/**
 * Supabase client (Phase 2C)
 *
 * The cloud backend is optional. Without the two environment variables the
 * application keeps working exactly as before: everything stays in the
 * browser and no request leaves the device. This is what the self-hosted
 * build ships as.
 *
 * With the variables present the same application stores its data in a
 * Supabase project and asks the user to sign in first, so the data follows
 * the account instead of the browser profile.
 *
 * Only the publishable anon key belongs here. It is safe in the bundle
 * because row-level security decides what the signed-in user may read, and
 * the key alone grants nothing. A service-role key must never appear in
 * client code; it belongs in a server environment variable.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Read the Supabase configuration from a build environment.
 * @param {object} env - import.meta.env or an equivalent object
 * @returns {{url: string, anonKey: string, configured: boolean}}
 */
export function readSupabaseConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

/**
 * Whether this build talks to a Supabase project.
 * @param {object} env
 * @returns {boolean}
 */
export function isSupabaseConfigured(env = import.meta.env) {
  return readSupabaseConfig(env).configured;
}

let client = null;

/**
 * The shared Supabase client, or null when the build is not configured for
 * one. Callers must handle null: that is the local-only build.
 *
 * @param {object} env
 * @returns {object|null}
 */
export function getSupabaseClient(env = import.meta.env) {
  const config = readSupabaseConfig(env);
  if (!config.configured) return null;
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Drop the cached client. Tests use this; the application does not.
 */
export function resetSupabaseClient() {
  client = null;
}
