/**
 * Structural checks on the trial sign-up migration.
 *
 * Nothing here executes SQL. It pins the properties that matter most and are
 * easiest to lose in a later edit: anonymous callers can insert and never read,
 * and the honeypot is refused by the table itself.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'supabase/migrations');

const migrationFile = readdirSync(dir).find((file) => file.endsWith('_trial-signups.sql'));
if (!migrationFile) throw new Error('no trial-signups migration found in supabase/migrations');
const migration = readFileSync(resolve(dir, migrationFile), 'utf8');

describe('the trial_signups table', () => {
  it('is created with a unique work email', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.trial_signups');
    expect(migration).toMatch(/work_email TEXT NOT NULL UNIQUE/);
  });

  it('refuses a filled honeypot in the table itself', () => {
    expect(migration).toMatch(/honeypot TEXT CHECK \(honeypot IS NULL OR honeypot = ''\)/);
  });

  it('stores interests as a JSON array so the measurement query can match them', () => {
    expect(migration).toMatch(/interest JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it('enables row level security', () => {
    expect(migration).toContain('ALTER TABLE public.trial_signups ENABLE ROW LEVEL SECURITY');
  });

  it('lets anonymous callers insert and grants them nothing else', () => {
    expect(migration).toContain('REVOKE ALL ON public.trial_signups FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT INSERT ON public.trial_signups TO anon, authenticated');
    expect(migration).not.toMatch(/GRANT\s+(SELECT|UPDATE|DELETE|ALL)[^;]*TO[^;]*anon/i);
    expect(migration).toMatch(/FOR INSERT TO anon, authenticated\s+WITH CHECK \(true\)/);
    expect(migration).not.toMatch(/FOR (SELECT|UPDATE|DELETE|ALL)/);
  });
});
