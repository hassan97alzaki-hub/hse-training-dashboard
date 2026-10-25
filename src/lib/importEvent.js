// Records that a training file was imported (SPECS-TRIAL v1.4, R-1).
//
// Only the fact goes to the database — the time (set by the database) and the
// number of training rows — through `record_import()`
// (migration 20261025150000_workspace-last-import.sql). The imported data
// itself stays in the browser until R-3.
//
// Never throws and never blocks the import: the import has already succeeded
// in the browser, and a missing event must not turn it into an error. Nothing
// about the file or its rows is logged.

import { isSupabaseConfigured, getSupabaseClient } from './supabaseClient.js';

/**
 * @param {number} rowCount - training rows in the import
 * @param {{client?: object, configured?: boolean}} [deps] - for tests
 * @returns {Promise<{recorded: boolean, reason?: string}>}
 */
export async function recordImportEvent(rowCount, deps = {}) {
  const configured = deps.configured ?? isSupabaseConfigured();
  if (!configured) return { recorded: false, reason: 'local' };
  if (!Number.isInteger(rowCount) || rowCount < 1) return { recorded: false, reason: 'empty' };

  try {
    const client = deps.client ?? getSupabaseClient();
    const { error } = await client.rpc('record_import', { row_count: rowCount });
    if (error) return { recorded: false, reason: 'error' };
    return { recorded: true };
  } catch {
    return { recorded: false, reason: 'error' };
  }
}
