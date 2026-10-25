/**
 * What the trial-signup Edge Function does with one request, kept apart from
 * Deno so the tests can run it with a stand-in client.
 *
 * `admin` is a Supabase client built with the service-role key. It never
 * reaches a browser: the function runs on Supabase, and the page only ever
 * sees the status this returns.
 *
 * Statuses the page understands:
 *   created  — the account exists with a seven-day trial; the page signs in
 *   exists   — an account with this email is already there; the page offers sign-in
 *   waitlist — the twenty trial places are taken; the request is recorded
 *   invalid  — a field failed the shared checks; `errors` names them
 *   failed   — something broke; nothing was left half made
 */

import { toTrialRow, isAcceptablePassword } from './trialSignup.js';

/** Auth's answer when the address is taken. Matched loosely: the wording moves between releases. */
function isAlreadyRegistered(error) {
  return error?.status === 422 || /already (been )?registered|already exists/i.test(error?.message ?? '');
}

/**
 * @param {object} admin - Supabase client with the service-role key
 * @param {object} input - the form values as sent, plus `sourceLanding` and `password`
 * @returns {Promise<{status: string, errors?: object}>}
 */
export async function provisionTrial(admin, input = {}) {
  const result = toTrialRow(input, input.sourceLanding);
  const errors = { ...result.errors };
  if (!isAcceptablePassword(input.password)) errors.password = true;
  if (!result.ok || Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const row = result.row;
  // A bot filled the hidden field. Tell it nothing useful and create nothing.
  if (row.honeypot) return { status: 'invalid', errors: {} };

  const { data: slots, error: slotsError } = await admin.rpc('trial_slots_left');
  if (slotsError) return { status: 'failed' };

  if (slots <= 0) {
    const { error } = await admin.from('trial_signups').insert({ ...row, honeypot: null });
    // A repeat from the same address is still on the list.
    if (error && error.code !== '23505') return { status: 'failed' };
    return { status: 'waitlist' };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: row.work_email,
    password: String(input.password),
    // No message can be sent until the domain and its mail provider exist, so
    // the address is accepted as given. The cap bounds what that can cost.
    email_confirm: true,
    user_metadata: { company_name: row.company_name },
  });
  if (createError) return { status: isAlreadyRegistered(createError) ? 'exists' : 'failed' };

  const userId = created?.user?.id;
  const { error: provisionError } = await admin.rpc('provision_trial', {
    p_user: userId,
    p_company: row.company_name,
    p_email: row.work_email,
    p_country: row.country,
    p_headcount: row.headcount_estimate,
    p_file_format: row.file_format,
    p_interest: row.interest,
    p_source: row.source_landing,
  });

  if (provisionError) {
    // An account without a trial workspace would get a workspace that never
    // ends at its first sign-in. Take the account back instead.
    await admin.auth.admin.deleteUser(userId);
    return { status: 'failed' };
  }

  return { status: 'created' };
}
