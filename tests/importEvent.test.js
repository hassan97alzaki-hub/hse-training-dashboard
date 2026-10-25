/**
 * R-1 (SPECS-TRIAL v1.4): the fact of an import is recorded in the cloud so
 * the gate item "uploaded training data" can be measured, while the imported
 * data itself stays in the browser.
 *
 * The migration is checked structurally (nothing here executes SQL), the
 * client helper with a stub client, and the wiring by reading App.jsx.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { recordImportEvent } from '../src/lib/importEvent.js';

const dir = resolve(process.cwd(), 'supabase/migrations');
const file = readdirSync(dir).find(f => f.endsWith('_workspace-last-import.sql'));
const migration = file ? readFileSync(resolve(dir, file), 'utf8') : '';

describe('the import-event migration', () => {
  it('exists in CLI format', () => {
    expect(file).toMatch(/^\d{14}_workspace-last-import\.sql$/);
  });

  it('adds two nullable columns to workspaces, with a non-negative row count', () => {
    expect(migration).toContain('ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS last_import_at TIMESTAMPTZ;');
    expect(migration).toContain('ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS last_import_rows INTEGER;');
    expect(migration).not.toMatch(/last_import_\w+ \w+ NOT NULL/);
    expect(migration).toContain('CHECK (last_import_rows IS NULL OR last_import_rows >= 0)');
  });

  it('stores only the fact: no employee, course or certificate column', () => {
    expect(migration).not.toMatch(/ADD COLUMN[^;]*(employee|course|certificate|file_name)/i);
  });

  it('lets the client write only through record_import, never the columns', () => {
    expect(migration).not.toMatch(/GRANT UPDATE/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.record_import\(row_count INTEGER\)/);
    expect(migration).toContain('SECURITY DEFINER SET search_path = public');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.record_import(integer) FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.record_import(integer) TO authenticated;');
  });

  it('writes the caller\'s own workspace with the database clock, and skips frozen or read-only ones', () => {
    expect(migration).toContain('public.default_workspace_id()');
    expect(migration).toContain('public.can_write_workspace(ws)');
    expect(migration).toContain('public.is_workspace_frozen(ws)');
    expect(migration).toMatch(/SET last_import_at = now\(\),\s*last_import_rows = row_count\s*WHERE id = ws;/);
  });

  it('rejects an out-of-range row count', () => {
    expect(migration).toMatch(/row_count IS NULL OR row_count < 1 OR row_count > 1000000/);
  });
});

describe('recordImportEvent', () => {
  const stub = (result) => ({ rpc: vi.fn(async () => result) });

  it('does nothing in the local build', async () => {
    const client = stub({ error: null });
    expect(await recordImportEvent(27, { configured: false, client })).toEqual({ recorded: false, reason: 'local' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('sends only the row count to record_import', async () => {
    const client = stub({ error: null });
    expect(await recordImportEvent(27, { configured: true, client })).toEqual({ recorded: true });
    expect(client.rpc).toHaveBeenCalledWith('record_import', { row_count: 27 });
  });

  it('skips an empty or invalid count', async () => {
    const client = stub({ error: null });
    for (const n of [0, -1, 2.5, NaN, undefined]) {
      expect((await recordImportEvent(n, { configured: true, client })).recorded).toBe(false);
    }
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('never throws: a database error or a missing function is reported, not raised', async () => {
    expect(await recordImportEvent(5, { configured: true, client: stub({ error: { message: 'x' } }) }))
      .toEqual({ recorded: false, reason: 'error' });
    const throwing = { rpc: vi.fn(async () => { throw new Error('offline'); }) };
    expect(await recordImportEvent(5, { configured: true, client: throwing }))
      .toEqual({ recorded: false, reason: 'error' });
  });
});

describe('the import paths record the event', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
  const body = (name) => {
    const start = app.indexOf(name);
    expect(start, name).toBeGreaterThan(-1);
    const next = app.indexOf('\n  async function ', start + name.length);
    const nextSync = app.indexOf('\n  function ', start + name.length);
    const ends = [next, nextSync].filter(i => i > -1);
    return app.slice(start, ends.length ? Math.min(...ends) : undefined);
  };

  it('after a successful legacy import, a workbook approval and a production approval', () => {
    expect(body('async function handleTrainingImport')).toContain('recordImportEvent(result.validRecords.length)');
    expect(body('function handleApproveMatrix')).toContain('recordImportEvent(result.validRecords.length)');
    expect(body('async function handleApproveProductionPackage')).toContain('recordImportEvent(result.view.prepared.records.length)');
  });

  it('not for the demo data', () => {
    expect(body('async function handleLoadDemo')).not.toContain('recordImportEvent');
  });
});
