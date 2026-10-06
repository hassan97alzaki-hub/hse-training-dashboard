/**
 * Validation of `Employees` and `Training_Records` of `HSE-DC-1.0`, plus the
 * record fingerprint of §3.8.
 *
 * Source of truth: docs/DATA-CONTRACT.md §2, §3.3, §3.6, §3.7, §3.8 and §4,
 * read through src/lib/contract/schema.js. Shared primitives come from
 * src/lib/contract/core.js.
 *
 * Scope limits:
 * - Input is plain JavaScript rows plus an explicit context. There is no XLSX
 *   or CSV reading, no staging, no diff, no UI and no engine call.
 * - `RECORD_IDENTITY_CHANGED` (§3.7) compares a batch with approved records and
 *   is not implemented here.
 * - Issues carry a code, a severity, the sheet, the row number, the field name
 *   and numbers only (§4.1).
 */

import {
  SEVERITY,
  ENTITIES,
  EMPLOYEE_CODE_PATTERN,
  SOURCE_RECORD_ID_MAX_LENGTH,
  normalizeReferenceCode,
} from './schema.js';
import {
  HEADER_ROWS,
  ROW_NUMBER_KEY,
  columnsOf,
  collapseText,
  issue,
  validateColumns,
  normalizeRow,
  checkDateLimits,
  daysBetween,
  finishResult,
} from './core.js';
import { buildCodeIndex, resolveCode, checkJobTitleScope } from './referenceValidation.js';
import { addCalendarMonths } from '../normalization.js';

/* ------------------------------------------------------------------ *
 * Context helpers
 * ------------------------------------------------------------------ */

/**
 * Index the job titles by code so that the scope check can find the title of a
 * row. Returns a Map of code → normalised row; the last row wins, so approved
 * rows are passed before the rows of the staged batch.
 */
export function buildJobTitleIndex(rows) {
  const index = new Map();
  for (const row of rows ?? []) {
    if (row?.job_title_code) index.set(row.job_title_code, row);
  }
  return index;
}

/** Key of one requirement in the requirement index. */
export function requirementKey(departmentCode, jobTitleCode, courseCode) {
  return [
    normalizeReferenceCode(departmentCode),
    normalizeReferenceCode(jobTitleCode),
    normalizeReferenceCode(courseCode),
  ].join('|');
}

/**
 * Index the requirements that are effective at the As Of Date.
 * The caller prepares that selection (§5.4); this module never computes it.
 * Accepts an array of requirement rows or a ready Map.
 */
export function buildRequirementIndex(requirements) {
  if (requirements instanceof Map) return requirements;
  const index = new Map();
  for (const row of requirements ?? []) {
    if (!row) continue;
    index.set(
      requirementKey(row.department_code, row.job_title_code, row.course_code),
      row,
    );
  }
  return index;
}

/** Index the employees by `employee_code`, which is compared exactly (§2.2). */
export function buildEmployeeIndex(rows) {
  const index = new Map();
  for (const row of rows ?? []) {
    if (row?.employee_code) index.set(row.employee_code, row);
  }
  return index;
}

/* ------------------------------------------------------------------ *
 * Employees (§3.3)
 * ------------------------------------------------------------------ */

/**
 * Validate `Employees` rows.
 *
 * Context:
 * - `extractDate`, `asOfDate`: date limits (§2.3, §4).
 * - `departments`, `jobTitles`: normalised reference rows, approved rows first.
 * - `employeeCodePattern` MAY override the organization pattern (decision H-01).
 * - `columns` MAY declare the header of an empty sheet.
 *
 * A department or job title of a new employee MUST be known and active
 * (`REF_UNKNOWN`, `REF_INACTIVE_CODE`), and the pair MUST respect the scope of
 * the job title (`JOB_TITLE_SCOPE`). Names are display only and are never used
 * for matching.
 */
export function validateEmployees(inputRows, context = {}) {
  const sheet = 'Employees';
  const rows = Array.isArray(inputRows) ? inputRows : [];
  const presentColumns = columnsOf(rows, context.columns);
  const hasHeader = Array.isArray(context.columns) || rows.length > 0;
  const issues = hasHeader ? validateColumns(sheet, presentColumns) : [];
  const columnBlocked = issues.some((entry) => entry.severity === SEVERITY.BLOCK);

  const departmentIndex = buildCodeIndex(context.departments, 'department_code');
  const jobTitleIndex = buildJobTitleIndex(context.jobTitles);
  const jobTitleCodes = buildCodeIndex(context.jobTitles, 'job_title_code');
  const patterns = {
    employee_code: context.employeeCodePattern
      ? new RegExp(context.employeeCodePattern)
      : EMPLOYEE_CODE_PATTERN,
  };
  const limits = { extract_date: context.extractDate, as_of_date: context.asOfDate };

  const accepted = [];
  const seenCodes = new Map();
  const seenBadges = new Map();
  let duplicates = 0;
  let badgeDuplicates = 0;
  let rejected = 0;
  const byStatus = { Active: 0, Inactive: 0, Left: 0 };

  rows.forEach((raw, index) => {
    const rowNumber = index + 1 + HEADER_ROWS;
    const rowIssues = [];
    const row = normalizeRow(sheet, raw, rowNumber, rowIssues, { patterns });

    // `employee_code` keeps its case and is compared exactly (§2.2).
    const code = row.employee_code;
    if (code) {
      if (seenCodes.has(code)) {
        duplicates += 1;
        rowIssues.push(issue('KEY_DUPLICATE', sheet, rowNumber, 'employee_code'));
      } else {
        seenCodes.set(code, rowNumber);
      }
    }

    // The badge is informational, so a repeat is a warning only (§3.3).
    const badge = row.badge_number;
    if (badge) {
      if (seenBadges.has(badge)) {
        badgeDuplicates += 1;
        rowIssues.push(issue('BADGE_DUPLICATE', sheet, rowNumber, 'badge_number'));
      } else {
        seenBadges.set(badge, rowNumber);
      }
    }

    // `status_effective_date` is required unless the employee is `Active`.
    if (row.employment_status && row.employment_status !== 'Active' && !row.status_effective_date) {
      rowIssues.push(issue('REQUIRED_EMPTY', sheet, rowNumber, 'status_effective_date'));
    }

    checkDateLimits(sheet, row, limits, rowIssues);

    if (row.department_code) {
      const department = resolveCode(row.department_code, departmentIndex, { requireActive: true });
      if (!department.known) {
        rowIssues.push(issue('REF_UNKNOWN', sheet, rowNumber, 'department_code'));
      } else if (!department.active) {
        rowIssues.push(issue('REF_INACTIVE_CODE', sheet, rowNumber, 'department_code'));
      }
    }

    if (row.job_title_code) {
      const title = resolveCode(row.job_title_code, jobTitleCodes, { requireActive: true });
      if (!title.known) {
        rowIssues.push(issue('REF_UNKNOWN', sheet, rowNumber, 'job_title_code'));
      } else {
        if (!title.active) {
          rowIssues.push(issue('REF_INACTIVE_CODE', sheet, rowNumber, 'job_title_code'));
        }
        const scope = checkJobTitleScope(
          jobTitleIndex.get(row.job_title_code),
          row.department_code,
          { sheet, row: rowNumber },
        );
        if (scope) rowIssues.push(scope);
      }
    }

    issues.push(...rowIssues);
    if (rowIssues.some((entry) => entry.severity === SEVERITY.BLOCK) || columnBlocked) {
      rejected += 1;
      return;
    }
    if (row.employment_status in byStatus) byStatus[row.employment_status] += 1;
    accepted.push(Object.freeze(row));
  });

  return finishResult({
    sheet,
    rows: Object.freeze(accepted),
    issues,
    counts: {
      input: rows.length,
      accepted: accepted.length,
      rejected,
      duplicateKeys: duplicates,
      duplicateBadges: badgeDuplicates,
      active: byStatus.Active,
      inactive: byStatus.Inactive,
      left: byStatus.Left,
      columns: presentColumns.length,
    },
  });
}

/* ------------------------------------------------------------------ *
 * Fingerprint (§3.8) — detection only
 * ------------------------------------------------------------------ */

/** Version tag that is part of the fingerprint values and of its prefix. */
export const FINGERPRINT_VERSION = 'fp1';

function fingerprintText(value) {
  return collapseText(value).toUpperCase();
}

/**
 * The canonical values of a record fingerprint, in contract order. Each value
 * is a separate JSON string, so a `|` or `,` inside a value cannot shift a
 * field boundary.
 */
export function fingerprintValues(record) {
  return [
    FINGERPRINT_VERSION,
    record?.employee_code ? String(record.employee_code) : '',
    record?.course_code ? String(record.course_code) : '',
    record?.completion_status ? String(record.completion_status) : '',
    record?.completion_date ? String(record.completion_date) : '',
    record?.expiry_date ? String(record.expiry_date) : '',
    fingerprintText(record?.certificate_number),
  ];
}

/** The canonical JSON of the values above: an array of strings, no whitespace. */
export function fingerprintCanonical(record) {
  return JSON.stringify(fingerprintValues(record));
}

/**
 * `fp1:<lowercase hex of SHA-256>` of the canonical JSON.
 * Uses Web Crypto, which is available in the browser and in Node, so no
 * dependency is added. The fingerprint detects possible duplicates only: it is
 * never a key and records are never merged on it.
 */
export async function fingerprintRecord(record) {
  const bytes = new TextEncoder().encode(fingerprintCanonical(record));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${FINGERPRINT_VERSION}:${hex}`;
}

/**
 * `POSSIBLE_DUPLICATE_RECORD` (`warn`) for records that share a fingerprint
 * while their `source_record_id` differs. Nothing is merged.
 */
export async function detectPossibleDuplicates(rows, { sheet = 'Training_Records' } = {}) {
  const issues = [];
  const byFingerprint = new Map();
  const fingerprints = new Map();

  for (const row of rows ?? []) {
    const fingerprint = await fingerprintRecord(row);
    fingerprints.set(row[ROW_NUMBER_KEY], fingerprint);
    const first = byFingerprint.get(fingerprint);
    if (first === undefined) {
      byFingerprint.set(fingerprint, row);
      continue;
    }
    if (first.source_record_id === row.source_record_id) continue;
    issues.push(
      issue('POSSIBLE_DUPLICATE_RECORD', sheet, row[ROW_NUMBER_KEY], 'source_record_id', {
        firstRow: first[ROW_NUMBER_KEY],
      }),
    );
  }
  return { issues, fingerprints };
}

/* ------------------------------------------------------------------ *
 * Training records (§3.6)
 * ------------------------------------------------------------------ */

/**
 * The requirement that applies to a record: the requirement of the employee's
 * `(department_code, job_title_code)` for the record's `course_code` that the
 * caller selected as effective at the As Of Date (§3.6, §5.4).
 */
export function applicableRequirement(employee, courseCode, requirementIndex) {
  if (!employee || !courseCode || !(requirementIndex instanceof Map)) return undefined;
  return requirementIndex.get(
    requirementKey(employee.department_code, employee.job_title_code, courseCode),
  );
}

/** True when that requirement makes an expiry date mandatory (§3.6, T-07). */
export function requiresExpiry(requirement) {
  return (
    requirement?.requirement_type === 'Mandatory' &&
    requirement?.validity_months !== undefined &&
    requirement?.validity_months !== null &&
    requirement?.validity_months !== ''
  );
}

/**
 * Validate `Training_Records` rows.
 *
 * Context:
 * - `sourceSystem`: `_Contract.source_system`; the batch key is
 *   `(source_system, source_record_id)` (§3.7).
 * - `extractDate`, `asOfDate`: date limits.
 * - `employees`: normalised employee rows, approved rows first.
 * - `courses`: normalised course rows.
 * - `requirements`: the requirements effective at the As Of Date, prepared by
 *   the caller (array or Map).
 *
 * `RECORD_IDENTITY_CHANGED` is not checked here; it compares against approved
 * records (§3.7) and belongs to a later layer.
 */
export function validateTrainingRecords(inputRows, context = {}) {
  const sheet = 'Training_Records';
  const rows = Array.isArray(inputRows) ? inputRows : [];
  const presentColumns = columnsOf(rows, context.columns);
  const hasHeader = Array.isArray(context.columns) || rows.length > 0;
  const issues = hasHeader ? validateColumns(sheet, presentColumns) : [];
  const columnBlocked = issues.some((entry) => entry.severity === SEVERITY.BLOCK);

  const sourceSystem = normalizeReferenceCode(context.sourceSystem);
  if (rows.length > 0 && !sourceSystem) {
    issues.push(issue('CONTRACT_FIELD', sheet, undefined, 'source_system'));
  }
  const employeeIndex = buildEmployeeIndex(context.employees);
  const courseIndex = buildCodeIndex(context.courses, 'course_code');
  const requirementIndex = buildRequirementIndex(context.requirements);
  const limits = { extract_date: context.extractDate, as_of_date: context.asOfDate };

  const accepted = [];
  const seenKeys = new Map();
  const seenCertificates = new Map();
  let duplicates = 0;
  let rejected = 0;
  let certMissing = 0;
  let certDuplicates = 0;
  let forInactive = 0;
  let expiryMismatches = 0;
  const byStatus = { Completed: 0, 'In Progress': 0, 'Not Started': 0 };
  const differenceDays = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 1 + HEADER_ROWS;
    const rowIssues = [];
    const row = normalizeRow(sheet, raw, rowNumber, rowIssues);
    if (sourceSystem) row.source_system = sourceSystem;

    // Batch key: `source_record_id` under one `source_system`, compared
    // exactly and case-sensitively (§2.2, §3.7).
    const key = row.source_record_id ? `${sourceSystem}\u0000${row.source_record_id}` : '';
    if (key) {
      if (seenKeys.has(key)) {
        duplicates += 1;
        rowIssues.push(issue('KEY_DUPLICATE', sheet, rowNumber, 'source_record_id'));
      } else {
        seenKeys.set(key, rowNumber);
      }
    }

    const employee = row.employee_code ? employeeIndex.get(row.employee_code) : undefined;
    if (row.employee_code && !employee) {
      rowIssues.push(issue('REF_UNKNOWN', sheet, rowNumber, 'employee_code'));
    }
    if (row.course_code && !resolveCode(row.course_code, courseIndex).known) {
      rowIssues.push(issue('REF_UNKNOWN', sheet, rowNumber, 'course_code'));
    }
    // A record of a non-active employee is kept as history (§4, info).
    if (employee && employee.employment_status && employee.employment_status !== 'Active') {
      forInactive += 1;
      rowIssues.push(issue('RECORD_FOR_INACTIVE', sheet, rowNumber, 'employee_code'));
    }

    const status = row.completion_status;
    if (status === 'Completed') {
      if (!row.completion_date) {
        rowIssues.push(issue('REQUIRED_EMPTY', sheet, rowNumber, 'completion_date'));
      }
      if (!row.certificate_number) {
        certMissing += 1;
        rowIssues.push(issue('CERT_MISSING', sheet, rowNumber, 'certificate_number'));
      } else {
        const certificate = row.certificate_number.toUpperCase();
        if (seenCertificates.has(certificate)) {
          certDuplicates += 1;
          rowIssues.push(issue('CERT_DUPLICATE', sheet, rowNumber, 'certificate_number'));
        } else {
          seenCertificates.set(certificate, rowNumber);
        }
      }
      if (row.expiry_date && row.completion_date) {
        if (daysBetween(row.expiry_date, row.completion_date) <= 0) {
          rowIssues.push(issue('DATE_ORDER', sheet, rowNumber, 'expiry_date'));
        }
      }

      const requirement = applicableRequirement(employee, row.course_code, requirementIndex);
      if (!row.expiry_date && requiresExpiry(requirement)) {
        // Blocking only while the effective requirement is `Mandatory` with a
        // validity (default of decision T-07). A `Recommended` requirement, a
        // requirement without validity and an absent requirement do not block
        // storing the evidence.
        rowIssues.push(issue('COMPLETED_WITHOUT_EXPIRY', sheet, rowNumber, 'expiry_date'));
      }
      if (row.expiry_date && row.completion_date && requirement?.validity_months) {
        const expected = addCalendarMonths(row.completion_date, requirement.validity_months);
        const difference = daysBetween(row.expiry_date, expected);
        if (difference !== null && difference !== 0) {
          expiryMismatches += 1;
          differenceDays.push(difference);
          rowIssues.push(
            issue('EXPIRY_VALIDITY_MISMATCH', sheet, rowNumber, 'expiry_date', {
              differenceDays: difference,
            }),
          );
        }
      }
    } else if (status) {
      // `In Progress` and `Not Started` need no date and no certificate; dates
      // on them are reported and then dropped from the normalised row (§3.6).
      const extra = ['completion_date', 'expiry_date', 'certificate_number'].filter(
        (field) => row[field] !== undefined,
      );
      if (extra.length > 0) {
        for (const field of extra) {
          rowIssues.push(issue('DATES_ON_INCOMPLETE', sheet, rowNumber, field));
          delete row[field];
        }
      }
    }

    checkDateLimits(sheet, row, limits, rowIssues);

    issues.push(...rowIssues);
    if (rowIssues.some((entry) => entry.severity === SEVERITY.BLOCK) || columnBlocked) {
      rejected += 1;
      return;
    }
    if (status in byStatus) byStatus[status] += 1;
    accepted.push(Object.freeze(row));
  });

  differenceDays.sort((a, b) => a - b);

  return finishResult({
    sheet,
    rows: Object.freeze(accepted),
    issues,
    counts: {
      input: rows.length,
      accepted: accepted.length,
      rejected,
      duplicateKeys: duplicates,
      completed: byStatus.Completed,
      inProgress: byStatus['In Progress'],
      notStarted: byStatus['Not Started'],
      forInactive,
      certMissing,
      certDuplicates,
      expiryMismatches,
      columns: presentColumns.length,
    },
    // Numbers only: the day differences of EXPIRY_VALIDITY_MISMATCH as a
    // distribution, with no employee, course or certificate value (§4.1).
    expiryDifferenceDays: Object.freeze(differenceDays),
  });
}

/**
 * `validateTrainingRecords` plus the fingerprint duplicate detection, which
 * needs SHA-256 and is therefore asynchronous.
 */
export async function validateTrainingRecordsWithFingerprints(inputRows, context = {}) {
  const base = validateTrainingRecords(inputRows, context);
  const { issues, fingerprints } = await detectPossibleDuplicates(base.rows);
  return finishResult({
    ...base,
    issues: [...base.issues, ...issues],
    counts: { ...base.counts, possibleDuplicates: issues.length },
    fingerprints: Object.freeze(fingerprints),
  });
}

export { ENTITIES, SOURCE_RECORD_ID_MAX_LENGTH };
