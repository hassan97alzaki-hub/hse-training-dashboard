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

  it('count uploads from the R-1 import event of trial workspaces only (SPECS v1.4)', () => {
    expect(sql).toContain('w.last_import_at >= win.starts AND w.last_import_at < win.ends');
    expect(sql).toContain('w.trial_ends_at IS NOT NULL');
    expect(sql).not.toMatch(/select workspace_id from workspaces/i);
  });

  it('reach a workspace\'s users through its members, not a column auth.users lacks', () => {
    expect(sql).toContain('JOIN auth.users u ON u.id = m.user_id');
    expect(sql).not.toMatch(/auth\.users\s+group by workspace_id/i);
  });

  it('count inside the v1.4 window, 2026-10-25 to 2026-11-07 in Riyadh, with sign-ups from 2026-10-24', () => {
    expect(sql).toContain(`timestamptz '2026-10-25 00:00+03' AS starts`);
    expect(sql).toContain(`timestamptz '2026-11-08 00:00+03' AS ends`);
    expect(sql).toContain(`timestamptz '2026-10-24 00:00+03' AS signups_from`);
    expect(sql).toContain('created_at >= win.signups_from AND created_at < win.ends) AS signups');
    expect(sql).not.toContain('2026-10-21');
  });
});
