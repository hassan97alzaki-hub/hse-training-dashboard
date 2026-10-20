/**
 * Structural checks on the audit trail migration.
 *
 * Like workspacesMigration.test.js, nothing here executes SQL. It pins the
 * properties that are invisible in review and fatal if they slip: a log that
 * a client can write to, a trigger that is not wired to the tables it must
 * cover, a definer function without a pinned search path. Behaviour against a
 * real database is checked by running the SQL in the Supabase SQL editor and
 * by `npm run verify:rls` for the read side.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'supabase/migrations');

const migrationFile = readdirSync(dir).find((file) => file.endsWith('_audit-trail.sql'));
if (!migrationFile) throw new Error('no audit-trail migration found in supabase/migrations');
const migration = readFileSync(resolve(dir, migrationFile), 'utf8');

const AUDITED_TABLES = ['training_records', 'requirements', 'requirements_approval'];

describe('the audit log table', () => {
  it('is created with a workspace key and a timestamp', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.audit_log');
    expect(migration).toMatch(/workspace_id\s+UUID NOT NULL REFERENCES public\.workspaces\(id\) ON DELETE RESTRICT/);
    expect(migration).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
  });

  it('enables row level security on the log', () => {
    expect(migration).toContain('ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY');
  });

  // Append-only is enforced twice: by the grant and by the policies. The grant
  // is the one that holds if someone adds a policy later without thinking.
  it('grants clients SELECT on the log and nothing else', () => {
    expect(migration).toContain('REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT SELECT ON public.audit_log TO authenticated');
    expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*audit_log/);
  });

  it('lets members read only their own workspace', () => {
    expect(migration).toContain(
      'CREATE POLICY audit_log_member_select ON public.audit_log\n  FOR SELECT TO authenticated\n  USING (public.is_workspace_member(workspace_id))',
    );
  });

  it('has no insert, update or delete policy for clients', () => {
    expect(migration).not.toMatch(/CREATE POLICY \w+ ON public\.audit_log\s+FOR (INSERT|UPDATE|DELETE)/);
    expect(migration).not.toMatch(/CREATE POLICY \w+ ON public\.audit_log\s+FOR ALL/);
  });
});

describe('the write trigger', () => {
  // Without this the insert in the trigger would run as the caller and the
  // log would reject its own writes for every ordinary member.
  it('runs as its owner with a pinned search path', () => {
    expect(migration).toMatch(
      /FUNCTION public\.write_audit_row\(\)\s+RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/,
    );
  });

  it('is not callable by clients', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.write_audit_row() FROM PUBLIC');
  });

  it('records who acted, through auth.uid()', () => {
    expect(migration).toContain('auth.uid()');
  });

  it('is attached to exactly the audited tables', () => {
    const list = migration.match(/ARRAY\['([^\]]+)'\]/);
    const tables = list[1].split(/',\s*'/);
    expect(tables).toEqual(AUDITED_TABLES);
  });

  it('is attached as an AFTER trigger on all three write operations', () => {
    expect(migration).toContain(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_row()',
    );
  });

  // Employees are left out on purpose: every import would write one log row
  // per person. The decision is recorded in the migration header. Adding the
  // table here is the change, and this test will say so.
  it('does not audit employees', () => {
    const list = migration.match(/ARRAY\['([^\]]+)'\]/);
    expect(list).not.toBeNull();
    expect(list[1]).not.toContain('employees');
  });
});
