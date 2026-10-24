/**
 * Authentication (Phase 2C)
 *
 * Only meaningful when the build is configured for Supabase. In a local-only
 * build every function here reports "not required", and the application
 * opens straight to the dashboard as it always did.
 *
 * A sign-in is what makes the data belong to an account instead of a browser
 * profile, and it is also what identifies the address a reminder is later
 * sent from (BL-003).
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';

export const AUTH_STATE = Object.freeze({
  NOT_REQUIRED: 'not_required', // local-only build
  LOADING: 'loading',
  SIGNED_OUT: 'signed_out',
  SIGNED_IN: 'signed_in',
});

/**
 * Whether this build asks the user to sign in.
 * @returns {boolean}
 */
export function authRequired() {
  return isSupabaseConfigured();
}

/**
 * The session the client already holds, or null.
 * @returns {Promise<object|null>}
 */
export async function getSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data?.session ?? null;
}

/**
 * Subscribe to sign-in and sign-out.
 * @param {(session: object|null) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function onAuthChange(onChange) {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    onChange(session ?? null);
  });
  return () => data?.subscription?.unsubscribe?.();
}

/**
 * Sign in with an email address and a password.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signIn(email, password) {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'This build has no account backend' };

  const { error } = await client.auth.signInWithPassword({
    email: String(email ?? '').trim(),
    password: String(password ?? ''),
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Sign in with a link sent to an email address.
 *
 * Added alongside the password, not in place of it. Accounts created before
 * this existed have passwords and must keep being able to use them; taking
 * that away would lock out real users to make a new sign-in path tidier.
 *
 * It never creates an account. Accounts are made by the owner, one per trial
 * request (docs/TRIAL_CLOUD_RUNBOOK.md); a link sent to an unknown address
 * signs nobody in.
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signInWithMagicLink(email) {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'This build has no account backend' };

  const trimmed = String(email ?? '').trim();
  if (!trimmed) return { success: false, error: 'Email address required' };

  const { error } = await client.auth.signInWithOtp({
    email: trimmed,
    options: {
      shouldCreateUser: false,
      // Where the link lands. The dashboard is served from /app, and the
      // client is configured with detectSessionInUrl, so it reads the token
      // out of the URL on load.
      emailRedirectTo: `${globalThis.location?.origin ?? ''}/app`,
    },
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * The workspace this account works in, created on the spot if it has none.
 *
 * A workspace cannot be created by the client directly: the policy that would
 * allow the insert has to check membership, and there is no membership until
 * the workspace exists. `bootstrap_workspace_for_user()` does both writes as
 * its owner, outside the policies, and returns the same workspace on every
 * later call — so this is safe to run after any sign-in.
 *
 * @returns {Promise<{success: boolean, workspaceId?: string, error?: string}>}
 */
export async function ensureWorkspace() {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'This build has no account backend' };

  const { data, error } = await client.rpc('bootstrap_workspace_for_user');
  if (error) return { success: false, error: error.message };
  return { success: true, workspaceId: data ?? null };
}

/**
 * Send a password-reset email.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function requestPasswordReset(email) {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'This build has no account backend' };

  const { error } = await client.auth.resetPasswordForEmail(String(email ?? '').trim());
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Sign out.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return { success: true };
  const { error } = await client.auth.signOut();
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * The address a reminder is sent from: the address of the signed-in account.
 * Null in a local-only build, where no account exists and no reminder is
 * sent. See docs/BACKLOG.md, BL-003.
 * @param {object|null} session
 * @returns {string|null}
 */
export function accountEmail(session) {
  return session?.user?.email ?? null;
}
