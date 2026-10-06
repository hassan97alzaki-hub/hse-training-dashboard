/**
 * Validation of the reference lists of `HSE-DC-1.0`: `Departments`,
 * `Job_Titles` and `Courses`, plus the reference-code helpers that the later
 * entity validators (employees, requirements, training records) reuse.
 *
 * Source of truth for every rule: docs/DATA-CONTRACT.md §1.3, §2, §3.1–§3.4,
 * §3.10 and §4, read through src/lib/contract/schema.js.
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
  PRESENCE,
  FIELD_TYPES,
  SEVERITY,
  ENTITIES,
  ENUMS,
  REFERENCE_CODE_PATTERN,
  REFERENCE_CODE_FIELDS,
  FORBIDDEN_COLUMN_TOPICS,
  normalizeReferenceCode,
  severityOf,
} from './schema.js';

/** Spreadsheet row number of data row `index`: header is row 1. */
export const HEADER_ROWS = 1;

/** Row number key added to a normalised row. Not a contract field. */
export const ROW_NUMBER_KEY = '_row';

function columnToken(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Spellings of the forbidden topics beyond the topic name itself. Every topic
 * of `FORBIDDEN_COLUMN_TOPICS` is always detected; these are extra aliases.
 * Language variants are added once agreed (§3.10, decision P-04).
 */
const FORBIDDEN_COLUMN_ALIASES = Object.freeze([
  'nationalidnumber',
  'iqamanumber',
  'iqamaid',
  'birthdate',
  'dob',
]);

/**
 * Column names that MUST NOT appear in any sheet. A column matches when its
 * name, reduced to lower-case letters and digits, equals one of these tokens.
 */
const FORBIDDEN_COLUMN_TOKENS = Object.freeze([
  ...FORBIDDEN_COLUMN_TOPICS.map(columnToken),
  ...FORBIDDEN_COLUMN_ALIASES,
]);

/* ------------------------------------------------------------------ *
 * Small pure helpers
 * ------------------------------------------------------------------ */

function collapseText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function isForbiddenColumn(name) {
  return FORBIDDEN_COLUMN_TOKENS.includes(columnToken(name));
}

function issue(code, sheet, row, field) {
  const entry = { code, severity: severityOf(code) ?? SEVERITY.BLOCK, sheet };
  if (row !== undefined && row !== null) entry.row = row;
  if (field) entry.field = field;
  return entry;
}

/** Union of the column names seen in the rows, in first-seen order. */
function columnsOf(rows, declared) {
  if (Array.isArray(declared)) return [...declared];
  const seen = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (!seen.includes(key)) seen.push(key);
    }
  }
  return seen;
}

/** Yes/No to boolean; returns undefined when the value is not in the list. */
function parseYesNo(value) {
  const text = collapseText(value).toLowerCase();
  if (text === 'yes') return true;
  if (text === 'no') return false;
  return undefined;
}

/**
 * Integer of a cell: a JavaScript integer, or decimal digits only.
 * Exponent and hexadecimal forms (`1e2`, `0x10`), a decimal point, a sign and
 * a boolean are not numbers of this contract and return undefined.
 */
function parseInteger(rawValue, text) {
  if (typeof rawValue === 'number') return Number.isInteger(rawValue) ? rawValue : undefined;
  if (typeof rawValue === 'boolean') return undefined;
  return /^[0-9]+$/.test(text) ? Number(text) : undefined;
}

/* ------------------------------------------------------------------ *
 * Column-level checks (§1.1, §3.10, §4)
 * ------------------------------------------------------------------ */

/**
 * Check the header of one sheet against its field definitions.
 * Returns issues only; no value is included.
 */
export function validateColumns(sheet, columns) {
  const entity = ENTITIES[sheet];
  if (!entity) return [];
  const issues = [];
  const known = entity.fields.map((field) => field.name);
  const present = new Set(columns);

  for (const field of entity.fields) {
    if (field.presence === PRESENCE.REQUIRED && !present.has(field.name)) {
      issues.push(issue('COLUMN_MISSING', sheet, undefined, field.name));
    }
  }
  for (const column of columns) {
    if (isForbiddenColumn(column)) {
      issues.push(issue('FORBIDDEN_COLUMN', sheet, undefined, column));
    } else if (!known.includes(column)) {
      issues.push(issue('COLUMN_UNKNOWN', sheet, undefined, column));
    }
  }
  return issues;
}

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

/* ------------------------------------------------------------------ *
 * Generic row validation driven by the field definitions
 * ------------------------------------------------------------------ */

function validateField(field, rawValue, sheet, rowNumber, issues) {
  const isCode = field.type === FIELD_TYPES.CODE;
  const value = isCode ? normalizeReferenceCode(rawValue) : collapseText(rawValue);

  if (value === '') {
    if (field.presence === PRESENCE.REQUIRED) {
      issues.push(issue(field.key ? 'KEY_MISSING' : 'REQUIRED_EMPTY', sheet, rowNumber, field.name));
    }
    return undefined;
  }

  if (isCode) {
    if (!REFERENCE_CODE_PATTERN.test(value)) {
      issues.push(issue('KEY_PATTERN', sheet, rowNumber, field.name));
      return undefined;
    }
    return value;
  }

  if (field.type === FIELD_TYPES.ENUM) {
    const match = field.values.find((allowed) => allowed.toLowerCase() === value.toLowerCase());
    if (!match) {
      issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
      return undefined;
    }
    return match;
  }

  if (field.type === FIELD_TYPES.INTEGER) {
    const number = parseInteger(rawValue, value);
    const invalid =
      number === undefined ||
      (field.min !== undefined && number < field.min) ||
      (field.max !== undefined && number > field.max);
    if (invalid) {
      issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
      return undefined;
    }
    return number;
  }

  if (field.minLength !== undefined && value.length < field.minLength) {
    issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
    return undefined;
  }
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
    return undefined;
  }
  return value;
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
    const normalised = { [ROW_NUMBER_KEY]: rowNumber };

    for (const field of entity.fields) {
      const value = validateField(field, raw?.[field.name], sheet, rowNumber, rowIssues);
      if (value === undefined) continue;
      normalised[field.name] =
        field.name === 'active' ? parseYesNo(value) : value;
    }

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

function finish(result) {
  const { issues } = result;
  const blocking = issues.filter((entry) => entry.severity === SEVERITY.BLOCK).length;
  const warnings = issues.filter((entry) => entry.severity === SEVERITY.WARN).length;
  const info = issues.filter((entry) => entry.severity === SEVERITY.INFO).length;
  return Object.freeze({
    ...result,
    ok: blocking === 0,
    issues: Object.freeze(issues),
    counts: Object.freeze({ ...result.counts, blocking, warnings, info }),
  });
}

/* ------------------------------------------------------------------ *
 * Public sheet validators
 * ------------------------------------------------------------------ */

/** Validate `Departments` rows (§3.1). */
export function validateDepartments(rows, options = {}) {
  return finish(validateReferenceSheet('Departments', rows, options));
}

/** Validate `Courses` rows (§3.4). */
export function validateCourses(rows, options = {}) {
  return finish(validateReferenceSheet('Courses', rows, options));
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

  return finish({
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
