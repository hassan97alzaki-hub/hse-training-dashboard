import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SEVERITY } from '../src/lib/contract/schema.js';
import { ROW_NUMBER_KEY } from '../src/lib/contract/core.js';
import {
  validateContactPackage,
  CONTACT_ENUMS,
  CONTACT_REQUIRED_FIELDS,
  UNDEFINED_BASIS,
  EMAIL_PATTERN,
  PHONE_E164_PATTERN,
} from '../src/lib/contract/contactValidation.js';

const ORG = 'TST-ORG';
const EXTRACT = '2027-01-10';
const AS_OF = '2027-01-12';

const employee = (code, overrides = {}) => ({
  employee_code: code,
  full_name: `Test Employee ${code}`,
  department_code: 'OPS',
  job_title_code: 'OPR',
  employment_status: 'Active',
  ...overrides,
});

const employees = [
  employee('TST-0001'),
  employee('TST-0002'),
  employee('TST-0003', { employment_status: 'Left', status_effective_date: '2026-12-31' }),
];

const contract = (overrides = {}) => ({
  contract_version: 'HSE-CONTACT-1.0',
  organization_code: ORG,
  extract_date: EXTRACT,
  prepared_by_role: 'Training Coordinator',
  ...overrides,
});

const contact = (code, overrides = {}) => ({
  employee_code: code,
  email: `test.${code.toLowerCase()}@example.invalid`,
  phone_e164: '+999000000001',
  preferred_language: 'ar',
  email_allowed: 'Yes',
  whatsapp_allowed: 'No',
  communication_authorization_basis: UNDEFINED_BASIS,
  authorization_reference: '',
  authorization_recorded_at: '',
  contact_status: 'unverified',
  verified_at: '',
  ...overrides,
});

const run = (overrides = {}) =>
  validateContactPackage({
    contract: contract(),
    contacts: [contact('TST-0001')],
    sheetNames: ['_Contract', 'Contacts'],
    boundOrganizationCode: ORG,
    approvedEmployees: employees,
    asOfDate: AS_OF,
    ...overrides,
  });

const codes = (result) => result.issues.map((entry) => entry.code);
const of = (result, code) => result.issues.filter((entry) => entry.code === code);

describe('contact package: _Contract', () => {
  it('accepts a sound package with the basis not_defined', () => {
    const result = run();
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.contract).toEqual({
      contract_version: 'HSE-CONTACT-1.0',
      organization_code: ORG,
      extract_date: EXTRACT,
      prepared_by_role: 'Training Coordinator',
    });
  });

  it('refuses another contract version, including the training one', () => {
    for (const version of ['', 'HSE-DC-1.0', 'HSE-CONTACT-2.0', 'hse-contact-1.0']) {
      const result = run({ contract: contract({ contract_version: version }) });
      expect(of(result, 'CONTRACT_VERSION')[0], version).toMatchObject({
        sheet: '_Contract',
        field: 'contract_version',
        severity: SEVERITY.BLOCK,
      });
    }
  });

  it('refuses a package while no organization is bound', () => {
    const result = run({ boundOrganizationCode: '' });
    expect(of(result, 'ORG_NOT_LOADED')[0]).toMatchObject({ severity: SEVERITY.BLOCK });
    expect(result.ok).toBe(false);
  });

  it('refuses another organization and normalises the code', () => {
    expect(of(run({ contract: contract({ organization_code: 'OTHER-ORG' }) }), 'ORG_MISMATCH')).toHaveLength(1);
    // The code is a reference code: trimmed and upper-cased before comparing.
    expect(run({ contract: contract({ organization_code: ' tst-org ' }) }).ok).toBe(true);
    expect(of(run({ contract: contract({ organization_code: '' }) }), 'CONTRACT_FIELD')[0]).toMatchObject({
      field: 'organization_code',
    });
  });

  it('refuses an organization_code that is not a reference code', () => {
    for (const bad of ['@@', 'A', 'O'.repeat(21), 'TST ORG', 'TST.ORG', 'org/1']) {
      // Even when the bound organization carries the same text, the code must
      // match the reference pattern first.
      const result = run({
        contract: contract({ organization_code: bad }),
        boundOrganizationCode: bad,
      });
      expect(of(result, 'KEY_PATTERN')[0], bad).toMatchObject({
        sheet: '_Contract',
        field: 'organization_code',
        severity: SEVERITY.BLOCK,
      });
      expect(result.ok, bad).toBe(false);
    }
  });

  it('accepts a valid code and matches it after upper-casing', () => {
    expect(run({ contract: contract({ organization_code: 'TST-ORG' }) }).ok).toBe(true);
    expect(run({ contract: contract({ organization_code: 'tst-org' }) }).ok).toBe(true);
    expect(
      run({ contract: contract({ organization_code: 'tst-org' }), boundOrganizationCode: 'TST-ORG' }).ok,
    ).toBe(true);
    expect(run({ contract: contract({ organization_code: 'AB' }), boundOrganizationCode: 'ab' }).ok).toBe(true);
  });

  it('refuses an invalid or future extract_date', () => {
    for (const bad of ['10/01/2027', '2027-02-30', 'soon']) {
      expect(of(run({ contract: contract({ extract_date: bad }) }), 'DATE_INVALID')[0], bad).toMatchObject({
        field: 'extract_date',
      });
    }
    expect(of(run({ contract: contract({ extract_date: '' }) }), 'CONTRACT_FIELD')[0]).toMatchObject({
      field: 'extract_date',
    });
    const future = run({ contract: contract({ extract_date: '2027-01-13' }) });
    expect(of(future, 'DATE_FUTURE')[0]).toMatchObject({ field: 'extract_date' });
    // The As Of Date itself is allowed.
    expect(run({ contract: contract({ extract_date: AS_OF }) }).ok).toBe(true);
  });

  it('requires a prepared_by_role of 2 to 60 characters', () => {
    for (const bad of ['', ' ', 'A', 'R'.repeat(61)]) {
      expect(of(run({ contract: contract({ prepared_by_role: bad }) }), 'CONTRACT_FIELD')[0], bad).toMatchObject({
        field: 'prepared_by_role',
      });
    }
  });

  it('reports a missing sheet and warns about any other sheet', () => {
    const missing = run({ sheetNames: ['_Contract'] });
    expect(of(missing, 'SHEET_MISSING')[0]).toMatchObject({ sheet: 'Contacts', severity: SEVERITY.BLOCK });

    // A sheet of a training package is unexpected here and is ignored.
    const mixed = run({ sheetNames: ['_Contract', 'Contacts', 'Employees', 'Training_Records'] });
    expect(of(mixed, 'SHEET_UNEXPECTED').map((entry) => entry.sheet)).toEqual([
      'Employees',
      'Training_Records',
    ]);
    expect(of(mixed, 'SHEET_UNEXPECTED')[0].severity).toBe(SEVERITY.WARN);
    expect(mixed.ok).toBe(true);
    expect(mixed.rows).toHaveLength(1);
  });
});

describe('contact package: structure', () => {
  it('refuses a package without a usable sheet list', () => {
    for (const sheetNames of [undefined, null, 'Contacts', 42, {}]) {
      const result = run({ sheetNames });
      expect(result.ok, String(sheetNames)).toBe(false);
      expect(of(result, 'SHEET_MISSING').map((entry) => entry.sheet), String(sheetNames)).toEqual([
        '_Contract',
        'Contacts',
      ]);
    }
  });

  it('refuses a package without _Contract', () => {
    const result = run({ sheetNames: ['Contacts'] });
    expect(result.ok).toBe(false);
    expect(of(result, 'SHEET_MISSING').map((entry) => entry.sheet)).toEqual(['_Contract']);
  });

  it('refuses a package without Contacts and does not report its columns', () => {
    const result = run({ sheetNames: ['_Contract'], contacts: [] });
    expect(result.ok).toBe(false);
    expect(of(result, 'SHEET_MISSING').map((entry) => entry.sheet)).toEqual(['Contacts']);
    // No column noise for a sheet that is not there.
    expect(codes(result)).not.toContain('COLUMN_MISSING');
  });

  it('accepts an empty Contacts sheet that declares a complete header', () => {
    const header = [
      'employee_code',
      'email',
      'phone_e164',
      'preferred_language',
      'email_allowed',
      'whatsapp_allowed',
      'communication_authorization_basis',
      'authorization_reference',
      'authorization_recorded_at',
      'contact_status',
      'verified_at',
    ];
    const result = run({ contacts: [], columns: header });
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.counts).toMatchObject({ input: 0, accepted: 0, columns: 11 });
  });

  it('reports the required columns of an empty Contacts sheet without a header', () => {
    const result = run({ contacts: [] });
    expect(result.ok).toBe(false);
    expect(of(result, 'COLUMN_MISSING').map((entry) => entry.field)).toEqual([
      'employee_code',
      'email_allowed',
      'whatsapp_allowed',
      'communication_authorization_basis',
      'contact_status',
    ]);
  });

  it('reports one missing required column of a declared header', () => {
    const result = run({
      contacts: [],
      columns: ['employee_code', 'email_allowed', 'whatsapp_allowed', 'contact_status'],
    });
    expect(of(result, 'COLUMN_MISSING').map((entry) => entry.field)).toEqual([
      'communication_authorization_basis',
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('contact package: employee_code', () => {
  it('reports a missing employee_code', () => {
    const result = run({ contacts: [contact('   ')] });
    expect(of(result, 'KEY_MISSING')[0]).toMatchObject({ field: 'employee_code', row: 2 });
    expect(result.rows).toHaveLength(0);
  });

  it('reports a repeated employee_code', () => {
    const result = run({ contacts: [contact('TST-0001'), contact('TST-0001')] });
    expect(of(result, 'KEY_DUPLICATE')[0]).toMatchObject({ row: 3, severity: SEVERITY.BLOCK });
    expect(result.counts.duplicateKeys).toBe(1);
  });

  it('reports an employee that is not approved', () => {
    const result = run({ contacts: [contact('TST-9999')] });
    expect(of(result, 'REF_UNKNOWN')[0]).toMatchObject({ field: 'employee_code' });
    expect(result.rows).toHaveLength(0);
  });

  it('matches employee_code case-sensitively', () => {
    // A different case is a different employee, so it is unknown.
    const result = run({ contacts: [contact('tst-0001')] });
    expect(codes(result)).toContain('REF_UNKNOWN');
    // And two cases are not a duplicate of each other.
    const both = run({ contacts: [contact('TST-0001'), contact('TST-0002')] });
    expect(codes(both)).not.toContain('KEY_DUPLICATE');
  });

  it('reports a contact of a non-active employee as information', () => {
    const result = run({ contacts: [contact('TST-0003')] });
    expect(of(result, 'CONTACT_FOR_INACTIVE')[0]).toMatchObject({
      severity: SEVERITY.INFO,
      field: 'employee_code',
    });
    expect(result.ok).toBe(true);
    expect(result.counts.forInactive).toBe(1);
  });
});

describe('contact package: values', () => {
  it('lower-cases the email address', () => {
    const result = run({ contacts: [contact('TST-0001', { email: '  TEST.ONE@Example.Invalid ' })] });
    expect(result.ok).toBe(true);
    expect(result.rows[0].email).toBe('test.one@example.invalid');
  });

  it('refuses an email that does not match local@domain.tld', () => {
    for (const bad of ['no-at-sign', 'a@b', 'a@@b.c', 'a b@c.invalid', '@example.invalid', 'a@.invalid']) {
      const result = run({ contacts: [contact('TST-0001', { email: bad })] });
      expect(of(result, 'CONTACT_EMAIL_INVALID')[0], bad).toMatchObject({
        field: 'email',
        severity: SEVERITY.BLOCK,
      });
    }
    expect(EMAIL_PATTERN.test('test.one@example.invalid')).toBe(true);
  });

  it('refuses a phone number outside E.164', () => {
    for (const bad of ['999000000001', '+0990000001', '+99900', `+9${'9'.repeat(15)}`, '+999-000-0001']) {
      const result = run({ contacts: [contact('TST-0001', { phone_e164: bad, whatsapp_allowed: 'No' })] });
      expect(of(result, 'CONTACT_PHONE_INVALID')[0], bad).toMatchObject({ field: 'phone_e164' });
    }
    expect(PHONE_E164_PATTERN.test('+999000000001')).toBe(true);
  });

  it('does not repair a phone number that is not E.164', () => {
    for (const bad of ['+999 00000001', '+999-00000001', '(+999)00000001', '+999 000 000 001', ' +999 00000001 ']) {
      const result = run({ contacts: [contact('TST-0001', { phone_e164: bad, whatsapp_allowed: 'No' })] });
      expect(of(result, 'CONTACT_PHONE_INVALID')[0], bad).toMatchObject({
        field: 'phone_e164',
        severity: SEVERITY.BLOCK,
      });
      expect(result.rows, bad).toHaveLength(0);
    }
  });

  it('accepts a connected number and trims the ends only', () => {
    const result = run({ contacts: [contact('TST-0001', { phone_e164: '  +999000000001  ' })] });
    expect(result.ok).toBe(true);
    expect(result.rows[0].phone_e164).toBe('+999000000001');
  });

  it('accepts an empty email and phone', () => {
    const result = run({
      contacts: [contact('TST-0001', { email: '', phone_e164: '', email_allowed: 'No' })],
    });
    expect(result.ok).toBe(true);
    expect('email' in result.rows[0]).toBe(false);
    expect(result.counts).toMatchObject({ withEmail: 0, withPhone: 0 });
  });

  it('normalises every enumeration case-insensitively to the contract spelling', () => {
    const result = run({
      contacts: [
        contact('TST-0001', {
          preferred_language: 'AR',
          email_allowed: 'yes',
          whatsapp_allowed: 'UNKNOWN',
          contact_status: 'VERIFIED',
        }),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.rows[0]).toMatchObject({
      preferred_language: 'ar',
      email_allowed: 'Yes',
      whatsapp_allowed: 'Unknown',
      contact_status: 'verified',
    });
  });

  it('refuses a value outside an enumeration', () => {
    const cases = [
      ['preferred_language', 'fr'],
      ['email_allowed', 'Maybe'],
      ['whatsapp_allowed', 'Y'],
      ['contact_status', 'pending'],
    ];
    for (const [field, bad] of cases) {
      const result = run({ contacts: [contact('TST-0001', { [field]: bad })] });
      expect(of(result, 'VALUE_INVALID').map((entry) => entry.field), field).toContain(field);
    }
    expect(CONTACT_ENUMS.contact_status).toEqual(['unverified', 'verified', 'invalid', 'withdrawn']);
    expect(CONTACT_ENUMS.allowed_flag).toEqual(['Yes', 'No', 'Unknown']);
    expect(CONTACT_ENUMS.preferred_language).toEqual(['ar', 'en']);
  });

  it('requires every mandatory field of the sheet', () => {
    expect(CONTACT_REQUIRED_FIELDS).toEqual([
      'employee_code',
      'email_allowed',
      'whatsapp_allowed',
      'communication_authorization_basis',
      'contact_status',
    ]);
    for (const field of ['email_allowed', 'whatsapp_allowed', 'contact_status']) {
      const result = run({ contacts: [contact('TST-0001', { [field]: '' })] });
      expect(of(result, 'REQUIRED_EMPTY').map((entry) => entry.field), field).toContain(field);
    }
  });

  it('warns about an allowed channel without its value', () => {
    const email = run({
      contacts: [contact('TST-0001', { email: '', email_allowed: 'Yes' })],
    });
    expect(of(email, 'CONTACT_CHANNEL_WITHOUT_VALUE')[0]).toMatchObject({
      severity: SEVERITY.WARN,
      field: 'email',
    });
    expect(email.ok).toBe(true);

    const whatsapp = run({
      contacts: [contact('TST-0001', { phone_e164: '', whatsapp_allowed: 'Yes' })],
    });
    expect(of(whatsapp, 'CONTACT_CHANNEL_WITHOUT_VALUE')[0]).toMatchObject({ field: 'phone_e164' });
  });
});

describe('contact package: authorization basis', () => {
  it('refuses any basis other than not_defined while P-01 is pending', () => {
    for (const basis of ['consent', 'contract', 'legitimate_interest', 'NOT-DEFINED']) {
      const result = run({ contacts: [contact('TST-0001', { communication_authorization_basis: basis })] });
      expect(of(result, 'CONTACT_BASIS_UNKNOWN')[0], basis).toMatchObject({
        severity: SEVERITY.BLOCK,
        field: 'communication_authorization_basis',
      });
      expect(result.rows, basis).toHaveLength(0);
    }
  });

  it('accepts not_defined in any letter case', () => {
    const result = run({ contacts: [contact('TST-0001', { communication_authorization_basis: 'Not_Defined' })] });
    expect(result.ok).toBe(true);
    expect(result.rows[0].communication_authorization_basis).toBe(UNDEFINED_BASIS);
  });

  it('reports a missing basis', () => {
    const result = run({ contacts: [contact('TST-0001', { communication_authorization_basis: '' })] });
    expect(of(result, 'REQUIRED_EMPTY')[0]).toMatchObject({
      field: 'communication_authorization_basis',
    });
  });

  it('requires evidence once an explicit policy allows another basis', () => {
    const policy = { approvedBases: [UNDEFINED_BASIS, 'consent'] };
    const missing = run({
      contacts: [contact('TST-0001', { communication_authorization_basis: 'consent' })],
      ...policy,
    });
    expect(of(missing, 'CONTACT_BASIS_EVIDENCE_MISSING')[0]).toMatchObject({
      severity: SEVERITY.BLOCK,
      field: 'authorization_reference',
    });

    const partial = run({
      contacts: [
        contact('TST-0001', {
          communication_authorization_basis: 'consent',
          authorization_reference: 'PRV-DEC-0001',
        }),
      ],
      ...policy,
    });
    expect(codes(partial)).toContain('CONTACT_BASIS_EVIDENCE_MISSING');

    const complete = run({
      contacts: [
        contact('TST-0001', {
          communication_authorization_basis: 'consent',
          authorization_reference: 'PRV-DEC-0001',
          authorization_recorded_at: '2026-12-01',
        }),
      ],
      ...policy,
    });
    expect(complete.ok).toBe(true);
    expect(codes(complete)).not.toContain('CONTACT_BASIS_EVIDENCE_MISSING');
  });

  it('needs no evidence for not_defined', () => {
    expect(run().ok).toBe(true);
  });
});

describe('contact package: dates and columns', () => {
  it('refuses a verified_at or authorization_recorded_at after extract_date', () => {
    const verified = run({ contacts: [contact('TST-0001', { verified_at: '2027-01-11' })] });
    expect(of(verified, 'DATE_FUTURE')[0]).toMatchObject({ field: 'verified_at' });

    const recorded = run({
      contacts: [
        contact('TST-0001', {
          communication_authorization_basis: 'consent',
          authorization_reference: 'PRV-DEC-0001',
          authorization_recorded_at: '2027-01-11',
        }),
      ],
      approvedBases: [UNDEFINED_BASIS, 'consent'],
    });
    expect(of(recorded, 'DATE_FUTURE')[0]).toMatchObject({ field: 'authorization_recorded_at' });

    // The extract date itself is allowed.
    expect(run({ contacts: [contact('TST-0001', { verified_at: EXTRACT })] }).ok).toBe(true);
  });

  it('refuses an unreadable date in the sheet', () => {
    const result = run({ contacts: [contact('TST-0001', { verified_at: '11/01/2027' })] });
    expect(of(result, 'DATE_INVALID')[0]).toMatchObject({ field: 'verified_at' });
  });

  it('blocks a forbidden column and warns about an unknown one', () => {
    const forbidden = run({ contacts: [contact('TST-0001', { iqama_number: '1', note: 'x' })] });
    expect(of(forbidden, 'FORBIDDEN_COLUMN')[0]).toMatchObject({
      field: 'iqama_number',
      severity: SEVERITY.BLOCK,
    });
    expect(of(forbidden, 'COLUMN_UNKNOWN')[0]).toMatchObject({ field: 'note' });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.rows).toHaveLength(0);
  });

  it('reports a missing required column', () => {
    const result = run({ contacts: [{ employee_code: 'TST-0001' }] });
    expect(of(result, 'COLUMN_MISSING').map((entry) => entry.field)).toEqual([
      'email_allowed',
      'whatsapp_allowed',
      'communication_authorization_basis',
      'contact_status',
    ]);
  });

  it('numbers rows below one header row', () => {
    const result = run({ contacts: [contact('TST-0001'), contact('TST-0002')] });
    expect(result.rows.map((row) => row[ROW_NUMBER_KEY])).toEqual([2, 3]);
  });
});

describe('privacy and purity', () => {
  it('puts no name, email, phone or cell value into an issue', () => {
    const result = run({
      contacts: [
        contact('TST-9999', {
          email: 'Secret.Person@Example.Invalid',
          phone_e164: '+999123456789',
          contact_status: 'secret-status',
          communication_authorization_basis: 'secret-basis',
        }),
      ],
    });
    const serialised = JSON.stringify(result.issues);
    for (const leak of [
      'Secret.Person',
      'secret.person',
      'example.invalid',
      '+999123456789',
      '999123456789',
      'secret-status',
      'secret-basis',
      'TST-9999',
      'Test Employee',
    ]) {
      expect(serialised, leak).not.toContain(leak);
    }
    for (const entry of result.issues) {
      for (const key of Object.keys(entry)) {
        expect(['code', 'severity', 'sheet', 'row', 'field']).toContain(key);
      }
    }
  });

  it('returns counts that are numbers only', () => {
    const result = run({ contacts: [contact('TST-0001'), contact('TST-0003')] });
    for (const [key, value] of Object.entries(result.counts)) {
      expect(typeof value, key).toBe('number');
      expect(Array.isArray(value), key).toBe(false);
    }
    const serialised = JSON.stringify(result.counts);
    expect(serialised).not.toContain('TST-');
    expect(serialised).not.toContain('@');
    expect(serialised).not.toContain('+999');
  });

  it('writes nothing to the console and stores nothing', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/contract/contactValidation.js'), 'utf8');
    expect(source).not.toContain('console.');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('indexedDB');
  });

  it('does not change the input rows', () => {
    const contacts = [contact('TST-0001', { email: '  TEST@Example.Invalid ' }), contact('TST-0001')];
    const snapshot = JSON.parse(JSON.stringify(contacts));
    run({ contacts });
    expect(contacts).toEqual(snapshot);
  });

  it('freezes the result and is deterministic', () => {
    const contacts = [contact('TST-0001'), contact('TST-9999')];
    const first = run({ contacts });
    const second = run({ contacts });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.rows)).toBe(true);
    expect(Object.isFrozen(first.rows[0])).toBe(true);
    expect(Object.isFrozen(first.issues)).toBe(true);
    expect(Object.isFrozen(first.contract)).toBe(true);
  });

  it('survives an empty or missing package', () => {
    expect(() => validateContactPackage()).not.toThrow();
    const empty = validateContactPackage();
    expect(empty.ok).toBe(false);
    expect(empty.rows).toHaveLength(0);
    expect(empty.counts.input).toBe(0);
    // A listed Contacts sheet with no row still has its header checked.
    const noRows = run({ contacts: [] });
    expect(noRows.ok).toBe(false);
    expect(noRows.counts.input).toBe(0);
    expect(of(noRows, 'COLUMN_MISSING')).toHaveLength(5);
  });
});
