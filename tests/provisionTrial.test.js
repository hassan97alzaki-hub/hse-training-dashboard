/**
 * The trial-signup Edge Function's logic, with a stand-in for the
 * service-role client. The SQL it calls (provision_trial, trial_slots_left)
 * was run against Postgres when it was written; see the pull request.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { provisionTrial } from '../supabase/functions/_shared/provisionTrial.js';

const valid = {
  companyName: 'Gulf Contracting Co',
  workEmail: 'Safety@GulfContracting.com',
  country: 'SA',
  headcountEstimate: '120',
  fileFormat: 'XLSX',
  interest: ['pricing'],
  honeypot: '',
  password: 'correct-horse-1',
  sourceLanding: '/en',
};

function fakeAdmin({ slots = 5, createError = null, provisionError = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      if (name === 'trial_slots_left') return { data: slots, error: null };
      return { data: provisionError ? null : 'ws-1', error: provisionError };
    },
    from: (table) => ({
      insert: async (row) => { calls.push(['insert', table, row]); return { error: null }; },
    }),
    auth: {
      admin: {
        createUser: async (args) => {
          calls.push(['createUser', args]);
          return createError ? { data: null, error: createError } : { data: { user: { id: 'user-1' } }, error: null };
        },
        deleteUser: async (id) => { calls.push(['deleteUser', id]); return { error: null }; },
      },
    },
  };
}

describe('provisionTrial', () => {
  it('creates a confirmed account and its trial in one go', async () => {
    const admin = fakeAdmin();
    expect(await provisionTrial(admin, valid)).toEqual({ status: 'created' });

    const create = admin.calls.find(([kind]) => kind === 'createUser')[1];
    expect(create).toMatchObject({ email: 'safety@gulfcontracting.com', password: 'correct-horse-1', email_confirm: true });

    const provision = admin.calls.find(([kind, name]) => kind === 'rpc' && name === 'provision_trial')[2];
    expect(provision).toMatchObject({
      p_user: 'user-1',
      p_company: 'Gulf Contracting Co',
      p_email: 'safety@gulfcontracting.com',
      p_interest: ['pricing'],
      p_source: '/en',
    });
  });

  it('refuses a short password before touching anything', async () => {
    const admin = fakeAdmin();
    const result = await provisionTrial(admin, { ...valid, password: 'short' });
    expect(result).toEqual({ status: 'invalid', errors: { password: true } });
    expect(admin.calls).toHaveLength(0);
  });

  it('runs the same field checks as the page, on what actually arrived', async () => {
    const admin = fakeAdmin();
    const result = await provisionTrial(admin, { ...valid, workEmail: 'not-an-email' });
    expect(result.status).toBe('invalid');
    expect(result.errors.workEmail).toBe(true);
    expect(admin.calls).toHaveLength(0);
  });

  it('creates nothing for a filled honeypot', async () => {
    const admin = fakeAdmin();
    expect((await provisionTrial(admin, { ...valid, honeypot: 'http://spam' })).status).toBe('invalid');
    expect(admin.calls).toHaveLength(0);
  });

  it('puts the request on the waiting list once the twenty places are taken', async () => {
    const admin = fakeAdmin({ slots: 0 });
    expect(await provisionTrial(admin, valid)).toEqual({ status: 'waitlist' });
    expect(admin.calls.some(([kind]) => kind === 'createUser')).toBe(false);
    const insert = admin.calls.find(([kind]) => kind === 'insert');
    expect(insert[1]).toBe('trial_signups');
    expect(insert[2].work_email).toBe('safety@gulfcontracting.com');
  });

  it('says the account exists when the address is taken', async () => {
    const admin = fakeAdmin({ createError: { status: 422, message: 'A user with this email address has already been registered' } });
    expect(await provisionTrial(admin, valid)).toEqual({ status: 'exists' });
    expect(admin.calls.some(([, name]) => name === 'provision_trial')).toBe(false);
  });

  it('takes the account back if its trial could not be written', async () => {
    const admin = fakeAdmin({ provisionError: { message: 'boom' } });
    expect(await provisionTrial(admin, valid)).toEqual({ status: 'failed' });
    expect(admin.calls.at(-1)).toEqual(['deleteUser', 'user-1']);
  });
});

describe('the provisioning migration', () => {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const sql = readFileSync(resolve(dir, readdirSync(dir).find((f) => f.endsWith('_trial-provisioning.sql'))), 'utf8');

  it('is callable by the service role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.trial_slots_left\(\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.provision_trial\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*(anon|authenticated)/);
  });

  it('ends the trial at midnight in Riyadh after seven days', () => {
    expect(sql).toContain("(((now() AT TIME ZONE 'Asia/Riyadh')::date + 7)::timestamp AT TIME ZONE 'Asia/Riyadh')");
  });

  it('caps trial accounts at twenty', () => {
    expect(sql).toMatch(/GREATEST\(0, 20 - /);
  });
});

describe('the trial-signup function config', () => {
  it('lets an anonymous visitor call it', () => {
    const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8');
    expect(config).toMatch(/\[functions\.trial-signup\]\s*\nverify_jwt = false/);
  });
});
