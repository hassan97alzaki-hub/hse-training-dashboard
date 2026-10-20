/**
 * Structural checks on migration 0003.
 *
 * None of this executes SQL — there is no Postgres in the test environment —
 * so it cannot tell you that the isolation holds. That is what
 * `scripts/verify-rls-isolation.mjs` is for, run against a real project with
 * two real accounts before this is merged.
 *
 * What these tests do catch is the class of mistake that is invisible in
 * review and fatal in production: a policy left behind that still authorises
 * by `owner_id`, a SECURITY DEFINER function without a pinned search path, a
 * table that gained a column but not a policy.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'supabase/migrations');

const sql = readdirSync(dir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(resolve(dir, file), 'utf8'))
  .join('\n');

// Found by suffix rather than by name: the files carry a timestamp so the
// Supabase CLI can order them, and that timestamp is not something a test
// should have to be told about.
const migrationFile = readdirSync(dir).find((file) => file.endsWith('_workspaces.sql'));
if (!migrationFile) throw new Error('no workspaces migration found in supabase/migrations');
const migration = readFileSync(resolve(dir, migrationFile), 'utf8');

const SCOPED_TABLES = [
  'courses', 'certificates', 'departments', 'employees',
  'employee_contacts', 'reminders_sent', 'requirements',
  'training_records', 'requirements_approval',
];

const DEFINER_FUNCTIONS = [
  'is_workspace_member',
  'workspace_role',
  'can_write_workspace',
  'default_workspace_id',
  'bootstrap_workspace_for_user',
];

describe('the workspace tables', () => {
  it('creates the workspace and its membership', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.workspaces');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.workspace_members');
  });

  it('names the four roles and nothing else', () => {
    expect(migration).toMatch(
      /CHECK \(role IN \('owner', 'admin', 'supervisor', 'viewer'\)\)/,
    );
  });

  // A role is a grant. Defaulting to the most powerful one would turn a typo
  // in an invitation into a second owner.
  it('defaults a new member to the least powerful role', () => {
    expect(migration).toMatch(/role TEXT NOT NULL DEFAULT 'viewer'/);
  });

  it('lets one account belong to a workspace once', () => {
    expect(migration).toContain('PRIMARY KEY (workspace_id, user_id)');
  });
});

describe('every scoped table', () => {
  it.each(SCOPED_TABLES.map((t) => [t]))('gives %s a workspace', (table) => {
    // The column is added and backfilled by a loop over this same list, so
    // the check is that the list in the migration matches this one.
    expect(migration).toContain(`'${table}'`);
  });

  it('adds the column, backfills it, then requires it', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS workspace_id UUID');
    expect(migration).toContain('ALTER COLUMN workspace_id SET NOT NULL');
    // Order matters: a NOT NULL applied before the backfill fails on the
    // first existing row.
    expect(migration.indexOf('UPDATE public.%I AS t SET workspace_id'))
      .toBeLessThan(migration.indexOf('ALTER COLUMN workspace_id SET NOT NULL'));
  });

  // The service layer was written against the owner model and never sends a
  // workspace. Without the default every insert would fail on NOT NULL.
  it('fills the column in for a client that does not send it', () => {
    expect(migration).toContain('SET DEFAULT public.default_workspace_id()');
  });
});

describe('the policies', () => {
  it('authorise by membership', () => {
    expect(migration).toContain('public.is_workspace_member(workspace_id)');
    expect(migration).toContain('public.can_write_workspace(workspace_id)');
  });

  // Policies on the same command are OR-ed. An owner-model policy left in
  // place would grant exactly what the membership rules are there to deny.
  it('drop every owner-model policy they replace', () => {
    for (const suffix of ['select', 'insert', 'update', 'delete']) {
      expect(migration, suffix).toContain(`target || '_owner_${suffix}'`);
    }
  });

  it('leave no policy authorising by owner_id', () => {
    // 0003 is the last word on every policy in the schema: it drops the
    // owner-model ones and writes the replacements. So the definitions it
    // creates are the live ones, and none of them may mention owner_id.
    const created = migration.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(created.length).toBeGreaterThan(0);
    expect(created.filter((policy) => /owner_id/.test(policy))).toHaveLength(0);
  });

  // A viewer that is read-only only in the interface is not read-only: the
  // anon key and a fetch call are all it takes to go around the screen. The
  // write check is a role list, and `viewer` must not be on it.
  it('let a viewer read and nothing else', () => {
    const writeCheck = migration.match(
      /FUNCTION public\.can_write_workspace[\s\S]*?\$\$;/,
    );
    expect(writeCheck).not.toBeNull();
    expect(writeCheck[0]).toContain("role IN ('owner', 'admin', 'supervisor')");
    expect(writeCheck[0]).not.toContain('viewer');
  });

  it('check both halves of an update, so a row cannot be moved out', () => {
    expect(migration).toMatch(
      /FOR UPDATE TO authenticated USING \(public\.can_write_workspace\(workspace_id\)\) WITH CHECK \(public\.can_write_workspace\(workspace_id\)\)/,
    );
  });

  it('restrict membership changes to an owner or an admin', () => {
    for (const command of ['INSERT', 'UPDATE', 'DELETE']) {
      const policy = new RegExp(
        `CREATE POLICY workspace_members_admin_${command.toLowerCase()}[\\s\\S]*?role\\(workspace_id\\) IN \\('owner', 'admin'\\)`,
      );
      expect(migration, command).toMatch(policy);
    }
  });

  // There is no INSERT policy on `workspaces` on purpose: one would have to
  // check a membership that does not exist yet. The bootstrap function
  // creates both rows instead.
  it('give workspaces no insert or delete policy', () => {
    expect(migration).not.toMatch(/CREATE POLICY \w+ ON public\.workspaces\s+FOR (INSERT|DELETE)/);
  });
});

describe('the SECURITY DEFINER functions', () => {
  it.each(DEFINER_FUNCTIONS.map((f) => [f]))('%s runs as its owner', (fn) => {
    expect(migration, fn).toMatch(
      new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]*?SECURITY DEFINER`),
    );
  });

  // Without a pinned search path, anyone who can create a schema can put
  // their own `workspace_members` in front of the real one and have the
  // function answer from it with the owner's rights.
  it.each(DEFINER_FUNCTIONS.map((f) => [f]))('%s pins its search path', (fn) => {
    expect(migration, fn).toMatch(
      new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]*?SET search_path = public`),
    );
  });

  // EXECUTE is granted to PUBLIC by default, which includes the anon role.
  it('are taken away from PUBLIC before being granted', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.%s TO authenticated');
    expect(migration.indexOf('REVOKE ALL ON FUNCTION'))
      .toBeLessThan(migration.indexOf('GRANT EXECUTE ON FUNCTION'));
  });

  it('refuse to bootstrap without a signed-in user', () => {
    expect(migration).toMatch(/IF auth\.uid\(\) IS NULL THEN\s*\n\s*RAISE EXCEPTION/);
  });

  // The client calls it after every sign-in; a second workspace per call
  // would multiply silently.
  it('return the existing workspace rather than a second one', () => {
    expect(migration).toMatch(/IF ws IS NOT NULL THEN\s*\n\s*RETURN ws;/);
  });
});

describe('the backfill', () => {
  it('gives each existing owner a workspace of their own', () => {
    expect(migration).toContain("VALUES (ws, owner_uid, 'owner')");
  });

  // The membership row carries a foreign key to the workspace, checked as the
  // row is inserted. Postgres does not order data-modifying CTEs against each
  // other, so creating both in one statement can insert a membership for a
  // workspace that does not exist yet. The pairs are created in a loop.
  it('creates each workspace before the membership that points at it', () => {
    const loop = migration.match(/FOR owner_uid IN[\s\S]*?END LOOP;/);
    expect(loop).not.toBeNull();
    expect(loop[0].indexOf('INSERT INTO public.workspaces'))
      .toBeLessThan(loop[0].indexOf('INSERT INTO public.workspace_members'));
    expect(migration).not.toMatch(/\), created AS \(/);
  });

  it('skips an account that already has one, so it can be run again', () => {
    expect(migration).toContain(
      'AND owner_id NOT IN (SELECT user_id FROM public.workspace_members)',
    );
  });

  it('reads every scoped table when collecting owners', () => {
    for (const table of SCOPED_TABLES) {
      expect(migration, table).toMatch(
        new RegExp(`(SELECT|UNION SELECT) owner_id FROM public\\.${table}\\b`),
      );
    }
  });
});

describe('what the migration leaves alone', () => {
  // A dropped column cannot be put back, and `owner_id` is the only record of
  // who created a row.
  it('drops no column and no table', () => {
    expect(migration).not.toMatch(/DROP COLUMN/i);
    expect(migration).not.toMatch(/DROP TABLE/i);
  });

  it('grants nothing to an unauthenticated request', () => {
    expect(migration).not.toMatch(/TO\s+anon\b/);
    expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });
});

describe('the migration files', () => {
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql'));

  // The Supabase CLI orders migrations by the timestamp in the filename and
  // records that timestamp as the version. A file named any other way is one
  // the CLI will not apply, which is how a migration goes missing from a
  // project without anyone noticing.
  it.each(files.map((f) => [f]))('%s is named for the CLI', (file) => {
    expect(file).toMatch(/^\d{14}_[a-z0-9-]+\.sql$/);
  });

  // Only the migrations that reached the hosted project through the SQL editor
  // belong in this file. Anything newer is applied by `supabase db push`, and
  // registering it here would make the CLI skip it.
  it('registers every migration that was applied by hand', () => {
    const register = readFileSync(resolve(dir, '..', 'REGISTER_EXISTING.sql'), 'utf8');
    const byHand = files.filter((file) => file.slice(0, 14) <= '20261019100039');
    expect(byHand.length).toBe(3);
    for (const file of byHand) {
      const version = file.slice(0, 14);
      expect(register, file).toContain(`('${version}'`);
    }
  });

  // Telling the CLI a migration is applied when it is not makes it skip the
  // migration for ever. The file has to say so where it cannot be missed.
  it('warns that registering an unapplied migration is unrecoverable', () => {
    const register = readFileSync(resolve(dir, '..', 'REGISTER_EXISTING.sql'), 'utf8');
    expect(register).toMatch(/has NOT had them applied/);
    expect(register).toMatch(/select count\(\*\) from pg_tables/);
  });
});
