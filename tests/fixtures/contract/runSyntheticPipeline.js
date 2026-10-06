/**
 * Test helper that runs the contract modules in their production order over a
 * package of plain rows. It adds no business rule of its own: every decision
 * belongs to the module it calls.
 *
 * Order: reference lists, employees, requirements, training records with the
 * fingerprints, then staging, applying, engine preparation, the compliance
 * engine and the KPIs.
 *
 * Nothing is read from or written to disk, no clock is read and no network call
 * is made. Summaries carry counts only.
 */

import { validateReferenceLists } from '../../../src/lib/contract/referenceValidation.js';
import {
  validateEmployees,
  validateTrainingRecordsWithFingerprints,
} from '../../../src/lib/contract/entityValidation.js';
import {
  validateRequirements,
  selectEffectiveRequirements,
} from '../../../src/lib/contract/requirementsValidation.js';
import {
  createApprovedState,
  stageBatch,
  applyBatch,
} from '../../../src/lib/contract/staging.js';
import { prepareEngineInput } from '../../../src/lib/contract/enginePreparation.js';
import { buildComplianceUniverse, calculateKPIs } from '../../../src/lib/complianceEngine.js';
import { SEVERITY } from '../../../src/lib/contract/schema.js';

const blocking = (issues) => issues.filter((entry) => entry.severity === SEVERITY.BLOCK);

/**
 * Validate one package. Returns the four validator results, the combined
 * issues and the rows the staging layer receives.
 */
export function validatePackage(pkg, { approvedState = createApprovedState() } = {}) {
  const contract = pkg.contract;
  const asOfDate = pkg.asOfDate;

  const references = validateReferenceLists(
    { departments: pkg.departments, jobTitles: pkg.jobTitles, courses: pkg.courses },
    { departments: approvedState.departments },
  );

  const employees = validateEmployees(pkg.employees, {
    extractDate: contract.extract_date,
    asOfDate,
    departments: [...approvedState.departments, ...references.departments.rows],
    jobTitles: [...approvedState.jobTitles, ...references.jobTitles.rows],
    approvedEmployees: approvedState.employees,
  });

  const requirements = validateRequirements(pkg.requirements, {
    requirementsEffectiveFrom: contract.requirements_effective_from,
    extractDate: contract.extract_date,
    asOfDate,
    departments: [...approvedState.departments, ...references.departments.rows],
    jobTitles: [...approvedState.jobTitles, ...references.jobTitles.rows],
    courses: [...approvedState.courses, ...references.courses.rows],
    approvedRequirements: approvedState.requirements,
  });

  return { references, employees, requirements, asOfDate, contract };
}

/**
 * Run the whole pipeline. `records` defaults to the training records of the
 * package, so a later batch can be applied by passing its own rows.
 */
export async function runSyntheticPipeline(
  pkg,
  { approvedState = createApprovedState(), records, measure } = {},
) {
  const timings = {};
  const clock = async (name, work) => {
    if (!measure) return work();
    const start = performance.now();
    const result = await work();
    timings[name] = performance.now() - start;
    return result;
  };

  const validation = await clock('validation', async () => {
    const base = validatePackage(pkg, { approvedState });
    const effective = selectEffectiveRequirements(
      [...approvedState.requirements, ...base.requirements.rows],
      pkg.asOfDate,
    );
    const trainingRecords = await validateTrainingRecordsWithFingerprints(
      records ?? pkg.trainingRecords,
      {
        sourceSystem: pkg.contract.source_system,
        extractDate: pkg.contract.extract_date,
        asOfDate: pkg.asOfDate,
        employees: [...approvedState.employees, ...base.employees.rows],
        courses: [...approvedState.courses, ...base.references.courses.rows],
        requirements: effective,
      },
    );
    const issues = [
      ...base.references.issues,
      ...base.employees.issues,
      ...base.requirements.issues,
      ...trainingRecords.issues,
    ];
    return Object.freeze({ ...base, trainingRecords, effective, issues });
  });

  const plan = await clock('staging', () =>
    stageBatch(approvedState, {
      ...pkg.approval,
      packageType: pkg.contract.package_type,
      organizationCode: pkg.contract.organization_code,
      sourceSystem: pkg.contract.source_system,
      extractDate: pkg.contract.extract_date,
      asOfDate: pkg.asOfDate,
      requirementsEffectiveFrom: pkg.contract.requirements_effective_from,
      departments: validation.references.departments.rows,
      jobTitles: validation.references.jobTitles.rows,
      courses: validation.references.courses.rows,
      employees: validation.employees.rows,
      requirements: validation.requirements.rows,
      records: validation.trainingRecords.rows,
      rowsToClose: validation.requirements.rowsToClose,
      validationIssues: validation.issues,
    }),
  );

  const applied = await clock('apply', () => applyBatch(approvedState, plan));

  if (!applied.ok) {
    return Object.freeze({
      validation,
      plan,
      applied,
      approvedState: applied.state,
      prepared: null,
      compliance: null,
      kpis: null,
      timings,
    });
  }

  const prepared = await clock('preparation', () =>
    prepareEngineInput(applied.state, pkg.asOfDate),
  );

  const compliance = await clock('engine', () =>
    buildComplianceUniverse(prepared.records, prepared.requirements, prepared.asOfDate, prepared.employees),
  );

  const kpis = await clock('kpis', () =>
    calculateKPIs(compliance.universe, compliance.employees, compliance.unconfiguredEmployees),
  );

  return Object.freeze({
    validation,
    plan,
    applied,
    approvedState: applied.state,
    prepared,
    compliance,
    kpis,
    timings,
  });
}

/** Counts only: safe to print or to assert on. */
export function summarise(result) {
  return Object.freeze({
    blockingIssues: blocking(result.validation.issues).length,
    warnings: result.validation.issues.length - blocking(result.validation.issues).length,
    employees: result.approvedState.employees.length,
    departments: result.approvedState.departments.length,
    jobTitles: result.approvedState.jobTitles.length,
    courses: result.approvedState.courses.length,
    requirements: result.approvedState.requirements.length,
    records: result.approvedState.records.length,
    preparedRecords: result.prepared?.records.length ?? 0,
    complianceItems: result.compliance?.universe.length ?? 0,
    activeEmployees: result.compliance?.employees.active.length ?? 0,
    inactiveEmployees: result.compliance?.employees.inactive.length ?? 0,
    notConfigured: result.compliance?.employees.notConfigured ?? 0,
    requirementCompliance: result.kpis?.requirementCompliance ?? 0,
    fullyCompliantPct: result.kpis?.fullyCompliantPct ?? 0,
  });
}

export { blocking };
