/**
 * Preparation layer between the approved state of `HSE-DC-1.0` and the existing
 * compliance engine.
 *
 * Source of truth: docs/DATA-CONTRACT.md §3.5, §3.6, §3.7, §5.4 and §8, read
 * through src/lib/contract/schema.js.
 *
 * The engine (src/lib/complianceEngine.js) is **not** changed by this module.
 * It keeps its own field names, so everything is translated here:
 * `department_code` becomes `Department`, `employee_code` becomes `Employee_ID`
 * and so on. Codes are the only matching keys; display names never match.
 *
 * Scope limits:
 * - Pure functions. No clock, no time zone, no network, no file reading, no UI,
 *   no export and no storage. `asOfDate` is always given by the caller.
 * - The approved state and its rows are never changed. A record is only left
 *   out of the engine input; it always stays in the approved state.
 */

import { isValidDateStr, dateDiffDays } from '../normalization.js';

/** Markers of a voided or deleted record version, when the state carries one. */
const VOID_MARKERS = Object.freeze(['deleted_at', 'voided_at', 'void_reference']);

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function recordKey(row) {
  return `${text(row?.source_system).toUpperCase()}\u0000${text(row?.source_record_id)}`;
}

function requirementKeyOf(departmentCode, jobTitleCode, courseCode) {
  return `${text(departmentCode)}|${text(jobTitleCode)}|${text(courseCode)}`;
}

function isVoided(row) {
  return VOID_MARKERS.some((marker) => Boolean(row?.[marker]));
}

/** A validity that the contract accepts as a real period (§3.5). */
function hasValidity(requirement) {
  const months = requirement?.validity_months;
  if (months === undefined || months === null || months === '') return false;
  return Number.isInteger(Number(months)) && Number(months) > 0;
}

function frozenIndex(rows, codeField) {
  const index = new Map();
  for (const row of rows ?? []) {
    const code = row?.[codeField];
    if (code && !index.has(code)) index.set(code, Object.freeze({ ...row }));
  }
  return Object.freeze(index);
}

/* ------------------------------------------------------------------ *
 * Effective requirements (§5.4)
 * ------------------------------------------------------------------ */

/**
 * A requirement row is effective at `asOfDate` when
 * `effective_from <= asOfDate` and `effective_to` is empty or
 * `asOfDate <= effective_to`. Both bounds are inclusive.
 */
export function isRequirementEffective(row, asOfDate) {
  if (!row?.effective_from || !asOfDate) return false;
  if (dateDiffDays(asOfDate, row.effective_from) < 0) return false;
  if (row.effective_to && dateDiffDays(asOfDate, row.effective_to) > 0) return false;
  return true;
}

/**
 * Translate one requirement row into the engine shape. `Validity_Months` is
 * passed through exactly as approved and is never recalculated.
 */
export function toEngineRequirement(row, courses) {
  const course = courses instanceof Map ? courses.get(row.course_code) : undefined;
  return Object.freeze({
    Department: row.department_code,
    Job_Title: row.job_title_code,
    Course_Code: row.course_code,
    // The engine carries one course name; the UI substitutes the display
    // language later from the lookups, so the code never depends on language.
    Course_Name: course?.name_en || row.course_code,
    Mandatory: row.requirement_type === 'Mandatory',
    Validity_Months: row.validity_months,
  });
}

/* ------------------------------------------------------------------ *
 * Record versions (§3.7)
 * ------------------------------------------------------------------ */

/**
 * The current version of each logical record `(source_system,
 * source_record_id)`.
 *
 * Order, deterministic and documented:
 *   1. the highest `_version`;
 *   2. on a tie or a missing `_version`, the latest valid `_approvedAt`;
 *   3. on a tie there too, the version that appears later in the state, because
 *      the state is append-only, so the later entry is the newer one.
 *
 * Two different `source_record_id`s are never merged, even when employee,
 * course and fingerprint are identical: a renewal is a separate record and the
 * engine picks the best one with its own rule.
 */
export function selectCurrentVersions(records) {
  const current = new Map();
  for (const row of records ?? []) {
    const key = recordKey(row);
    if (!row?.source_record_id) continue;
    const held = current.get(key);
    if (held === undefined || isNewerVersion(row, held)) current.set(key, row);
  }
  return current;
}

function approvalInstant(value) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

function isNewerVersion(candidate, held) {
  const candidateVersion = Number.isInteger(candidate?._version) ? candidate._version : 0;
  const heldVersion = Number.isInteger(held?._version) ? held._version : 0;
  if (candidateVersion !== heldVersion) return candidateVersion > heldVersion;

  const candidateAt = approvalInstant(candidate?._approvedAt);
  const heldAt = approvalInstant(held?._approvedAt);
  if (candidateAt !== null && heldAt !== null && candidateAt !== heldAt) {
    return candidateAt > heldAt;
  }
  if (candidateAt !== null && heldAt === null) return true;
  if (candidateAt === null && heldAt !== null) return false;
  // Same version and same approval time: the later entry of an append-only
  // state wins, so the result stays the same for the same input.
  return true;
}

/** Translate one record version into the engine shape. */
export function toEngineRecord(row, courses) {
  const course = courses instanceof Map ? courses.get(row.course_code) : undefined;
  const completed = row.completion_status === 'Completed';
  return Object.freeze({
    Employee_ID: row.employee_code,
    Course_Code: row.course_code,
    Course_Name: course?.name_en || row.course_code,
    Completion_Status: row.completion_status,
    // Dates of an incomplete status never reach the engine (§3.6).
    Issue_Date: completed ? (row.completion_date ?? '') : '',
    Expiry_Date: completed ? (row.expiry_date ?? '') : '',
    Certificate_Number: row.certificate_number ?? '',
    Training_Provider: row.training_provider ?? '',
    Remarks: row.remarks ?? '',
    // Technical, for tracing only; the engine ignores unknown fields.
    _sourceSystem: row.source_system ?? '',
    _sourceRecordId: row.source_record_id ?? '',
    _version: row._version ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * Employees
 * ------------------------------------------------------------------ */

/**
 * Translate one approved employee into the engine shape. This list is passed as
 * the optional fourth argument of `buildComplianceUniverse`, so an active
 * employee without any training record still receives `MISSING` for every
 * mandatory requirement of the role.
 */
export function toEngineEmployee(row) {
  return Object.freeze({
    Employee_ID: row.employee_code,
    Employee_Name: row.full_name ?? '',
    Department: row.department_code,
    Job_Title: row.job_title_code,
    Employment_Status: row.employment_status,
  });
}

/* ------------------------------------------------------------------ *
 * Preparation
 * ------------------------------------------------------------------ */

export class EnginePreparationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnginePreparationError';
  }
}

/**
 * Build the engine input from the approved state at `asOfDate`.
 *
 * `asOfDate` MUST be a real calendar day written `YYYY-MM-DD`. An invalid value
 * throws `EnginePreparationError`: there is no fallback to the clock of the
 * device, because a silent fallback would change compliance results.
 *
 * Returns `{ records, requirements, employees, lookups, counts }`, all frozen.
 * The approved state and its rows are not changed; a record that the rule of
 * §3.6 excludes is left out of `records` only and stays approved.
 */
export function prepareEngineInput(approvedState, asOfDate) {
  if (typeof asOfDate !== 'string' || !isValidDateStr(asOfDate)) {
    throw new EnginePreparationError(
      'asOfDate must be a real calendar day written YYYY-MM-DD; no clock fallback is used',
    );
  }
  const state = approvedState ?? {};

  const lookups = Object.freeze({
    departments: frozenIndex(state.departments, 'department_code'),
    jobTitles: frozenIndex(state.jobTitles, 'job_title_code'),
    courses: frozenIndex(state.courses, 'course_code'),
  });

  const effective = (state.requirements ?? []).filter((row) =>
    isRequirementEffective(row, asOfDate),
  );
  const requirements = Object.freeze(
    effective.map((row) => toEngineRequirement(row, lookups.courses)),
  );

  // Effective requirements by role and course, for the re-check below (§3.6).
  const effectiveByKey = new Map();
  for (const row of effective) {
    const key = requirementKeyOf(row.department_code, row.job_title_code, row.course_code);
    if (!effectiveByKey.has(key)) effectiveByKey.set(key, row);
  }

  const employeeRows = state.employees ?? [];
  const employees = Object.freeze(employeeRows.map(toEngineEmployee));
  const employeeByCode = new Map(employeeRows.map((row) => [row.employee_code, row]));

  const current = selectCurrentVersions(state.records);
  const records = [];
  let voided = 0;
  let withoutExpiry = 0;

  for (const row of current.values()) {
    // The current version is voided, so the whole logical record is out. An
    // older version is never brought back, and no new void system is invented.
    if (isVoided(row)) {
      voided += 1;
      continue;
    }

    // Re-check of COMPLETED_WITHOUT_EXPIRY against the requirements effective
    // at this As Of Date (decision T-07). A Recommended requirement, a missing
    // requirement and a Mandatory requirement without validity do not exclude
    // the record.
    if (row.completion_status === 'Completed' && !row.expiry_date) {
      const employee = employeeByCode.get(row.employee_code);
      const requirement = employee
        ? effectiveByKey.get(
            requirementKeyOf(employee.department_code, employee.job_title_code, row.course_code),
          )
        : undefined;
      if (requirement?.requirement_type === 'Mandatory' && hasValidity(requirement)) {
        withoutExpiry += 1;
        continue;
      }
    }

    records.push(toEngineRecord(row, lookups.courses));
  }

  return Object.freeze({
    asOfDate,
    records: Object.freeze(records),
    requirements,
    employees,
    lookups,
    counts: Object.freeze({
      approvedRecords: (state.records ?? []).length,
      logicalRecords: current.size,
      records: records.length,
      excludedVoided: voided,
      excludedCompletedWithoutExpiry: withoutExpiry,
      requirements: requirements.length,
      approvedRequirements: (state.requirements ?? []).length,
      employees: employees.length,
      departments: lookups.departments.size,
      jobTitles: lookups.jobTitles.size,
      courses: lookups.courses.size,
    }),
  });
}
