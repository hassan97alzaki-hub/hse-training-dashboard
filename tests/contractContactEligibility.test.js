import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { STATUS } from '../src/lib/constants.js';
import {
  countContactEligibility,
  isAlertItem,
  DEFAULT_APPROVED_BASES,
  DEFAULT_ALLOWED_CONTACT_STATUSES,
  ALERT_WINDOW_DAYS,
  NEVER_ELIGIBLE_BASES,
  hasUsableEmail,
  hasUsablePhone,
} from '../src/lib/contract/contactEligibility.js';
import {
  validateContactPackage,
  UNDEFINED_BASIS,
} from '../src/lib/contract/contactValidation.js';

const ORG = 'TST-ORG';
const EXTRACT = '2027-01-10';
const AS_OF = '2027-01-12';

// An explicit future policy, used only to prove the mechanism. It is never the
// default and it changes no production schema: decision P-01 stays pending.
const FUTURE_POLICY = Object.freeze({ approvedBases: ['consent'], requireEvidence: true });

const employee = (code, overrides = {}) => ({
  employee_code: code,
  full_name: `Test Employee ${code}`,
  department_code: 'OPS',
  job_title_code: 'OPR',
  employment_status: 'Active',
  ...overrides,
});

const contact = (code, overrides = {}) => ({
  employee_code: code,
  email: `test.${code.toLowerCase()}@example.invalid`,
  phone_e164: '+999000000001',
  preferred_language: 'ar',
  email_allowed: 'Yes',
  whatsapp_allowed: 'Yes',
  communication_authorization_basis: 'consent',
  authorization_reference: 'PRV-DEC-0001',
  authorization_recorded_at: '2026-12-01',
  contact_status: 'verified',
  verified_at: '2026-12-02',
  ...overrides,
});

const item = (code, overrides = {}) => ({
  Employee_ID: code,
  Course_Code: 'H2S-01',
  Mandatory: true,
  Status: STATUS.EXPIRING_30,
  daysRemaining: 10,
  ...overrides,
});

const count = (overrides = {}) =>
  countContactEligibility({
    contacts: [contact('TST-0001')],
    approvedEmployees: [employee('TST-0001')],
    complianceItems: [item('TST-0001')],
    authorizationPolicy: FUTURE_POLICY,
    ...overrides,
  });

describe('the default policy counts nothing (P-01 pending)', () => {
  it('has an empty list of approved bases', () => {
    expect(DEFAULT_APPROVED_BASES).toEqual([]);
    expect(Object.isFrozen(DEFAULT_APPROVED_BASES)).toBe(true);
    expect(DEFAULT_ALLOWED_CONTACT_STATUSES).toEqual(['verified']);
  });

  it('returns 0 for both channels with no policy at all', () => {
    const result = countContactEligibility({
      contacts: [contact('TST-0001'), contact('TST-0002')],
      approvedEmployees: [employee('TST-0001'), employee('TST-0002')],
      complianceItems: [item('TST-0001'), item('TST-0002')],
    });
    expect(result).toEqual({ email: 0, whatsapp: 0 });
  });

  it('never makes not_defined eligible, under any default', () => {
    for (const policy of [undefined, {}, { approvedBases: DEFAULT_APPROVED_BASES }, { requireEvidence: false }]) {
      const result = countContactEligibility({
        contacts: [
          contact('TST-0001', {
            communication_authorization_basis: UNDEFINED_BASIS,
            authorization_reference: '',
            authorization_recorded_at: '',
          }),
        ],
        approvedEmployees: [employee('TST-0001')],
        complianceItems: [item('TST-0001')],
        authorizationPolicy: policy,
      });
      expect(result, JSON.stringify(policy)).toEqual({ email: 0, whatsapp: 0 });
    }
  });

  it('keeps not_defined out of the count even when a caller lists it', () => {
    expect(NEVER_ELIGIBLE_BASES).toEqual([UNDEFINED_BASIS]);
    const row = contact('TST-0001', {
      communication_authorization_basis: UNDEFINED_BASIS,
      authorization_reference: 'PRV-DEC-0001',
      authorization_recorded_at: '2026-12-01',
    });
    for (const approvedBases of [[UNDEFINED_BASIS], [UNDEFINED_BASIS, 'consent']]) {
      expect(
        count({ contacts: [row], authorizationPolicy: { approvedBases } }),
        JSON.stringify(approvedBases),
      ).toEqual({ email: 0, whatsapp: 0 });
    }
    // Another basis of the same explicit policy is unaffected.
    expect(
      count({
        contacts: [contact('TST-0001')],
        authorizationPolicy: { approvedBases: [UNDEFINED_BASIS, 'consent'] },
      }),
    ).toEqual({ email: 1, whatsapp: 1 });
  });

  it('stays 0 for a package that passed validation with not_defined', () => {
    const validated = validateContactPackage({
      contract: {
        contract_version: 'HSE-CONTACT-1.0',
        organization_code: ORG,
        extract_date: EXTRACT,
        prepared_by_role: 'Training Coordinator',
      },
      contacts: [
        contact('TST-0001', {
          communication_authorization_basis: UNDEFINED_BASIS,
          authorization_reference: '',
          authorization_recorded_at: '',
          contact_status: 'verified',
        }),
      ],
      sheetNames: ['_Contract', 'Contacts'],
      boundOrganizationCode: ORG,
      approvedEmployees: [employee('TST-0001')],
      asOfDate: AS_OF,
    });
    expect(validated.ok).toBe(true);
    expect(validated.rows).toHaveLength(1);

    const result = countContactEligibility({
      contacts: validated.rows,
      approvedEmployees: [employee('TST-0001')],
      complianceItems: [item('TST-0001')],
    });
    expect(result).toEqual({ email: 0, whatsapp: 0 });
  });
});

describe('eligibility conditions', () => {
  it('counts a fully eligible employee under an explicit policy', () => {
    expect(count()).toEqual({ email: 1, whatsapp: 1 });
  });

  it('counts an employee once per channel however many items are due', () => {
    const result = count({
      complianceItems: [
        item('TST-0001', { Course_Code: 'H2S-01', daysRemaining: 3 }),
        item('TST-0001', { Course_Code: 'FA-01', daysRemaining: 9 }),
        item('TST-0001', { Course_Code: 'FF-01', daysRemaining: 15 }),
      ],
    });
    expect(result).toEqual({ email: 1, whatsapp: 1 });
  });

  it('counts each channel on its own', () => {
    expect(count({ contacts: [contact('TST-0001', { whatsapp_allowed: 'No' })] })).toEqual({
      email: 1,
      whatsapp: 0,
    });
    expect(count({ contacts: [contact('TST-0001', { email_allowed: 'No' })] })).toEqual({
      email: 0,
      whatsapp: 1,
    });
    expect(
      count({ contacts: [contact('TST-0001', { email_allowed: 'Unknown', whatsapp_allowed: 'Unknown' })] }),
    ).toEqual({ email: 0, whatsapp: 0 });
  });

  it('needs the channel value, not only the flag', () => {
    expect(count({ contacts: [contact('TST-0001', { email: '' })] })).toEqual({ email: 0, whatsapp: 1 });
    expect(count({ contacts: [contact('TST-0001', { phone_e164: '' })] })).toEqual({ email: 1, whatsapp: 0 });
  });

  it('needs an approved and active employee', () => {
    expect(count({ approvedEmployees: [] })).toEqual({ email: 0, whatsapp: 0 });
    for (const status of ['Inactive', 'Left', '', undefined]) {
      expect(
        count({ approvedEmployees: [employee('TST-0001', { employment_status: status })] }),
        String(status),
      ).toEqual({ email: 0, whatsapp: 0 });
    }
  });

  it('needs an allowed contact_status', () => {
    for (const status of ['unverified', 'invalid', 'withdrawn']) {
      expect(count({ contacts: [contact('TST-0001', { contact_status: status })] }), status).toEqual({
        email: 0,
        whatsapp: 0,
      });
    }
    // An explicit decision could widen the list (P-05).
    expect(
      count({
        contacts: [contact('TST-0001', { contact_status: 'unverified' })],
        allowedContactStatuses: ['verified', 'unverified'],
      }),
    ).toEqual({ email: 1, whatsapp: 1 });
  });

  it('needs a basis inside the approved list', () => {
    expect(count({ contacts: [contact('TST-0001', { communication_authorization_basis: 'other' })] })).toEqual(
      { email: 0, whatsapp: 0 },
    );
    expect(count({ contacts: [contact('TST-0001', { communication_authorization_basis: '' })] })).toEqual({
      email: 0,
      whatsapp: 0,
    });
  });

  it('needs the evidence of the basis', () => {
    expect(count({ contacts: [contact('TST-0001', { authorization_reference: '' })] })).toEqual({
      email: 0,
      whatsapp: 0,
    });
    expect(count({ contacts: [contact('TST-0001', { authorization_recorded_at: '' })] })).toEqual({
      email: 0,
      whatsapp: 0,
    });
    // Evidence cannot be switched off: a legacy requireEvidence flag is ignored.
    expect(
      count({
        contacts: [contact('TST-0001', { authorization_reference: '', authorization_recorded_at: '' })],
        authorizationPolicy: { approvedBases: ['consent'], requireEvidence: false },
      }),
    ).toEqual({ email: 0, whatsapp: 0 });
    // With the evidence present the same policy counts.
    expect(
      count({ authorizationPolicy: { approvedBases: ['consent'], requireEvidence: false } }),
    ).toEqual({ email: 1, whatsapp: 1 });
  });

  it('refuses a channel value that does not match its pattern', () => {
    for (const email of ['bad', 'a@b', 'no-at-sign', ' ', 'TST@', 42, null]) {
      expect(count({ contacts: [contact('TST-0001', { email })] }), String(email)).toMatchObject({
        email: 0,
      });
    }
    for (const phone of [
      'bad',
      '+999 00000001',
      '+999-00000001',
      '(+999)00000001',
      '999000000001',
      '+0990000001',
      '+99900',
      42,
      null,
    ]) {
      expect(count({ contacts: [contact('TST-0001', { phone_e164: phone })] }), String(phone)).toMatchObject(
        { whatsapp: 0 },
      );
    }
  });

  it('counts the other channel when one channel value is unusable', () => {
    expect(count({ contacts: [contact('TST-0001', { email: 'bad' })] })).toEqual({
      email: 0,
      whatsapp: 1,
    });
    expect(count({ contacts: [contact('TST-0001', { phone_e164: '+999 00000001' })] })).toEqual({
      email: 1,
      whatsapp: 0,
    });
  });

  it('uses the same patterns as the validator', () => {
    expect(hasUsableEmail({ email: 'test.one@example.invalid' })).toBe(true);
    expect(hasUsableEmail({ email: 'bad' })).toBe(false);
    expect(hasUsableEmail({})).toBe(false);
    expect(hasUsablePhone({ phone_e164: '+999000000001' })).toBe(true);
    expect(hasUsablePhone({ phone_e164: '+999 00000001' })).toBe(false);
    expect(hasUsablePhone({})).toBe(false);
  });

  it('ignores a contact without an employee_code', () => {
    expect(count({ contacts: [contact('TST-0001', { employee_code: '' })] })).toEqual({
      email: 0,
      whatsapp: 0,
    });
  });
});

describe('the compliance item that makes an employee due', () => {
  it('includes the window bounds 0 and 15', () => {
    for (const days of [0, 1, 15]) {
      expect(count({ complianceItems: [item('TST-0001', { daysRemaining: days })] }), String(days)).toEqual({
        email: 1,
        whatsapp: 1,
      });
    }
    expect(ALERT_WINDOW_DAYS).toEqual({ min: 0, max: 15 });
  });

  it('excludes -1 and 16', () => {
    for (const days of [-1, 16, 30, -30]) {
      expect(count({ complianceItems: [item('TST-0001', { daysRemaining: days })] }), String(days)).toEqual({
        email: 0,
        whatsapp: 0,
      });
    }
  });

  it('excludes an item that is not mandatory', () => {
    expect(count({ complianceItems: [item('TST-0001', { Mandatory: false })] })).toEqual({
      email: 0,
      whatsapp: 0,
    });
  });

  it('excludes every other status', () => {
    for (const status of [
      STATUS.VALID,
      STATUS.EXPIRED,
      STATUS.MISSING,
      STATUS.NOT_REQUIRED,
      STATUS.EXPIRING_60,
      STATUS.EXPIRING_90,
      STATUS.IN_PROGRESS,
      STATUS.NOT_STARTED,
    ]) {
      expect(count({ complianceItems: [item('TST-0001', { Status: status })] }), status).toEqual({
        email: 0,
        whatsapp: 0,
      });
    }
  });

  it('excludes an item without a usable daysRemaining', () => {
    for (const days of [null, undefined, Number.NaN, '10']) {
      expect(count({ complianceItems: [item('TST-0001', { daysRemaining: days })] }), String(days)).toEqual({
        email: 0,
        whatsapp: 0,
      });
    }
  });

  it('excludes an employee with no item at all', () => {
    expect(count({ complianceItems: [] })).toEqual({ email: 0, whatsapp: 0 });
    expect(count({ complianceItems: [item('TST-0002')] })).toEqual({ email: 0, whatsapp: 0 });
  });

  it('exposes the rule through isAlertItem', () => {
    expect(isAlertItem(item('TST-0001'))).toBe(true);
    expect(isAlertItem(item('TST-0001', { Status: STATUS.NOT_REQUIRED }))).toBe(false);
    expect(isAlertItem(item('TST-0001', { Mandatory: false }))).toBe(false);
    expect(isAlertItem(undefined)).toBe(false);
    // The engine field name is daysRemaining; Days_Remaining is accepted too.
    expect(isAlertItem({ Mandatory: true, Status: STATUS.EXPIRING_30, Days_Remaining: 5 })).toBe(true);
  });
});

describe('AT-15: nothing is sent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes no network request during validation or counting', () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    const beacon = vi.fn();
    const originalBeacon = globalThis.navigator?.sendBeacon;
    if (globalThis.navigator) globalThis.navigator.sendBeacon = beacon;

    try {
      const validated = validateContactPackage({
        contract: {
          contract_version: 'HSE-CONTACT-1.0',
          organization_code: ORG,
          extract_date: EXTRACT,
          prepared_by_role: 'Training Coordinator',
        },
        contacts: [
          contact('TST-0001', {
            communication_authorization_basis: UNDEFINED_BASIS,
            authorization_reference: '',
            authorization_recorded_at: '',
          }),
        ],
        sheetNames: ['_Contract', 'Contacts'],
        boundOrganizationCode: ORG,
        approvedEmployees: [employee('TST-0001')],
        asOfDate: AS_OF,
      });
      const counts = countContactEligibility({
        contacts: validated.rows,
        approvedEmployees: [employee('TST-0001')],
        complianceItems: [item('TST-0001')],
      });

      expect(validated.ok).toBe(true);
      expect(counts).toEqual({ email: 0, whatsapp: 0 });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      if (globalThis.navigator && originalBeacon) globalThis.navigator.sendBeacon = originalBeacon;
    }
  });

  it('contains no sending code and no provider import', () => {
    for (const file of [
      'src/lib/contract/contactValidation.js',
      'src/lib/contract/contactEligibility.js',
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
      expect(source, file).not.toContain('XMLHttpRequest');
      expect(source, file).not.toContain('WebSocket');
      expect(source, file).not.toContain('sendBeacon');
      expect(source, file).not.toContain('EventSource');
      for (const provider of ['twilio', 'resend', 'nodemailer', 'sendgrid', 'whatsapp', 'graph.facebook', 'mailgun', 'postmark']) {
        expect(source.toLowerCase(), `${file}: ${provider}`).not.toContain(`'${provider}`);
        expect(source.toLowerCase(), `${file}: ${provider}`).not.toContain(`"${provider}`);
      }
      // No placeholder sending function either.
      expect(source, file).not.toMatch(/function\s+send[A-Z]/);
      expect(source, file).not.toContain('localStorage');
      expect(source, file).not.toContain('console.');
    }
  });
});

describe('privacy and purity of the counting', () => {
  it('returns numbers only, with no list and no identifier', () => {
    const result = count();
    expect(Object.keys(result).sort()).toEqual(['email', 'whatsapp']);
    for (const value of Object.values(result)) expect(typeof value).toBe('number');
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('TST-');
    expect(serialised).not.toContain('@');
    expect(serialised).not.toContain('+999');
    expect(result).toEqual({ email: 1, whatsapp: 1 });
  });

  it('freezes the result', () => {
    const result = count();
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => {
      'use strict';
      result.email = 99;
    }).toThrow(TypeError);
  });

  it('does not change its inputs', () => {
    const contacts = [contact('TST-0001')];
    const employees = [employee('TST-0001')];
    const items = [item('TST-0001')];
    const snapshot = JSON.stringify({ contacts, employees, items });
    countContactEligibility({
      contacts,
      approvedEmployees: employees,
      complianceItems: items,
      authorizationPolicy: FUTURE_POLICY,
    });
    expect(JSON.stringify({ contacts, employees, items })).toBe(snapshot);
  });

  it('is deterministic and survives missing input', () => {
    expect(countContactEligibility()).toEqual({ email: 0, whatsapp: 0 });
    expect(countContactEligibility({})).toEqual({ email: 0, whatsapp: 0 });
    expect(count()).toEqual(count());
  });
});
