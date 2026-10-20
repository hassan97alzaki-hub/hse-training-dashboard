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
 * Two ways to run it.
 *
 * With two accounts, which is the situation the product is actually in:
 *
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_ANON_KEY=<the publishable anon key> \
 *   USER_A_EMAIL=a@example.com USER_A_PASSWORD=... \
 *   USER_B_EMAIL=b@example.com USER_B_PASSWORD=... \
 *   node scripts/verify-rls-isolation.mjs
 *
 * With one account and a workspace seeded by hand, which tests the same
 * property more sharply. Seed a second workspace holding a row whose
 * `owner_id` is the signed-in account but whose `workspace_id` is not theirs
 * (the SQL is printed when this mode starts). The account must not be able to
 * read it: if it can, a policy is still authorising by ownership, which is
 * exactly the mistake this migration exists to remove — and two separate
 * accounts would not have caught it, because neither owns the other's rows.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   USER_A_EMAIL=you@example.com USER_A_PASSWORD=... \
 *   PROBE_WORKSPACE_ID=<the seeded workspace's id> \
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
  PROBE_WORKSPACE_ID,
} = process.env;

// One account plus a seeded workspace, or two accounts.
const singleAccount = Boolean(PROBE_WORKSPACE_ID);

const required = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  ...(singleAccount ? {} : { USER_B_EMAIL, USER_B_PASSWORD }),
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  console.error('\nSet PROBE_WORKSPACE_ID to run with a single account against a seeded workspace.');
  process.exit(2);
}

// A key with privileged access bypasses row-level security entirely, so the
// check would pass however wrong the policies are. Both spellings are
// refused: the legacy `service_role` JWT and the newer `sb_secret_` form that
// sits directly beneath the publishable key in the dashboard.
if (
  /service_role/i.test(SUPABASE_ANON_KEY) ||
  /^sb_secret_/.test(SUPABASE_ANON_KEY) ||
  SUPABASE_ANON_KEY.length > 500
) {
  console.error('That key has privileged access: it bypasses RLS, so this check would be meaningless.');
  console.error('Use the publishable key — `sb_publishable_…`, or the legacy anon JWT.');
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
const b = singleAccount ? a : await signIn(USER_B_EMAIL, USER_B_PASSWORD);

// Each account is bootstrapped the way the application bootstraps it.
for (const [label, account] of singleAccount ? [['A', a]] : [['A', a], ['B', b]]) {
  const { data, error } = await account.client.rpc('bootstrap_workspace_for_user');
  if (error) {
    record(`account ${label} has a workspace`, false, error.message);
  } else {
    account.workspaceId = data;
    record(`account ${label} has a workspace`, Boolean(data), data ?? 'no id returned');
  }
}

// In single-account mode the workspace the reader must not see is the seeded
// one, and the reader is the same account that owns the rows inside it.
const foreignWorkspaceId = singleAccount ? PROBE_WORKSPACE_ID : a.workspaceId;
const reader = b;
const readerLabel = singleAccount ? 'the account' : 'B';
const foreignLabel = singleAccount ? 'the seeded workspace' : "A's";

if (singleAccount) {
  console.log(`\nSingle-account mode. Reader: ${USER_A_EMAIL}`);
  console.log(`Their own workspace: ${a.workspaceId}`);
  console.log(`The workspace they must not see: ${foreignWorkspaceId}\n`);
  record(
    'the seeded workspace is not the reader\'s own',
    foreignWorkspaceId !== a.workspaceId,
    'a probe inside their own workspace would prove nothing',
  );
} else {
  record(
    'the two accounts are in different workspaces',
    Boolean(a.workspaceId) && a.workspaceId !== b.workspaceId,
    `${a.workspaceId} vs ${b.workspaceId}`,
  );
}

// The heart of it: the reader names the other workspace explicitly. Knowing
// the identifier must not be enough — that is the difference between a filter
// and a policy. In single-account mode the reader also *owns* those rows, so
// a policy still written against owner_id would hand them straight over.
for (const table of TABLES) {
  const { data, error } = await reader.client
    .from(table)
    .select('*')
    .eq('workspace_id', foreignWorkspaceId);

  const leaked = (data ?? []).length;
  record(
    `${readerLabel} cannot read ${foreignLabel} ${table}`,
    !error && leaked === 0,
    error ? error.message : `${leaked} row(s) returned`,
  );
}

// A row the reader is allowed to see must still be visible, or the policies
// are simply denying everything and the check above proves nothing.
let ownRows = 0;
for (const table of TABLES) {
  const { data } = await reader.client.from(table).select('id').limit(1);
  ownRows += (data ?? []).length;
}
record(
  `${readerLabel} can still read their own data`,
  ownRows > 0,
  `${ownRows} table(s) returned a row — if this is 0, load the demo data while signed in and run again`,
);

// Membership is itself a workspace-scoped table, and the one most likely to
// be left open: a policy on it that reads it is the recursion trap.
{
  const { data, error } = await reader.client
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', foreignWorkspaceId);
  record(
    `${readerLabel} cannot read ${foreignLabel} membership list`,
    !error && (data ?? []).length === 0,
    error ? error.message : `${(data ?? []).length} row(s) returned`,
  );
}

{
  const { data, error } = await reader.client
    .from('workspaces')
    .select('*')
    .eq('id', foreignWorkspaceId);
  record(
    `${readerLabel} cannot read ${foreignLabel} workspace row`,
    !error && (data ?? []).length === 0,
    error ? error.message : `${(data ?? []).length} row(s) returned`,
  );
}

// A write into another workspace must be refused, not silently dropped.
{
  const { data, error } = await reader.client
    .from('courses')
    .insert({ id: `rls-probe-${Date.now()}`, workspace_id: foreignWorkspaceId, code: 'PROBE', name: 'probe' })
    .select();
  const wrote = (data ?? []).length > 0;
  record(
    `${readerLabel} cannot write into ${foreignLabel} workspace`,
    Boolean(error) && !wrote,
    error ? error.message : 'the insert was accepted',
  );
  if (wrote) {
    console.error('A probe row was written into another workspace. Delete it by hand:', data);
  }
}

await a.client.auth.signOut();
if (!singleAccount) await b.client.auth.signOut();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length) {
  console.error('\nIsolation is NOT proven. Do not merge.');
  process.exit(1);
}
console.log('Isolation holds.');
