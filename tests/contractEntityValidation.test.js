import { describe, it, expect } from 'vitest';

import { SEVERITY } from '../src/lib/contract/schema.js';
import { ROW_NUMBER_KEY } from '../src/lib/contract/core.js';
import {
  validateDepartments,
  validateJobTitles,
  validateCourses,
} from '../src/lib/contract/referenceValidation.js';
import {
  validateEmployees,
  validateTrainingRecords,
  validateTrainingRecordsWithFingerprints,
  detectPossibleDuplicates,
  fingerprintValues,
  fingerprintCanonical,
  fingerprintRecord,
  buildRequirementIndex,
  requirementKey,
  applicableRequirement,
  requiresExpiry,
  FINGERPRINT_VERSION,
} from '../src/lib/contract/entityValidation.js';

const EXTRACT = '2027-01-10';
const AS_OF = '2027-01-12';

const departments = validateDepartments([
  { department_code: 'OPS', name_en: 'Operations', name_ar: 'التشغيل', active: 'Yes' },
  { department_code: 'MNT', name_en: 'Maintenance', name_ar: 'الصيانة', active: 'Yes' },
  { department_code: 'OLD', name_en: 'Closed', name_ar: 'مغلق', active: 'No' },
]).rows;

const jobTitles = validateJobTitles(
  [
    { job_title_code: 'OPR', name_en: 'Operator', name_ar: 'مشغل', department_code: '', active: 'Yes' },
    {
      job_title_code: 'OPS-SUP',
      name_en: 'Supervisor',
      name_ar: 'مشرف',
      department_code: 'OPS',
      active: 'Yes',
    },
    { job_title_code: 'RET', name_en: 'Retired', name_ar: 'ملغى', department_code: '', active: 'No' },
  ],
  { departments },
).rows;

const courses = validateCourses([
  { course_code: 'H2S-01', name_en: 'H2S Awareness' },
  { course_code: 'FA-01', name_en: 'First Aid' },
]).rows;

const employeeRow = (code, overrides = {}) => ({
  employee_code: code,
  badge_number: '',
  full_name: `Test Employee ${code}`,
  full_name_ar: '',
  department_code: 'OPS',
  job_title_code: 'OPR',
  employment_status: 'Active',
  status_effective_date: '',
  hire_date: '2025-03-01',
  site_code: '',
  ...overrides,
});

const employeeContext = (overrides = {}) => ({
  extractDate: EXTRACT,
  asOfDate: AS_OF,
  departments,
  jobTitles,
  ...overrides,
});

const employees = validateEmployees(
  [
    employeeRow('TST-0001'),
    employeeRow('TST-0002', { job_title_code: 'OPS-SUP' }),
    employeeRow('TST-0003', { employment_status: 'Left', status_effective_date: '2026-12-31' }),
  ],
  employeeContext(),
).rows;

const recordRow = (id, overrides = {}) => ({
  source_record_id: id,
  employee_code: 'TST-0001',
  course_code: 'H2S-01',
  completion_status: 'Completed',
  completion_date: '2026-01-15',
  expiry_date: '2028-01-15',
  certificate_number: `TST-CERT-${id}`,
  training_provider: 'Test Provider',
  remarks: '',
  ...overrides,
});

const mandatory = (validity = 24) => [
  {
    department_code: 'OPS',
    job_title_code: 'OPR',
    course_code: 'H2S-01',
    requirement_type: 'Mandatory',
    validity_months: validity,
  },
];

const recordContext = (overrides = {}) => ({
  sourceSystem: 'TEST-LMS',
  extractDate: EXTRACT,
  asOfDate: AS_OF,
  employees,
  courses,
  requirements: [],
  ...overrides,
});

const codes = (result) => result.issues.map((entry) => entry.code);
const of = (result, code) => result.issues.filter((entry) => entry.code === code);

describe('Employees: fields and normalisation', () => {
  it('accepts a valid sheet and reports nothing', () => {
    const result = validateEmployees([employeeRow('TST-0001')], employeeContext());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.counts).toMatchObject({ input: 1, accepted: 1, active: 1, rejected: 0 });
  });

  it('does not change the input rows', () => {
    const input = [employeeRow('  TST-0001 ', { full_name: '  Test   Employee ' })];
    const snapshot = JSON.parse(JSON.stringify(input));
    validateEmployees(input, employeeContext());
    expect(input).toEqual(snapshot);
  });

  it('trims but never upper-cases employee_code', () => {
    const result = validateEmployees([employeeRow('  tst-0001 ')], employeeContext());
    expect(result.ok).toBe(true);
    expect(result.rows[0].employee_code).toBe('tst-0001');
  });

  it('treats employee_code case-sensitively for duplicates', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001'), employeeRow('tst-0001')],
      employeeContext(),
    );
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('KEY_DUPLICATE');
    expect(result.rows).toHaveLength(2);
  });

  it('detects an exactly repeated employee_code', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001'), employeeRow('TST-0001')],
      employeeContext(),
    );
    expect(result.ok).toBe(false);
    expect(of(result, 'KEY_DUPLICATE')[0]).toMatchObject({
      sheet: 'Employees',
      row: 3,
      field: 'employee_code',
      severity: SEVERITY.BLOCK,
    });
    expect(result.counts.duplicateKeys).toBe(1);
  });

  it('rejects an employee_code outside the organization pattern', () => {
    const result = validateEmployees([employeeRow('AB')], employeeContext());
    expect(of(result, 'KEY_PATTERN')[0]).toMatchObject({ field: 'employee_code' });
  });

  it('accepts an overridden organization pattern', () => {
    const result = validateEmployees(
      [employeeRow('AB')],
      employeeContext({ employeeCodePattern: '^[A-Z]{2}$' }),
    );
    expect(result.ok).toBe(true);
  });

  it('warns about a repeated non-empty badge_number and keeps both rows', () => {
    const result = validateEmployees(
      [
        employeeRow('TST-0001', { badge_number: 'B-1' }),
        employeeRow('TST-0002', { badge_number: 'B-1' }),
      ],
      employeeContext(),
    );
    expect(result.ok).toBe(true);
    const duplicate = of(result, 'BADGE_DUPLICATE');
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]).toMatchObject({ severity: SEVERITY.WARN, row: 3, field: 'badge_number' });
    expect(result.rows).toHaveLength(2);
    expect(result.counts.duplicateBadges).toBe(1);
  });

  it('ignores an empty badge_number for duplicate detection', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { badge_number: '' }), employeeRow('TST-0002', { badge_number: '  ' })],
      employeeContext(),
    );
    expect(codes(result)).not.toContain('BADGE_DUPLICATE');
  });

  it('keeps the name for display only and never matches on it', () => {
    const result = validateEmployees(
      [
        employeeRow('TST-0001', { full_name: 'Same Name' }),
        employeeRow('TST-0002', { full_name: 'Same Name' }),
      ],
      employeeContext(),
    );
    expect(result.ok).toBe(true);
    expect(result.rows[0].full_name).toBe('Same Name');
  });

  it('rejects a full_name outside 2–120 characters', () => {
    for (const name of ['A', 'A'.repeat(121)]) {
      const result = validateEmployees([employeeRow('TST-0001', { full_name: name })], employeeContext());
      expect(of(result, 'VALUE_INVALID')[0], name).toMatchObject({ field: 'full_name' });
    }
  });
});

describe('Employees: references and scope', () => {
  it('produces REF_UNKNOWN for an unknown department or job title', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'NOPE', job_title_code: 'NONE' })],
      employeeContext(),
    );
    expect(of(result, 'REF_UNKNOWN').map((entry) => entry.field)).toEqual([
      'department_code',
      'job_title_code',
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it('refuses an inactive department or job title for an employee', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'OLD', job_title_code: 'RET' })],
      employeeContext(),
    );
    expect(of(result, 'REF_INACTIVE_CODE').map((entry) => entry.field)).toEqual([
      'department_code',
      'job_title_code',
    ]);
    expect(result.ok).toBe(false);
  });

  it('keeps an unchanged inactive reference of an already approved employee', () => {
    const approvedEmployees = [
      { employee_code: 'TST-0001', department_code: 'OLD', job_title_code: 'RET' },
    ];
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'OLD', job_title_code: 'RET' })],
      employeeContext({ approvedEmployees }),
    );
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('REF_INACTIVE_CODE');
    expect(result.rows).toHaveLength(1);
  });

  it('blocks an approved employee moving to a different inactive code', () => {
    const approvedEmployees = [
      { employee_code: 'TST-0001', department_code: 'OPS', job_title_code: 'OPR' },
    ];
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'OLD', job_title_code: 'RET' })],
      employeeContext({ approvedEmployees }),
    );
    expect(result.ok).toBe(false);
    expect(of(result, 'REF_INACTIVE_CODE').map((entry) => entry.field)).toEqual([
      'department_code',
      'job_title_code',
    ]);
  });

  it('blocks a new employee that uses an inactive code', () => {
    const approvedEmployees = [
      { employee_code: 'TST-0002', department_code: 'OLD', job_title_code: 'RET' },
    ];
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'OLD', job_title_code: 'RET' })],
      employeeContext({ approvedEmployees }),
    );
    expect(result.ok).toBe(false);
    expect(of(result, 'REF_INACTIVE_CODE')).toHaveLength(2);
  });

  it('matches approvedEmployees on employee_code exactly', () => {
    const approvedEmployees = [
      { employee_code: 'TST-0001', department_code: 'OLD', job_title_code: 'RET' },
    ];
    // A different letter case is a different employee, so the exemption does
    // not apply.
    const result = validateEmployees(
      [employeeRow('tst-0001', { department_code: 'OLD', job_title_code: 'RET' })],
      employeeContext({ approvedEmployees }),
    );
    expect(result.ok).toBe(false);
    expect(of(result, 'REF_INACTIVE_CODE')).toHaveLength(2);
  });

  it('never exempts an unknown code', () => {
    const approvedEmployees = [
      { employee_code: 'TST-0001', department_code: 'GONE', job_title_code: 'NONE' },
    ];
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'GONE', job_title_code: 'NONE' })],
      employeeContext({ approvedEmployees }),
    );
    expect(result.ok).toBe(false);
    expect(of(result, 'REF_UNKNOWN').map((entry) => entry.field)).toEqual([
      'department_code',
      'job_title_code',
    ]);
    expect(codes(result)).not.toContain('REF_INACTIVE_CODE');
  });

  it('resolves a lower-case reference code against the approved list', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'ops', job_title_code: 'opr' })],
      employeeContext(),
    );
    expect(result.ok).toBe(true);
    expect(result.rows[0].department_code).toBe('OPS');
  });

  it('blocks a department-scoped job title used in another department', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'MNT', job_title_code: 'OPS-SUP' })],
      employeeContext(),
    );
    expect(of(result, 'JOB_TITLE_SCOPE')[0]).toMatchObject({
      sheet: 'Employees',
      row: 2,
      field: 'job_title_code',
      severity: SEVERITY.BLOCK,
    });
  });

  it('allows a title without scope in any department', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { department_code: 'MNT', job_title_code: 'OPR' })],
      employeeContext(),
    );
    expect(result.ok).toBe(true);
  });
});

describe('Employees: statuses and dates', () => {
  it('requires status_effective_date when the status is not Active', () => {
    for (const status of ['Inactive', 'Left']) {
      const result = validateEmployees(
        [employeeRow('TST-0001', { employment_status: status })],
        employeeContext(),
      );
      expect(of(result, 'REQUIRED_EMPTY')[0], status).toMatchObject({
        field: 'status_effective_date',
      });
    }
  });

  it('does not require the date for an Active employee', () => {
    const result = validateEmployees([employeeRow('TST-0001')], employeeContext());
    expect(codes(result)).not.toContain('REQUIRED_EMPTY');
  });

  it('rejects an unknown employment_status', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { employment_status: 'Retired' })],
      employeeContext(),
    );
    expect(of(result, 'VALUE_INVALID')[0]).toMatchObject({ field: 'employment_status' });
  });

  it('blocks hire_date and status_effective_date after extract_date', () => {
    const result = validateEmployees(
      [
        employeeRow('TST-0001', { hire_date: '2027-01-11' }),
        employeeRow('TST-0002', {
          employment_status: 'Left',
          status_effective_date: '2027-02-01',
        }),
      ],
      employeeContext(),
    );
    expect(of(result, 'DATE_FUTURE').map((entry) => entry.field)).toEqual([
      'hire_date',
      'status_effective_date',
    ]);
  });

  it('accepts a date equal to extract_date', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { hire_date: EXTRACT })],
      employeeContext(),
    );
    expect(result.ok).toBe(true);
  });

  it('reads an Excel serial and rejects a slash date or a day fraction', () => {
    const serial = validateEmployees([employeeRow('TST-0001', { hire_date: 45809 })], employeeContext());
    expect(serial.ok).toBe(true);
    expect(serial.rows[0].hire_date).toBe('2025-06-01');

    for (const bad of ['01/03/2025', 45809.5, '2025-13-01', '2025-02-30']) {
      const result = validateEmployees([employeeRow('TST-0001', { hire_date: bad })], employeeContext());
      expect(of(result, 'DATE_INVALID')[0], String(bad)).toMatchObject({ field: 'hire_date' });
    }
  });

  it('checks site_code for format only, with no reference list', () => {
    const ok = validateEmployees([employeeRow('TST-0001', { site_code: 'site-1' })], employeeContext());
    expect(ok.ok).toBe(true);
    expect(ok.rows[0].site_code).toBe('SITE-1');
    expect(codes(ok)).not.toContain('REF_UNKNOWN');

    const bad = validateEmployees([employeeRow('TST-0001', { site_code: 'S' })], employeeContext());
    expect(of(bad, 'KEY_PATTERN')[0]).toMatchObject({ field: 'site_code' });
  });
});

describe('Training records: key, references and statuses', () => {
  it('accepts a valid Completed record', () => {
    const result = validateTrainingRecords([recordRow('TR-000001')], recordContext());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.counts).toMatchObject({ accepted: 1, completed: 1 });
    expect(result.rows[0].source_system).toBe('TEST-LMS');
  });

  it('uses source_record_id with the contract source_system as the batch key', () => {
    const duplicate = validateTrainingRecords(
      [recordRow('TR-1'), recordRow('TR-1', { certificate_number: 'TST-CERT-2' })],
      recordContext(),
    );
    expect(of(duplicate, 'KEY_DUPLICATE')[0]).toMatchObject({
      row: 3,
      field: 'source_record_id',
      severity: SEVERITY.BLOCK,
    });
  });

  it('compares source_record_id case-sensitively', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1'), recordRow('tr-1', { certificate_number: 'TST-CERT-2' })],
      recordContext(),
    );
    expect(codes(result)).not.toContain('KEY_DUPLICATE');
    expect(result.rows.map((row) => row.source_record_id)).toEqual(['TR-1', 'tr-1']);
  });

  it('reports a missing source_system of the contract', () => {
    const result = validateTrainingRecords([recordRow('TR-1')], recordContext({ sourceSystem: '' }));
    expect(of(result, 'CONTRACT_FIELD')[0]).toMatchObject({ field: 'source_system' });
  });

  it('rejects a source_record_id longer than 64 characters', () => {
    const result = validateTrainingRecords([recordRow('T'.repeat(65))], recordContext());
    expect(of(result, 'VALUE_INVALID')[0]).toMatchObject({ field: 'source_record_id' });
  });

  it('produces REF_UNKNOWN for an unknown employee or course', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { employee_code: 'TST-9999', course_code: 'NOPE' })],
      recordContext(),
    );
    expect(of(result, 'REF_UNKNOWN').map((entry) => entry.field)).toEqual([
      'employee_code',
      'course_code',
    ]);
  });

  it('keeps a record of a non-active employee with RECORD_FOR_INACTIVE', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { employee_code: 'TST-0003' })],
      recordContext(),
    );
    expect(result.ok).toBe(true);
    expect(of(result, 'RECORD_FOR_INACTIVE')[0]).toMatchObject({ severity: SEVERITY.INFO });
    expect(result.rows).toHaveLength(1);
    expect(result.counts.forInactive).toBe(1);
  });

  it('accepts In Progress and Not Started without dates or certificate', () => {
    const result = validateTrainingRecords(
      [
        recordRow('TR-1', {
          completion_status: 'In Progress',
          completion_date: '',
          expiry_date: '',
          certificate_number: '',
        }),
        recordRow('TR-2', {
          completion_status: 'Not Started',
          completion_date: '',
          expiry_date: '',
          certificate_number: '',
        }),
      ],
      recordContext({ requirements: mandatory() }),
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.counts).toMatchObject({ inProgress: 1, notStarted: 1 });
  });

  it('reports dates on an incomplete status and drops them from the row', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { completion_status: 'In Progress' })],
      recordContext(),
    );
    const dropped = of(result, 'DATES_ON_INCOMPLETE');
    expect(dropped.map((entry) => entry.field)).toEqual([
      'completion_date',
      'expiry_date',
      'certificate_number',
    ]);
    expect(dropped[0].severity).toBe(SEVERITY.WARN);
    expect(result.ok).toBe(true);
    const row = result.rows[0];
    expect('completion_date' in row).toBe(false);
    expect('expiry_date' in row).toBe(false);
    expect('certificate_number' in row).toBe(false);
  });

  it('requires completion_date for a Completed record', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { completion_date: '' })],
      recordContext(),
    );
    expect(of(result, 'REQUIRED_EMPTY')[0]).toMatchObject({ field: 'completion_date' });
  });

  it('blocks completion_date after extract_date', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { completion_date: '2027-01-11' })],
      recordContext(),
    );
    expect(of(result, 'DATE_FUTURE')[0]).toMatchObject({ field: 'completion_date' });
  });

  it('requires expiry_date to be after completion_date', () => {
    for (const expiry of ['2026-01-15', '2026-01-14']) {
      const result = validateTrainingRecords(
        [recordRow('TR-1', { expiry_date: expiry })],
        recordContext(),
      );
      expect(of(result, 'DATE_ORDER')[0], expiry).toMatchObject({ field: 'expiry_date' });
    }
  });

  it('accepts an expiry_date in the future of the extract date', () => {
    const result = validateTrainingRecords([recordRow('TR-1')], recordContext());
    expect(codes(result)).not.toContain('DATE_FUTURE');
  });

  it('warns about a missing or repeated certificate number', () => {
    const missing = validateTrainingRecords(
      [recordRow('TR-1', { certificate_number: '' })],
      recordContext(),
    );
    expect(of(missing, 'CERT_MISSING')[0]).toMatchObject({ severity: SEVERITY.WARN });
    expect(missing.ok).toBe(true);

    const repeated = validateTrainingRecords(
      [
        recordRow('TR-1', { certificate_number: 'C-1' }),
        recordRow('TR-2', { certificate_number: 'c-1', course_code: 'FA-01' }),
      ],
      recordContext(),
    );
    expect(of(repeated, 'CERT_DUPLICATE')[0]).toMatchObject({
      severity: SEVERITY.WARN,
      row: 3,
      field: 'certificate_number',
    });
    expect(repeated.ok).toBe(true);
    expect(repeated.counts.certDuplicates).toBe(1);
  });
});

describe('Training records: COMPLETED_WITHOUT_EXPIRY (T-07)', () => {
  const withoutExpiry = (overrides = {}) => recordRow('TR-1', { expiry_date: '', ...overrides });

  it('blocks when the effective requirement is Mandatory with validity', () => {
    const result = validateTrainingRecords(
      [withoutExpiry()],
      recordContext({ requirements: mandatory(24) }),
    );
    expect(result.ok).toBe(false);
    expect(of(result, 'COMPLETED_WITHOUT_EXPIRY')[0]).toMatchObject({
      severity: SEVERITY.BLOCK,
      field: 'expiry_date',
      row: 2,
    });
    expect(result.rows).toHaveLength(0);
  });

  it('does not block for a Recommended requirement', () => {
    const result = validateTrainingRecords(
      [withoutExpiry()],
      recordContext({
        requirements: [{ ...mandatory()[0], requirement_type: 'Recommended' }],
      }),
    );
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('COMPLETED_WITHOUT_EXPIRY');
    expect(result.rows).toHaveLength(1);
  });

  it('does not block for a Mandatory requirement without validity', () => {
    for (const validity of ['', null, undefined]) {
      const result = validateTrainingRecords(
        [withoutExpiry()],
        recordContext({ requirements: [{ ...mandatory()[0], validity_months: validity }] }),
      );
      expect(result.ok, String(validity)).toBe(true);
      expect(result.rows, String(validity)).toHaveLength(1);
    }
  });

  it('does not block when no requirement applies', () => {
    const result = validateTrainingRecords([withoutExpiry()], recordContext({ requirements: [] }));
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
  });

  it('does not block when the requirement belongs to another role', () => {
    const result = validateTrainingRecords(
      [withoutExpiry()],
      recordContext({ requirements: [{ ...mandatory()[0], job_title_code: 'OPS-SUP' }] }),
    );
    expect(result.ok).toBe(true);
  });

  it('exposes the rule through requiresExpiry and applicableRequirement', () => {
    const index = buildRequirementIndex(mandatory(12));
    expect(index.get(requirementKey('ops', 'opr', 'h2s-01'))).toBeDefined();
    const requirement = applicableRequirement(employees[0], 'H2S-01', index);
    expect(requiresExpiry(requirement)).toBe(true);
    expect(requiresExpiry({ requirement_type: 'Mandatory', validity_months: '' })).toBe(false);
    expect(requiresExpiry({ requirement_type: 'Recommended', validity_months: 12 })).toBe(false);
    expect(requiresExpiry(undefined)).toBe(false);
    expect(applicableRequirement(undefined, 'H2S-01', index)).toBeUndefined();
    expect(buildRequirementIndex(index)).toBe(index);
  });
});

describe('Training records: EXPIRY_VALIDITY_MISMATCH', () => {
  it('stays silent when the expiry matches the calendar months', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { completion_date: '2026-01-15', expiry_date: '2028-01-15' })],
      recordContext({ requirements: mandatory(24) }),
    );
    expect(result.issues).toHaveLength(0);
  });

  it('clamps the day to the last day of the target month', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { completion_date: '2026-01-31', expiry_date: '2026-02-28' })],
      recordContext({ requirements: mandatory(1) }),
    );
    expect(codes(result)).not.toContain('EXPIRY_VALIDITY_MISMATCH');
  });

  it('reports the difference as a number and keeps the row', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { completion_date: '2026-01-15', expiry_date: '2028-01-20' })],
      recordContext({ requirements: mandatory(24) }),
    );
    const mismatch = of(result, 'EXPIRY_VALIDITY_MISMATCH')[0];
    expect(mismatch).toMatchObject({ severity: SEVERITY.WARN, differenceDays: 5 });
    expect(result.ok).toBe(true);
    expect(result.counts.expiryMismatches).toBe(1);
    expect(result.expiryDifferenceDays).toEqual([5]);
  });

  it('returns the distribution sorted, with numbers only', () => {
    const result = validateTrainingRecords(
      [
        recordRow('TR-1', { expiry_date: '2028-01-20' }),
        recordRow('TR-2', { expiry_date: '2028-01-10', certificate_number: 'C-2' }),
      ],
      recordContext({ requirements: mandatory(24) }),
    );
    expect(result.expiryDifferenceDays).toEqual([-5, 5]);
    for (const value of result.expiryDifferenceDays) expect(typeof value).toBe('number');
  });

  it('is silent when the requirement carries no validity', () => {
    const result = validateTrainingRecords(
      [recordRow('TR-1', { expiry_date: '2030-01-01' })],
      recordContext({ requirements: [{ ...mandatory()[0], validity_months: '' }] }),
    );
    expect(codes(result)).not.toContain('EXPIRY_VALIDITY_MISMATCH');
  });
});

describe('Fingerprint (§3.8)', () => {
  const record = {
    employee_code: 'TST-0001',
    course_code: 'H2S-01',
    completion_status: 'Completed',
    completion_date: '2026-01-15',
    expiry_date: '2028-01-15',
    certificate_number: ' tst-cert-1 ',
  };

  it('puts fp1 inside the canonical array', () => {
    expect(fingerprintValues(record)[0]).toBe(FINGERPRINT_VERSION);
    expect(fingerprintCanonical(record)).toBe(
      '["fp1","TST-0001","H2S-01","Completed","2026-01-15","2028-01-15","TST-CERT-1"]',
    );
  });

  it('writes a missing value as an empty string', () => {
    expect(fingerprintValues({})).toEqual(['fp1', '', '', '', '', '', '']);
  });

  it('returns fp1 plus lowercase hex of SHA-256', async () => {
    const fingerprint = await fingerprintRecord(record);
    expect(fingerprint).toMatch(/^fp1:[0-9a-f]{64}$/);
    expect(await fingerprintRecord(record)).toBe(fingerprint);
  });

  it('matches a fixed test vector', async () => {
    // Independent vector: SHA-256 of the canonical string below, taken from a
    // separate implementation. It is written literally on purpose, so that a
    // change of the canonical form or of the hash makes this test fail.
    const canonical =
      '["fp1","TST-0001","H2S-01","Completed","2026-01-15","2028-01-15","TST-CERT-1"]';
    const expected = 'fp1:5cbe4a82e14bc6a3d5c6f8a307c5cc0a16ec45c7f118b64382028a9f5087badd';
    expect(fingerprintCanonical(record)).toBe(canonical);
    expect(await fingerprintRecord(record)).toBe(expected);
    expect(await fingerprintRecord({ ...record, certificate_number: 'TST-CERT-1' })).toBe(expected);
  });

  it('is not shifted by a separator inside a value', async () => {
    const a = await fingerprintRecord({ ...record, employee_code: 'A|B', course_code: 'C' });
    const b = await fingerprintRecord({ ...record, employee_code: 'A', course_code: 'B|C' });
    expect(a).not.toBe(b);
    const withComma = await fingerprintRecord({ ...record, employee_code: 'A,B', course_code: 'C' });
    const withoutComma = await fingerprintRecord({ ...record, employee_code: 'A', course_code: 'B,C' });
    expect(withComma).not.toBe(withoutComma);
  });

  it('ignores the case of the certificate number only', async () => {
    const upper = await fingerprintRecord({ ...record, certificate_number: 'TST-CERT-1' });
    const lower = await fingerprintRecord({ ...record, certificate_number: 'tst-cert-1' });
    expect(upper).toBe(lower);
    const otherEmployee = await fingerprintRecord({ ...record, employee_code: 'tst-0001' });
    expect(otherEmployee).not.toBe(upper);
  });

  it('warns about two source_record_ids with the same fingerprint, without merging', async () => {
    const result = await validateTrainingRecordsWithFingerprints(
      [recordRow('TR-1', { certificate_number: 'C-1' }), recordRow('TR-2', { certificate_number: 'C-1' })],
      recordContext(),
    );
    const possible = of(result, 'POSSIBLE_DUPLICATE_RECORD');
    expect(possible).toHaveLength(1);
    expect(possible[0]).toMatchObject({
      severity: SEVERITY.WARN,
      row: 3,
      field: 'source_record_id',
      firstRow: 2,
    });
    // Both records are kept; nothing is merged.
    expect(result.rows).toHaveLength(2);
    expect(result.ok).toBe(true);
    expect(result.counts.possibleDuplicates).toBe(1);
  });

  it('does not warn when the content differs', async () => {
    const result = await validateTrainingRecordsWithFingerprints(
      [recordRow('TR-1'), recordRow('TR-2', { course_code: 'FA-01' })],
      recordContext(),
    );
    expect(codes(result)).not.toContain('POSSIBLE_DUPLICATE_RECORD');
  });

  it('exposes one fingerprint per accepted row', async () => {
    const { fingerprints } = await detectPossibleDuplicates(
      validateTrainingRecords([recordRow('TR-1')], recordContext()).rows,
    );
    expect(fingerprints.get(2)).toMatch(/^fp1:[0-9a-f]{64}$/);
  });
});

describe('Privacy, purity and columns', () => {
  it('puts no name, code or certificate value into an issue', () => {
    const result = validateTrainingRecords(
      [
        recordRow('TR-SECRET', {
          employee_code: 'TST-9999',
          course_code: 'SECRET-01',
          certificate_number: 'SECRET-CERT',
        }),
      ],
      recordContext(),
    );
    const serialised = JSON.stringify(result.issues);
    for (const leak of ['TR-SECRET', 'TST-9999', 'SECRET-01', 'SECRET-CERT']) {
      expect(serialised, leak).not.toContain(leak);
    }
    for (const entry of result.issues) {
      for (const [key, value] of Object.entries(entry)) {
        if (['code', 'severity', 'sheet', 'field'].includes(key)) continue;
        expect(typeof value, key).toBe('number');
      }
    }
  });

  it('leaks no employee name through the Employees issues', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001', { full_name: 'Secret Name', department_code: 'NOPE' })],
      employeeContext(),
    );
    expect(JSON.stringify(result.issues)).not.toContain('Secret Name');
  });

  it('counts only numbers', () => {
    const result = validateTrainingRecords([recordRow('TR-1')], recordContext());
    for (const value of Object.values(result.counts)) expect(typeof value).toBe('number');
  });

  it('does not change the input training rows', () => {
    const input = [recordRow('TR-1', { completion_status: 'In Progress' })];
    const snapshot = JSON.parse(JSON.stringify(input));
    validateTrainingRecords(input, recordContext());
    expect(input).toEqual(snapshot);
  });

  it('freezes the rows and issues of both validators', () => {
    for (const result of [
      validateEmployees([employeeRow('TST-0001')], employeeContext()),
      validateTrainingRecords([recordRow('TR-1')], recordContext()),
    ]) {
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.rows)).toBe(true);
      expect(Object.isFrozen(result.rows[0])).toBe(true);
      expect(Object.isFrozen(result.issues)).toBe(true);
    }
  });

  it('reports missing, unknown and forbidden columns on both sheets', () => {
    const employeesResult = validateEmployees(
      [{ employee_code: 'TST-0001', full_name: 'Test Employee', iqama: '1', note: 'x' }],
      employeeContext(),
    );
    expect(of(employeesResult, 'FORBIDDEN_COLUMN')[0]).toMatchObject({ field: 'iqama' });
    expect(of(employeesResult, 'COLUMN_UNKNOWN')[0]).toMatchObject({ field: 'note' });
    expect(of(employeesResult, 'COLUMN_MISSING').map((entry) => entry.field)).toEqual([
      'department_code',
      'job_title_code',
      'employment_status',
    ]);

    const recordsResult = validateTrainingRecords(
      [{ source_record_id: 'TR-1', employee_code: 'TST-0001', date_of_birth: '2000-01-01' }],
      recordContext(),
    );
    expect(of(recordsResult, 'FORBIDDEN_COLUMN')[0]).toMatchObject({ field: 'date_of_birth' });
    expect(of(recordsResult, 'COLUMN_MISSING').map((entry) => entry.field)).toEqual([
      'course_code',
      'completion_status',
    ]);
  });

  it('numbers rows below one header row', () => {
    const result = validateEmployees(
      [employeeRow('TST-0001'), employeeRow('TST-0002')],
      employeeContext(),
    );
    expect(result.rows.map((row) => row[ROW_NUMBER_KEY])).toEqual([2, 3]);
  });

  it('survives missing or malformed input', () => {
    for (const input of [undefined, null, 'x', [null]]) {
      expect(() => validateEmployees(input, employeeContext())).not.toThrow();
      expect(() => validateTrainingRecords(input, recordContext())).not.toThrow();
    }
    expect(validateEmployees(undefined, employeeContext()).counts.input).toBe(0);
    expect(validateTrainingRecords([], {}).counts.input).toBe(0);
  });

  it('is deterministic for the same input', () => {
    const rows = [recordRow('TR-1'), recordRow('TR-1')];
    const context = recordContext({ requirements: mandatory() });
    expect(JSON.stringify(validateTrainingRecords(rows, context))).toBe(
      JSON.stringify(validateTrainingRecords(rows, context)),
    );
  });
});
