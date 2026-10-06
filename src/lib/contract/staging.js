/**
 * Staging and application of approved batches in Local Mode.
 *
 * Source of truth: docs/DATA-CONTRACT.md §1.3, §3.7, §5, §6 and §7, read
 * through src/lib/contract/schema.js.
 *
 * Scope limits:
 * - Pure functions only. No file reading, no UI, no database, no network.
 * - The approved state is treated as immutable: every function returns a new
 *   state and never changes the one it receives.
 * - Nothing here validates a sheet; the validators of the other modules produce
 *   the normalised rows that `stageBatch` receives.
 * - Contacts (`HSE-CONTACT-1.0`) are not part of this module.
 */

import { SEVERITY, ENTITIES, PRESENCE } from './schema.js';
import { issue, collapseText, countSeverities } from './core.js';
import {
  fingerprintRecord,
  buildEmployeeIndex,
} from './entityValidation.js';
import {
  requirementTriple,
  requirementSignature,
  isEffectiveAt,
} from './requirementsValidation.js';

/* ------------------------------------------------------------------ *
 * Entity description
 * ------------------------------------------------------------------ */

/** How one staged entity is keyed and where it is kept in the state. */
export const STAGED_ENTITIES = Object.freeze({
  Departments: { collection: 'departments', key: ['department_code'] },
  Job_Titles: { collection: 'jobTitles', key: ['job_title_code'] },
  Courses: { collection: 'courses', key: ['course_code'] },
  Employees: { collection: 'employees', key: ['employee_code'] },
});

/** Classification of a staged row (§7). */
export const STAGED_STATUS = Object.freeze({
  NEW: 'new',
  CHANGED: 'changed',
  UNCHANGED: 'unchanged',
  CONFLICT: 'conflict',
});

/** Fields that never take part in a comparison or in the stored row. */
const INTERNAL_FIELDS = Object.freeze([
  '_row',
  '_version',
  '_batchId',
  '_approvedAt',
  '_fingerprint',
]);

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/**
 * A fresh approved state of Local Mode. Everything is frozen, so a caller can
 * keep a reference to an earlier state and compare it with a later one.
 */
export function createApprovedState(seed = {}) {
  return Object.freeze({
    organizationCode: collapseText(seed.organizationCode).toUpperCase(),
    departments: Object.freeze([...(seed.departments ?? [])]),
    jobTitles: Object.freeze([...(seed.jobTitles ?? [])]),
    courses: Object.freeze([...(seed.courses ?? [])]),
    employees: Object.freeze([...(seed.employees ?? [])]),
    requirements: Object.freeze([...(seed.requirements ?? [])]),
    requirementHistory: Object.freeze([...(seed.requirementHistory ?? [])]),
    records: Object.freeze([...(seed.records ?? [])]),
    batches: Object.freeze([...(seed.batches ?? [])]),
    changeLog: Object.freeze([...(seed.changeLog ?? [])]),
    // `none`, `approved` or `derived` (§5.5).
    requirementsSource: seed.requirementsSource ?? 'none',
  });
}

/**
 * Drop the organization binding and everything held under it, including the
 * batch list and the change log. Used by a full reset and when a demo or test
 * workbook is loaded (§6). Nothing of one organization may survive into the
 * next, so the state returned is completely empty.
 */
export function clearOrganizationBinding() {
  return createApprovedState();
}

/**
 * Bind the state to an organization. Only a `full` package may do this, and a
 * state that is already bound cannot be moved to another organization while it
 * keeps its data: that is `ORG_MISMATCH` and the state stays as it was. Use
 * `clearOrganizationBinding` first (§6).
 */
export function bindOrganization(state, organizationCode) {
  const code = collapseText(organizationCode).toUpperCase();
  if (!code) {
    return {
      ok: false,
      state,
      issues: [issue('CONTRACT_FIELD', '_Contract', undefined, 'organization_code')],
    };
  }
  const bound = state?.organizationCode ?? '';
  if (bound && bound !== code) {
    return {
      ok: false,
      state,
      issues: [issue('ORG_MISMATCH', '_Contract', undefined, 'organization_code')],
    };
  }
  if (bound === code) return { ok: true, state, issues: [] };
  return { ok: true, state: createApprovedState({ ...state, organizationCode: code }), issues: [] };
}

/* ------------------------------------------------------------------ *
 * Batch metadata
 * ------------------------------------------------------------------ */

/**
 * Normalise an approval time. Any ISO 8601 instant with a time zone is
 * accepted and stored as UTC through `toISOString()`, so two spellings of the
 * same instant compare equal. Returns `''` when the value is not an instant.
 */
export function normalizeApprovalTime(value) {
  const text = collapseText(value);
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

/** Milliseconds of a normalised approval time, or null. */
function approvalInstant(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** `true` when `candidate` is strictly earlier than `approved`. */
function isOlderThan(candidate, approved) {
  const a = approvalInstant(candidate);
  const b = approvalInstant(approved);
  if (a === null || b === null) return false;
  return a < b;
}

/** The batch fields every approved batch MUST carry (§7). */
const REQUIRED_BATCH_FIELDS = Object.freeze({
  batchId: 'batch_id',
  preparedByRole: 'prepared_by_role',
  approvedByRole: 'approved_by_role',
  approvedAt: 'approved_at',
});

/**
 * Organization binding rules of §6:
 * - A `full` package binds the organization, or must match an existing binding.
 * - Any other package type without a binding is `ORG_NOT_LOADED`.
 * - A different organization is `ORG_MISMATCH`.
 */
export function checkOrganizationBinding(state, { packageType, organizationCode } = {}) {
  const issues = [];
  const code = collapseText(organizationCode).toUpperCase();
  const bound = state?.organizationCode ?? '';

  if (!code) {
    issues.push(issue('CONTRACT_FIELD', '_Contract', undefined, 'organization_code'));
    return issues;
  }
  if (!bound) {
    if (packageType !== 'full') {
      issues.push(issue('ORG_NOT_LOADED', '_Contract', undefined, 'organization_code'));
    }
    return issues;
  }
  if (bound !== code) {
    issues.push(issue('ORG_MISMATCH', '_Contract', undefined, 'organization_code'));
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function withoutInternals(row) {
  const copy = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    if (!INTERNAL_FIELDS.includes(key)) copy[key] = value;
  }
  return copy;
}

function indexBy(rows, keyOf) {
  const index = new Map();
  for (const row of rows ?? []) {
    const key = keyOf(row);
    if (key) index.set(key, row);
  }
  return index;
}

function keyOfEntity(sheet, row) {
  return STAGED_ENTITIES[sheet].key.map((field) => row?.[field] ?? '').join('\u0000');
}

/**
 * Canonical content signature of a training record: every contract field of
 * `Training_Records` (§3.6) as a JSON array, so any difference — status, dates,
 * certificate number, provider or remarks — makes a new version. The
 * fingerprint of §3.8 is never used for this: it covers a subset of the fields
 * and exists only to detect possible duplicates.
 */
export function recordSignature(row) {
  return JSON.stringify(
    ENTITIES.Training_Records.fields.map((field) => {
      const value = row?.[field.name];
      return value === undefined || value === null ? '' : String(value);
    }),
  );
}

function recordKey(row) {
  if (!row?.source_record_id) return '';
  return `${collapseText(row.source_system).toUpperCase()}\u0000${row.source_record_id}`;
}

function requirementRowKey(row) {
  return `${requirementTriple(row)}\u0000${row?.effective_from ?? ''}`;
}

/** The day before `dateStr`, used to close a requirement version (§5). */
export function previousDay(dateStr) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Required field names of a sheet; these may never be cleared (§7.3). */
export function requiredFieldsOf(sheet) {
  const entity = ENTITIES[sheet];
  if (!entity) return [];
  return entity.fields
    .filter((field) => field.presence === PRESENCE.REQUIRED)
    .map((field) => field.name);
}

/* ------------------------------------------------------------------ *
 * Staging
 * ------------------------------------------------------------------ */

/**
 * Classify one row against the approved row of the same key.
 * A blank cell is not present in a normalised row, so it keeps the approved
 * value; only a field named in `clear` is emptied (§7.3).
 */
function classifyRow(sheet, row, approvedRow, clear, batchApprovedAt, issues) {
  if (!approvedRow) return { status: STAGED_STATUS.NEW, changedFields: [], merged: withoutInternals(row) };

  const required = requiredFieldsOf(sheet);
  const merged = { ...withoutInternals(approvedRow) };
  const changedFields = [];

  for (const [field, value] of Object.entries(withoutInternals(row))) {
    if (merged[field] === value) continue;
    merged[field] = value;
    changedFields.push(field);
  }

  // An explicit clear wins over the value of the same cell in the batch; a
  // required field can never be cleared (§7.3).
  for (const field of clear) {
    if (required.includes(field)) {
      issues.push(issue('REQUIRED_EMPTY', sheet, row?._row, field));
      continue;
    }
    if (merged[field] === undefined) continue;
    delete merged[field];
    if (!changedFields.includes(field)) changedFields.push(field);
  }

  if (changedFields.length === 0) {
    return { status: STAGED_STATUS.UNCHANGED, changedFields, merged };
  }

  // An older batch never overwrites a value that a newer batch approved (§7).
  // An older batch never overwrites a value a later batch approved. The whole
  // batch is then refused (`BATCH_OLDER`, §7).
  if (isOlderThan(batchApprovedAt, approvedRow._approvedAt)) {
    issues.push(issue('BATCH_OLDER', sheet, row?._row, changedFields[0]));
    return { status: STAGED_STATUS.CONFLICT, changedFields, merged: withoutInternals(approvedRow) };
  }
  return { status: STAGED_STATUS.CHANGED, changedFields, merged };
}

function stageEntity(sheet, rows, state, clearMap, batchApprovedAt) {
  const definition = STAGED_ENTITIES[sheet];
  const approved = indexBy(state[definition.collection], (row) => keyOfEntity(sheet, row));
  const issues = [];
  const entries = [];
  const counts = { new: 0, changed: 0, unchanged: 0, conflict: 0 };

  for (const row of rows ?? []) {
    const key = keyOfEntity(sheet, row);
    if (!key) continue;
    const clear = clearMap?.[key] ?? [];
    const result = classifyRow(sheet, row, approved.get(key), clear, batchApprovedAt, issues);
    counts[result.status] += 1;
    entries.push(Object.freeze({ sheet, key, ...result }));
  }
  return { sheet, entries: Object.freeze(entries), issues, counts };
}

/**
 * Badge, certificate and fingerprint duplicates against the **approved** data,
 * not only inside the batch (§3.3, §3.8, decision T-06).
 */
async function crossBatchDuplicates(state, batch) {
  const issues = [];

  const approvedBadges = new Map();
  for (const employee of state.employees) {
    if (employee.badge_number) approvedBadges.set(employee.badge_number, employee.employee_code);
  }
  for (const row of batch.employees ?? []) {
    if (!row.badge_number) continue;
    const holder = approvedBadges.get(row.badge_number);
    if (holder !== undefined && holder !== row.employee_code) {
      issues.push(issue('BADGE_DUPLICATE', 'Employees', row._row, 'badge_number'));
    }
  }

  const approvedCertificates = new Map();
  const approvedFingerprints = new Map();
  for (const record of state.records) {
    if (record.certificate_number) {
      approvedCertificates.set(record.certificate_number.toUpperCase(), recordKey(record));
    }
    const fingerprint = record._fingerprint ?? (await fingerprintRecord(record));
    approvedFingerprints.set(fingerprint, recordKey(record));
  }
  for (const row of batch.records ?? []) {
    const key = recordKey(row);
    if (row.certificate_number) {
      const holder = approvedCertificates.get(row.certificate_number.toUpperCase());
      if (holder !== undefined && holder !== key) {
        issues.push(issue('CERT_DUPLICATE', 'Training_Records', row._row, 'certificate_number'));
      }
    }
    const fingerprint = await fingerprintRecord(row);
    const twin = approvedFingerprints.get(fingerprint);
    if (twin !== undefined && twin !== key) {
      issues.push(
        issue('POSSIBLE_DUPLICATE_RECORD', 'Training_Records', row._row, 'source_record_id'),
      );
    }
  }
  return issues;
}

/**
 * Training records against the approved history (§3.7).
 * The identity of a key is fixed: a different employee or course for the same
 * `(source_system, source_record_id)` is blocked. Any other change becomes a
 * new version and the previous version is kept.
 */
async function stageRecords(state, rows, batchApprovedAt) {
  const approved = new Map();
  for (const record of state.records) {
    const key = recordKey(record);
    const current = approved.get(key);
    if (!current || (record._version ?? 0) >= (current._version ?? 0)) approved.set(key, record);
  }

  const issues = [];
  const entries = [];
  const counts = { new: 0, changed: 0, unchanged: 0, conflict: 0 };

  for (const row of rows ?? []) {
    const key = recordKey(row);
    if (!key) continue;
    const current = approved.get(key);
    if (!current) {
      counts.new += 1;
      entries.push(
        Object.freeze({
          sheet: 'Training_Records',
          key,
          status: STAGED_STATUS.NEW,
          version: 1,
          merged: withoutInternals(row),
          fingerprint: await fingerprintRecord(row),
        }),
      );
      continue;
    }
    if (
      current.employee_code !== row.employee_code ||
      current.course_code !== row.course_code
    ) {
      counts.conflict += 1;
      issues.push(
        issue('RECORD_IDENTITY_CHANGED', 'Training_Records', row._row, 'source_record_id'),
      );
      entries.push(
        Object.freeze({
          sheet: 'Training_Records',
          key,
          status: STAGED_STATUS.CONFLICT,
          merged: withoutInternals(current),
        }),
      );
      continue;
    }

    const fingerprint = await fingerprintRecord(row);
    if (recordSignature(current) === recordSignature(row)) {
      counts.unchanged += 1;
      issues.push(issue('RECORD_UNCHANGED', 'Training_Records', row._row, 'source_record_id'));
      entries.push(
        Object.freeze({
          sheet: 'Training_Records',
          key,
          status: STAGED_STATUS.UNCHANGED,
          merged: withoutInternals(current),
        }),
      );
      continue;
    }
    if (isOlderThan(batchApprovedAt, current._approvedAt)) {
      counts.conflict += 1;
      issues.push(issue('BATCH_OLDER', 'Training_Records', row._row, 'source_record_id'));
      entries.push(
        Object.freeze({
          sheet: 'Training_Records',
          key,
          status: STAGED_STATUS.CONFLICT,
          merged: withoutInternals(current),
        }),
      );
      continue;
    }
    counts.changed += 1;
    entries.push(
      Object.freeze({
        sheet: 'Training_Records',
        key,
        status: STAGED_STATUS.CHANGED,
        version: (current._version ?? 1) + 1,
        merged: withoutInternals(row),
        fingerprint,
      }),
    );
  }
  return { sheet: 'Training_Records', entries: Object.freeze(entries), issues, counts };
}

/**
 * Stage one approved batch against the approved state.
 *
 * `batch` carries the normalised rows of the validators plus the contract
 * fields: `{ packageType, organizationCode, sourceSystem, extractDate,
 * asOfDate, requirementsEffectiveFrom, preparedByRole, approvedByRole,
 * approvedAt, batchId, departments, jobTitles, courses, employees,
 * requirements, records, rowsToClose, clear }`.
 *
 * `clear` is the explicit clear list: `{ Employees: { '<key>': ['field'] } }`.
 * A blank cell never clears anything, and an explicit clear wins over a value
 * the same batch carries for that field (§7.3).
 *
 * `validationIssues` MAY carry the issues of the sheet validators; a blocking
 * one refuses the batch.
 *
 * Returns a plan. Nothing is applied and no input is changed.
 */
export async function stageBatch(state, batch = {}) {
  // Issues the sheet validators already produced travel with the batch, so a
  // blocking validation issue refuses the batch here too.
  const issues = [...(batch.validationIssues ?? []), ...checkOrganizationBinding(state, batch)];
  const approvedAt = normalizeApprovalTime(batch.approvedAt);
  const sheets = {};

  for (const [field, contractName] of Object.entries(REQUIRED_BATCH_FIELDS)) {
    const value = field === 'approvedAt' ? approvedAt : collapseText(batch[field]);
    if (!value) issues.push(issue('CONTRACT_FIELD', '_Contract', undefined, contractName));
  }

  // A production batch MUST NOT sit on derived test requirements (§5.5).
  const hasRequirements = (batch.requirements ?? []).length > 0;
  if (state.requirementsSource === 'derived' && !hasRequirements) {
    issues.push(issue('REQ_ON_DERIVED', 'Requirements', undefined, 'source'));
  }

  for (const sheet of Object.keys(STAGED_ENTITIES)) {
    const rows = batch[STAGED_ENTITIES[sheet].collection];
    if (rows === undefined) continue;
    const staged = stageEntity(sheet, rows, state, batch.clear?.[sheet], approvedAt);
    sheets[sheet] = staged;
    issues.push(...staged.issues);
  }

  if (batch.requirements !== undefined) {
    const approved = indexBy(state.requirements, requirementRowKey);
    const entries = [];
    const counts = { new: 0, changed: 0, unchanged: 0, conflict: 0 };
    for (const row of batch.requirements) {
      const key = requirementRowKey(row);
      const current = approved.get(key);
      if (!current) {
        counts.new += 1;
        entries.push(Object.freeze({ sheet: 'Requirements', key, status: STAGED_STATUS.NEW, merged: withoutInternals(row) }));
        continue;
      }
      const same = requirementSignature(current) === requirementSignature(row);
      counts[same ? 'unchanged' : 'changed'] += 1;
      entries.push(
        Object.freeze({
          sheet: 'Requirements',
          key,
          status: same ? STAGED_STATUS.UNCHANGED : STAGED_STATUS.CHANGED,
          merged: withoutInternals(row),
        }),
      );
    }
    sheets.Requirements = { sheet: 'Requirements', entries: Object.freeze(entries), issues: [], counts };
  }

  if (batch.records !== undefined) {
    const staged = await stageRecords(state, batch.records, approvedAt);
    sheets.Training_Records = staged;
    issues.push(...staged.issues);
  }

  issues.push(...(await crossBatchDuplicates(state, batch)));

  const rowsToClose = Object.freeze([...(batch.rowsToClose ?? [])]);
  const summary = { conflicts: 0 };
  for (const staged of Object.values(sheets)) {
    summary[`${staged.sheet}.new`] = staged.counts.new;
    summary[`${staged.sheet}.changed`] = staged.counts.changed;
    summary[`${staged.sheet}.unchanged`] = staged.counts.unchanged;
    summary[`${staged.sheet}.conflict`] = staged.counts.conflict;
    summary.conflicts += staged.counts.conflict;
  }
  summary.rowsToClose = rowsToClose.length;

  const severities = countSeverities(issues);
  return Object.freeze({
    ok: severities.blocking === 0,
    batch: Object.freeze({
      batchId: collapseText(batch.batchId),
      packageType: collapseText(batch.packageType),
      organizationCode: collapseText(batch.organizationCode).toUpperCase(),
      sourceSystem: collapseText(batch.sourceSystem).toUpperCase(),
      extractDate: collapseText(batch.extractDate),
      asOfDate: collapseText(batch.asOfDate),
      requirementsEffectiveFrom: collapseText(batch.requirementsEffectiveFrom),
      // Roles only: four-eyes is recorded, never a personal name, and it is not
      // enforced technically in Local Mode (decision T-09).
      preparedByRole: collapseText(batch.preparedByRole),
      approvedByRole: collapseText(batch.approvedByRole),
      approvedAt,
    }),
    sheets: Object.freeze(sheets),
    rowsToClose,
    issues: Object.freeze(issues),
    counts: Object.freeze({ ...summary, ...severities }),
  });
}

/* ------------------------------------------------------------------ *
 * Apply
 * ------------------------------------------------------------------ */

function applyEntity(collection, sheet, staged, batchId, approvedAt) {
  if (!staged) return { rows: collection, log: [] };
  const byKey = new Map(collection.map((row) => [keyOfEntity(sheet, row), row]));
  const log = [];

  for (const entry of staged.entries) {
    if (entry.status === STAGED_STATUS.UNCHANGED || entry.status === STAGED_STATUS.CONFLICT) {
      continue;
    }
    byKey.set(
      entry.key,
      Object.freeze({ ...entry.merged, _batchId: batchId, _approvedAt: approvedAt }),
    );
    for (const field of entry.changedFields ?? []) {
      // Field names and the key only; no value, no name, no contact (§4.1).
      log.push(Object.freeze({ batchId, sheet, key: entry.key, field }));
    }
    if (entry.status === STAGED_STATUS.NEW) {
      log.push(Object.freeze({ batchId, sheet, key: entry.key, field: '*', created: true }));
    }
  }
  return { rows: Object.freeze([...byKey.values()]), log };
}

/**
 * Apply a staged plan. All-or-nothing: when the plan carries any blocking
 * issue, the state that was passed in is returned unchanged (§7).
 */
export function applyBatch(state, plan) {
  if (!plan?.ok) {
    return { ok: false, state, issues: plan?.issues ?? [], applied: false };
  }

  const batchId = plan.batch.batchId;
  const approvedAt = plan.batch.approvedAt;
  const changeLog = [];
  const next = { ...state };

  for (const [sheet, definition] of Object.entries(STAGED_ENTITIES)) {
    const applied = applyEntity(
      state[definition.collection],
      sheet,
      plan.sheets[sheet],
      batchId,
      approvedAt,
    );
    next[definition.collection] = applied.rows;
    changeLog.push(...applied.log);
  }

  // Requirements: a new version is appended and the rows it closes are copied
  // with an `effective_to`; the original row is kept in the history (§5).
  const requirementPlan = plan.sheets.Requirements;
  if (requirementPlan) {
    const closing = new Set(plan.rowsToClose.map(requirementRowKey));
    const history = [...state.requirementHistory];
    const kept = [];
    const closeBefore = previousDay(plan.batch.requirementsEffectiveFrom);

    for (const row of state.requirements) {
      if (!closing.has(requirementRowKey(row))) {
        kept.push(row);
        continue;
      }
      history.push(row);
      kept.push(
        Object.freeze({
          ...withoutInternals(row),
          effective_to: closeBefore,
          _batchId: batchId,
          _approvedAt: approvedAt,
        }),
      );
      changeLog.push(
        Object.freeze({
          batchId,
          sheet: 'Requirements',
          key: requirementRowKey(row),
          field: 'effective_to',
        }),
      );
    }

    const byKey = new Map(kept.map((row) => [requirementRowKey(row), row]));
    for (const entry of requirementPlan.entries) {
      if (entry.status === STAGED_STATUS.UNCHANGED || entry.status === STAGED_STATUS.CONFLICT) {
        continue;
      }
      byKey.set(
        entry.key,
        Object.freeze({ ...entry.merged, _batchId: batchId, _approvedAt: approvedAt }),
      );
      changeLog.push(
        Object.freeze({ batchId, sheet: 'Requirements', key: entry.key, field: '*' }),
      );
    }
    next.requirements = Object.freeze([...byKey.values()]);
    next.requirementHistory = Object.freeze(history);
    if (requirementPlan.entries.length > 0) next.requirementsSource = 'approved';
  }

  // Training records are append-only: a change adds a version and keeps the
  // previous one (§3.7).
  const recordPlan = plan.sheets.Training_Records;
  if (recordPlan) {
    const records = [...state.records];
    for (const entry of recordPlan.entries) {
      if (entry.status === STAGED_STATUS.UNCHANGED || entry.status === STAGED_STATUS.CONFLICT) {
        continue;
      }
      records.push(
        Object.freeze({
          ...entry.merged,
          _version: entry.version,
          _fingerprint: entry.fingerprint,
          _batchId: batchId,
          _approvedAt: approvedAt,
        }),
      );
      changeLog.push(
        Object.freeze({ batchId, sheet: 'Training_Records', key: entry.key, field: '*' }),
      );
    }
    next.records = Object.freeze(records);
  }

  if (plan.batch.packageType === 'full' && !state.organizationCode) {
    next.organizationCode = plan.batch.organizationCode;
  }

  next.batches = Object.freeze([
    ...state.batches,
    Object.freeze({ ...plan.batch, counts: plan.counts }),
  ]);
  next.changeLog = Object.freeze([...state.changeLog, ...changeLog]);

  return { ok: true, applied: true, state: createApprovedState(next), issues: plan.issues };
}

/**
 * Stage and apply in one call. The returned state is the original one when the
 * plan is blocked.
 */
export async function stageAndApply(state, batch) {
  const plan = await stageBatch(state, batch);
  const result = applyBatch(state, plan);
  return { ...result, plan };
}

export { SEVERITY, buildEmployeeIndex, isEffectiveAt };
