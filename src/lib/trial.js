/**
 * Trial Mode — an optional, build-time presentation layer for a seven-day
 * company trial.
 *
 * ────────────────────────────────────────────────────────────────────────
 * SECURITY NOTICE — READ BEFORE RELYING ON THIS MODULE
 *
 * Everything here is a **user-experience gate, not access control**. The
 * dates live in the build, the countdown is computed in the browser and the
 * expiry only disables buttons in this page. Anyone can change the device
 * clock, edit the bundle or open the file offline, so a trial that has ended
 * can still be used by someone who wants to.
 *
 * Real expiry of access MUST be enforced where the files are served:
 * Cloudflare Access, a signed URL with a deadline, HTTP auth, or the removal
 * of the deployment. See `docs/TRIAL_BUILD_AND_RUN.md`.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Scope rules of this module:
 * - Pure functions over an explicit `now`; no storage, no cookies, no
 *   analytics, no telemetry and no network call.
 * - With `VITE_TRIAL_MODE` unset the application behaves exactly as before:
 *   `readTrialConfig()` returns a disabled configuration and every gate is
 *   open.
 * - Days are calendar days in `Asia/Riyadh` (`REPORTING_TIME_ZONE`), the same
 *   rule the As Of Date uses, so a trial boundary never depends on the device
 *   time zone.
 */

import { REPORTING_TIME_ZONE } from './constants.js';
import { toReportingDateStr } from './clock.js';
import { isValidDateStr, dateDiffDays } from './normalization.js';

/** The trial is a fixed seven-day window; the length is documented, not read. */
export const TRIAL_LENGTH_DAYS = 7;

/** Phases of a trial. `off` means the feature is not built into this bundle. */
export const TRIAL_PHASE = Object.freeze({
  OFF: 'off',
  BEFORE: 'before',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  MISCONFIGURED: 'misconfigured',
});

function flag(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function text(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Read the trial configuration from the build environment.
 *
 * `env` is injectable so tests never depend on how the bundle was built.
 * Accepted variables:
 * - `VITE_TRIAL_MODE` — `true` turns the trial presentation on.
 * - `VITE_TRIAL_COMPANY` — the company the trial is prepared for.
 * - `VITE_TRIAL_START_DATE`, `VITE_TRIAL_END_DATE` — `YYYY-MM-DD`, inclusive.
 */
export function readTrialConfig(env = import.meta.env) {
  const enabled = flag(env?.VITE_TRIAL_MODE);
  if (!enabled) {
    return Object.freeze({ enabled: false, company: '', startDate: '', endDate: '' });
  }
  return Object.freeze({
    enabled: true,
    company: text(env?.VITE_TRIAL_COMPANY),
    startDate: text(env?.VITE_TRIAL_START_DATE),
    endDate: text(env?.VITE_TRIAL_END_DATE),
    timeZone: REPORTING_TIME_ZONE,
  });
}

/**
 * Resolve the state of a trial at `now`.
 *
 * Both bounds are inclusive: the start day and the end day are inside the
 * trial. `daysRemaining` counts the end day itself, so it is 1 on the last
 * day and 0 once the trial has ended.
 *
 * A configuration that is enabled but unusable (missing or unreadable dates,
 * end before start) is `misconfigured`: the banner says so and **no gate is
 * closed**, because a broken build must not silently lock a customer out.
 */
export function resolveTrialState(config, now = new Date()) {
  if (!config?.enabled) {
    return Object.freeze({ phase: TRIAL_PHASE.OFF, active: false, expired: false, daysRemaining: null });
  }

  const today = toReportingDateStr(now);
  const { startDate, endDate, company } = config;
  const datesUsable = isValidDateStr(startDate) && isValidDateStr(endDate) && endDate >= startDate;

  if (!datesUsable) {
    return Object.freeze({
      phase: TRIAL_PHASE.MISCONFIGURED,
      active: false,
      expired: false,
      today,
      company,
      startDate,
      endDate,
      daysRemaining: null,
      timeZone: REPORTING_TIME_ZONE,
    });
  }

  const beforeStart = dateDiffDays(today, startDate) < 0;
  const afterEnd = dateDiffDays(today, endDate) > 0;
  const daysRemaining = afterEnd ? 0 : dateDiffDays(endDate, today) + 1;

  return Object.freeze({
    phase: beforeStart ? TRIAL_PHASE.BEFORE : afterEnd ? TRIAL_PHASE.EXPIRED : TRIAL_PHASE.ACTIVE,
    active: !beforeStart && !afterEnd,
    expired: afterEnd,
    today,
    company,
    startDate,
    endDate,
    daysRemaining,
    totalDays: dateDiffDays(endDate, startDate) + 1,
    timeZone: REPORTING_TIME_ZONE,
  });
}

/**
 * Whether customer data may be imported and approved.
 *
 * Closed only while a correctly configured trial has ended. The synthetic
 * demonstration dataset stays available in every phase, so the application
 * can still be shown after the trial.
 *
 * This is the UX gate of the notice at the top of this file, never a security
 * boundary.
 */
export function customerDataAllowed(state) {
  return !(state?.phase === TRIAL_PHASE.EXPIRED);
}

/** The i18n key of the banner headline for a phase. */
export function trialHeadlineKey(phase) {
  switch (phase) {
    case TRIAL_PHASE.BEFORE:
      return 'trialHeadlineBefore';
    case TRIAL_PHASE.ACTIVE:
      return 'trialHeadlineActive';
    case TRIAL_PHASE.EXPIRED:
      return 'trialHeadlineExpired';
    case TRIAL_PHASE.MISCONFIGURED:
      return 'trialHeadlineMisconfigured';
    default:
      return '';
  }
}
