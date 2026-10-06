/**
 * Eligibility **counts** of `HSE-CONTACT-1.0` §5.
 *
 * This module calculates how many employees would be eligible for an alert
 * today. It sends nothing, it builds no recipient list, and it returns numbers
 * only: no employee code, no name, no email address and no phone number.
 *
 * Decision P-01 is still pending, so the default list of approved
 * communication bases is **empty**. `not_defined` is accepted when a contact
 * file is imported, but it is never an eligible basis, so with the default
 * policy every count is 0. A non-zero count before P-01 is approved is a defect
 * (CONTACT-CONTRACT.md §5).
 *
 * Scope limits: pure function, no clock, no network, no storage, no UI. The
 * compliance items are given by the caller, already computed by the engine.
 */

import { STATUS } from '../constants.js';

/**
 * While P-01 is pending no basis authorises sending. This list stays empty in
 * production; a caller MAY pass the bases of an approved decision instead.
 */
export const DEFAULT_APPROVED_BASES = Object.freeze([]);

/** Contact statuses that may receive an alert (default of decision P-05). */
export const DEFAULT_ALLOWED_CONTACT_STATUSES = Object.freeze(['verified']);

/** The alert window of §5: 0 to 15 days after the As Of Date, both inclusive. */
export const ALERT_WINDOW_DAYS = Object.freeze({ min: 0, max: 15 });

/**
 * A compliance item counts for an alert only when it is a real, counted
 * mandatory item of status `EXPIRING_30` whose expiry falls inside the window.
 * `NOT_REQUIRED` and a missing `daysRemaining` never count.
 */
export function isAlertItem(item) {
  if (!item || item.Mandatory !== true) return false;
  if (item.Status !== STATUS.EXPIRING_30) return false;
  const days = item.Days_Remaining ?? item.daysRemaining;
  if (typeof days !== 'number' || !Number.isFinite(days)) return false;
  return days >= ALERT_WINDOW_DAYS.min && days <= ALERT_WINDOW_DAYS.max;
}

function hasEvidence(contact) {
  return Boolean(contact?.authorization_reference) && Boolean(contact?.authorization_recorded_at);
}

/**
 * Count the employees that would be eligible per channel.
 *
 * Input:
 * - `contacts`: normalised contact rows of `validateContactPackage`.
 * - `approvedEmployees`: the approved employee rows; `employee_code` is matched
 *   exactly.
 * - `complianceItems`: the universe the engine produced.
 * - `authorizationPolicy` MAY carry `{ approvedBases, requireEvidence }`. The
 *   default list of bases is empty, so every count is 0 while P-01 is pending.
 * - `allowedContactStatuses` MAY override the default `['verified']` (P-05).
 *
 * Returns `{ email, whatsapp }`: numbers only, frozen. An employee is counted
 * at most once per channel, whatever the number of its compliance items.
 */
export function countContactEligibility({
  contacts,
  approvedEmployees,
  complianceItems,
  authorizationPolicy,
  allowedContactStatuses = DEFAULT_ALLOWED_CONTACT_STATUSES,
} = {}) {
  const approvedBases = authorizationPolicy?.approvedBases ?? DEFAULT_APPROVED_BASES;
  const requireEvidence = authorizationPolicy?.requireEvidence ?? true;
  const statuses = [...allowedContactStatuses];

  const activeEmployees = new Set();
  for (const employee of approvedEmployees ?? []) {
    if (employee?.employee_code && employee.employment_status === 'Active') {
      activeEmployees.add(employee.employee_code);
    }
  }

  // Employees with at least one counted mandatory item inside the window.
  const dueEmployees = new Set();
  for (const item of complianceItems ?? []) {
    if (isAlertItem(item) && item.Employee_ID) dueEmployees.add(item.Employee_ID);
  }

  const countedEmail = new Set();
  const countedWhatsapp = new Set();

  for (const contact of contacts ?? []) {
    const code = contact?.employee_code;
    if (!code) continue;
    if (!activeEmployees.has(code)) continue;
    if (!dueEmployees.has(code)) continue;
    if (!statuses.includes(contact.contact_status)) continue;

    const basis = contact.communication_authorization_basis;
    if (!basis || !approvedBases.includes(basis)) continue;
    if (requireEvidence && !hasEvidence(contact)) continue;

    if (contact.email_allowed === 'Yes' && contact.email) countedEmail.add(code);
    if (contact.whatsapp_allowed === 'Yes' && contact.phone_e164) countedWhatsapp.add(code);
  }

  return Object.freeze({ email: countedEmail.size, whatsapp: countedWhatsapp.size });
}
