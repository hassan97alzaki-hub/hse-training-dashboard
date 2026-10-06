import { describe, it, expect } from 'vitest';

import { SEVERITY } from '../src/lib/contract/schema.js';
import { ROW_NUMBER_KEY } from '../src/lib/contract/core.js';
import {
  validateDepartments,
  validateJobTitles,
  validateCourses,
} from '../src/lib/contract/referenceValidation.js';
import {
  validateRequirements,
  selectEffectiveRequirements,
  isEffectiveAt,
  requirementTriple,
  requirementSignature,
  APPROVED_SOURCE,
} from '../src/lib/contract/requirementsValidation.js';

const EXTRACT = '2027-01-10';
const AS_OF = '2027-01-12';
const VERSION = '2027-01-01';

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
  { course_code: 'H2S-01', name_en: 'H2S Awareness', suggested_validity_months: 24 },
  { course_code: 'FA-01', name_en: 'First Aid' },
]).rows;

const requirementRow = (overrides = {}) => ({
  department_code: 'OPS',
  job_title_code: 'OPR',
  course_code: 'H2S-01',
  requirement_type: 'Mandatory',
  validity_months: 24,
  effective_from: VERSION,
  effective_to: '',
  approval_reference: 'TRN-DEC-0001',
  approved_by_role: 'Training Manager',
  approved_on: '2026-12-15',
  source: 'approved',
  ...overrides,
});

const context = (overrides = {}) => ({
  requirementsEffectiveFrom: VERSION,
  extractDate: EXTRACT,
  asOfDate: AS_OF,
  departments,
  jobTitles,
  courses,
  approvedRequirements: [],
  ...overrides,
});

const codes = (result) => result.issues.map((entry) => entry.code);
const of = (result, code) => result.issues.filter((entry) => entry.code === code);

describe('Requirements: fields, codes and scope', () => {
  it('accepts a valid approved row', () => {
    const result = validateRequirements([requirementRow()], context());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.counts).toMatchObject({ accepted: 1, mandatory: 1, recommended: 0, departments: 1 });
    expect(result.rows[0].source).toBe(APPROVED_SOURCE);
  });

  it('does not change the input rows', () => {
    const input = [requirementRow({ department_code: ' ops ' })];
    const snapshot = JSON.parse(JSON.stringify(input));
    validateRequirements(input, context());
    expect(input).toEqual(snapshot);
  });

  it('upper-cases the reference codes of the row', () => {
    const result = validateRequirements(
      [requirementRow({ department_code: 'ops', job_title_code: 'opr', course_code: 'h2s-01' })],
      context(),
    );
    expect(result.ok).toBe(true);
    expect(result.rows[0]).toMatchObject({
      department_code: 'OPS',
      job_title_code: 'OPR',
      course_code: 'H2S-01',
    });
  });

  it('produces REF_UNKNOWN for an unknown code', () => {
    const result = validateRequirements(
      [requirementRow({ department_code: 'NOPE', job_title_code: 'NONE', course_code: 'GONE' })],
      context(),
    );
    expect(of(result, 'REF_UNKNOWN').map((entry) => entry.field)).toEqual([
      'department_code',
      'job_title_code',
      'course_code',
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it('refuses an inactive department or job title in a new requirement', () => {
    const result = validateRequirements(
      [requirementRow({ department_code: 'OLD', job_title_code: 'RET' })],
      context(),
    );
    expect(of(result, 'REF_INACTIVE_CODE').map((entry) => entry.field)).toEqual([
      'department_code',
      'job_title_code',
    ]);
  });

  it('blocks a department-scoped job title used with another department', () => {
    const result = validateRequirements(
      [requirementRow({ department_code: 'MNT', job_title_code: 'OPS-SUP' })],
      context(),
    );
    expect(of(result, 'JOB_TITLE_SCOPE')[0]).toMatchObject({
      sheet: 'Requirements',
      row: 2,
      field: 'job_title_code',
      severity: SEVERITY.BLOCK,
    });
  });

  it('allows the scoped title in its own department', () => {
    const result = validateRequirements(
      [requirementRow({ department_code: 'OPS', job_title_code: 'OPS-SUP' })],
      context(),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a repeated requirement key', () => {
    const result = validateRequirements([requirementRow(), requirementRow()], context());
    expect(of(result, 'KEY_DUPLICATE')[0]).toMatchObject({ row: 3, severity: SEVERITY.BLOCK });
    expect(result.counts.duplicateKeys).toBe(1);
  });

  it('rejects an unknown requirement_type', () => {
    const result = validateRequirements(
      [requirementRow({ requirement_type: 'Optional' })],
      context(),
    );
    expect(of(result, 'VALUE_INVALID')[0]).toMatchObject({ field: 'requirement_type' });
  });

  it('counts Recommended rows separately', () => {
    const result = validateRequirements(
      [requirementRow({ requirement_type: 'Recommended' })],
      context(),
    );
    expect(result.counts).toMatchObject({ mandatory: 0, recommended: 1 });
  });
});

describe('Requirements: approval and derived rows', () => {
  it('requires source to be approved', () => {
    for (const source of ['', 'draft', 'derived_test', 'Approved ']) {
      const result = validateRequirements([requirementRow({ source })], context());
      if (source === 'Approved ') {
        expect(result.ok, source).toBe(true);
        continue;
      }
      expect(of(result, 'REQ_NOT_APPROVED')[0], source).toMatchObject({
        field: 'source',
        severity: SEVERITY.BLOCK,
      });
      expect(result.rows, source).toHaveLength(0);
    }
  });

  it('reports a missing approval field as REQ_NOT_APPROVED', () => {
    for (const field of ['approval_reference', 'approved_by_role', 'approved_on']) {
      const result = validateRequirements([requirementRow({ [field]: '' })], context());
      expect(of(result, 'REQ_NOT_APPROVED'), field).toHaveLength(1);
      expect(result.ok, field).toBe(false);
    }
  });

  it('rejects a row carrying a derived marker', () => {
    for (const raw of [
      requirementRow({ Derived: true }),
      requirementRow({ derived: 1 }),
      requirementRow({ source: 'derived' }),
    ]) {
      const result = validateRequirements([raw], context());
      expect(of(result, 'REQ_NOT_APPROVED')).toHaveLength(1);
      expect(result.ok).toBe(false);
    }
  });

  it('reports an unreadable approved_on once as REQ_NOT_APPROVED', () => {
    for (const bad of ['15/12/2026', '2026-13-01', 'last December', 45809.5, true]) {
      const result = validateRequirements([requirementRow({ approved_on: bad })], context());
      expect(of(result, 'REQ_NOT_APPROVED'), String(bad)).toHaveLength(1);
      expect(codes(result), String(bad)).not.toContain('DATE_INVALID');
      expect(codes(result), String(bad)).not.toContain('REQUIRED_EMPTY');
      expect(result.ok, String(bad)).toBe(false);
    }
  });

  it('stores approved_on as YYYY-MM-DD, also from an Excel serial', () => {
    const result = validateRequirements([requirementRow({ approved_on: 45809 })], context());
    expect(result.ok).toBe(true);
    expect(result.rows[0].approved_on).toBe('2025-06-01');
  });

  it('keeps DATE_FUTURE for an approved_on after extract_date', () => {
    const result = validateRequirements(
      [requirementRow({ approved_on: '2027-01-11' })],
      context(),
    );
    expect(of(result, 'DATE_FUTURE')).toHaveLength(1);
    expect(of(result, 'DATE_FUTURE')[0]).toMatchObject({ field: 'approved_on' });
    expect(codes(result)).not.toContain('REQ_NOT_APPROVED');
  });

  it('requires approval_reference and approved_by_role to survive trimming', () => {
    for (const field of ['approval_reference', 'approved_by_role']) {
      const result = validateRequirements([requirementRow({ [field]: '   ' })], context());
      expect(of(result, 'REQ_NOT_APPROVED'), field).toHaveLength(1);
    }
  });

  it('counts the rows that are not approved', () => {
    const result = validateRequirements(
      [requirementRow({ source: 'draft' }), requirementRow({ course_code: 'FA-01' })],
      context(),
    );
    expect(result.counts.notApproved).toBe(1);
    expect(result.counts.accepted).toBe(1);
  });
});

describe('Requirements: dates and validity', () => {
  it('requires effective_from to equal the contract version', () => {
    const result = validateRequirements(
      [requirementRow({ effective_from: '2027-02-01' })],
      context(),
    );
    expect(of(result, 'REQ_EFFECTIVE_MISMATCH')[0]).toMatchObject({
      field: 'effective_from',
      severity: SEVERITY.BLOCK,
    });
  });

  it('accepts effective_to equal to effective_from and rejects an earlier one', () => {
    const same = validateRequirements([requirementRow({ effective_to: VERSION })], context());
    expect(same.ok).toBe(true);

    const earlier = validateRequirements(
      [requirementRow({ effective_to: '2026-12-31' })],
      context(),
    );
    expect(of(earlier, 'DATE_ORDER')[0]).toMatchObject({ field: 'effective_to' });
  });

  it('blocks approved_on after extract_date', () => {
    const result = validateRequirements(
      [requirementRow({ approved_on: '2027-01-11' })],
      context(),
    );
    expect(of(result, 'DATE_FUTURE')[0]).toMatchObject({ field: 'approved_on' });
  });

  it('accepts approved_on equal to extract_date', () => {
    const result = validateRequirements([requirementRow({ approved_on: EXTRACT })], context());
    expect(result.ok).toBe(true);
  });

  it('keeps validity_months inside 1–120', () => {
    for (const validity of [0, 121, '12.5', 'twelve']) {
      const result = validateRequirements(
        [requirementRow({ validity_months: validity })],
        context(),
      );
      expect(of(result, 'VALUE_INVALID')[0], String(validity)).toMatchObject({
        field: 'validity_months',
      });
    }
    for (const validity of [1, 120]) {
      expect(
        validateRequirements([requirementRow({ validity_months: validity })], context()).ok,
        String(validity),
      ).toBe(true);
    }
  });

  it('accepts an empty validity_months as no expiry for the role', () => {
    const result = validateRequirements([requirementRow({ validity_months: '' })], context());
    expect(result.ok).toBe(true);
    expect('validity_months' in result.rows[0]).toBe(false);
  });

  it('reports a difference from the course suggestion as information', () => {
    const result = validateRequirements([requirementRow({ validity_months: 12 })], context());
    const info = of(result, 'SUGGESTED_VALIDITY_DIFFERS')[0];
    expect(info).toMatchObject({
      severity: SEVERITY.INFO,
      field: 'validity_months',
      differenceMonths: -12,
    });
    expect(result.ok).toBe(true);
    expect(result.rows[0].validity_months).toBe(12);
    expect(result.counts.suggestionDiffers).toBe(1);
  });

  it('is silent when the suggestion matches or is absent', () => {
    expect(codes(validateRequirements([requirementRow()], context()))).not.toContain(
      'SUGGESTED_VALIDITY_DIFFERS',
    );
    expect(
      codes(validateRequirements([requirementRow({ course_code: 'FA-01' })], context())),
    ).not.toContain('SUGGESTED_VALIDITY_DIFFERS');
  });
});

describe('Requirements: overlap', () => {
  it('blocks two overlapping ranges of one requirement', () => {
    const result = validateRequirements(
      [
        requirementRow({ effective_from: VERSION, effective_to: '2027-06-30' }),
        requirementRow({ effective_from: VERSION, effective_to: '' }),
      ],
      context(),
    );
    // The exact key repeat is reported once as KEY_DUPLICATE.
    expect(codes(result)).toContain('KEY_DUPLICATE');
    expect(result.ok).toBe(false);
  });

  it('blocks an overlap between two versions of one requirement', () => {
    const result = validateRequirements(
      [
        requirementRow({ effective_from: VERSION, effective_to: '' }),
        requirementRow({ effective_from: '2027-03-01', effective_to: '' }),
      ],
      context({ requirementsEffectiveFrom: '' }),
    );
    expect(of(result, 'REQ_OVERLAP')[0]).toMatchObject({
      row: 3,
      field: 'effective_from',
      severity: SEVERITY.BLOCK,
    });
    expect(result.counts.overlaps).toBe(1);
  });

  it('allows two ranges that touch without overlapping', () => {
    const result = validateRequirements(
      [
        requirementRow({ effective_from: '2026-01-01', effective_to: '2026-12-31' }),
        requirementRow({ effective_from: VERSION, effective_to: '' }),
      ],
      context({ requirementsEffectiveFrom: '' }),
    );
    expect(codes(result)).not.toContain('REQ_OVERLAP');
    expect(result.ok).toBe(true);
  });

  it('does not treat different requirements as an overlap', () => {
    const result = validateRequirements(
      [requirementRow(), requirementRow({ course_code: 'FA-01' })],
      context(),
    );
    expect(codes(result)).not.toContain('REQ_OVERLAP');
  });
});

describe('Requirements: versions against the approved data', () => {
  const approvedRow = (overrides = {}) =>
    requirementRow({ effective_from: '2026-01-01', ...overrides });

  it('blocks a version older than the approved one of a listed department', () => {
    const result = validateRequirements(
      [requirementRow()],
      context({ approvedRequirements: [approvedRow({ effective_from: '2027-06-01' })] }),
    );
    expect(of(result, 'REQ_VERSION_OLDER')[0]).toMatchObject({
      severity: SEVERITY.BLOCK,
      field: 'effective_from',
    });
    expect(result.rowsToClose).toHaveLength(0);
  });

  it('reports the identical version as REQ_UNCHANGED', () => {
    const approved = [requirementRow()];
    const result = validateRequirements([requirementRow()], context({ approvedRequirements: approved }));
    expect(of(result, 'REQ_UNCHANGED')[0]).toMatchObject({ severity: SEVERITY.INFO });
    expect(result.ok).toBe(true);
    expect(result.unchanged).toBe(true);
    expect(result.rowsToClose).toHaveLength(0);
  });

  it('blocks the same version date with different content', () => {
    const result = validateRequirements(
      [requirementRow({ validity_months: 12 })],
      context({ approvedRequirements: [requirementRow()] }),
    );
    expect(of(result, 'REQ_VERSION_EXISTS')[0]).toMatchObject({ severity: SEVERITY.BLOCK });
    expect(result.ok).toBe(false);
  });

  it('blocks the same version date when any approval detail differs', () => {
    for (const change of [
      { approval_reference: 'TRN-DEC-0002' },
      { approved_by_role: 'HSE Manager' },
      { approved_on: '2026-12-16' },
    ]) {
      const result = validateRequirements(
        [requirementRow(change)],
        context({ approvedRequirements: [requirementRow()] }),
      );
      expect(codes(result), JSON.stringify(change)).toContain('REQ_VERSION_EXISTS');
      expect(codes(result), JSON.stringify(change)).not.toContain('REQ_UNCHANGED');
      expect(result.ok, JSON.stringify(change)).toBe(false);
    }
  });

  it('blocks the same version date with an extra row', () => {
    const result = validateRequirements(
      [requirementRow(), requirementRow({ course_code: 'FA-01' })],
      context({ approvedRequirements: [requirementRow()] }),
    );
    expect(codes(result)).toContain('REQ_VERSION_EXISTS');
  });

  it('lists the approved rows a new version would close', () => {
    const older = approvedRow();
    const result = validateRequirements(
      [requirementRow()],
      context({ approvedRequirements: [older] }),
    );
    expect(result.ok).toBe(true);
    expect(result.rowsToClose).toEqual([older]);
    expect(result.counts.rowsToClose).toBe(1);
  });

  it('closes rows of the listed departments only', () => {
    const opsRow = approvedRow({ department_code: 'OPS' });
    const mntRow = approvedRow({ department_code: 'MNT' });
    const result = validateRequirements(
      [requirementRow({ department_code: 'OPS' })],
      context({ approvedRequirements: [opsRow, mntRow] }),
    );
    expect(result.departmentsInBatch).toEqual(['OPS']);
    expect(result.rowsToClose).toEqual([opsRow]);
  });

  it('does not close a row whose range already ended', () => {
    const closed = approvedRow({ effective_to: '2026-06-30' });
    const result = validateRequirements(
      [requirementRow()],
      context({ approvedRequirements: [closed] }),
    );
    expect(result.rowsToClose).toHaveLength(0);
  });

  it('changes nothing in the approved rows it returns', () => {
    const older = approvedRow();
    const snapshot = JSON.parse(JSON.stringify(older));
    const result = validateRequirements(
      [requirementRow()],
      context({ approvedRequirements: [older] }),
    );
    expect(older).toEqual(snapshot);
    expect(result.rowsToClose[0]).toEqual(snapshot);
    expect(Object.isFrozen(result.rowsToClose)).toBe(true);
  });
});

describe('Effective selection at a date', () => {
  const row = (from, to, course = 'H2S-01') =>
    requirementRow({ effective_from: from, effective_to: to, course_code: course });

  it('includes both bounds and excludes the days outside', () => {
    const r = row('2027-01-01', '2027-01-31');
    expect(isEffectiveAt(r, '2026-12-31')).toBe(false);
    expect(isEffectiveAt(r, '2027-01-01')).toBe(true);
    expect(isEffectiveAt(r, '2027-01-31')).toBe(true);
    expect(isEffectiveAt(r, '2027-02-01')).toBe(false);
  });

  it('treats an empty effective_to as open-ended', () => {
    expect(isEffectiveAt(row('2027-01-01', ''), '2099-01-01')).toBe(true);
    expect(isEffectiveAt(row('2027-01-01', ''), '2026-12-31')).toBe(false);
    expect(isEffectiveAt({}, AS_OF)).toBe(false);
    expect(isEffectiveAt(row('2027-01-01', ''), '')).toBe(false);
  });

  it('selects one row per requirement, newest version first', () => {
    const old = row('2026-01-01', '2026-12-31');
    const current = row('2027-01-01', '');
    const other = row('2027-01-01', '', 'FA-01');
    const selected = selectEffectiveRequirements([old, current, other], AS_OF);
    expect(selected).toHaveLength(2);
    expect(selected).toContain(current);
    expect(selected).not.toContain(old);
    expect(Object.isFrozen(selected)).toBe(true);
  });

  it('keeps the newer version when two overlap', () => {
    const older = row('2026-01-01', '');
    const newer = row('2027-01-01', '');
    expect(selectEffectiveRequirements([older, newer], AS_OF)).toEqual([newer]);
    expect(selectEffectiveRequirements([newer, older], AS_OF)).toEqual([newer]);
  });

  it('returns nothing for an empty or future set', () => {
    expect(selectEffectiveRequirements([], AS_OF)).toEqual([]);
    expect(selectEffectiveRequirements(undefined, AS_OF)).toEqual([]);
    expect(selectEffectiveRequirements([row('2028-01-01', '')], AS_OF)).toEqual([]);
  });
});

describe('Keys, signatures, privacy and columns', () => {
  it('builds the triple from normalised codes', () => {
    expect(requirementTriple({ department_code: 'ops', job_title_code: 'opr', course_code: 'h2s-01' })).toBe(
      'OPS|OPR|H2S-01',
    );
  });

  it('separates content by every versioned field', () => {
    const base = requirementRow();
    expect(requirementSignature(base)).toBe(requirementSignature({ ...base }));
    // Canonical JSON, so a separator inside a value cannot shift a boundary.
    expect(requirementSignature({ ...base, approval_reference: 'A|B', approved_by_role: 'C' })).not.toBe(
      requirementSignature({ ...base, approval_reference: 'A', approved_by_role: 'B|C' }),
    );
    expect(() => JSON.parse(requirementSignature(base))).not.toThrow();
    for (const change of [
      { requirement_type: 'Recommended' },
      { validity_months: 12 },
      { effective_from: '2026-01-01' },
      { effective_to: '2027-12-31' },
      { course_code: 'FA-01' },
      { approval_reference: 'TRN-DEC-0002' },
      { approved_by_role: 'HSE Manager' },
      { approved_on: '2026-12-16' },
      { source: 'draft' },
    ]) {
      expect(requirementSignature({ ...base, ...change })).not.toBe(requirementSignature(base));
    }
  });

  it('puts no code value into an issue', () => {
    const result = validateRequirements(
      [requirementRow({ department_code: 'SECRET', course_code: 'HIDDEN' })],
      context(),
    );
    const serialised = JSON.stringify(result.issues);
    for (const leak of ['SECRET', 'HIDDEN', 'TRN-DEC-0001', 'Training Manager']) {
      expect(serialised, leak).not.toContain(leak);
    }
    for (const entry of result.issues) {
      for (const [key, value] of Object.entries(entry)) {
        if (['code', 'severity', 'sheet', 'field'].includes(key)) continue;
        expect(typeof value, key).toBe('number');
      }
    }
  });

  it('counts only numbers and freezes the result', () => {
    const result = validateRequirements([requirementRow()], context());
    for (const value of Object.values(result.counts)) expect(typeof value).toBe('number');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
  });

  it('reports missing, unknown and forbidden columns', () => {
    const result = validateRequirements(
      [{ department_code: 'OPS', job_title_code: 'OPR', nationality: 'x', note: 'y' }],
      context(),
    );
    expect(of(result, 'FORBIDDEN_COLUMN')[0]).toMatchObject({ field: 'nationality' });
    expect(of(result, 'COLUMN_UNKNOWN')[0]).toMatchObject({ field: 'note' });
    expect(of(result, 'COLUMN_MISSING').map((entry) => entry.field)).toEqual([
      'course_code',
      'requirement_type',
      'effective_from',
      'approval_reference',
      'approved_by_role',
      'approved_on',
      'source',
    ]);
  });

  it('numbers rows below one header row', () => {
    const result = validateRequirements(
      [requirementRow(), requirementRow({ course_code: 'FA-01' })],
      context(),
    );
    expect(result.rows.map((row) => row[ROW_NUMBER_KEY])).toEqual([2, 3]);
  });

  it('survives missing or malformed input', () => {
    for (const input of [undefined, null, 'x', [null]]) {
      expect(() => validateRequirements(input, context())).not.toThrow();
    }
    const empty = validateRequirements(undefined, context());
    expect(empty.counts.input).toBe(0);
    expect(empty.rowsToClose).toHaveLength(0);
    expect(validateRequirements([], {}).ok).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const rows = [requirementRow(), requirementRow({ validity_months: 12 })];
    const ctx = context({ approvedRequirements: [requirementRow({ effective_from: '2026-01-01' })] });
    expect(JSON.stringify(validateRequirements(rows, ctx))).toBe(
      JSON.stringify(validateRequirements(rows, ctx)),
    );
  });
});
