/**
 * Production entry for `HSE-DC-1.0` packages.
 *
 * This module reads a real `.xlsx` file, runs the rows it finds through the
 * contract validators, the staging layer and the engine preparation, and returns
 * a preview the interface can show before anything is approved.
 *
 * It owns no business rule: every decision belongs to the module it calls
 * (`referenceValidation`, `entityValidation`, `requirementsValidation`,
 * `staging`, `enginePreparation`) and to the compliance engine, which is not
 * changed. Nothing is stored, nothing is sent and no clock is read: the As Of
 * Date, the batch id and the approval time are given by the caller.
 */

import * as XLSX from 'xlsx';

import {
  PACKAGE_TYPES, PACKAGE_SHEETS, PRESENCE, SEVERITY,
  TRAINING_CONTRACT_VERSION, REFERENCE_CODE_PATTERN,
} from './schema.js';
import { issue, collapseText, parseContractDate, countSeverities, normalizeReferenceCode } from './core.js';
import { validateReferenceLists } from './referenceValidation.js';
import { validateEmployees, validateTrainingRecordsWithFingerprints } from './entityValidation.js';
import { validateRequirements, selectEffectiveRequirements } from './requirementsValidation.js';
import { createApprovedState, stageBatch, applyBatch, checkOrganizationBinding } from './staging.js';
import { prepareEngineInput } from './enginePreparation.js';
import { buildComplianceUniverse, calculateKPIs } from '../complianceEngine.js';

const CONTRACT_SHEET = '_Contract';


/* ------------------------------------------------------------------ *
 * Reading the file
 * ------------------------------------------------------------------ */

function readSheet(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return { rows: [], columns: [] };
  const header = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  const columns = (header[0] ?? []).map((value) => collapseText(value)).filter(Boolean);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true, blankrows: false });
  return { rows, columns };
}

/**
 * Read a workbook from a `File`, a `Blob`, an `ArrayBuffer` or a `Uint8Array`.
 * Returns the sheet names, the rows and the header of each sheet. No validation
 * happens here.
 */
export async function readProductionWorkbook(fileOrBytes) {
  let bytes = fileOrBytes;
  if (typeof fileOrBytes?.arrayBuffer === 'function') bytes = await fileOrBytes.arrayBuffer();
  const workbook = XLSX.read(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes, {
    type: 'array',
    // Dates stay text or serials; the contract rules of §2.3 decide.
    cellDates: false,
  });

  const sheets = {};
  const columns = {};
  for (const name of workbook.SheetNames) {
    const read = readSheet(workbook, name);
    sheets[name] = read.rows;
    columns[name] = read.columns;
  }
  return Object.freeze({ sheetNames: [...workbook.SheetNames], sheets, columns });
}

/**
 * A file is a production package when it carries a `_Contract` sheet whose
 * `contract_version` is `HSE-DC-1.0`. Everything else keeps the older import
 * paths (the three-sheet Training Matrix workbook, CSV).
 */
export function isProductionPackage(parsed) {
  if (!parsed?.sheetNames?.includes(CONTRACT_SHEET)) return false;
  const version = collapseText(parsed.sheets[CONTRACT_SHEET]?.[0]?.contract_version);
  return version === TRAINING_CONTRACT_VERSION || version.startsWith(`${TRAINING_CONTRACT_VERSION}.`);
}

/* ------------------------------------------------------------------ *
 * `_Contract` and the sheets of the package type
 * ------------------------------------------------------------------ */

function validateContractSheet(parsed, asOfDate, issues) {
  const rows = parsed.sheets[CONTRACT_SHEET] ?? [];
  if (rows.length === 0) {
    issues.push(issue('CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'contract_version'));
    return {};
  }
  if (rows.length > 1) {
    // Exactly one value row (§1.2).
    issues.push(issue('CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'contract_version'));
  }
  const row = rows[0];
  const contract = {};

  const version = collapseText(row.contract_version);
  if (version !== TRAINING_CONTRACT_VERSION) {
    issues.push(issue('CONTRACT_VERSION', CONTRACT_SHEET, undefined, 'contract_version'));
  } else {
    contract.contract_version = version;
  }

  const packageType = collapseText(row.package_type).toLowerCase();
  if (!PACKAGE_TYPES.includes(packageType)) {
    issues.push(issue('PACKAGE_TYPE', CONTRACT_SHEET, undefined, 'package_type'));
  } else {
    contract.package_type = packageType;
  }

  // Both are reference codes (§2.2): trimmed, upper-cased, then checked against
  // the unified pattern. An unusable code never binds a session.
  const organizationCode = normalizeReferenceCode(row.organization_code);
  if (!organizationCode) {
    issues.push(issue('CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'organization_code'));
  } else if (!REFERENCE_CODE_PATTERN.test(organizationCode)) {
    issues.push(issue('KEY_PATTERN', CONTRACT_SHEET, undefined, 'organization_code'));
  } else {
    contract.organization_code = organizationCode;
  }

  const sourceSystem = normalizeReferenceCode(row.source_system);
  const needsSourceSystem = packageType === 'full' || packageType === 'training';
  if (needsSourceSystem && !sourceSystem) {
    issues.push(issue('CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'source_system'));
  } else if (sourceSystem && !REFERENCE_CODE_PATTERN.test(sourceSystem)) {
    issues.push(issue('KEY_PATTERN', CONTRACT_SHEET, undefined, 'source_system'));
  } else if (sourceSystem) {
    contract.source_system = sourceSystem;
  }

  const extractDate = parseContractDate(row.extract_date);
  if (!extractDate) {
    issues.push(
      issue(extractDate === undefined ? 'DATE_INVALID' : 'CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'extract_date'),
    );
  } else {
    contract.extract_date = extractDate;
    if (asOfDate && extractDate > asOfDate) {
      issues.push(issue('DATE_FUTURE', CONTRACT_SHEET, undefined, 'extract_date'));
    }
  }

  const preparedByRole = collapseText(row.prepared_by_role);
  if (preparedByRole.length < 2 || preparedByRole.length > 60) {
    issues.push(issue('CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'prepared_by_role'));
  } else {
    contract.prepared_by_role = preparedByRole;
  }

  const effectiveFrom = parseContractDate(row.requirements_effective_from);
  const needsEffectiveFrom = packageType === 'full' || packageType === 'requirements';
  if (needsEffectiveFrom && !effectiveFrom) {
    issues.push(
      issue(
        effectiveFrom === undefined ? 'DATE_INVALID' : 'CONTRACT_FIELD',
        CONTRACT_SHEET,
        undefined,
        'requirements_effective_from',
      ),
    );
  } else if (effectiveFrom) {
    contract.requirements_effective_from = effectiveFrom;
  }

  return contract;
}

/**
 * Apply `PACKAGE_SHEETS`: a missing required sheet blocks, a forbidden sheet
 * warns and is ignored completely, an optional sheet is accepted and an unknown
 * sheet warns.
 */
function validateSheetPresence(parsed, packageType, issues) {
  const allowed = PACKAGE_SHEETS[packageType];
  if (!allowed) return { usable: {}, ignored: [] };
  const usable = {};
  const ignored = [];

  for (const [name, presence] of Object.entries(allowed)) {
    if (presence === PRESENCE.REQUIRED && !parsed.sheetNames.includes(name)) {
      issues.push(issue('SHEET_MISSING', name, undefined, undefined));
    }
  }
  for (const name of parsed.sheetNames) {
    const presence = allowed[name] ?? PRESENCE.FORBIDDEN;
    if (presence === PRESENCE.FORBIDDEN) {
      issues.push(issue('SHEET_UNEXPECTED', name, undefined, undefined));
      ignored.push(name);
      continue;
    }
    if (name !== CONTRACT_SHEET) usable[name] = name;
  }
  return { usable, ignored };
}

/** Drop a column the sheet must not carry, so it cannot reach a validator. */
function withoutColumn(rows, column) {
  return rows.map((row) => {
    if (!(column in row)) return row;
    const copy = { ...row };
    delete copy[column];
    return copy;
  });
}

/* ------------------------------------------------------------------ *
 * Validation of the whole package
 * ------------------------------------------------------------------ */

/**
 * Validate a parsed package against the approved state.
 *
 * Returns `{ ok, contract, sheetsPresent, ignoredSheets, results, rows, issues,
 * counts }`. Nothing is staged and nothing is applied.
 */
export async function validateProductionPackage(parsed, { approvedState = createApprovedState(), asOfDate } = {}) {
  const issues = [];
  const contract = validateContractSheet(parsed, asOfDate, issues);
  const packageType = contract.package_type ?? '';

  issues.push(
    ...checkOrganizationBinding(approvedState, {
      packageType,
      organizationCode: contract.organization_code,
    }),
  );

  const { usable, ignored } = validateSheetPresence(parsed, packageType, issues);
  const sheetRows = (name) => (usable[name] ? (parsed.sheets[name] ?? []) : undefined);
  const sheetColumns = (name) => (usable[name] ? (parsed.columns[name] ?? []) : undefined);

  const references = validateReferenceLists(
    {
      departments: sheetRows('Departments'),
      jobTitles: sheetRows('Job_Titles'),
      courses: sheetRows('Courses'),
      departmentColumns: sheetColumns('Departments'),
      jobTitleColumns: sheetColumns('Job_Titles'),
      courseColumns: sheetColumns('Courses'),
    },
    { departments: approvedState.departments },
  );
  issues.push(...references.issues);

  const knownDepartments = [...approvedState.departments, ...references.departments.rows];
  const knownJobTitles = [...approvedState.jobTitles, ...references.jobTitles.rows];
  const knownCourses = [...approvedState.courses, ...references.courses.rows];

  const employees = validateEmployees(sheetRows('Employees'), {
    columns: sheetColumns('Employees'),
    extractDate: contract.extract_date,
    asOfDate,
    departments: knownDepartments,
    jobTitles: knownJobTitles,
    approvedEmployees: approvedState.employees,
  });
  if (usable.Employees) issues.push(...employees.issues);

  const requirements = validateRequirements(sheetRows('Requirements'), {
    columns: sheetColumns('Requirements'),
    requirementsEffectiveFrom: contract.requirements_effective_from,
    extractDate: contract.extract_date,
    asOfDate,
    departments: knownDepartments,
    jobTitles: knownJobTitles,
    courses: knownCourses,
    approvedRequirements: approvedState.requirements,
  });
  if (usable.Requirements) issues.push(...requirements.issues);

  const effective = selectEffectiveRequirements(
    [...approvedState.requirements, ...requirements.rows],
    asOfDate,
  );

  // `source_system` is a `_Contract` field, not a column of the sheet. A column
  // of that name is reported as unknown and its values are then ignored; the
  // contract value is the only source and it is injected by the validator.
  const hasSourceSystemColumn =
    Boolean(usable.Training_Records) && (parsed.columns.Training_Records ?? []).includes('source_system');
  if (hasSourceSystemColumn) {
    issues.push(issue('COLUMN_UNKNOWN', 'Training_Records', undefined, 'source_system'));
  }
  const recordRows = usable.Training_Records
    ? withoutColumn(parsed.sheets.Training_Records ?? [], 'source_system')
    : undefined;
  const recordColumns = usable.Training_Records
    ? (parsed.columns.Training_Records ?? []).filter((name) => name !== 'source_system')
    : undefined;

  const records = await validateTrainingRecordsWithFingerprints(recordRows, {
    columns: recordColumns,
    sourceSystem: contract.source_system,
    extractDate: contract.extract_date,
    asOfDate,
    employees: [...approvedState.employees, ...employees.rows],
    courses: knownCourses,
    requirements: effective,
  });
  if (usable.Training_Records) issues.push(...records.issues);

  const severities = countSeverities(issues);
  return Object.freeze({
    ok: severities.blocking === 0,
    contract: Object.freeze(contract),
    asOfDate,
    sheetsPresent: Object.freeze(Object.keys(usable)),
    ignoredSheets: Object.freeze(ignored),
    sheetRowCounts: Object.freeze(
      Object.fromEntries(parsed.sheetNames.map((name) => [name, (parsed.sheets[name] ?? []).length])),
    ),
    results: Object.freeze({ references, employees, requirements, records }),
    rows: Object.freeze({
      departments: references.departments.rows,
      jobTitles: references.jobTitles.rows,
      courses: references.courses.rows,
      employees: employees.rows,
      requirements: requirements.rows,
      records: records.rows,
      rowsToClose: requirements.rowsToClose,
    }),
    issues: Object.freeze(issues),
    counts: Object.freeze({
      ...severities,
      accepted:
        references.departments.rows.length +
        references.jobTitles.rows.length +
        references.courses.rows.length +
        employees.rows.length +
        requirements.rows.length +
        records.rows.length,
      rejected:
        references.departments.counts.rejected +
        references.jobTitles.counts.rejected +
        references.courses.counts.rejected +
        employees.counts.rejected +
        requirements.counts.rejected +
        records.counts.rejected,
    }),
  });
}

/* ------------------------------------------------------------------ *
 * Engine view
 * ------------------------------------------------------------------ */

/** Run the preparation layer, the engine and the KPIs over one state. */
export function runEngineOnState(approvedState, asOfDate) {
  const prepared = prepareEngineInput(approvedState, asOfDate);
  const compliance = buildComplianceUniverse(
    prepared.records,
    prepared.requirements,
    prepared.asOfDate,
    prepared.employees,
  );
  const kpis = calculateKPIs(compliance.universe, compliance.employees, compliance.unconfiguredEmployees);
  return { prepared, compliance, kpis };
}

/** The numbers the preview compares before and after the batch. */
export function kpiSnapshot(view) {
  if (!view) {
    return Object.freeze({
      activeEmployees: 0,
      mandatoryItems: 0,
      requirementCompliance: 0,
      fullyCompliantCount: 0,
      valid: 0,
      expiring30: 0,
      expired: 0,
      missing: 0,
    });
  }
  const counts = view.kpis.statusCounts;
  return Object.freeze({
    activeEmployees: view.kpis.totalActiveEmployees,
    mandatoryItems: view.kpis.totalMandatoryReqs,
    requirementCompliance: view.kpis.requirementCompliance,
    fullyCompliantCount: view.kpis.fullyCompliantCount,
    valid: counts.VALID ?? 0,
    expiring30: counts.EXPIRING_30 ?? 0,
    expired: counts.EXPIRED ?? 0,
    missing: counts.MISSING ?? 0,
  });
}

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */

function stagingInput(validated, approvalMetadata) {
  return {
    ...approvalMetadata,
    packageType: validated.contract.package_type,
    organizationCode: validated.contract.organization_code,
    sourceSystem: validated.contract.source_system,
    extractDate: validated.contract.extract_date,
    asOfDate: validated.asOfDate,
    requirementsEffectiveFrom: validated.contract.requirements_effective_from,
    departments: validated.sheetsPresent.includes('Departments') ? validated.rows.departments : undefined,
    jobTitles: validated.sheetsPresent.includes('Job_Titles') ? validated.rows.jobTitles : undefined,
    courses: validated.sheetsPresent.includes('Courses') ? validated.rows.courses : undefined,
    employees: validated.sheetsPresent.includes('Employees') ? validated.rows.employees : undefined,
    requirements: validated.sheetsPresent.includes('Requirements') ? validated.rows.requirements : undefined,
    records: validated.sheetsPresent.includes('Training_Records') ? validated.rows.records : undefined,
    rowsToClose: validated.rows.rowsToClose,
    validationIssues: validated.issues,
  };
}

/**
 * Stage the batch and compute the impact on the indicators.
 *
 * `applyBatch` is pure, so the preview applies the plan to a copy of the state
 * only to read the result; the approved state of the session is untouched until
 * the user approves.
 */
export async function buildProductionPreview(validated, { approvedState = createApprovedState(), approvalMetadata = {} } = {}) {
  const plan = await stageBatch(approvedState, stagingInput(validated, approvalMetadata));

  const before = approvedState.employees.length > 0 || approvedState.records.length > 0
    ? kpiSnapshot(runEngineOnState(approvedState, validated.asOfDate))
    : kpiSnapshot(null);

  let after = null;
  if (plan.ok) {
    const previewState = applyBatch(approvedState, plan);
    if (previewState.ok) after = kpiSnapshot(runEngineOnState(previewState.state, validated.asOfDate));
  }

  return Object.freeze({
    validated,
    plan,
    impact: Object.freeze({ before, after }),
    issues: Object.freeze([...plan.issues]),
    counts: Object.freeze({ ...plan.counts }),
  });
}

/**
 * Approve a previously previewed batch. The plan is staged again with the final
 * approval metadata, so a block that appears only now still refuses everything.
 */
export async function approveProductionPackage(approvedState, validated, approvalMetadata) {
  const plan = await stageBatch(approvedState, stagingInput(validated, approvalMetadata));
  const applied = applyBatch(approvedState, plan);
  if (!applied.ok) {
    return Object.freeze({ ok: false, plan, state: approvedState, view: null });
  }
  return Object.freeze({
    ok: true,
    plan,
    state: applied.state,
    view: runEngineOnState(applied.state, validated.asOfDate),
  });
}

/* ------------------------------------------------------------------ *
 * Display projection
 * ------------------------------------------------------------------ */

function displayName(row, lang, fallback) {
  if (!row) return fallback;
  const name = lang === 'ar' ? row.name_ar || row.name_en : row.name_en || row.name_ar;
  return collapseText(name) || fallback;
}

/**
 * Add display names to the engine output without touching the codes the engine
 * matches on. `Department`, `Job_Title` and `Course_Code` keep their values;
 * `Department_Code`, `Job_Title_Code` and the display fields are added.
 */
export function projectForDisplay(items, lookups, lang) {
  if (!lookups) return items ?? [];
  return (items ?? []).map((item) => ({
    ...item,
    Department_Code: item.Department,
    Job_Title_Code: item.Job_Title,
    Department_Name: displayName(lookups.departments?.get(item.Department), lang, item.Department),
    Job_Title_Name: displayName(lookups.jobTitles?.get(item.Job_Title), lang, item.Job_Title),
    Course_Name: displayName(lookups.courses?.get(item.Course_Code), lang, item.Course_Name || item.Course_Code),
  }));
}

/** The same projection for the employee rows of the unconfigured section. */
export function projectEmployeesForDisplay(employees, lookups, lang) {
  if (!lookups) return employees ?? [];
  return (employees ?? []).map((employee) => ({
    ...employee,
    Department_Code: employee.Department,
    Job_Title_Code: employee.Job_Title,
    Department_Name: displayName(lookups.departments?.get(employee.Department), lang, employee.Department),
    Job_Title_Name: displayName(lookups.jobTitles?.get(employee.Job_Title), lang, employee.Job_Title),
  }));
}

/** Group issues by code, counting only. Used by the preview summary. */
export function groupIssuesByCode(issues) {
  const groups = new Map();
  for (const entry of issues ?? []) {
    const current = groups.get(entry.code);
    if (current) {
      current.count += 1;
      continue;
    }
    groups.set(entry.code, { code: entry.code, severity: entry.severity, count: 1 });
  }
  const order = { [SEVERITY.BLOCK]: 0, [SEVERITY.WARN]: 1, [SEVERITY.INFO]: 2 };
  return [...groups.values()].sort(
    (a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code),
  );
}

export { SEVERITY };
