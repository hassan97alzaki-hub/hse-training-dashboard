import { describe, it, expect } from 'vitest';

import {
  SEVERITY,
  PRESENCE,
  ENTITIES,
  FORBIDDEN_COLUMN_TOPICS,
} from '../src/lib/contract/schema.js';
import {
  HEADER_ROWS,
  ROW_NUMBER_KEY,
  validateColumns,
  validateDepartments,
  validateJobTitles,
  validateCourses,
  validateReferenceLists,
  buildCodeIndex,
  resolveCode,
  checkJobTitleScope,
} from '../src/lib/contract/referenceValidation.js';

const dept = (code, overrides = {}) => ({
  department_code: code,
  name_en: `Department ${code}`,
  name_ar: `قسم ${code}`,
  active: 'Yes',
  ...overrides,
});

const title = (code, overrides = {}) => ({
  job_title_code: code,
  name_en: `Title ${code}`,
  name_ar: `مسمى ${code}`,
  department_code: '',
  active: 'Yes',
  ...overrides,
});

const course = (code, overrides = {}) => ({
  course_code: code,
  name_en: `Course ${code}`,
  ...overrides,
});

const codes = (result) => result.issues.map((entry) => entry.code);
const of = (result, code) => result.issues.filter((entry) => entry.code === code);

describe('reference code normalisation and duplicates', () => {
  it('trims and upper-cases codes in the normalised rows', () => {
    const result = validateDepartments([dept('  ops '), dept('mnt')]);
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.department_code)).toEqual(['OPS', 'MNT']);
  });

  it('treats ops and OPS as the same key (KEY_DUPLICATE)', () => {
    const result = validateDepartments([dept('ops'), dept('OPS')]);
    expect(result.ok).toBe(false);
    const duplicates = of(result, 'KEY_DUPLICATE');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      severity: SEVERITY.BLOCK,
      sheet: 'Departments',
      row: 3,
      field: 'department_code',
    });
    expect(result.rows).toHaveLength(1);
    expect(result.counts.duplicateKeys).toBe(1);
    expect(result.counts.rejected).toBe(1);
  });

  it('detects duplicates in Job_Titles and Courses the same way', () => {
    expect(codes(validateJobTitles([title('opr'), title('OPR')]))).toContain('KEY_DUPLICATE');
    expect(codes(validateCourses([course('h2s-01'), course('H2S-01')]))).toContain(
      'KEY_DUPLICATE',
    );
  });

  it('accepts codes at the length boundaries and rejects outside them', () => {
    const okResult = validateDepartments([dept('AB'), dept('A'.repeat(20))]);
    expect(okResult.ok).toBe(true);
    expect(okResult.rows).toHaveLength(2);

    const badResult = validateDepartments([dept('A'), dept('A'.repeat(21))]);
    expect(of(badResult, 'KEY_PATTERN')).toHaveLength(2);
    expect(badResult.rows).toHaveLength(0);
  });

  it('rejects codes with characters outside the unified pattern', () => {
    for (const bad of ['OPS 1', 'OPS.1', 'OPS/1', 'OPS+1', 'قسم']) {
      const result = validateDepartments([dept(bad)]);
      expect(codes(result), bad).toContain('KEY_PATTERN');
    }
  });

  it('accepts underscore and hyphen in the same list', () => {
    const result = validateCourses([course('TEST_LMS-01')]);
    expect(result.ok).toBe(true);
  });

  it('reports an empty key as KEY_MISSING, not KEY_PATTERN', () => {
    const result = validateDepartments([dept('   ')]);
    expect(codes(result)).toContain('KEY_MISSING');
    expect(codes(result)).not.toContain('KEY_PATTERN');
  });
});

describe('display names', () => {
  it('allows the same display name under two different codes', () => {
    const rows = [
      dept('OPS', { name_en: 'Operations', name_ar: 'التشغيل' }),
      dept('OPS2', { name_en: 'Operations', name_ar: 'التشغيل' }),
    ];
    const result = validateDepartments(rows);
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(codes(result)).not.toContain('KEY_DUPLICATE');
  });

  it('allows a repeated job title name across departments', () => {
    const departments = validateDepartments([dept('OPS'), dept('MNT')]).rows;
    const result = validateJobTitles(
      [
        title('OPS-SUP', { name_en: 'Supervisor', department_code: 'OPS' }),
        title('MNT-SUP', { name_en: 'Supervisor', department_code: 'MNT' }),
      ],
      { departments },
    );
    expect(result.ok).toBe(true);
    expect(result.counts.scoped).toBe(2);
  });

  it('does not use display names for matching', () => {
    const departments = validateDepartments([dept('OPS', { name_en: 'Operations' })]).rows;
    // A job title referring to the department by its display name must not
    // resolve: the name is not a key, so the code is simply unknown.
    const result = validateJobTitles([title('SUP', { department_code: 'Operations' })], {
      departments,
    });
    expect(codes(result)).toContain('REF_UNKNOWN');
    expect(result.ok).toBe(false);
  });

  it('collapses inner whitespace of display text without changing matching', () => {
    const result = validateDepartments([dept('OPS', { name_en: '  Field   Operations ' })]);
    expect(result.rows[0].name_en).toBe('Field Operations');
  });
});

describe('Job_Titles.department_code resolution', () => {
  it('produces REF_UNKNOWN for an unknown department', () => {
    const departments = validateDepartments([dept('OPS')]).rows;
    const result = validateJobTitles([title('SUP', { department_code: 'NOPE' })], { departments });
    expect(result.ok).toBe(false);
    const unknown = of(result, 'REF_UNKNOWN');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({
      sheet: 'Job_Titles',
      row: 2,
      field: 'department_code',
      severity: SEVERITY.BLOCK,
    });
    expect(result.rows).toHaveLength(0);
    expect(result.counts.rejected).toBe(1);
  });

  it('accepts an empty department_code as usable in any department', () => {
    const result = validateJobTitles([title('SUP', { department_code: '' })], {
      departments: validateDepartments([dept('OPS')]).rows,
    });
    expect(result.ok).toBe(true);
    expect(result.counts.scoped).toBe(0);
  });

  it('resolves a lower-case reference against an approved upper-case code', () => {
    const result = validateJobTitles([title('SUP', { department_code: 'ops' })], {
      departments: validateDepartments([dept('OPS')]).rows,
    });
    expect(result.ok).toBe(true);
    expect(result.rows[0].department_code).toBe('OPS');
  });

  it('keeps a job title scoped to an inactive department as history', () => {
    const departments = validateDepartments([dept('OLD', { active: 'No' })]).rows;
    const result = validateJobTitles([title('SUP', { department_code: 'OLD' })], { departments });
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('REF_INACTIVE_CODE');
  });
});

describe('inactive codes', () => {
  it('keeps an inactive code as a valid historical row', () => {
    const result = validateDepartments([dept('OLD', { active: 'No' })]);
    expect(result.ok).toBe(true);
    expect(result.rows[0].active).toBe(false);
    expect(result.counts.inactive).toBe(1);
    expect(result.counts.active).toBe(0);
  });

  it('marks an inactive code as unusable for a new entity', () => {
    const index = buildCodeIndex(
      validateDepartments([dept('OPS'), dept('OLD', { active: 'No' })]).rows,
      'department_code',
    );
    expect(resolveCode('OPS', index, { requireActive: true })).toMatchObject({
      known: true,
      active: true,
      usableForNewEntity: true,
    });
    expect(resolveCode('old', index, { requireActive: true })).toMatchObject({
      known: true,
      active: false,
      usableForNewEntity: false,
    });
    // Without requireActive the historical reference stays usable.
    expect(resolveCode('OLD', index).usableForNewEntity).toBe(true);
    expect(resolveCode('NOPE', index)).toMatchObject({ known: false, usableForNewEntity: false });
  });

  it('lets the batch state of a code win over the approved state', () => {
    const approved = validateDepartments([dept('OLD', { active: 'No' })]).rows;
    const batch = validateDepartments([dept('OLD', { active: 'Yes' })]).rows;
    // Approved rows first, batch rows after them.
    const index = buildCodeIndex([...approved, ...batch], 'department_code');
    expect(resolveCode('OLD', index, { requireActive: true })).toMatchObject({
      known: true,
      active: true,
      usableForNewEntity: true,
    });
    // And the other way round: the batch deactivates an approved active code.
    const reversed = buildCodeIndex(
      [
        ...validateDepartments([dept('OPS', { active: 'Yes' })]).rows,
        ...validateDepartments([dept('OPS', { active: 'No' })]).rows,
      ],
      'department_code',
    );
    expect(resolveCode('OPS', reversed, { requireActive: true })).toMatchObject({
      active: false,
      usableForNewEntity: false,
    });
  });

  it('rejects an invalid active value with VALUE_INVALID', () => {
    for (const bad of ['Y', 'true', '1', 'نعم', 'Active']) {
      const result = validateDepartments([dept('OPS', { active: bad })]);
      expect(codes(result), bad).toContain('VALUE_INVALID');
      expect(result.ok, bad).toBe(false);
    }
  });

  it('accepts any letter case for Yes and No', () => {
    const result = validateDepartments([dept('OPS', { active: 'yes' }), dept('MNT', { active: 'NO' })]);
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.active)).toEqual([true, false]);
  });

  it('reports a missing active value as REQUIRED_EMPTY', () => {
    const result = validateDepartments([dept('OPS', { active: '' })]);
    expect(codes(result)).toContain('REQUIRED_EMPTY');
  });
});

describe('JOB_TITLE_SCOPE helper', () => {
  const scoped = { job_title_code: 'OPS-SUP', department_code: 'OPS' };
  const free = { job_title_code: 'SUP', department_code: '' };

  it('allows a title with an empty department_code anywhere', () => {
    expect(checkJobTitleScope(free, 'OPS')).toBeNull();
    expect(checkJobTitleScope(free, 'MNT')).toBeNull();
    expect(checkJobTitleScope({}, 'MNT')).toBeNull();
  });

  it('allows the matching department, case-insensitively', () => {
    expect(checkJobTitleScope(scoped, 'OPS')).toBeNull();
    expect(checkJobTitleScope(scoped, ' ops ')).toBeNull();
  });

  it('blocks another department with JOB_TITLE_SCOPE', () => {
    const result = checkJobTitleScope(scoped, 'MNT', {
      sheet: 'Employees',
      row: 7,
      field: 'job_title_code',
    });
    expect(result).toMatchObject({
      code: 'JOB_TITLE_SCOPE',
      severity: SEVERITY.BLOCK,
      sheet: 'Employees',
      row: 7,
      field: 'job_title_code',
    });
  });

  it('defaults the field name and leaks no code value', () => {
    const result = checkJobTitleScope(scoped, 'MNT', { sheet: 'Requirements', row: 4 });
    expect(result.field).toBe('job_title_code');
    expect(JSON.stringify(result)).not.toContain('OPS');
    expect(JSON.stringify(result)).not.toContain('MNT');
  });
});

describe('columns', () => {
  it('reports a missing required column once per sheet', () => {
    const rows = [{ department_code: 'OPS', name_en: 'Operations', active: 'Yes' }];
    const result = validateDepartments(rows);
    const missing = of(result, 'COLUMN_MISSING');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ sheet: 'Departments', field: 'name_ar' });
    expect(missing[0].row).toBeUndefined();
    expect(result.ok).toBe(false);
    expect(result.rows).toHaveLength(0);
  });

  it('warns about an unknown column and ignores it', () => {
    const result = validateDepartments([dept('OPS', { extra_note: 'anything' })]);
    const unknown = of(result, 'COLUMN_UNKNOWN');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ severity: SEVERITY.WARN, field: 'extra_note' });
    expect(result.ok).toBe(true);
    expect(result.rows[0].extra_note).toBeUndefined();
  });

  it('blocks a forbidden column in any spelling', () => {
    for (const column of ['national_id', 'National ID', 'iqama', 'IqamaNumber', 'date_of_birth', 'DOB', 'nationality']) {
      const result = validateDepartments([dept('OPS', { [column]: 'x' })]);
      const forbidden = of(result, 'FORBIDDEN_COLUMN');
      expect(forbidden, column).toHaveLength(1);
      expect(forbidden[0].severity).toBe(SEVERITY.BLOCK);
      expect(codes(result), column).not.toContain('COLUMN_UNKNOWN');
      expect(result.ok, column).toBe(false);
    }
  });

  it('detects every topic of FORBIDDEN_COLUMN_TOPICS', () => {
    expect(FORBIDDEN_COLUMN_TOPICS.length).toBeGreaterThan(0);
    for (const topic of FORBIDDEN_COLUMN_TOPICS) {
      const spellings = [
        topic,
        topic.replace(/_/g, ' '),
        topic.replace(/_/g, '-'),
        topic.replace(/_/g, ''),
        topic.toUpperCase(),
      ];
      for (const column of spellings) {
        const result = validateDepartments([dept('OPS', { [column]: 'x' })]);
        expect(of(result, 'FORBIDDEN_COLUMN'), `${topic} as ${column}`).toHaveLength(1);
        expect(codes(result), `${topic} as ${column}`).not.toContain('COLUMN_UNKNOWN');
      }
    }
  });

  it('accepts a declared column list when the rows are empty', () => {
    const result = validateDepartments([], { columns: ['department_code', 'name_en'] });
    expect(of(result, 'COLUMN_MISSING').map((entry) => entry.field)).toEqual(['name_ar', 'active']);
    expect(result.counts.input).toBe(0);
  });

  it('skips column checks for a sheet that is not in the package', () => {
    for (const input of [undefined, []]) {
      const result = validateDepartments(input);
      expect(result.issues).toHaveLength(0);
      expect(result.ok).toBe(true);
    }
  });

  it('checks the header of every reference sheet through validateColumns', () => {
    expect(validateColumns('Courses', ['course_code'])).toEqual([
      { code: 'COLUMN_MISSING', severity: SEVERITY.BLOCK, sheet: 'Courses', field: 'name_en' },
    ]);
    expect(validateColumns('Nope', ['a'])).toEqual([]);
  });

  it('treats every optional column as allowed', () => {
    const optional = ENTITIES.Courses.fields
      .filter((field) => field.presence === PRESENCE.OPTIONAL)
      .map((field) => field.name);
    const row = course('H2S-01');
    for (const name of optional) row[name] = name === 'suggested_validity_months' ? 24 : 'x';
    const result = validateCourses([row]);
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('COLUMN_UNKNOWN');
    expect(result.rows[0].suggested_validity_months).toBe(24);
  });
});

describe('numbers and text limits', () => {
  it('rejects suggested_validity_months outside 1–120', () => {
    for (const bad of [0, 121, 1.5, 'twelve', -3]) {
      const result = validateCourses([course('H2S-01', { suggested_validity_months: bad })]);
      expect(codes(result), String(bad)).toContain('VALUE_INVALID');
    }
  });

  it('rejects number forms that are not plain integers', () => {
    for (const bad of ['1e2', '0x10', '12.0', '+12', '12e0', true, false, 12.5]) {
      const result = validateCourses([course('H2S-01', { suggested_validity_months: bad })]);
      expect(codes(result), JSON.stringify(bad)).toContain('VALUE_INVALID');
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('accepts a plain integer as number or as digits', () => {
    const result = validateCourses([
      course('A-1', { suggested_validity_months: 24 }),
      course('A-2', { suggested_validity_months: '24' }),
      // Trimming is applied to every cell before the check (§2.1).
      course('A-3', { suggested_validity_months: ' 24 ' }),
    ]);
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.suggested_validity_months)).toEqual([24, 24, 24]);
  });

  it('accepts the boundaries 1 and 120', () => {
    const result = validateCourses([
      course('A-1', { suggested_validity_months: 1 }),
      course('A-2', { suggested_validity_months: 120 }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('keeps an empty optional value out of the normalised row', () => {
    const result = validateCourses([course('H2S-01', { category: '', name_ar: '   ' })]);
    expect(result.ok).toBe(true);
    expect('category' in result.rows[0]).toBe(false);
    expect('name_ar' in result.rows[0]).toBe(false);
  });
});

describe('purity and privacy', () => {
  it('does not change the input rows', () => {
    const input = [dept('  ops ', { name_en: '  Field   Operations ' }), dept('OPS')];
    const snapshot = JSON.parse(JSON.stringify(input));
    validateDepartments(input);
    expect(input).toEqual(snapshot);
  });

  it('returns frozen rows and issues', () => {
    const result = validateDepartments([dept('OPS')]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const rows = [dept('OPS'), dept('ops'), dept('A')];
    expect(JSON.stringify(validateDepartments(rows))).toBe(
      JSON.stringify(validateDepartments(rows)),
    );
  });

  it('puts no code value, display name or raw row into an issue', () => {
    const departments = validateDepartments([dept('OPS')]).rows;
    const result = validateJobTitles(
      [
        title('SUP', { name_en: 'Secret Title', department_code: 'NOPE' }),
        title('sup', { name_en: 'Secret Title' }),
        title('bad code!', { name_en: 'Secret Title' }),
      ],
      { departments },
    );
    const serialised = JSON.stringify(result.issues);
    for (const leak of ['Secret Title', 'NOPE', 'bad code', 'مسمى']) {
      expect(serialised, leak).not.toContain(leak);
    }
    for (const entry of result.issues) {
      expect(Object.keys(entry).sort()).toEqual(
        expect.arrayContaining(['code', 'severity', 'sheet']),
      );
      for (const key of Object.keys(entry)) {
        expect(['code', 'severity', 'sheet', 'row', 'field']).toContain(key);
      }
    }
  });

  it('counts only numbers, no personal data', () => {
    const result = validateDepartments([dept('OPS'), dept('ops'), dept('OLD', { active: 'No' })]);
    for (const value of Object.values(result.counts)) {
      expect(typeof value).toBe('number');
    }
    expect(result.counts.input).toBe(3);
  });

  it('numbers rows as spreadsheet rows below one header row', () => {
    expect(HEADER_ROWS).toBe(1);
    const result = validateDepartments([dept('OPS'), dept('MNT')]);
    expect(result.rows.map((row) => row[ROW_NUMBER_KEY])).toEqual([2, 3]);
  });

  it('survives missing, null and non-object input', () => {
    for (const input of [undefined, null, 'x', [null], [undefined]]) {
      expect(() => validateDepartments(input)).not.toThrow();
    }
    expect(validateDepartments(undefined).counts.input).toBe(0);
    expect(validateDepartments([null]).ok).toBe(false);
  });
});

describe('validateReferenceLists', () => {
  it('validates the three lists together and resolves inside the batch', () => {
    const result = validateReferenceLists({
      departments: [dept('OPS'), dept('MNT')],
      jobTitles: [title('OPS-SUP', { department_code: 'OPS' }), title('TEC')],
      courses: [course('H2S-01'), course('FA-01')],
    });
    expect(result.ok).toBe(true);
    expect(result.counts).toMatchObject({
      departments: 2,
      jobTitles: 2,
      courses: 2,
      blocking: 0,
    });
    expect(result.issues).toHaveLength(0);
  });

  it('resolves a job title against already approved departments', () => {
    const approved = { departments: validateDepartments([dept('OPS')]).rows };
    const result = validateReferenceLists(
      { jobTitles: [title('SUP', { department_code: 'OPS' })] },
      approved,
    );
    expect(result.ok).toBe(true);
    expect(result.counts.departments).toBe(0);
    expect(result.counts.jobTitles).toBe(1);
  });

  it('collects blocking issues from every list', () => {
    const result = validateReferenceLists({
      departments: [dept('ops'), dept('OPS')],
      jobTitles: [title('SUP', { department_code: 'NOPE' })],
      courses: [course('X')],
    });
    expect(result.ok).toBe(false);
    const collected = result.issues.map((entry) => `${entry.sheet}:${entry.code}`);
    expect(collected).toContain('Departments:KEY_DUPLICATE');
    expect(collected).toContain('Job_Titles:REF_UNKNOWN');
    expect(collected).toContain('Courses:KEY_PATTERN');
    expect(result.counts.blocking).toBe(3);
  });

  it('handles an empty batch without throwing', () => {
    const result = validateReferenceLists();
    expect(result.ok).toBe(true);
    expect(result.counts).toMatchObject({ departments: 0, jobTitles: 0, courses: 0 });
  });
});
