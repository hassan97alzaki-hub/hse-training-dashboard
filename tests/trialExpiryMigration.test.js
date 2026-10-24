/**
 * Structural checks on the trial expiry migration.
 *
 * Nothing here executes SQL; the behaviour was checked against Postgres when
 * the migration was written (see the pull request). These pin the properties
 * a later edit could lose without any test going red: the freeze only takes
 * access away, it leaves reading alone, a NULL end date never freezes, and
 * the client cannot move its own end date.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'supabase/migrations');

const migrationFile = readdirSync(dir).find((file) => file.endsWith('_trial-expiry.sql'));
if (!migrationFile) throw new Error('no trial-expiry migration found in supabase/migrations');
const migration = readFileSync(resolve(dir, migrationFile), 'utf8');

describe('the trial expiry migration', () => {
  it('adds the end of the trial as an instant, nullable', () => {
    expect(migration).toContain('ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;');
    expect(migration).not.toMatch(/trial_ends_at TIMESTAMPTZ NOT NULL/);
  });

  it('treats a NULL end date as never frozen and compares with the database clock', () => {
    expect(migration).toMatch(/COALESCE\(\s*\(SELECT trial_ends_at <= now\(\) FROM public\.workspaces WHERE id = ws\),\s*false\s*\)/);
  });

  it('lets the client change the workspace name and nothing else', () => {
    expect(migration).toContain('REVOKE UPDATE ON public.workspaces FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT UPDATE (name) ON public.workspaces TO authenticated;');
  });

  it('freezes inserts, updates and deletes on both tables with restrictive policies', () => {
    expect(migration).toContain("ARRAY['training_records', 'requirements']");
    for (const command of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(migration).toMatch(new RegExp(`AS RESTRICTIVE FOR ${command} TO authenticated`));
    }
    expect(migration).not.toMatch(/CREATE POLICY[^;]*AS PERMISSIVE/);
  });

  it('never restricts reading, so a frozen workspace can still export', () => {
    expect(migration).not.toMatch(/FOR SELECT/);
    expect(migration).not.toMatch(/FOR ALL/);
  });

  it('keeps the freeze check callable only by signed-in accounts', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.is_workspace_frozen(uuid) FROM PUBLIC;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.is_workspace_frozen(uuid) TO authenticated;');
    expect(migration).toMatch(/is_workspace_frozen\(ws UUID\)[\s\S]*SECURITY DEFINER SET search_path = public/);
  });
});
