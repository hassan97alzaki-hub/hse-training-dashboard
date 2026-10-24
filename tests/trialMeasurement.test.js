/**
 * The measurement queries are the evidence the trial decision rests on, and a
 * wrong one fails silently: it returns a plausible number. These pin the three
 * mistakes found in v1.1 of the spec so none of them can come back.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const doc = readFileSync(resolve(process.cwd(), 'docs/TRIAL_MEASUREMENT.md'), 'utf8');
const sql = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');

describe('the trial measurement queries', () => {
  it('match interests by the keys the form stores, not by Arabic labels', () => {
    expect(sql).toContain(`interest @> '["reminders"]'`);
    expect(sql).toContain(`interest @> '["pricing"]'`);
    expect(sql).not.toMatch(/التذكيرات|السعر/);
  });

  it('join workspaces by their id, so the upload count cannot match every workspace', () => {
    expect(sql).toContain('JOIN public.workspaces w ON w.id = tr.workspace_id');
    expect(sql).not.toMatch(/select workspace_id from workspaces/i);
  });

  it('reach a workspace\'s users through its members, not a column auth.users lacks', () => {
    expect(sql).toContain('JOIN auth.users u ON u.id = m.user_id');
    expect(sql).not.toMatch(/auth\.users\s+group by workspace_id/i);
  });

  it('count inside the approved window, 2026-10-24 to 2026-11-07 in Riyadh', () => {
    expect(sql).toContain(`timestamptz '2026-10-24 00:00+03'`);
    expect(sql).toContain(`timestamptz '2026-11-08 00:00+03'`);
    expect(sql).not.toContain('2026-10-21');
  });
});
