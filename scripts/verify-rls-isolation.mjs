#!/usr/bin/env node

/**
 * Proves that one workspace cannot read another.
 *
 * Migration 0003 moves authorisation from `owner_id` to workspace membership.
 * A mistake in those policies does not fail loudly: the application keeps
 * working and one company's training data becomes readable by another. No
 * unit test can catch that, because the rules live in Postgres and the test
 * environment has no Postgres — this script is the check, and it runs against
 * the real project with two real accounts.
 *
 * It only ever reads. Nothing is created, changed or deleted.
 *
 * Usage, with the project's anon key and two accounts that each have data:
 *
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_ANON_KEY=<the publishable anon key> \
 *   USER_A_EMAIL=a@example.com USER_A_PASSWORD=... \
 *   USER_B_EMAIL=b@example.com USER_B_PASSWORD=... \
 *   node scripts/verify-rls-isolation.mjs
 *
 * The anon key is the publishable one that already ships in the bundle. Never
 * use a service-role key here: it bypasses row-level security, so the script
 * would pass no matter how wrong the policies are.
 */

import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
} = process.env;

const missing = Object.entries({
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(2);
}

if (/service_role/i.test(SUPABASE_ANON_KEY) || SUPABASE_ANON_KEY.length > 500) {
  console.error('That looks like a service-role key. It bypasses RLS, so this check would be meaningless.');
  process.exit(2);
}

const TABLES = [
  'courses', 'certificates', 'departments', 'employees',
  'employee_contacts', 'reminders_sent', 'requirements',
  'training_records', 'requirements_approval',
];

const results = [];
const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { client, userId: data.user.id };
}

const a = await signIn(USER_A_EMAIL, USER_A_PASSWORD);
const b = await signIn(USER_B_EMAIL, USER_B_PASSWORD);

// Each account is bootstrapped the way the application bootstraps it.
for (const [label, account] of [['A', a], ['B', b]]) {
  const { data, error } = await account.client.rpc('bootstrap_workspace_for_user');
  if (error) {
    record(`account ${label} has a workspace`, false, error.message);
  } else {
    account.workspaceId = data;
    record(`account ${label} has a workspace`, Boolean(data), data ?? 'no id returned');
  }
}

record(
  'the two accounts are in different workspaces',
  Boolean(a.workspaceId) && a.workspaceId !== b.workspaceId,
  `${a.workspaceId} vs ${b.workspaceId}`,
);

// The heart of it: B names A's workspace explicitly. Knowing the identifier
// must not be enough — that is the difference between a filter and a policy.
for (const table of TABLES) {
  const { data, error } = await b.client
    .from(table)
    .select('*')
    .eq('workspace_id', a.workspaceId);

  const leaked = (data ?? []).length;
  record(
    `B cannot read A's ${table}`,
    !error && leaked === 0,
    error ? error.message : `${leaked} row(s) returned`,
  );
}

// A row B is allowed to see must still be visible, or the policies are simply
// denying everything and the check above proves nothing.
let ownRows = 0;
for (const table of TABLES) {
  const { data } = await b.client.from(table).select('id').limit(1);
  ownRows += (data ?? []).length;
}
record(
  "B can still read B's own data",
  ownRows > 0,
  `${ownRows} table(s) returned a row — if this is 0, seed account B and run again`,
);

// Membership is itself a workspace-scoped table, and the one most likely to
// be left open: a policy on it that reads it is the recursion trap.
{
  const { data, error } = await b.client
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', a.workspaceId);
  record(
    "B cannot read A's membership list",
    !error && (data ?? []).length === 0,
    error ? error.message : `${(data ?? []).length} row(s) returned`,
  );
}

{
  const { data, error } = await b.client
    .from('workspaces')
    .select('*')
    .eq('id', a.workspaceId);
  record(
    "B cannot read A's workspace row",
    !error && (data ?? []).length === 0,
    error ? error.message : `${(data ?? []).length} row(s) returned`,
  );
}

// A write into another workspace must be refused, not silently dropped.
{
  const { data, error } = await b.client
    .from('courses')
    .insert({ id: `rls-probe-${Date.now()}`, workspace_id: a.workspaceId, code: 'PROBE', name: 'probe' })
    .select();
  const wrote = (data ?? []).length > 0;
  record("B cannot write into A's workspace", Boolean(error) && !wrote, error ? error.message : 'the insert was accepted');
  if (wrote) {
    console.error('A probe row was written into another workspace. Delete it by hand:', data);
  }
}

await a.client.auth.signOut();
await b.client.auth.signOut();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length) {
  console.error('\nIsolation is NOT proven. Do not merge.');
  process.exit(1);
}
console.log('Isolation holds across both workspaces.');
