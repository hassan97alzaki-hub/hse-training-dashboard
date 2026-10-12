import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readSupabaseConfig } from '../src/lib/supabaseClient.js';
import { SupabaseDbService } from '../src/lib/db/supabaseDbService.js';
import { accountEmail, AUTH_STATE } from '../src/lib/auth.js';

/**
 * A stand-in for the Supabase query builder. Records every call so a test can
 * assert what the service asked for, and returns whatever the test queued.
 */
function fakeClient(responses = {}) {
  const calls = [];

  const builder = (table) => {
    const state = { table, filters: [] };
    const result = (kind) => {
      calls.push({ ...state, kind });
      const queued = responses[`${table}.${kind}`];
      return queued ?? { data: null, error: null };
    };

    const chain = {
      insert(row) { state.row = row; state.op = 'insert'; return chain; },
      update(row) { state.row = row; state.op = 'update'; return chain; },
      delete() { state.op = 'delete'; return Promise.resolve(result('delete')); },
      select() {
        state.op = state.op ?? 'select';
        if (state.op === 'select') {
          // A bare select resolves as a list unless a lookup narrows it.
          const promise = Promise.resolve(result('list'));
          return Object.assign(chain, { then: promise.then.bind(promise) });
        }
        return chain;
      },
      eq(column, value) { state.filters.push([column, value]); return chain; },
      limit() { return chain; },
      maybeSingle() { return Promise.resolve(result('maybeSingle')); },
      single() { return Promise.resolve(result('single')); },
    };
    return chain;
  };

  return { from: (table) => builder(table), calls };
}

describe('reading the Supabase configuration', () => {
  it('is not configured when both variables are absent', () => {
    expect(readSupabaseConfig({}).configured).toBe(false);
    expect(readSupabaseConfig().configured).toBe(false);
  });

  it('is not configured with only one of the two', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' }).configured).toBe(false);
    expect(readSupabaseConfig({ VITE_SUPABASE_ANON_KEY: 'key' }).configured).toBe(false);
  });

  it('is not configured when a value is only spaces', () => {
    const config = readSupabaseConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: 'key' });
    expect(config.configured).toBe(false);
  });

  it('is configured with both, and trims them', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: ' https://x.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' key ',
    });
    expect(config).toEqual({ url: 'https://x.supabase.co', anonKey: 'key', configured: true });
  });
});

describe('the Supabase database service', () => {
  it('refuses to be built without a client', () => {
    expect(() => new SupabaseDbService(null)).toThrow(/requires a Supabase client/);
  });

  it('exposes the same stores as the local service', async () => {
    const db = await new SupabaseDbService(fakeClient()).init();
    for (const store of ['courses', 'certificates', 'departments', 'employees', 'employeeContacts', 'remindersSent']) {
      expect(db[store], store).toBeTruthy();
      expect(typeof db[store].add, store).toBe('function');
      expect(typeof db[store].list, store).toBe('function');
    }
    expect(typeof db.certificates.getByNumber).toBe('function');
    expect(typeof db.departments.getByNameKey).toBe('function');
    expect(typeof db.employees.getByEmployeeId).toBe('function');
    expect(typeof db.employeeContacts.getByEmployeeId).toBe('function');
    expect(typeof db.remindersSent.listByEmployee).toBe('function');
  });

  it('keeps the reminder log append-only', async () => {
    const db = await new SupabaseDbService(fakeClient()).init();
    expect(db.remindersSent.update).toBeUndefined();
    expect(db.remindersSent.delete).toBeUndefined();
    expect(db.courses.update).toBeTypeOf('function');
    expect(db.courses.delete).toBeTypeOf('function');
  });

  it('never sends owner_id, so the database decides the owner', async () => {
    const client = fakeClient({
      'courses.single': { data: { id: 'c1' }, error: null },
    });
    const db = await new SupabaseDbService(client).init();

    await db.courses.add({ id: 'c1', code: 'H2S', name: 'H2S Safety', owner_id: 'someone-else' });
    await db.courses.update('c1', { code: 'H2S', name: 'H2S Safety', owner_id: 'someone-else' });

    for (const call of client.calls) {
      expect(call.row, call.op).toBeTruthy();
      expect(call.row.owner_id, call.op).toBeUndefined();
    }
  });

  it('stamps an update with the time it happened', async () => {
    const client = fakeClient({ 'employees.single': { data: { id: 'e1' }, error: null } });
    const db = await new SupabaseDbService(client).init();

    await db.employees.update('emp_E1', { name: 'Ahmed' });

    const call = client.calls.find(c => c.op === 'update');
    expect(call.row.id).toBe('emp_E1');
    expect(call.row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('looks a department up by its name key', async () => {
    const client = fakeClient({
      'departments.maybeSingle': { data: { id: 'dept_operations', name: 'Operations' }, error: null },
    });
    const db = await new SupabaseDbService(client).init();

    const found = await db.departments.getByNameKey('operations');

    expect(found.name).toBe('Operations');
    expect(client.calls[0].filters).toEqual([['name_key', 'operations']]);
  });

  it('reports no row as null, not as a failure', async () => {
    const client = fakeClient({
      'employees.maybeSingle': { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    });
    const db = await new SupabaseDbService(client).init();
    await expect(db.employees.getByEmployeeId('E999')).resolves.toBeNull();
  });

  it('raises a real error', async () => {
    const client = fakeClient({
      'courses.list': { data: null, error: { code: '42501', message: 'permission denied' } },
    });
    const db = await new SupabaseDbService(client).init();
    await expect(db.courses.list()).rejects.toThrow(/permission denied/);
  });

  it('returns an empty list rather than null', async () => {
    const db = await new SupabaseDbService(fakeClient()).init();
    await expect(db.courses.list()).resolves.toEqual([]);
    await expect(db.remindersSent.listByEmployee('E1')).resolves.toEqual([]);
  });
});

describe('the account', () => {
  it('names the address a reminder is sent from', () => {
    expect(accountEmail({ user: { email: 'hse@example.com' } })).toBe('hse@example.com');
  });

  it('has no address without a session', () => {
    expect(accountEmail(null)).toBeNull();
    expect(accountEmail({})).toBeNull();
  });

  it('treats a build with no backend as a build needing no sign-in', () => {
    expect(AUTH_STATE.NOT_REQUIRED).toBe('not_required');
  });
});

describe('the gate in a build with no backend', () => {
  it('opens straight to the dashboard', async () => {
    const { render, screen, cleanup } = await import('@testing-library/react');
    const { AuthGate } = await import('../src/components/AuthGate.jsx');
    const { createElement } = await import('react');

    render(createElement(AuthGate, null, 'the dashboard'));
    expect(screen.getByText('the dashboard')).toBeTruthy();
    expect(screen.queryByText('Sign in')).toBeNull();
    cleanup();
  });

  it('hands no account to a child that asks for one', async () => {
    const { render, screen, cleanup } = await import('@testing-library/react');
    const { AuthGate } = await import('../src/components/AuthGate.jsx');
    const { createElement } = await import('react');

    render(createElement(AuthGate, null, (session) => String(session)));
    expect(screen.getByText('null')).toBeTruthy();
    cleanup();
  });

  it('shows no account strip without a session', async () => {
    const { render, cleanup } = await import('@testing-library/react');
    const { AccountBar } = await import('../src/components/AccountBar.jsx');
    const { createElement } = await import('react');

    const { container } = render(createElement(AccountBar, { session: null }));
    expect(container.textContent).toBe('');
    cleanup();
  });
});

describe('the privacy statement', () => {
  it('has a cloud wording in both languages, so the local-only claim is never shown untruthfully', async () => {
    const { createI18n } = await import('../src/lib/i18n.js');
    for (const lang of ['en', 'ar']) {
      const { t } = createI18n(lang);
      expect(t('privacyNote'), lang).not.toBe('privacyNote');
      expect(t('privacyNoteCloud'), lang).not.toBe('privacyNoteCloud');
      expect(t('privacyNoteCloud'), lang).not.toMatch(/browser|متصفح/i);
    }
  });

  it('is chosen from the build configuration, not hard-coded', () => {
    const header = readFileSync(resolve(process.cwd(), 'src/components/Header.jsx'), 'utf8');
    expect(header).toContain('isSupabaseConfigured');
    expect(header).toContain('privacyNoteCloud');
  });
});

describe('the migration', () => {
  let sql;

  beforeEach(() => {
    sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/0001_init.sql'), 'utf8');
  });

  const TABLES = ['courses', 'certificates', 'departments', 'employees', 'employee_contacts', 'reminders_sent'];

  it('creates every table the service uses', () => {
    for (const table of TABLES) {
      expect(sql, table).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
  });

  it('closes every table with row-level security', () => {
    for (const table of TABLES) {
      expect(sql, table).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('owns every row by the signed-in user, and lets the database fill it in', () => {
    const owners = sql.match(/owner_id UUID NOT NULL DEFAULT auth\.uid\(\)/g) ?? [];
    expect(owners).toHaveLength(TABLES.length);
  });

  it('scopes every unique key to the account', () => {
    // A code or an employee ID is unique per account, never globally: two
    // companies may both run H2S and both number an employee 1001.
    expect(sql).toContain('UNIQUE (owner_id, code)');
    expect(sql).toContain('UNIQUE (owner_id, certificate_number)');
    expect(sql).toContain('UNIQUE (owner_id, name_key)');
    expect(sql).toContain('UNIQUE (owner_id, employee_id)');
  });

  it('grants nothing to an unauthenticated request', () => {
    expect(sql).toContain('TO authenticated');
    expect(sql).not.toMatch(/TO\s+anon\b/);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('removes an account\'s rows with the account', () => {
    const cascades = sql.match(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/g) ?? [];
    expect(cascades).toHaveLength(TABLES.length);
  });
});

describe('the example environment file', () => {
  it('names both variables and carries no secret', () => {
    const env = readFileSync(resolve(process.cwd(), '.env.supabase.example'), 'utf8');
    expect(env).toMatch(/VITE_SUPABASE_URL/);
    expect(env).toMatch(/VITE_SUPABASE_ANON_KEY/);
    // A real anon key is a long JWT. A placeholder is not.
    expect(env).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(env).toMatch(/service-role key/i);
  });

  it('is not committed as a live environment file', () => {
    const ignore = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8');
    expect(ignore).toMatch(/\*\.local|\.env\.local/);
  });
});
