/**
 * Validation of the reference lists of `HSE-DC-1.0`: `Departments`,
 * `Job_Titles` and `Courses`, plus the reference-code helpers that the entity
 * validators (employees, requirements, training records) reuse.
 *
 * Source of truth for every rule: docs/DATA-CONTRACT.md §1.3, §2, §3.1–§3.4,
 * §3.10 and §4, read through src/lib/contract/schema.js. The shared
 * primitives live in src/lib/contract/core.js.
 *
 * Scope limits of this module:
 * - Input is plain JavaScript rows that a caller already read from somewhere.
 *   There is no XLSX or CSV reading here, no staging and no diff.
 * - Every function is pure: it never mutates the rows it receives and never
 *   reads a clock, the network or the file system.
 * - Issues carry a code, a severity, the sheet, the row number and the field
 *   name only. They MUST NOT carry code values, display names or raw rows
 *   (§4.1).
 */

import {
  SEVERITY,
  ENTITIES,
  ENUMS,
  REFERENCE_CODE_FIELDS,
  FORBIDDEN_COLUMN_TOPICS,
  normalizeReferenceCode,
} from './schema.js';
import {
  HEADER_ROWS,
  ROW_NUMBER_KEY,
  columnsOf,
  issue,
  validateColumns,
  normalizeRow,
  finishResult,
} from './core.js';

export { HEADER_ROWS, ROW_NUMBER_KEY, validateColumns };

/* ------------------------------------------------------------------ *
 * Reference-code helpers reused by later validators
 * ------------------------------------------------------------------ */

/**
 * Build a lookup of normalised code → `{ active }` from validated rows.
 * `rows` are normalised rows produced by this module.
 */
export function buildCodeIndex(rows, codeField) {
  const index = new Map();
  for (const row of rows ?? []) {
    const code = row?.[codeField];
    if (!code) continue;
    // The last value wins, so callers pass the approved rows first and the
    // rows of the staged batch after them: a batch that reactivates a code is
    // already visible while the batch is previewed.
    index.set(code, { active: row.active !== false });
  }
  return index;
}

/**
 * Resolve a reference code against an index.
 * `requireActive` = the code is used by a new entity, where an inactive code
 * is not allowed (§3.1). Historical rows keep an inactive code without issue.
 *
 * Returns `{ known, active, code }`; the caller decides which issue to raise.
 */
export function resolveCode(value, index, { requireActive = false } = {}) {
  const code = normalizeReferenceCode(value);
  const entry = index instanceof Map ? index.get(code) : undefined;
  const known = entry !== undefined;
  const active = known ? entry.active !== false : false;
  return { code, known, active, usableForNewEntity: known && (!requireActive || active) };
}

/**
 * Pure check for `JOB_TITLE_SCOPE` (§3.2).
 * An empty `department_code` on the job title means the title is usable in any
 * department. When set, using the title with another department is blocking.
 *
 * `jobTitle` is a normalised `Job_Titles` row or `{ department_code }`.
 * Returns `null` when the combination is allowed, otherwise an issue without
 * the sheet, so the caller adds its own sheet and row.
 */
export function checkJobTitleScope(jobTitle, departmentCode, { sheet, row, field } = {}) {
  const scope = normalizeReferenceCode(jobTitle?.department_code);
  if (!scope) return null;
  const used = normalizeReferenceCode(departmentCode);
  if (!used || used === scope) return null;
  return issue('JOB_TITLE_SCOPE', sheet, row, field ?? 'job_title_code');
}

/**
 * Normalise and check the rows of one reference sheet.
 * Rows with a blocking issue are not returned in `rows`; they are counted.
 */
function validateReferenceSheet(sheet, inputRows, { columns } = {}) {
  const entity = ENTITIES[sheet];
  const rows = Array.isArray(inputRows) ? inputRows : [];
  const presentColumns = columnsOf(rows, columns);
  // A sheet that is not part of the package carries no header, so column
  // checks are skipped. `SHEET_MISSING` is raised by the package layer, not
  // here. Pass `columns` explicitly to check the header of an empty sheet.
  const hasHeader = Array.isArray(columns) || rows.length > 0;
  const issues = hasHeader ? validateColumns(sheet, presentColumns) : [];
  const columnBlocked = issues.some((entry) => entry.severity === SEVERITY.BLOCK);

  const accepted = [];
  const keyField = entity.key[0];
  const seenKeys = new Map();
  let duplicates = 0;
  let rejected = 0;
  let active = 0;
  let inactive = 0;

  rows.forEach((raw, index) => {
    const rowNumber = index + 1 + HEADER_ROWS;
    const rowIssues = [];
    const normalised = normalizeRow(sheet, raw, rowNumber, rowIssues);

    // Duplicate detection runs on the normalised key (§2.2): `ops` and `OPS`
    // are the same department code.
    const key = normalised[keyField];
    if (key) {
      if (seenKeys.has(key)) {
        duplicates += 1;
        rowIssues.push(issue('KEY_DUPLICATE', sheet, rowNumber, keyField));
      } else {
        seenKeys.set(key, rowNumber);
      }
    }

    issues.push(...rowIssues);
    if (rowIssues.some((entry) => entry.severity === SEVERITY.BLOCK) || columnBlocked) {
      rejected += 1;
      return;
    }
    if (normalised.active === false) inactive += 1;
    else active += 1;
    accepted.push(Object.freeze(normalised));
  });

  return {
    sheet,
    rows: Object.freeze(accepted),
    issues,
    counts: {
      input: rows.length,
      accepted: accepted.length,
      rejected,
      duplicateKeys: duplicates,
      active,
      inactive,
      columns: presentColumns.length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Public sheet validators
 * ------------------------------------------------------------------ */

/** Validate `Departments` rows (§3.1). */
export function validateDepartments(rows, options = {}) {
  return finishResult(validateReferenceSheet('Departments', rows, options));
}

/** Validate `Courses` rows (§3.4). */
export function validateCourses(rows, options = {}) {
  return finishResult(validateReferenceSheet('Courses', rows, options));
}

/**
 * Validate `Job_Titles` rows (§3.2).
 * `options.departments` = normalised `Departments` rows of the same batch or
 * of the approved data. A `department_code` on a job title MUST resolve to a
 * known department; an inactive department is accepted here, because the scope
 * of an existing title is historical information.
 */
export function validateJobTitles(rows, options = {}) {
  const base = validateReferenceSheet('Job_Titles', rows, options);
  const index = buildCodeIndex(options.departments, 'department_code');
  const issues = [...base.issues];
  const accepted = [];
  let rejected = base.counts.rejected;
  let active = base.counts.active;
  let inactive = base.counts.inactive;
  let scoped = 0;

  for (const row of base.rows) {
    if (!row.department_code) {
      accepted.push(row);
      continue;
    }
    const { known } = resolveCode(row.department_code, index);
    if (!known) {
      issues.push(issue('REF_UNKNOWN', 'Job_Titles', row[ROW_NUMBER_KEY], 'department_code'));
      rejected += 1;
      if (row.active === false) inactive -= 1;
      else active -= 1;
      continue;
    }
    scoped += 1;
    accepted.push(row);
  }

  return finishResult({
    sheet: 'Job_Titles',
    rows: Object.freeze(accepted),
    issues,
    counts: { ...base.counts, accepted: accepted.length, rejected, active, inactive, scoped },
  });
}

/**
 * Validate the three reference lists of one batch together.
 * `approved` MAY carry the already approved rows so that a package which does
 * not repeat a list still resolves its codes (§1.3).
 */
export function validateReferenceLists(batch = {}, approved = {}) {
  const departments = validateDepartments(batch.departments, {
    columns: batch.departmentColumns,
  });
  const knownDepartments = [...(approved.departments ?? []), ...departments.rows];
  const jobTitles = validateJobTitles(batch.jobTitles, {
    columns: batch.jobTitleColumns,
    departments: knownDepartments,
  });
  const courses = validateCourses(batch.courses, { columns: batch.courseColumns });

  const issues = [...departments.issues, ...jobTitles.issues, ...courses.issues];
  const blocking = issues.filter((entry) => entry.severity === SEVERITY.BLOCK).length;

  return Object.freeze({
    ok: blocking === 0,
    departments,
    jobTitles,
    courses,
    issues: Object.freeze(issues),
    counts: Object.freeze({
      departments: departments.counts.accepted,
      jobTitles: jobTitles.counts.accepted,
      courses: courses.counts.accepted,
      blocking,
      warnings: issues.filter((entry) => entry.severity === SEVERITY.WARN).length,
      info: issues.filter((entry) => entry.severity === SEVERITY.INFO).length,
    }),
  });
}

/* Re-exported for callers that only import this module. */
export { REFERENCE_CODE_FIELDS, FORBIDDEN_COLUMN_TOPICS, ENUMS, normalizeReferenceCode };
