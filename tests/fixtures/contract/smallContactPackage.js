/**
 * A small, valid `HSE-CONTACT-1.0` package committed as code.
 *
 * Reserved values only: emails in `example.invalid` and phone numbers under the
 * unassigned country code 999. The only communication basis is `not_defined`,
 * so the package passes validation while every eligibility count stays 0 under
 * the default policy (decision P-01 is pending).
 */

import { FIXED_DATES } from './generateSyntheticPackage.js';

export const CONTACT_SHEET_NAMES = Object.freeze(['_Contract', 'Contacts']);

export const smallContactPackage = Object.freeze({
  asOfDate: FIXED_DATES.asOfDate,
  sheetNames: CONTACT_SHEET_NAMES,
  contract: Object.freeze({
    contract_version: 'HSE-CONTACT-1.0',
    organization_code: 'TST-ORG',
    extract_date: FIXED_DATES.extractDate,
    prepared_by_role: 'Training Coordinator',
  }),
  contacts: Object.freeze([
    {
      employee_code: 'TST-0001',
      email: 'test.employee001@example.invalid',
      phone_e164: '+999000000001',
      preferred_language: 'ar',
      email_allowed: 'Yes',
      whatsapp_allowed: 'Yes',
      communication_authorization_basis: 'not_defined',
      authorization_reference: '',
      authorization_recorded_at: '',
      contact_status: 'verified',
      verified_at: '2026-12-02',
    },
    {
      employee_code: 'TST-0002',
      email: 'test.employee002@example.invalid',
      phone_e164: '+999000000002',
      preferred_language: 'en',
      email_allowed: 'No',
      whatsapp_allowed: 'Yes',
      communication_authorization_basis: 'not_defined',
      authorization_reference: '',
      authorization_recorded_at: '',
      contact_status: 'unverified',
      verified_at: '',
    },
  ]),
  expected: Object.freeze({
    contacts: 2,
    blockingIssues: 0,
    eligibility: Object.freeze({ email: 0, whatsapp: 0 }),
  }),
});
