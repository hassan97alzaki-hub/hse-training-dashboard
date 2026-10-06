import { describe, it, expect, vi, afterEach } from 'vitest';
import * as XLSX from 'xlsx';

import { STATUS } from '../src/lib/constants.js';
import { SEVERITY } from '../src/lib/contract/schema.js';
import { createApprovedState, clearOrganizationBinding } from '../src/lib/contract/staging.js';
import {
  readProductionWorkbook,
  isProductionPackage,
  validateProductionPackage,
  buildProductionPreview,
  approveProductionPackage,
  runEngineOnState,
  kpiSnapshot,
  projectForDisplay,
  projectEmployeesForDisplay,
  groupIssuesByCode,
} from '../src/lib/contract/productionPackage.js';
import { generateSyntheticFullPackage, FIXED_DATES } from './fixtures/contract/generateSyntheticPackage.js';
import { smallFullPackage } from './fixtures/contract/smallFullPackage.js';
import { buildWorkbook } from '../scripts/generate-contract-workbook.mjs';

const AS_OF = FIXED_DATES.asOfDate;

const METADATA = Object.freeze({
  batchId: 'LOCAL-TEST-0001',
  preparedByRole: 'Training Coordinator',
  approvedByRole: 'Training Manager',
  approvedAt: '2027-01-11T08:00:00.000Z',
});

/** Build an .xlsx buffer from named sheets of plain rows. */
function toBuffer(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const smallSheets = (overrides = {}) => ({
  _Contract: [smallFullPackage.contract],
  Departments: smallFullPackage.departments,
  Job_Titles: smallFullPackage.jobTitles,
  Employees: smallFullPackage.employees,
  Courses: smallFullPackage.courses,
  Requirements: smallFullPackage.requirements,
  Training_Records: smallFullPackage.trainingRecords,
  ...overrides,
});

async function parse(sheets) {
  return readProductionWorkbook(toBuffer(sheets));
}

async function validate(sheets, options = {}) {
  const parsed = await parse(sheets);
  return validateProductionPackage(parsed, { asOfDate: AS_OF, ...options });
}

const of = (result, code) => result.issues.filter((entry) => entry.code === code);
const codes = (result) => result.issues.map((entry) => entry.code);

describe('detection of an HSE-DC-1.0 package', () => {
  it('recognises a package by _Contract and contract_version', async () => {
    expect(isProductionPackage(await parse(smallSheets()))).toBe(true);
  });

  it('does not recognise the legacy three-sheet workbook or a CSV-style sheet', async () => {
    const legacy = await parse({
      Employees: [{ Badge: 'XX-00001', Name: 'Legacy' }],
      Courses: [{ Course_Code: 'K01' }],
      Training: [{ Badge: 'XX-00001', Course_Code: 'K01' }],
    });
    expect(isProductionPackage(legacy)).toBe(false);

    const csvLike = await parse({ Sheet1: [{ Employee_ID: 'XX-1', Course_Code: 'K01' }] });
    expect(isProductionPackage(csvLike)).toBe(false);
  });

  it('does not recognise another contract version', async () => {
    const other = await parse(smallSheets({ _Contract: [{ ...smallFullPackage.contract, contract_version: 'HSE-DC-2.0' }] }));
    expect(isProductionPackage(other)).toBe(false);
  });

  it('reads the sheet names, rows and header of the file', async () => {
    const parsed = await parse(smallSheets());
    expect(parsed.sheetNames).toContain('_Contract');
    expect(parsed.sheets.Employees).toHaveLength(3);
    expect(parsed.columns.Employees).toContain('employee_code');
    expect(parsed.sheets._Contract[0].package_type).toBe('full');
  });
});

describe('_Contract validation', () => {
  it('accepts a sound full package', async () => {
    const result = await validate(smallSheets());
    expect(result.ok).toBe(true);
    expect(result.contract).toMatchObject({
      contract_version: 'HSE-DC-1.0',
      package_type: 'full',
      organization_code: 'TST-ORG',
      source_system: 'TEST-LMS',
      extract_date: FIXED_DATES.extractDate,
      prepared_by_role: 'Training Coordinator',
      requirements_effective_from: FIXED_DATES.requirementsEffectiveFrom,
    });
  });

  it('refuses a wrong contract version and an unknown package type', async () => {
    const version = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, contract_version: 'HSE-DC-0.9' }] }));
    expect(of(version, 'CONTRACT_VERSION')).toHaveLength(1);

    const type = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, package_type: 'everything' }] }));
    expect(of(type, 'PACKAGE_TYPE')).toHaveLength(1);
  });

  it('refuses more than one value row', async () => {
    const result = await validate(smallSheets({ _Contract: [smallFullPackage.contract, smallFullPackage.contract] }));
    expect(of(result, 'CONTRACT_FIELD').map((entry) => entry.field)).toContain('contract_version');
  });

  it('requires each contract field of the package type', async () => {
    for (const field of ['organization_code', 'source_system', 'prepared_by_role', 'requirements_effective_from']) {
      const result = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, [field]: '' }] }));
      expect(of(result, 'CONTRACT_FIELD').map((entry) => entry.field), field).toContain(field);
    }
  });

  it('refuses an extract_date that is unreadable or after the As Of Date', async () => {
    const invalid = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, extract_date: '10/01/2027' }] }));
    expect(of(invalid, 'DATE_INVALID')[0]).toMatchObject({ field: 'extract_date' });

    const future = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, extract_date: '2027-01-13' }] }));
    expect(of(future, 'DATE_FUTURE')[0]).toMatchObject({ field: 'extract_date' });
  });

  it('refuses an organization_code that is not a reference code', async () => {
    for (const bad of ['@@', 'A', 'O'.repeat(21), 'TST ORG', 'TST.ORG']) {
      const result = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, organization_code: bad }] }));
      const pattern = of(result, 'KEY_PATTERN').filter((entry) => entry.field === 'organization_code');
      expect(pattern, bad).toHaveLength(1);
      expect(pattern[0].severity, bad).toBe(SEVERITY.BLOCK);
      expect(result.ok, bad).toBe(false);
      // An unusable code is never carried into the contract, so it can bind
      // no session even when the session is still empty.
      expect(result.contract.organization_code, bad).toBeUndefined();
      const approved = await approveProductionPackage(createApprovedState(), result, METADATA);
      expect(approved.ok, bad).toBe(false);
      expect(approved.state.organizationCode, bad).toBe('');
    }
  });

  it('refuses a source_system that is not a reference code', async () => {
    for (const bad of ['@@', 'A', 'S'.repeat(21), 'TEST LMS']) {
      const result = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, source_system: bad }] }));
      const pattern = of(result, 'KEY_PATTERN').filter((entry) => entry.field === 'source_system');
      expect(pattern, bad).toHaveLength(1);
      expect(result.ok, bad).toBe(false);
      expect(result.contract.source_system, bad).toBeUndefined();
    }
  });

  it('accepts a valid code in any letter case', async () => {
    const result = await validate(
      smallSheets({ _Contract: [{ ...smallFullPackage.contract, organization_code: ' tst-org ', source_system: 'test-lms' }] }),
    );
    expect(result.ok).toBe(true);
    expect(result.contract).toMatchObject({ organization_code: 'TST-ORG', source_system: 'TEST-LMS' });
  });

  it('refuses another organization and a partial package before a binding', async () => {
    const bound = createApprovedState({ organizationCode: 'TST-ORG' });
    const other = await validate(smallSheets({ _Contract: [{ ...smallFullPackage.contract, organization_code: 'OTHER-ORG' }] }), {
      approvedState: bound,
    });
    expect(of(other, 'ORG_MISMATCH')).toHaveLength(1);

    const partial = await validate(
      {
        _Contract: [{ ...smallFullPackage.contract, package_type: 'training', requirements_effective_from: '' }],
        Training_Records: smallFullPackage.trainingRecords,
      },
      { approvedState: createApprovedState() },
    );
    expect(of(partial, 'ORG_NOT_LOADED')).toHaveLength(1);
    expect(partial.ok).toBe(false);
  });
});

describe('sheets of the package type', () => {
  it('blocks a missing required sheet', async () => {
    const sheets = smallSheets();
    delete sheets.Requirements;
    const result = await validate(sheets);
    expect(of(result, 'SHEET_MISSING')[0]).toMatchObject({ sheet: 'Requirements', severity: SEVERITY.BLOCK });
    expect(result.ok).toBe(false);
  });

  it('warns about a forbidden sheet and ignores it completely', async () => {
    const approved = await approveProductionPackage(
      createApprovedState(),
      await validate(smallSheets()),
      METADATA,
    );
    // A partial package may not carry Departments or Job_Titles.
    const result = await validate(
      {
        _Contract: [{ ...smallFullPackage.contract, package_type: 'employees', source_system: '', requirements_effective_from: '' }],
        Employees: smallFullPackage.employees,
        Departments: [{ department_code: 'INJECT', name_en: 'x', name_ar: 'x', active: 'Yes' }],
      },
      { approvedState: approved.state },
    );
    expect(of(result, 'SHEET_UNEXPECTED')[0]).toMatchObject({ sheet: 'Departments', severity: SEVERITY.WARN });
    expect(result.ok).toBe(true);
    expect(result.ignoredSheets).toContain('Departments');
    expect(result.rows.departments).toHaveLength(0);

    const preview = await buildProductionPreview(result, { approvedState: approved.state, approvalMetadata: METADATA });
    expect(preview.plan.sheets.Departments).toBeUndefined();
    const applied = await approveProductionPackage(approved.state, result, METADATA);
    expect(applied.state.departments.map((row) => row.department_code)).toEqual(['OPS', 'MNT']);
  });

  it('accepts the three partial package types', async () => {
    const full = await approveProductionPackage(createApprovedState(), await validate(smallSheets()), METADATA);
    expect(full.ok).toBe(true);

    const employees = await validate(
      {
        _Contract: [{ ...smallFullPackage.contract, package_type: 'employees', source_system: '', requirements_effective_from: '' }],
        Employees: smallFullPackage.employees,
      },
      { approvedState: full.state },
    );
    expect(employees.ok).toBe(true);

    const requirements = await validate(
      {
        _Contract: [{ ...smallFullPackage.contract, package_type: 'requirements', source_system: '' }],
        Requirements: smallFullPackage.requirements,
        Courses: smallFullPackage.courses,
      },
      { approvedState: full.state },
    );
    expect(requirements.ok).toBe(true);

    const training = await validate(
      {
        _Contract: [{ ...smallFullPackage.contract, package_type: 'training', requirements_effective_from: '' }],
        Training_Records: smallFullPackage.trainingRecords,
      },
      { approvedState: full.state },
    );
    expect(training.ok).toBe(true);
  });

  it('warns about an unknown column and blocks a forbidden one', async () => {
    const unknown = await validate(
      smallSheets({ Employees: smallFullPackage.employees.map((row) => ({ ...row, extra_note: 'x' })) }),
    );
    expect(of(unknown, 'COLUMN_UNKNOWN')[0]).toMatchObject({ field: 'extra_note', severity: SEVERITY.WARN });
    expect(unknown.ok).toBe(true);

    const forbidden = await validate(
      smallSheets({ Employees: smallFullPackage.employees.map((row) => ({ ...row, iqama_number: '1' })) }),
    );
    expect(of(forbidden, 'FORBIDDEN_COLUMN')[0]).toMatchObject({ field: 'iqama_number', severity: SEVERITY.BLOCK });
  });

  it('warns about a source_system column and ignores its values', async () => {
    const result = await validate(
      smallSheets({
        Training_Records: smallFullPackage.trainingRecords.map((row) => ({ ...row, source_system: 'WRONG-LMS' })),
      }),
    );
    // The column is not part of the sheet, so it is reported and then ignored.
    const unknown = of(result, 'COLUMN_UNKNOWN');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({
      sheet: 'Training_Records',
      field: 'source_system',
      severity: SEVERITY.WARN,
    });
    expect(result.ok).toBe(true);
    // The contract value wins; the row value never reaches an accepted record.
    for (const row of result.rows.records) expect(row.source_system).toBe('TEST-LMS');
    expect(JSON.stringify(result.rows.records)).not.toContain('WRONG-LMS');
  });

  it('does not warn when the sheet carries no source_system column', async () => {
    const result = await validate(smallSheets());
    expect(codes(result)).not.toContain('COLUMN_UNKNOWN');
    for (const row of result.rows.records) expect(row.source_system).toBe('TEST-LMS');
  });
});

describe('preview, approval and impact', () => {
  it('shows zero before and the new numbers after for a first package', async () => {
    const validated = await validate(smallSheets());
    const preview = await buildProductionPreview(validated, { approvedState: createApprovedState(), approvalMetadata: METADATA });
    expect(preview.plan.ok).toBe(true);
    expect(preview.impact.before).toEqual({
      activeEmployees: 0, mandatoryItems: 0, requirementCompliance: 0, fullyCompliantCount: 0,
      valid: 0, expiring30: 0, expired: 0, missing: 0,
    });
    expect(preview.impact.after).toMatchObject({
      activeEmployees: smallFullPackage.expected.activeEmployees,
      mandatoryItems: smallFullPackage.expected.mandatoryItems,
      requirementCompliance: smallFullPackage.expected.requirementCompliance,
      valid: 1,
      missing: 1,
    });
  });

  it('shows no impact for a blocked package', async () => {
    const sheets = smallSheets();
    delete sheets.Employees;
    const validated = await validate(sheets);
    const preview = await buildProductionPreview(validated, { approvedState: createApprovedState(), approvalMetadata: METADATA });
    expect(preview.plan.ok).toBe(false);
    expect(preview.impact.after).toBeNull();
  });

  it('does not change the state while previewing', async () => {
    const state = createApprovedState();
    const validated = await validate(smallSheets());
    await buildProductionPreview(validated, { approvedState: state, approvalMetadata: METADATA });
    expect(state.employees).toHaveLength(0);
    expect(state.batches).toHaveLength(0);
  });

  it('applies the batch once and binds the organization', async () => {
    const validated = await validate(smallSheets());
    const first = await approveProductionPackage(createApprovedState(), validated, METADATA);
    expect(first.ok).toBe(true);
    expect(first.state.organizationCode).toBe('TST-ORG');
    expect(first.state.employees).toHaveLength(3);
    expect(first.state.batches).toHaveLength(1);

    // Approving the same package again changes no data.
    const second = await approveProductionPackage(first.state, validated, { ...METADATA, batchId: 'LOCAL-TEST-0002', approvedAt: '2027-02-11T08:00:00.000Z' });
    expect(second.state.employees).toEqual(first.state.employees);
    expect(second.state.records).toEqual(first.state.records);
  });

  it('returns the original state when a block appears at approval time', async () => {
    const state = createApprovedState({ organizationCode: 'OTHER-ORG' });
    const validated = await validate(smallSheets(), { approvedState: state });
    const result = await approveProductionPackage(state, validated, METADATA);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.view).toBeNull();
  });

  it('refuses an approval without an approver role', async () => {
    const validated = await validate(smallSheets());
    const result = await approveProductionPackage(createApprovedState(), validated, { ...METADATA, approvedByRole: '' });
    expect(result.ok).toBe(false);
    expect(result.plan.issues.some((entry) => entry.field === 'approved_by_role')).toBe(true);
  });

  it('groups issues by code with counts only', () => {
    const grouped = groupIssuesByCode([
      { code: 'CERT_MISSING', severity: SEVERITY.WARN, sheet: 'Training_Records', row: 2 },
      { code: 'CERT_MISSING', severity: SEVERITY.WARN, sheet: 'Training_Records', row: 3 },
      { code: 'SHEET_MISSING', severity: SEVERITY.BLOCK, sheet: 'Employees' },
    ]);
    expect(grouped).toEqual([
      { code: 'SHEET_MISSING', severity: SEVERITY.BLOCK, count: 1 },
      { code: 'CERT_MISSING', severity: SEVERITY.WARN, count: 2 },
    ]);
  });
});

describe('AT-16 through the production parser', () => {
  const pkg = generateSyntheticFullPackage({});

  it('matches the pinned counts and KPIs of the 500-employee package', async () => {
    const { workbook } = buildWorkbook(pkg);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsed = await readProductionWorkbook(buffer);
    expect(isProductionPackage(parsed)).toBe(true);

    const validated = await validateProductionPackage(parsed, {
      approvedState: createApprovedState(),
      asOfDate: pkg.asOfDate,
    });
    expect(validated.ok).toBe(true);
    expect(validated.counts.rejected).toBe(0);
    expect(validated.rows.employees).toHaveLength(500);
    expect(validated.rows.records).toHaveLength(pkg.expected.trainingRecords);

    const approved = await approveProductionPackage(createApprovedState(), validated, METADATA);
    expect(approved.ok).toBe(true);
    expect(approved.state.employees).toHaveLength(500);
    expect(approved.state.records).toHaveLength(pkg.expected.trainingRecords);
    expect(approved.view.compliance.universe).toHaveLength(pkg.expected.complianceItems);
    expect(approved.view.kpis).toMatchObject({
      totalActiveEmployees: 480,
      totalMandatoryReqs: 960,
      compliantReqs: 603,
      requirementCompliance: 62.8,
      fullyCompliantCount: 198,
      fullyCompliantPct: 41.3,
    });
    expect(approved.view.kpis.statusCounts).toMatchObject({
      [STATUS.VALID]: 405,
      [STATUS.EXPIRING_30]: 198,
      [STATUS.EXPIRED]: 82,
      [STATUS.IN_PROGRESS]: 100,
      [STATUS.NOT_STARTED]: 91,
      [STATUS.MISSING]: 84,
    });
    expect(kpiSnapshot(approved.view)).toEqual({
      activeEmployees: 480, mandatoryItems: 960, requirementCompliance: 62.8,
      fullyCompliantCount: 198, valid: 405, expiring30: 198, expired: 82, missing: 84,
    });
  });
});

describe('display projection', () => {
  const lookups = {
    departments: new Map([['OPS', { name_en: 'Test Operations', name_ar: 'تشغيل اختبار' }]]),
    jobTitles: new Map([['OPR', { name_en: 'Test Operator', name_ar: 'مشغل اختبار' }]]),
    courses: new Map([
      ['H2S-01', { name_en: 'Test H2S Awareness', name_ar: 'توعية اختبار' }],
      ['FA-01', { name_en: '', name_ar: '' }],
    ]),
  };
  const items = [
    { Employee_ID: 'TST-0001', Department: 'OPS', Job_Title: 'OPR', Course_Code: 'H2S-01', Course_Name: 'Test H2S Awareness' },
    { Employee_ID: 'TST-0002', Department: 'LOG', Job_Title: 'TEC', Course_Code: 'FA-01', Course_Name: '' },
  ];

  it('adds English names and keeps the codes', () => {
    const [first] = projectForDisplay(items, lookups, 'en');
    expect(first).toMatchObject({
      Department: 'OPS',
      Department_Code: 'OPS',
      Department_Name: 'Test Operations',
      Job_Title: 'OPR',
      Job_Title_Code: 'OPR',
      Job_Title_Name: 'Test Operator',
      Course_Code: 'H2S-01',
      Course_Name: 'Test H2S Awareness',
    });
  });

  it('adds Arabic names for the Arabic interface', () => {
    const [first] = projectForDisplay(items, lookups, 'ar');
    expect(first.Department_Name).toBe('تشغيل اختبار');
    expect(first.Job_Title_Name).toBe('مشغل اختبار');
    expect(first.Course_Name).toBe('توعية اختبار');
    expect(first.Department).toBe('OPS');
  });

  it('falls back to the code when a name is missing', () => {
    const projected = projectForDisplay(items, lookups, 'en');
    expect(projected[1].Department_Name).toBe('LOG');
    expect(projected[1].Job_Title_Name).toBe('TEC');
    expect(projected[1].Course_Name).toBe('FA-01');
    expect(projectForDisplay(items, null, 'en')).toBe(items);
  });

  it('projects employee rows the same way', () => {
    const [first] = projectEmployeesForDisplay(
      [{ Employee_ID: 'TST-0001', Department: 'OPS', Job_Title: 'OPR' }],
      lookups,
      'ar',
    );
    expect(first).toMatchObject({ Department_Code: 'OPS', Department_Name: 'تشغيل اختبار' });
  });
});

describe('legacy paths and safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears the production binding on a reset', async () => {
    const approved = await approveProductionPackage(createApprovedState(), await validate(smallSheets()), METADATA);
    expect(approved.state.organizationCode).toBe('TST-ORG');
    const cleared = clearOrganizationBinding(approved.state);
    expect(cleared).toEqual(createApprovedState());
  });

  it('makes no network call and uses no storage', async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    try {
      const validated = await validate(smallSheets());
      await approveProductionPackage(createApprovedState(), validated, METADATA);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }

    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const file of ['src/lib/contract/productionPackage.js', 'src/components/ProductionPackagePreview.jsx']) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('localStorage');
      expect(source, file).not.toContain('sessionStorage');
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
      expect(source, file).not.toContain('Date.now(');
      expect(source, file).not.toMatch(/new Date\(\s*\)/);
    }
  });

  it('runs the engine on a state without touching the engine module', () => {
    const view = runEngineOnState(createApprovedState(), AS_OF);
    expect(view.compliance.universe).toHaveLength(0);
    expect(view.kpis.totalMandatoryReqs).toBe(0);
  });
});
