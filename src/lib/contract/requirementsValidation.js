/**
 * Validation of the `Requirements` sheet of `HSE-DC-1.0`, of the requirements
 * version it carries, and selection of the requirements effective at a date.
 *
 * Source of truth: docs/DATA-CONTRACT.md §3.5, §5 and §4, read through
 * src/lib/contract/schema.js. Shared primitives come from
 * src/lib/contract/core.js.
 *
 * Scope limits:
 * - Input is plain JavaScript rows plus an explicit context. There is no XLSX
 *   or CSV reading, no staging, no organization binding, no UI, no engine call
 *   and no historical report.
 * - The rows that a new version would close are **computed and returned only**.
 *   Nothing is modified here.
 * - Issues carry a code, a severity, the sheet, the row number, the field name
 *   and numbers only (§4.1).
 */

import { SEVERITY, normalizeReferenceCode } from './schema.js';
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
import { buildJobTitleIndex, requirementKey } from './entityValidation.js';

const SHEET = 'Requirements';

/** The literal value that `Requirements.source` MUST carry (§3.5). */
export const APPROVED_SOURCE = 'approved';

/** Fields whose own rule replaces the generic one (`REQ_NOT_APPROVED`). */
const APPROVAL_FIELDS = Object.freeze([
  'source',
  'approval_reference',
  'approved_by_role',
  'approved_on',
]);

/**
 * Markers that a row comes from derived test requirements rather than from an
 * approved decision. Derived requirements MUST NOT enter a production batch
 * (§3.5, §5.5).
 */
const DERIVED_MARKERS = Object.freeze(['Derived', 'derived', 'derived_test']);

function hasDerivedMarker(raw) {
  if (!raw || typeof raw !== 'object') return false;
  for (const marker of DERIVED_MARKERS) {
    if (raw[marker]) return true;
  }
  return collapseText(raw.source).toLowerCase().startsWith('derived');
}

/** The triple that identifies a requirement across versions. */
export function requirementTriple(row) {
  return requirementKey(row?.department_code, row?.job_title_code, row?.course_code);
}

/**
 * Content signature of one requirement row, without its row number: the fields
 * that decide whether two versions carry the same content (§5).
 */
export function requirementSignature(row) {
  return [
    requirementTriple(row),
    collapseText(row?.requirement_type),
    row?.validity_months === undefined || row?.validity_months === null
      ? ''
      : String(row.validity_months),
    row?.effective_from ?? '',
    row?.effective_to ?? '',
  ].join('\u0000');
}

/**
 * True when a requirement row is effective at `dateStr`.
 * Both bounds are inclusive: the `effective_from` day and the `effective_to`
 * day are inside the range, the day before and the day after are outside
 * (§3.5, §5.4).
 */
export function isEffectiveAt(row, dateStr) {
  if (!row?.effective_from || !dateStr) return false;
  if (daysBetween(dateStr, row.effective_from) < 0) return false;
  if (row.effective_to && daysBetween(dateStr, row.effective_to) > 0) return false;
  return true;
}

/**
 * The requirements effective at `dateStr`, newest version first per triple.
 * Pure selection: no clock is read and nothing is modified.
 */
export function selectEffectiveRequirements(rows, dateStr) {
  const best = new Map();
  for (const row of rows ?? []) {
    if (!isEffectiveAt(row, dateStr)) continue;
    const key = requirementTriple(row);
    const current = best.get(key);
    if (!current || daysBetween(row.effective_from, current.effective_from) > 0) {
      best.set(key, row);
    }
  }
  return Object.freeze([...best.values()]);
}

/** Two closed or open ranges overlap (inclusive bounds). */
function rangesOverlap(a, b) {
  const aEnd = a.effective_to || null;
  const bEnd = b.effective_to || null;
  if (aEnd && daysBetween(b.effective_from, aEnd) > 0) return false;
  if (bEnd && daysBetween(a.effective_from, bEnd) > 0) return false;
  return true;
}

/**
 * Validate the `Requirements` sheet of one batch.
 *
 * Context:
 * - `requirementsEffectiveFrom`: `_Contract.requirements_effective_from`; every
 *   row MUST carry exactly this date (`REQ_EFFECTIVE_MISMATCH`).
 * - `extractDate`, `asOfDate`: date limits.
 * - `departments`, `jobTitles`, `courses`: normalised reference rows, approved
 *   rows first.
 * - `approvedRequirements`: the requirement rows already approved, used for the
 *   version checks and for the list of rows a new version would close.
 * - `columns` MAY declare the header of an empty sheet.
 *
 * Returns the validator result plus:
 * - `rowsToClose`: the approved rows that this version would close, limited to
 *   the departments listed in the batch. They are returned, never changed.
 * - `departmentsInBatch`: the department codes the batch covers.
 */
export function validateRequirements(inputRows, context = {}) {
  const rows = Array.isArray(inputRows) ? inputRows : [];
  const presentColumns = columnsOf(rows, context.columns);
  const hasHeader = Array.isArray(context.columns) || rows.length > 0;
  const issues = hasHeader ? validateColumns(SHEET, presentColumns) : [];
  const columnBlocked = issues.some((entry) => entry.severity === SEVERITY.BLOCK);

  const departmentIndex = buildCodeIndex(context.departments, 'department_code');
  const jobTitleCodes = buildCodeIndex(context.jobTitles, 'job_title_code');
  const jobTitleIndex = buildJobTitleIndex(context.jobTitles);
  const courseIndex = new Map(
    (context.courses ?? []).filter((row) => row?.course_code).map((row) => [row.course_code, row]),
  );
  const limits = { extract_date: context.extractDate, as_of_date: context.asOfDate };
  const version = collapseText(context.requirementsEffectiveFrom);

  const accepted = [];
  const seenKeys = new Map();
  const byTriple = new Map();
  let duplicates = 0;
  let rejected = 0;
  let notApproved = 0;
  let overlaps = 0;
  let suggestionDiffers = 0;
  const byType = { Mandatory: 0, Recommended: 0 };

  rows.forEach((raw, index) => {
    const rowNumber = index + 1 + HEADER_ROWS;
    const rowIssues = [];
    const row = normalizeRow(SHEET, raw, rowNumber, rowIssues, { skip: APPROVAL_FIELDS });

    // One code for the whole approval state of the row: a missing approval
    // field, a `source` other than `approved`, or a derived marker (§3.5, §4).
    const approvalMissing = APPROVAL_FIELDS.some((field) => !row[field]);
    const sourceWrong = collapseText(row.source).toLowerCase() !== APPROVED_SOURCE;
    if (approvalMissing || sourceWrong || hasDerivedMarker(raw)) {
      notApproved += 1;
      rowIssues.push(issue('REQ_NOT_APPROVED', SHEET, rowNumber, 'source'));
    } else {
      row.source = APPROVED_SOURCE;
    }

    if (row.department_code) {
      const department = resolveCode(row.department_code, departmentIndex, { requireActive: true });
      if (!department.known) {
        rowIssues.push(issue('REF_UNKNOWN', SHEET, rowNumber, 'department_code'));
      } else if (!department.active) {
        rowIssues.push(issue('REF_INACTIVE_CODE', SHEET, rowNumber, 'department_code'));
      }
    }

    if (row.job_title_code) {
      const title = resolveCode(row.job_title_code, jobTitleCodes, { requireActive: true });
      if (!title.known) {
        rowIssues.push(issue('REF_UNKNOWN', SHEET, rowNumber, 'job_title_code'));
      } else {
        if (!title.active) {
          rowIssues.push(issue('REF_INACTIVE_CODE', SHEET, rowNumber, 'job_title_code'));
        }
        const scope = checkJobTitleScope(
          jobTitleIndex.get(row.job_title_code),
          row.department_code,
          { sheet: SHEET, row: rowNumber },
        );
        if (scope) rowIssues.push(scope);
      }
    }

    const course = row.course_code ? courseIndex.get(row.course_code) : undefined;
    if (row.course_code && !course) {
      rowIssues.push(issue('REF_UNKNOWN', SHEET, rowNumber, 'course_code'));
    }

    // Every row of the batch carries the version date of the contract (§5).
    if (row.effective_from && version && row.effective_from !== version) {
      rowIssues.push(issue('REQ_EFFECTIVE_MISMATCH', SHEET, rowNumber, 'effective_from'));
    }
    // `effective_to` is inclusive and may equal `effective_from` (§3.5).
    if (row.effective_to && row.effective_from) {
      if (daysBetween(row.effective_to, row.effective_from) < 0) {
        rowIssues.push(issue('DATE_ORDER', SHEET, rowNumber, 'effective_to'));
      }
    }
    checkDateLimits(SHEET, row, limits, rowIssues);

    // The requirement row is the official validity; the course suggestion is
    // help only and a difference is information (§3.4).
    if (
      course?.suggested_validity_months !== undefined &&
      row.validity_months !== undefined &&
      course.suggested_validity_months !== row.validity_months
    ) {
      suggestionDiffers += 1;
      rowIssues.push(
        issue('SUGGESTED_VALIDITY_DIFFERS', SHEET, rowNumber, 'validity_months', {
          differenceMonths: row.validity_months - course.suggested_validity_months,
        }),
      );
    }

    const key = `${requirementTriple(row)}\u0000${row.effective_from ?? ''}`;
    if (row.department_code && row.job_title_code && row.course_code && row.effective_from) {
      if (seenKeys.has(key)) {
        duplicates += 1;
        rowIssues.push(issue('KEY_DUPLICATE', SHEET, rowNumber, 'course_code'));
      } else {
        seenKeys.set(key, rowNumber);
        // Overlap of two different versions of the same requirement inside one
        // batch; an exactly repeated key is reported as KEY_DUPLICATE above.
        const triple = requirementTriple(row);
        const others = byTriple.get(triple) ?? [];
        if (others.some((other) => rangesOverlap(other, row))) {
          overlaps += 1;
          rowIssues.push(issue('REQ_OVERLAP', SHEET, rowNumber, 'effective_from'));
        }
        byTriple.set(triple, [...others, row]);
      }
    }

    issues.push(...rowIssues);
    if (rowIssues.some((entry) => entry.severity === SEVERITY.BLOCK) || columnBlocked) {
      rejected += 1;
      return;
    }
    if (row.requirement_type in byType) byType[row.requirement_type] += 1;
    accepted.push(Object.freeze(row));
  });

  const versionCheck = checkVersion(accepted, version, context.approvedRequirements);
  issues.push(...versionCheck.issues);

  return finishResult({
    sheet: SHEET,
    rows: Object.freeze(accepted),
    issues,
    counts: {
      input: rows.length,
      accepted: accepted.length,
      rejected,
      duplicateKeys: duplicates,
      notApproved,
      overlaps,
      suggestionDiffers,
      mandatory: byType.Mandatory,
      recommended: byType.Recommended,
      departments: versionCheck.departmentsInBatch.length,
      rowsToClose: versionCheck.rowsToClose.length,
      columns: presentColumns.length,
    },
    rowsToClose: versionCheck.rowsToClose,
    departmentsInBatch: versionCheck.departmentsInBatch,
    unchanged: versionCheck.unchanged,
  });
}

/**
 * Version checks of §5 against the approved requirements, plus the list of
 * approved rows this version would close.
 *
 * - `REQ_VERSION_OLDER`: the version date is earlier than the approved version
 *   of any department the batch lists.
 * - `REQ_UNCHANGED` (info): the same version date with the same content.
 * - `REQ_VERSION_EXISTS`: the same version date with different content.
 * - Rows to close: the approved rows of the listed departments whose range is
 *   still open at the new version date. They are returned, never changed.
 */
function checkVersion(rows, version, approvedRequirements) {
  const issues = [];
  const approved = (approvedRequirements ?? []).filter((row) => row?.effective_from);
  const departmentsInBatch = [...new Set(rows.map((row) => row.department_code).filter(Boolean))];
  const inBatch = new Set(departmentsInBatch);
  const relevant = approved.filter((row) =>
    inBatch.has(normalizeReferenceCode(row.department_code)),
  );

  if (!version || rows.length === 0) {
    return { issues, rowsToClose: Object.freeze([]), departmentsInBatch, unchanged: false };
  }

  let unchanged = false;
  const sameVersion = relevant.filter((row) => row.effective_from === version);
  const newer = relevant.filter((row) => daysBetween(row.effective_from, version) > 0);

  if (newer.length > 0) {
    issues.push(issue('REQ_VERSION_OLDER', SHEET, undefined, 'effective_from'));
  } else if (sameVersion.length > 0) {
    const batchContent = new Set(rows.map(requirementSignature));
    const approvedContent = new Set(sameVersion.map(requirementSignature));
    const identical =
      batchContent.size === approvedContent.size &&
      [...batchContent].every((signature) => approvedContent.has(signature));
    if (identical) {
      unchanged = true;
      issues.push(issue('REQ_UNCHANGED', SHEET, undefined, 'effective_from'));
    } else {
      issues.push(issue('REQ_VERSION_EXISTS', SHEET, undefined, 'effective_from'));
    }
  }

  // Only rows of the listed departments are closed; other departments keep
  // their approved version untouched (§5).
  const rowsToClose =
    unchanged || issues.some((entry) => entry.severity === SEVERITY.BLOCK)
      ? []
      : relevant.filter(
          (row) => row.effective_from !== version && isEffectiveAt(row, version),
        );

  return { issues, rowsToClose: Object.freeze(rowsToClose), departmentsInBatch, unchanged };
}

export { ROW_NUMBER_KEY, HEADER_ROWS };
