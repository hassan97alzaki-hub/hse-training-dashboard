#!/usr/bin/env node

/**
 * Proves that an ended trial is frozen in the database, not only on screen.
 *
 * SPECS-TRIAL v1.2, task 2: once `workspaces.trial_ends_at` has passed, an
 * insert, update or delete on the training data must be refused even when it
 * is sent straight to the REST API, while reading still works. The rules live
 * in Postgres (20261024120000_trial-expiry.sql), so this script is the check:
 * it signs in as a real trial account, with the publishable key, and tries.
 *
 * Use a test account, never a customer's. Before running, end its trial and
 * give it one training row and one requirement to aim at (SQL editor, as the
 * project owner):
 *
 *   update public.workspaces set trial_ends_at = now() - interval '1 minute'
 *   where id = (select workspace_id from public.workspace_members m
 *               join auth.users u on u.id = m.user_id
 *               where u.email = '<test account>' and m.role = 'owner');
 *
 * Then:
 *
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_ANON_KEY=<the publishable anon key> \
 *   TRIAL_EMAIL=probe@example.com TRIAL_PASSWORD=... \
 *   node scripts/verify-trial-freeze.mjs
 *
 * Every write it attempts is one the database must refuse. If any of them
 * goes through, the script says so and exits 1: that row was really written,
 * and the freeze is broken.
 */

import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, TRIAL_EMAIL, TRIAL_PASSWORD } = process.env;

const missing = Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, TRIAL_EMAIL, TRIAL_PASSWORD })
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(2);
}

// A privileged key bypasses row-level security, so every write would succeed
// and prove nothing. Same refusal as verify-rls-isolation.mjs.
if (
  /service_role/i.test(SUPABASE_ANON_KEY) ||
  /^sb_secret_/.test(SUPABASE_ANON_KEY) ||
  SUPABASE_ANON_KEY.length > 500
) {
  console.error('That key has privileged access: it bypasses RLS, so this check would be meaningless.');
  console.error('Use the publishable key — `sb_publishable_…`, or the legacy anon JWT.');
  process.exit(2);
}

const results = [];
const record = (name, passed, detail = '') => {
  results.push(passed);
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: signInError } = await client.auth.signInWithPassword({
  email: TRIAL_EMAIL,
  password: TRIAL_PASSWORD,
});
if (signInError) {
  console.error(`${TRIAL_EMAIL}: ${signInError.message}`);
  process.exit(2);
}

const { data: workspaceId } = await client.rpc('default_workspace_id');
const { data: workspace } = await client
  .from('workspaces').select('trial_ends_at').eq('id', workspaceId).maybeSingle();
const endsAt = workspace?.trial_ends_at ?? null;
record(
  'the account\'s trial has ended',
  Boolean(endsAt) && new Date(endsAt) <= new Date(),
  endsAt ? `trial_ends_at ${endsAt}` : 'trial_ends_at is NULL — not a trial, nothing to test',
);

// Reading must still work: it is what the export runs on.
for (const table of ['training_records', 'requirements']) {
  const { data, error } = await client.from(table).select('id');
  record(`${table}: reading still works`, !error, error ? error.message : `${data.length} row(s)`);
}

const probeId = `freeze-probe-${Date.now()}`;

const { error: trInsert } = await client.from('training_records')
  .insert({ id: probeId, employee_id: 'FREEZE-PROBE', course_code: 'FREEZE-PROBE' });
record('training_records: insert refused', Boolean(trInsert), trInsert?.message ?? 'THE ROW WAS WRITTEN');

const { error: rqInsert } = await client.from('requirements')
  .insert({ id: probeId, department: 'FREEZE-PROBE', course_code: 'FREEZE-PROBE' });
record('requirements: insert refused', Boolean(rqInsert), rqInsert?.message ?? 'THE ROW WAS WRITTEN');

// An update or delete the policy refuses matches no rows rather than raising
// an error, so the proof is that nothing came back changed.
for (const table of ['training_records', 'requirements']) {
  const { data: rows } = await client.from(table).select('id').limit(1);
  const target = rows?.[0]?.id;
  if (!target) {
    record(`${table}: update and delete refused`, false, 'no row to aim at — add one before ending the trial');
    continue;
  }
  const { data: updated } = await client.from(table)
    .update({ updated_at: new Date().toISOString() }).eq('id', target).select('id');
  record(`${table}: update refused`, (updated ?? []).length === 0, `${(updated ?? []).length} row(s) changed`);
  const { data: deleted } = await client.from(table).delete().eq('id', target).select('id');
  record(`${table}: delete refused`, (deleted ?? []).length === 0, `${(deleted ?? []).length} row(s) deleted`);
}

// The account must not be able to lift its own freeze.
const { error: lift } = await client.from('workspaces')
  .update({ trial_ends_at: null }).eq('id', workspaceId);
record('workspaces: clearing trial_ends_at refused', Boolean(lift), lift?.message ?? 'THE FREEZE WAS LIFTED');

const failed = results.filter((passed) => !passed).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
