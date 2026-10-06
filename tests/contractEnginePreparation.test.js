import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

import { buildComplianceUniverse } from '../src/lib/complianceEngine.js';
import { STATUS } from '../src/lib/constants.js';
import { createApprovedState } from '../src/lib/contract/staging.js';
import {
  prepareEngineInput,
  isRequirementEffective,
  selectCurrentVersions,
  toEngineRecord,
  toEngineRequirement,
  toEngineEmployee,
  createLookup,
  EnginePreparationError,
} from '../src/lib/contract/enginePreparation.js';

const AS_OF = '2027-01-12';

const department = (code, name = `Department ${code}`) => ({
  department_code: code,
  name_en: name,
  name_ar: name,
  active: true,
});

const jobTitle = (code, name = `Title ${code}`) => ({
  job_title_code: code,
  name_en: name,
  name_ar: name,
  active: true,
});

const course = (code, overrides = {}) => ({ course_code: code, name_en: `Course ${code}`, ...overrides });

const employee = (code, overrides = {}) => ({
  employee_code: code,
  full_name: `Test Employee ${code}`,
  department_code: 'OPS',
  job_title_code: 'OPR',
  employment_status: 'Active',
  ...overrides,
});

const requirement = (overrides = {}) => ({
  department_code: 'OPS',
  job_title_code: 'OPR',
  course_code: 'H2S-01',
  requirement_type: 'Mandatory',
  validity_months: 24,
  effective_from: '2027-01-01',
  effective_to: '',
  approval_reference: 'TRN-DEC-0001',
  approved_by_role: 'Training Manager',
  approved_on: '2026-12-15',
  source: 'approved',
  ...overrides,
});

const record = (id, overrides = {}) => ({
  source_system: 'TEST-LMS',
  source_record_id: id,
  employee_code: 'TST-0001',
  course_code: 'H2S-01',
  completion_status: 'Completed',
  completion_date: '2026-01-15',
  expiry_date: '2028-01-15',
  certificate_number: `C-${id}`,
  training_provider: 'Test Provider',
  remarks: '',
  _version: 1,
  _approvedAt: '2027-01-05T08:00:00.000Z',
  _batchId: 'B-1',
  _fingerprint: 'fp1:0000',
  ...overrides,
});

const state = (overrides = {}) =>
  createApprovedState({
    organizationCode: 'TST-ORG',
    departments: [department('OPS'), department('MNT')],
    jobTitles: [jobTitle('OPR'), jobTitle('SUP')],
    courses: [course('H2S-01'), course('FA-01')],
    employees: [employee('TST-0001')],
    requirements: [requirement()],
    records: [record('TR-1')],
    ...overrides,
  });

const universeOf = (prepared) =>
  buildComplianceUniverse(prepared.records, prepared.requirements, prepared.asOfDate, prepared.employees);

const itemsOf = (universe, employeeId) =>
  universe.universe.filter((item) => item.Employee_ID === employeeId);

describe('As Of Date validation', () => {
  it('refuses anything that is not a real calendar day', () => {
    for (const bad of [undefined, null, '', '2027-1-12', '12/01/2027', '2027-02-30', 20270112, new Date()]) {
      expect(() => prepareEngineInput(state(), bad), String(bad)).toThrow(EnginePreparationError);
    }
  });

  it('accepts a valid date and echoes it back', () => {
    const prepared = prepareEngineInput(state(), AS_OF);
    expect(prepared.asOfDate).toBe(AS_OF);
  });

  it('never falls back to the clock of the device', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/contract/enginePreparation.js'), 'utf8');
    expect(source).not.toContain('Date.now(');
    expect(source).not.toMatch(/new Date\(\s*\)/);
    expect(source).not.toContain('toLocale');
    expect(source).not.toContain('getTimezoneOffset');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+['"]xlsx['"]/);
  });

  it('gives the same result under any device time zone', () => {
    const ORIGINAL_TZ = process.env.TZ;
    try {
      const results = [];
      for (const tz of ['UTC', 'Asia/Riyadh', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        results.push(JSON.stringify(prepareEngineInput(state(), AS_OF)));
      }
      expect(new Set(results).size).toBe(1);
    } finally {
      if (ORIGINAL_TZ === undefined) delete process.env.TZ;
      else process.env.TZ = ORIGINAL_TZ;
    }
  });
});

describe('effective requirements (§5.4)', () => {
  const window = requirement({ effective_from: '2027-01-01', effective_to: '2027-01-31' });

  it('includes both bounds', () => {
    expect(isRequirementEffective(window, '2027-01-01')).toBe(true);
    expect(isRequirementEffective(window, '2027-01-31')).toBe(true);
  });

  it('excludes the day before and the day after', () => {
    expect(isRequirementEffective(window, '2026-12-31')).toBe(false);
    expect(isRequirementEffective(window, '2027-02-01')).toBe(false);
  });

  it('passes only the effective rows to the engine', () => {
    const prepared = prepareEngineInput(
      state({
        requirements: [
          requirement({ effective_from: '2026-01-01', effective_to: '2026-12-31' }),
          requirement({ course_code: 'FA-01' }),
          requirement({ course_code: 'FA-01', effective_from: '2028-01-01', effective_to: '' }),
        ],
      }),
      AS_OF,
    );
    expect(prepared.requirements.map((row) => row.Course_Code)).toEqual(['FA-01']);
    expect(prepared.counts).toMatchObject({ approvedRequirements: 3, requirements: 1 });
  });

  it('treats an empty effective_to as open-ended', () => {
    expect(isRequirementEffective(requirement({ effective_to: '' }), '2099-01-01')).toBe(true);
    expect(isRequirementEffective({}, AS_OF)).toBe(false);
    expect(isRequirementEffective(requirement(), '')).toBe(false);
  });

  it('translates a requirement into the engine shape without recalculating validity', () => {
    const prepared = prepareEngineInput(state(), AS_OF);
    expect(prepared.requirements[0]).toEqual({
      Department: 'OPS',
      Job_Title: 'OPR',
      Course_Code: 'H2S-01',
      Course_Name: 'Course H2S-01',
      Mandatory: true,
      Validity_Months: 24,
    });
    const recommended = toEngineRequirement(
      requirement({ requirement_type: 'Recommended', validity_months: '' }),
      new Map(),
    );
    expect(recommended).toMatchObject({ Mandatory: false, Validity_Months: '' });
  });
});

describe('codes are the only matching keys', () => {
  it('matches by code although the display names repeat or differ', () => {
    const prepared = prepareEngineInput(
      state({
        departments: [department('OPS', 'Same Name'), department('MNT', 'Same Name')],
        jobTitles: [jobTitle('OPR', 'Same Title'), jobTitle('SUP', 'Same Title')],
        employees: [employee('TST-0001'), employee('TST-0002', { department_code: 'MNT', job_title_code: 'SUP' })],
        requirements: [requirement(), requirement({ department_code: 'MNT', job_title_code: 'SUP', course_code: 'FA-01' })],
        records: [],
      }),
      AS_OF,
    );
    const universe = universeOf(prepared);
    expect(itemsOf(universe, 'TST-0001').map((item) => item.Course_Code)).toEqual(['H2S-01']);
    expect(itemsOf(universe, 'TST-0002').map((item) => item.Course_Code)).toEqual(['FA-01']);
  });

  it('keeps the course code when the course has no name', () => {
    const prepared = prepareEngineInput(
      state({ courses: [course('H2S-01', { name_en: '' })] }),
      AS_OF,
    );
    expect(prepared.requirements[0].Course_Name).toBe('H2S-01');
    expect(prepared.records[0].Course_Name).toBe('H2S-01');
    // A course missing from the lookups falls back the same way.
    expect(toEngineRecord(record('TR-9'), new Map()).Course_Name).toBe('H2S-01');
  });

  it('exposes read-only lookups by code for the interface layer', () => {
    const prepared = prepareEngineInput(state(), AS_OF);
    expect(prepared.lookups.departments.get('OPS').name_en).toBe('Department OPS');
    expect(prepared.lookups.jobTitles.get('OPR').name_en).toBe('Title OPR');
    expect(prepared.lookups.courses.get('H2S-01').name_en).toBe('Course H2S-01');
    expect(Object.isFrozen(prepared.lookups)).toBe(true);
    expect(prepared.counts).toMatchObject({ departments: 2, jobTitles: 2, courses: 2 });
  });

  it('keeps every reading function of a lookup working', () => {
    const lookup = prepareEngineInput(state(), AS_OF).lookups.courses;
    expect(lookup.has('H2S-01')).toBe(true);
    expect(lookup.has('NOPE')).toBe(false);
    expect(lookup.get('NOPE')).toBeUndefined();
    expect(lookup.size).toBe(2);
    expect(lookup.codes()).toEqual(['H2S-01', 'FA-01']);
    expect(lookup.rows().map((row) => row.name_en)).toEqual(['Course H2S-01', 'Course FA-01']);
    expect(lookup.entries()[0]).toEqual(['H2S-01', { course_code: 'H2S-01', name_en: 'Course H2S-01' }]);
    const seen = [];
    lookup.forEach((row, code) => seen.push(`${code}:${row.name_en}`));
    expect(seen).toEqual(['H2S-01:Course H2S-01', 'FA-01:Course FA-01']);
    expect(createLookup(undefined, 'course_code').size).toBe(0);
  });

  it('offers no public way to add, delete or replace a code', () => {
    const lookup = prepareEngineInput(state(), AS_OF).lookups.courses;
    for (const method of ['set', 'delete', 'clear']) {
      expect(lookup[method], method).toBeUndefined();
    }
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.keys(lookup).sort()).toEqual([
      'codes',
      'entries',
      'forEach',
      'get',
      'has',
      'rows',
      'size',
    ]);
  });

  it('fails any mutation attempt without changing the lookup', () => {
    const approved = state();
    const prepared = prepareEngineInput(approved, AS_OF);
    const lookup = prepared.lookups.courses;

    // Replacing the reading functions or adding one is refused.
    expect(() => {
      'use strict';
      lookup.set = () => {};
    }).toThrow(TypeError);
    expect(() => {
      'use strict';
      lookup.get = () => ({ name_en: 'Injected' });
    }).toThrow(TypeError);
    expect(() => {
      'use strict';
      delete lookup.get;
    }).toThrow(TypeError);
    expect(() => {
      'use strict';
      prepared.lookups.courses = new Map();
    }).toThrow(TypeError);

    expect(lookup.size).toBe(2);
    expect(lookup.has('INJECTED')).toBe(false);
    expect(lookup.get('H2S-01').name_en).toBe('Course H2S-01');
  });

  it('does not let a returned row be changed', () => {
    const prepared = prepareEngineInput(state(), AS_OF);
    const row = prepared.lookups.courses.get('H2S-01');
    expect(Object.isFrozen(row)).toBe(true);
    expect(() => {
      'use strict';
      row.name_en = 'Injected';
    }).toThrow(TypeError);
    expect(prepared.lookups.courses.get('H2S-01').name_en).toBe('Course H2S-01');

    // The arrays a lookup returns are frozen too, so a consumer cannot grow them.
    expect(() => {
      'use strict';
      prepared.lookups.courses.codes().push('INJECTED');
    }).toThrow(TypeError);
    expect(() => {
      'use strict';
      prepared.lookups.courses.rows()[0].name_en = 'Injected';
    }).toThrow(TypeError);
  });

  it('keeps Course_Name stable after a mutation attempt and on a later run', () => {
    const approved = state();
    const snapshot = JSON.parse(JSON.stringify(approved));
    const prepared = prepareEngineInput(approved, AS_OF);

    try {
      prepared.lookups.courses.get('H2S-01').name_en = 'Injected';
    } catch {
      // A frozen row throws in strict mode; either way nothing changes.
    }
    expect(prepared.requirements[0].Course_Name).toBe('Course H2S-01');
    expect(prepared.records[0].Course_Name).toBe('Course H2S-01');

    // A later run of the same approved state is unaffected.
    const again = prepareEngineInput(approved, AS_OF);
    expect(again.requirements[0].Course_Name).toBe('Course H2S-01');
    expect(again.records[0].Course_Name).toBe('Course H2S-01');
    expect(JSON.parse(JSON.stringify(approved))).toEqual(snapshot);
    expect(approved.courses[0].name_en).toBe('Course H2S-01');
  });
});

describe('employee list', () => {
  it('gives MISSING to an active employee without any record', () => {
    const prepared = prepareEngineInput(state({ records: [] }), AS_OF);
    expect(prepared.employees).toEqual([
      {
        Employee_ID: 'TST-0001',
        Employee_Name: 'Test Employee TST-0001',
        Department: 'OPS',
        Job_Title: 'OPR',
        Employment_Status: 'Active',
      },
    ]);
    const universe = universeOf(prepared);
    const items = itemsOf(universe, 'TST-0001');
    expect(items).toHaveLength(1);
    expect(items[0].Status).toBe(STATUS.MISSING);
  });

  it('keeps the engine behaviour for a non-active employee', () => {
    const prepared = prepareEngineInput(
      state({
        employees: [
          employee('TST-0001'),
          employee('TST-0002', { employment_status: 'Left', status_effective_date: '2026-12-31' }),
        ],
        records: [],
      }),
      AS_OF,
    );
    const universe = universeOf(prepared);
    expect(universe.employees.active).toHaveLength(1);
    expect(universe.employees.inactive).toHaveLength(1);
    // The engine builds no compliance item for a non-active employee.
    expect(itemsOf(universe, 'TST-0002')).toHaveLength(0);
    expect(toEngineEmployee(employee('TST-0003', { full_name: undefined })).Employee_Name).toBe('');
  });
});

describe('record versions (§3.7)', () => {
  it('passes only the highest _version of a logical record', () => {
    const prepared = prepareEngineInput(
      state({
        records: [
          record('TR-1', { _version: 1, expiry_date: '2028-01-15' }),
          record('TR-1', { _version: 2, expiry_date: '2029-06-30' }),
        ],
      }),
      AS_OF,
    );
    expect(prepared.records).toHaveLength(1);
    expect(prepared.records[0].Expiry_Date).toBe('2029-06-30');
    expect(prepared.counts).toMatchObject({ approvedRecords: 2, logicalRecords: 1, records: 1 });
  });

  it('breaks a tie on _version with the latest approval time', () => {
    const early = record('TR-1', { _version: 2, _approvedAt: '2027-01-05T08:00:00.000Z', remarks: 'early' });
    const late = record('TR-1', { _version: 2, _approvedAt: '2027-02-05T08:00:00.000Z', remarks: 'late' });
    expect(selectCurrentVersions([early, late]).get('TEST-LMS\u0000TR-1').remarks).toBe('late');
    expect(selectCurrentVersions([late, early]).get('TEST-LMS\u0000TR-1').remarks).toBe('late');
  });

  it('breaks a full tie by the position in the append-only state', () => {
    const first = record('TR-1', { remarks: 'first' });
    const second = record('TR-1', { remarks: 'second' });
    const pick = (rows) => selectCurrentVersions(rows).get('TEST-LMS\u0000TR-1').remarks;

    // The rule is the order of the state, not the content: the later entry of
    // the array wins, so a reversed array selects the other row on purpose.
    expect(pick([first, second])).toBe('second');
    expect(pick([second, first])).toBe('first');
    // The same array always gives the same answer.
    expect(pick([first, second])).toBe('second');
    expect(pick([second, first])).toBe('first');
  });

  it('prefers a row with an approval time over one without', () => {
    const dated = record('TR-1', { _version: 0, _approvedAt: '2027-01-05T08:00:00.000Z', remarks: 'dated' });
    const undated = record('TR-1', { _version: 0, _approvedAt: '', remarks: 'undated' });
    expect(selectCurrentVersions([undated, dated]).get('TEST-LMS\u0000TR-1').remarks).toBe('dated');
    expect(selectCurrentVersions([dated, undated]).get('TEST-LMS\u0000TR-1').remarks).toBe('dated');
  });

  it('keeps two different source_record_ids as separate renewals', () => {
    const prepared = prepareEngineInput(
      state({
        records: [
          record('TR-1', { expiry_date: '2027-06-30' }),
          // Same employee, course and content under another id: a renewal.
          record('TR-2', { expiry_date: '2029-06-30', certificate_number: 'C-TR-1' }),
        ],
      }),
      AS_OF,
    );
    expect(prepared.records).toHaveLength(2);
    expect(prepared.counts.logicalRecords).toBe(2);
    // The engine picks the best one with its own rule.
    const item = itemsOf(universeOf(prepared), 'TST-0001')[0];
    expect(item.Expiry_Date).toBe('2029-06-30');
    expect(item.Status).toBe(STATUS.VALID);
  });

  it('separates the same record id under two source systems', () => {
    const prepared = prepareEngineInput(
      state({
        records: [record('TR-1'), record('TR-1', { source_system: 'OTHER-LMS' })],
      }),
      AS_OF,
    );
    expect(prepared.counts.logicalRecords).toBe(2);
  });

  it('drops the whole logical record when deleted_at is on the current version', () => {
    const prepared = prepareEngineInput(
      state({
        records: [
          record('TR-1', { _version: 1, expiry_date: '2028-01-15' }),
          record('TR-1', { _version: 2, deleted_at: '2027-01-08' }),
        ],
      }),
      AS_OF,
    );
    expect(prepared.records).toHaveLength(0);
    expect(prepared.counts.excludedVoided).toBe(1);
    // No fallback to the earlier version.
    expect(prepared.records.some((row) => row.Expiry_Date === '2028-01-15')).toBe(false);
    // With a mandatory requirement the engine then reports MISSING.
    expect(itemsOf(universeOf(prepared), 'TST-0001')[0].Status).toBe(STATUS.MISSING);
  });

  it('treats deleted_at as the only removal marker', () => {
    // Fields that the contract, schema.js and staging do not define must not
    // change a compliance result.
    for (const field of ['voided_at', 'void_reference', 'is_void', 'voided']) {
      const prepared = prepareEngineInput(
        state({ records: [record('TR-1', { [field]: '2027-01-08' })] }),
        AS_OF,
      );
      expect(prepared.records, field).toHaveLength(1);
      expect(prepared.counts.excludedVoided, field).toBe(0);
      expect(itemsOf(universeOf(prepared), 'TST-0001')[0].Status, field).toBe(STATUS.VALID);
    }
  });

  it('keeps an older version alive when only it carries deleted_at', () => {
    const prepared = prepareEngineInput(
      state({
        records: [
          record('TR-1', { _version: 1, deleted_at: '2026-06-01' }),
          record('TR-1', { _version: 2, expiry_date: '2029-06-30' }),
        ],
      }),
      AS_OF,
    );
    expect(prepared.records).toHaveLength(1);
    expect(prepared.records[0].Expiry_Date).toBe('2029-06-30');
  });

  it('ignores a row without a source_record_id', () => {
    const prepared = prepareEngineInput(state({ records: [record('')] }), AS_OF);
    expect(prepared.counts.logicalRecords).toBe(0);
  });
});

describe('COMPLETED_WITHOUT_EXPIRY re-check (§3.6, T-07)', () => {
  const noExpiry = () => record('TR-1', { expiry_date: '' });

  it('excludes the record when a Mandatory requirement with validity applies', () => {
    const prepared = prepareEngineInput(state({ records: [noExpiry()] }), AS_OF);
    expect(prepared.records).toHaveLength(0);
    expect(prepared.counts.excludedCompletedWithoutExpiry).toBe(1);
    const items = itemsOf(universeOf(prepared), 'TST-0001');
    expect(items[0].Status).toBe(STATUS.MISSING);
  });

  it('keeps the record for a Recommended requirement', () => {
    const prepared = prepareEngineInput(
      state({
        records: [noExpiry()],
        requirements: [requirement({ requirement_type: 'Recommended' })],
      }),
      AS_OF,
    );
    expect(prepared.records).toHaveLength(1);
    expect(prepared.counts.excludedCompletedWithoutExpiry).toBe(0);
  });

  it('keeps the record when no requirement applies', () => {
    const prepared = prepareEngineInput(state({ records: [noExpiry()], requirements: [] }), AS_OF);
    expect(prepared.records).toHaveLength(1);
  });

  it('keeps the record when the requirement carries no validity', () => {
    for (const validity of ['', null, undefined, 0]) {
      const prepared = prepareEngineInput(
        state({ records: [noExpiry()], requirements: [requirement({ validity_months: validity })] }),
        AS_OF,
      );
      expect(prepared.records, String(validity)).toHaveLength(1);
    }
  });

  it('keeps the record when the mandatory requirement is not effective today', () => {
    const prepared = prepareEngineInput(
      state({
        records: [noExpiry()],
        requirements: [requirement({ effective_from: '2027-02-01' })],
      }),
      AS_OF,
    );
    expect(prepared.records).toHaveLength(1);
  });

  it('excludes the record once the mandatory requirement becomes effective', () => {
    const approved = state({ records: [noExpiry()], requirements: [requirement({ effective_from: '2027-02-01' })] });
    expect(prepareEngineInput(approved, '2027-01-31').records).toHaveLength(1);
    expect(prepareEngineInput(approved, '2027-02-01').records).toHaveLength(0);
    // The evidence itself is never removed from the approved state.
    expect(approved.records).toHaveLength(1);
  });

  it('matches the requirement by the role of the employee, not by the record', () => {
    const prepared = prepareEngineInput(
      state({
        employees: [employee('TST-0001', { department_code: 'MNT', job_title_code: 'SUP' })],
        records: [noExpiry()],
      }),
      AS_OF,
    );
    // The mandatory requirement belongs to OPS/OPR, so it does not apply.
    expect(prepared.records).toHaveLength(1);
  });

  it('does not touch In Progress or Not Started', () => {
    const prepared = prepareEngineInput(
      state({
        records: [
          record('TR-1', { completion_status: 'In Progress', completion_date: '', expiry_date: '', certificate_number: '' }),
          record('TR-2', { completion_status: 'Not Started', completion_date: '', expiry_date: '', certificate_number: '' }),
        ],
      }),
      AS_OF,
    );
    expect(prepared.records).toHaveLength(2);
    expect(prepared.counts.excludedCompletedWithoutExpiry).toBe(0);
  });
});

describe('record translation', () => {
  it('passes no date of an incomplete record to the engine', () => {
    const prepared = prepareEngineInput(
      state({
        records: [
          record('TR-1', { completion_status: 'In Progress' }),
          record('TR-2', { completion_status: 'Not Started' }),
        ],
      }),
      AS_OF,
    );
    for (const row of prepared.records) {
      expect(row.Issue_Date).toBe('');
      expect(row.Expiry_Date).toBe('');
    }
    const items = itemsOf(universeOf(prepared), 'TST-0001');
    expect([STATUS.IN_PROGRESS, STATUS.NOT_STARTED]).toContain(items[0].Status);
  });

  it('carries the dates of a Completed record', () => {
    const prepared = prepareEngineInput(state(), AS_OF);
    expect(prepared.records[0]).toMatchObject({
      Employee_ID: 'TST-0001',
      Course_Code: 'H2S-01',
      Completion_Status: 'Completed',
      Issue_Date: '2026-01-15',
      Expiry_Date: '2028-01-15',
      Certificate_Number: 'C-TR-1',
      Training_Provider: 'Test Provider',
      Remarks: '',
    });
  });

  it('keeps only technical tracing fields beyond the engine shape', () => {
    const prepared = prepareEngineInput(state(), AS_OF);
    const extra = Object.keys(prepared.records[0]).filter((key) => key.startsWith('_'));
    expect(extra).toEqual(['_sourceSystem', '_sourceRecordId', '_version']);
    // No name and no approved-state internals travel with the record.
    expect(Object.keys(prepared.records[0])).not.toContain('Employee_Name');
    expect(Object.keys(prepared.records[0])).not.toContain('_fingerprint');
    expect(Object.keys(prepared.records[0])).not.toContain('_batchId');
  });
});

describe('purity, determinism and the engine guard', () => {
  it('does not change the approved state or its rows', () => {
    const approved = state({
      records: [record('TR-1'), record('TR-1', { _version: 2 }), record('TR-2', { expiry_date: '' })],
    });
    const snapshot = JSON.parse(JSON.stringify(approved));
    prepareEngineInput(approved, AS_OF);
    expect(JSON.parse(JSON.stringify(approved))).toEqual(snapshot);
  });

  it('returns a frozen and deterministic result', () => {
    const approved = state();
    const first = prepareEngineInput(approved, AS_OF);
    const second = prepareEngineInput(approved, AS_OF);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.records)).toBe(true);
    expect(Object.isFrozen(first.records[0])).toBe(true);
    expect(Object.isFrozen(first.requirements)).toBe(true);
    expect(Object.isFrozen(first.employees)).toBe(true);
  });

  it('survives an empty state', () => {
    const prepared = prepareEngineInput(createApprovedState(), AS_OF);
    expect(prepared.records).toHaveLength(0);
    expect(prepared.requirements).toHaveLength(0);
    expect(prepared.employees).toHaveLength(0);
    expect(prepareEngineInput(undefined, AS_OF).counts.records).toBe(0);
    const universe = universeOf(prepared);
    expect(universe.universe).toHaveLength(0);
  });

  it('leaves complianceEngine.js unchanged', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/complianceEngine.js'));
    // Pinned on purpose: this commit must not change the engine.
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      'b058e38d53a524f584b15733f336f8a7b9472686dd13ec0fccbbae01920e595c',
    );
  });
});

describe('integration with buildComplianceUniverse', () => {
  it('runs the engine on the prepared input end to end', () => {
    const prepared = prepareEngineInput(
      state({
        employees: [
          employee('TST-0001'),
          employee('TST-0002'),
          employee('TST-0003', { employment_status: 'Left', status_effective_date: '2026-12-31' }),
          employee('TST-0004', { department_code: 'MNT', job_title_code: 'SUP' }),
        ],
        requirements: [requirement(), requirement({ course_code: 'FA-01', requirement_type: 'Recommended', validity_months: 12 })],
        records: [
          record('TR-1', { expiry_date: '2028-01-15' }),
          record('TR-2', { employee_code: 'TST-0002', expiry_date: '2026-12-31' }),
        ],
      }),
      AS_OF,
    );
    const universe = buildComplianceUniverse(
      prepared.records,
      prepared.requirements,
      prepared.asOfDate,
      prepared.employees,
    );

    expect(universe.employees.all).toHaveLength(4);
    expect(universe.employees.active).toHaveLength(3);
    expect(universe.employees.inactive).toHaveLength(1);

    const first = itemsOf(universe, 'TST-0001').find((item) => item.Course_Code === 'H2S-01');
    expect(first.Status).toBe(STATUS.VALID);
    expect(first.Mandatory).toBe(true);
    expect(first.Course_Name).toBe('Course H2S-01');

    const second = itemsOf(universe, 'TST-0002').find((item) => item.Course_Code === 'H2S-01');
    expect(second.Status).toBe(STATUS.EXPIRED);

    // The non-active employee receives no item, and the role without
    // requirements is counted as not configured.
    expect(itemsOf(universe, 'TST-0003')).toHaveLength(0);
    expect(universe.employees.notConfigured).toBe(1);

    // The Recommended requirement produces a non-mandatory item.
    const recommended = itemsOf(universe, 'TST-0001').find((item) => item.Course_Code === 'FA-01');
    expect(recommended.Mandatory).toBe(false);
  });

  it('turns an excluded record into MISSING for that requirement only', () => {
    const prepared = prepareEngineInput(
      state({
        requirements: [requirement(), requirement({ course_code: 'FA-01' })],
        records: [record('TR-1', { expiry_date: '' }), record('TR-2', { course_code: 'FA-01' })],
      }),
      AS_OF,
    );
    const universe = universeOf(prepared);
    const byCourse = Object.fromEntries(
      itemsOf(universe, 'TST-0001').map((item) => [item.Course_Code, item.Status]),
    );
    expect(byCourse['H2S-01']).toBe(STATUS.MISSING);
    expect(byCourse['FA-01']).toBe(STATUS.VALID);
  });
});
