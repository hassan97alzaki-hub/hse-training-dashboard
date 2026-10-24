/**
 * Cloud trial: how long the signed-in workspace's trial has left.
 *
 * Not to be confused with src/lib/trial.js, which is the build-time
 * presentation of the downloadable trial archive. Here the end of the trial is
 * a column in the database, `workspaces.trial_ends_at`, and the database
 * enforces it: from that instant row-level security refuses every write to
 * the training data (supabase/migrations/20261024120000_trial-expiry.sql).
 * What this module computes is only what the banner says.
 *
 * `trial_ends_at` is NULL for a workspace that is not a trial. Such a
 * workspace has no countdown and is never frozen.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days left, counting today, or null when there is nothing to count
 * down: no trial, an unreadable date, or a trial that has already ended.
 *
 * The end is midnight in Asia/Riyadh at the start of the day after the last
 * one, so rounding the remaining time up gives the calendar days left there:
 * 7 on the first day, 1 on the last.
 *
 * @param {string|null} trialEndsAt - ISO timestamp from the database
 * @param {Date} now
 * @returns {number|null}
 */
export function trialDaysRemaining(trialEndsAt, now = new Date()) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const left = end - now.getTime();
  if (left <= 0) return null;
  return Math.ceil(left / DAY_MS);
}

/**
 * Whether the trial has ended, by this page's clock. The database decides the
 * freeze by its own clock; this only chooses which notice to show.
 *
 * @param {string|null} trialEndsAt
 * @param {Date} now
 * @returns {boolean}
 */
export function trialHasEnded(trialEndsAt, now = new Date()) {
  if (!trialEndsAt) return false;
  const end = new Date(trialEndsAt).getTime();
  return !Number.isNaN(end) && end <= now.getTime();
}

/**
 * The trial state the banner needs, read with the signed-in account's own
 * rights. Null when there is no backend, no session or no workspace — the
 * local-only build and a signed-out page both show no banner.
 *
 * @param {object|null} client - a Supabase client
 * @returns {Promise<{role: string|null, trialEndsAt: string|null}|null>}
 */
export async function fetchCloudTrial(client) {
  if (!client) return null;

  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return null;

  // The workspace every row of this account lands in; see 0003_workspaces.sql.
  const { data: workspaceId, error: wsError } = await client.rpc('default_workspace_id');
  if (wsError || !workspaceId) return null;

  const [{ data: member }, { data: workspace }] = await Promise.all([
    client.from('workspace_members').select('role')
      .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(),
    client.from('workspaces').select('trial_ends_at').eq('id', workspaceId).maybeSingle(),
  ]);

  return { role: member?.role ?? null, trialEndsAt: workspace?.trial_ends_at ?? null };
}
