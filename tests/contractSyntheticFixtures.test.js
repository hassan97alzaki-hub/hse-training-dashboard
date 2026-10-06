import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { STATUS } from '../src/lib/constants.js';
import { SEVERITY } from '../src/lib/contract/schema.js';
import { createApprovedState } from '../src/lib/contract/staging.js';
import { validateContactPackage } from '../src/lib/contract/contactValidation.js';
import { countContactEligibility } from '../src/lib/contract/contactEligibility.js';
import { smallFullPackage } from './fixtures/contract/smallFullPackage.js';
import { smallContactPackage } from './fixtures/contract/smallContactPackage.js';
import {
  generateSyntheticFullPackage,
  DEFAULT_SEED,
  FIXED_DATES,
  ORGANIZATION_CODE,
  SOURCE_SYSTEM,
} from './fixtures/contract/generateSyntheticPackage.js';
import { runSyntheticPipeline, summarise, blocking } from './fixtures/contract/runSyntheticPipeline.js';
import { buildWorkbook, SHEET_ORDER } from '../scripts/generate-contract-workbook.mjs';

const NEW_FILES = Object.freeze([
  'tests/fixtures/contract/generateSyntheticPackage.js',
  'tests/fixtures/contract/runSyntheticPipeline.js',
  'tests/fixtures/contract/smallFullPackage.js',
  'tests/fixtures/contract/smallContactPackage.js',
  'tests/contractSyntheticFixtures.test.js',
  'tests/contractScale500.test.js',
  'scripts/generate-contract-workbook.mjs',
  'scripts/measure-contract-pipeline.mjs',
]);

const sourceOf = (file) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('AT-01: the small valid package', () => {
  it('passes validation with zero blocking issues', async () => {
    const result = await runSyntheticPipeline(smallFullPackage);
    expect(blocking(result.validation.issues)).toHaveLength(0);
    expect(result.plan.ok).toBe(true);
  });

  it('carries every sheet of a full package', () => {
    for (const key of ['departments', 'jobTitles', 'courses', 'employees', 'requirements', 'trainingRecords']) {
      expect(smallFullPackage[key].length, key).toBeGreaterThan(0);
    }
    expect(smallFullPackage.contract.package_type).toBe('full');
  });

  it('previews exact counts', async () => {
    const result = await runSyntheticPipeline(smallFullPackage);
    const { expected } = smallFullPackage;
    expect(result.plan.counts).toMatchObject({
      'Departments.new': expected.departments,
      'Job_Titles.new': expected.jobTitles,
      'Courses.new': expected.courses,
      'Employees.new': expected.employees,
      'Requirements.new': expected.requirements,
      'Training_Records.new': expected.trainingRecords,
      conflicts: 0,
      blocking: 0,
    });
  });

  it('applies atomically and binds the organization', async () => {
    const result = await runSyntheticPipeline(smallFullPackage);
    expect(result.applied.ok).toBe(true);
    expect(result.applied.applied).toBe(true);
    expect(result.approvedState.organizationCode).toBe('TST-ORG');
    expect(result.approvedState.batches).toHaveLength(1);
    expect(result.approvedState.batches[0]).toMatchObject({
      batchId: 'TST-BATCH-SMALL',
      preparedByRole: 'Training Coordinator',
      approvedByRole: 'Training Manager',
    });
  });

  it('stores the expected approved data', async () => {
    const result = await runSyntheticPipeline(smallFullPackage);
    const { expected } = smallFullPackage;
    expect(summarise(result)).toMatchObject({
      blockingIssues: 0,
      departments: expected.departments,
      jobTitles: expected.jobTitles,
      courses: expected.courses,
      employees: expected.employees,
      requirements: expected.requirements,
      records: expected.trainingRecords,
    });
  });

  it('prepares the engine input correctly', async () => {
    const result = await runSyntheticPipeline(smallFullPackage);
    expect(result.prepared.asOfDate).toBe(FIXED_DATES.asOfDate);
    expect(result.prepared.employees).toHaveLength(smallFullPackage.expected.employees);
    expect(result.prepared.requirements).toHaveLength(smallFullPackage.expected.requirements);
    expect(result.prepared.records).toHaveLength(smallFullPackage.expected.trainingRecords);
    expect(result.prepared.lookups.courses.get('H2S-01').name_en).toBe('Test H2S Awareness');
  });

  it('matches the pinned compliance items and KPIs', async () => {
    const result = await runSyntheticPipeline(smallFullPackage);
    const { expected } = smallFullPackage;
    expect(result.compliance.universe).toHaveLength(expected.complianceItems);
    expect(result.compliance.employees.active).toHaveLength(expected.activeEmployees);
    expect(result.compliance.employees.inactive).toHaveLength(expected.inactiveEmployees);
    expect(result.compliance.employees.notConfigured).toBe(0);

    const mandatory = result.compliance.universe.filter((entry) => entry.Mandatory === true);
    const notRequired = result.compliance.universe.filter((entry) => entry.Mandatory === false);
    expect(mandatory).toHaveLength(expected.mandatoryItems);
    expect(notRequired).toHaveLength(expected.notRequiredItems);

    const statuses = Object.fromEntries(
      Object.entries(result.kpis.statusCounts).filter(([, value]) => value > 0),
    );
    expect(statuses).toEqual(expected.statusCounts);
    expect(result.kpis.requirementCompliance).toBe(expected.requirementCompliance);
    expect(result.kpis.fullyCompliantPct).toBe(expected.fullyCompliantPct);

    // The employee without a record is MISSING; the non-active one has no item.
    const byEmployee = (code) => result.compliance.universe.filter((entry) => entry.Employee_ID === code);
    expect(byEmployee('TST-0002').find((entry) => entry.Mandatory === true).Status).toBe(STATUS.MISSING);
    expect(byEmployee('TST-0003')).toHaveLength(0);
  });

  it('is a no-op when the same package is approved again', async () => {
    const first = await runSyntheticPipeline(smallFullPackage);
    const second = await runSyntheticPipeline(smallFullPackage, { approvedState: first.approvedState });
    expect(second.applied.ok).toBe(true);
    expect(second.approvedState.employees).toEqual(first.approvedState.employees);
    expect(second.approvedState.records).toEqual(first.approvedState.records);
    expect(second.approvedState.requirements).toEqual(first.approvedState.requirements);
    expect(second.approvedState.changeLog).toHaveLength(first.approvedState.changeLog.length);
    expect(second.approvedState.batches).toHaveLength(2);
  });

  it('leaks no name or contact value into an issue summary', async () => {
    const result = await runSyntheticPipeline(smallFullPackage);
    const serialised = JSON.stringify([...result.validation.issues, ...result.plan.issues]);
    for (const leak of ['Test Employee', 'TST-CERT', 'example.invalid', '+999', 'Test Provider']) {
      expect(serialised, leak).not.toContain(leak);
    }
    for (const value of Object.values(summarise(result))) expect(typeof value).toBe('number');
  });
});

describe('the small contact package', () => {
  it('passes validation with the basis not_defined', () => {
    const result = validateContactPackage({
      contract: smallContactPackage.contract,
      contacts: smallContactPackage.contacts,
      sheetNames: smallContactPackage.sheetNames,
      boundOrganizationCode: ORGANIZATION_CODE,
      approvedEmployees: smallFullPackage.employees,
      asOfDate: smallContactPackage.asOfDate,
    });
    expect(result.ok).toBe(true);
    expect(blocking(result.issues)).toHaveLength(smallContactPackage.expected.blockingIssues);
    expect(result.rows).toHaveLength(smallContactPackage.expected.contacts);
  });

  it('counts zero eligibility under the default policy', () => {
    const validated = validateContactPackage({
      contract: smallContactPackage.contract,
      contacts: smallContactPackage.contacts,
      sheetNames: smallContactPackage.sheetNames,
      boundOrganizationCode: ORGANIZATION_CODE,
      approvedEmployees: smallFullPackage.employees,
      asOfDate: smallContactPackage.asOfDate,
    });
    const eligibility = countContactEligibility({
      contacts: validated.rows,
      approvedEmployees: smallFullPackage.employees,
      complianceItems: [
        {
          Employee_ID: 'TST-0001',
          Mandatory: true,
          Status: STATUS.EXPIRING_30,
          daysRemaining: 10,
        },
      ],
    });
    expect(eligibility).toEqual(smallContactPackage.expected.eligibility);
  });
});

describe('the generator is deterministic', () => {
  it('produces a deep-equal package for the same seed', () => {
    const first = generateSyntheticFullPackage({ employeeCount: 40 });
    const second = generateSyntheticFullPackage({ employeeCount: 40 });
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.seed).toBe(DEFAULT_SEED);
  });

  it('changes the distribution for another seed while staying valid', async () => {
    const base = generateSyntheticFullPackage({ employeeCount: 60 });
    const other = generateSyntheticFullPackage({ employeeCount: 60, seed: DEFAULT_SEED + 1 });
    expect(other.expected.statusCounts).not.toEqual(base.expected.statusCounts);
    // The contract itself is untouched by the seed.
    expect(other.contract).toEqual(base.contract);
    expect(other.requirements).toEqual(base.requirements);
    const result = await runSyntheticPipeline(other);
    expect(blocking(result.validation.issues)).toHaveLength(0);
    expect(result.applied.ok).toBe(true);
  });

  it('reads no clock, no time zone and no random source', () => {
    // The tokens are assembled from fragments so this guard does not match its
    // own source file.
    const SYSTEM_RANDOM = ['Math', '.random'].join('');
    const CLOCK = ['Date', '.now('].join('');
    const ZONE_OFFSET = ['getTimezone', 'Offset'].join('');
    const LOCALE_DATE = ['toLocale', 'DateString'].join('');
    const MATRIX_ENV = ['HSE_MATRIX', '_XLSX'].join('');
    for (const file of NEW_FILES) {
      const source = sourceOf(file);
      expect(source, file).not.toContain(SYSTEM_RANDOM);
      expect(source, file).not.toContain(CLOCK);
      expect(source, file).not.toContain(ZONE_OFFSET);
      expect(source, file).not.toContain(LOCALE_DATE);
      expect(source, file).not.toContain(MATRIX_ENV);
      // A date built without an argument would read the clock of the device.
      expect(source.replace(/\s/g, ''), file).not.toContain(['new', 'Date()'].join(''));
    }
  });

  it('uses a fixed As Of Date and fixed approval metadata', () => {
    const pkg = generateSyntheticFullPackage({ employeeCount: 10 });
    expect(pkg.asOfDate).toBe('2027-01-12');
    expect(pkg.contract.extract_date).toBe('2027-01-10');
    expect(pkg.contract.requirements_effective_from).toBe('2027-01-01');
    expect(pkg.approval.approvedAt).toBe('2027-01-11T08:00:00.000Z');
    expect(pkg.contract.organization_code).toBe(ORGANIZATION_CODE);
    expect(pkg.contract.source_system).toBe(SOURCE_SYSTEM);
  });
});

describe('privacy guards of the fixtures', () => {
  const pkg = generateSyntheticFullPackage({ employeeCount: 120 });

  it('uses reserved employee codes, names, certificates and record ids', () => {
    for (const employee of pkg.employees) {
      expect(employee.employee_code).toMatch(/^TST-\d{4}$/);
      expect(employee.full_name).toMatch(/^Test Employee \d{3}$/);
      expect(employee.badge_number).toMatch(/^TST-B-\d{4}$/);
    }
    for (const record of pkg.trainingRecords) {
      expect(record.source_record_id).toMatch(/^TR-\d{6}$/);
      if (record.certificate_number) {
        expect(record.certificate_number).toMatch(/^TST-CERT-\d{6}$/);
      }
    }
  });

  it('uses reserved emails and phone numbers in the contact fixture', () => {
    for (const row of smallContactPackage.contacts) {
      expect(row.email.endsWith('@example.invalid')).toBe(true);
      expect(row.phone_e164.startsWith('+999')).toBe(true);
      expect(row.employee_code.startsWith('TST-')).toBe(true);
      expect(row.communication_authorization_basis).toBe('not_defined');
    }
  });

  it('produces no forbidden identity column', () => {
    const forbidden = ['national_id', 'nationalid', 'iqama', 'date_of_birth', 'dob', 'nationality', 'birth'];
    const keys = new Set();
    for (const row of [...pkg.employees, ...pkg.trainingRecords, ...smallContactPackage.contacts]) {
      for (const key of Object.keys(row)) keys.add(key.toLowerCase());
    }
    for (const key of keys) {
      for (const bad of forbidden) expect(key, key).not.toContain(bad);
    }
  });

  it('contains no personal path and no real domain in the new files', () => {
    // The tokens are assembled from fragments so this guard does not match its
    // own source file.
    const HOME_PATH = ['/Us', 'ers/'].join('');
    const ACCOUNT = ['hassan', 'ali'].join('');
    const REQUEST = ['fet', 'ch('].join('');
    const LEGACY_REQUEST = ['XMLHttp', 'Request'].join('');
    for (const file of NEW_FILES) {
      const source = sourceOf(file);
      expect(source, file).not.toContain(HOME_PATH);
      expect(source.toLowerCase(), file).not.toContain(ACCOUNT);
      expect(source, file).not.toMatch(/@(gmail|hotmail|outlook|yahoo)\./i);
      expect(source.replace(/\s/g, ''), file).not.toContain(REQUEST);
      expect(source, file).not.toContain(LEGACY_REQUEST);
    }
  });

  it('commits no generated workbook', () => {
    const fixtures = resolve(process.cwd(), 'tests/fixtures/contract');
    for (const name of readdirSync(fixtures)) {
      expect(name.endsWith('.xlsx'), name).toBe(false);
      expect(name.endsWith('.csv'), name).toBe(false);
      expect(statSync(join(fixtures, name)).isFile()).toBe(true);
    }
  });
});

describe('no network during the pipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls fetch while validating, staging or running the engine', async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    try {
      const result = await runSyntheticPipeline(generateSyntheticFullPackage({ employeeCount: 30 }), {
        approvedState: createApprovedState(),
      });
      expect(result.applied.ok).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps every issue free of a severity other than the three known ones', async () => {
    const result = await runSyntheticPipeline(generateSyntheticFullPackage({ employeeCount: 30 }));
    for (const entry of [...result.validation.issues, ...result.plan.issues]) {
      expect(Object.values(SEVERITY)).toContain(entry.severity);
    }
  });
});

describe('the optional workbook builder', () => {
  it('builds every sheet in memory without saving a file', () => {
    const pkg = generateSyntheticFullPackage({ employeeCount: 20 });
    const { workbook, rowCounts } = buildWorkbook(pkg);
    expect(workbook.SheetNames).toEqual([
      '_Contract',
      'Departments',
      'Job_Titles',
      'Employees',
      'Courses',
      'Requirements',
      'Training_Records',
    ]);
    expect(SHEET_ORDER).toEqual(workbook.SheetNames);
    expect(rowCounts).toEqual({
      _Contract: 1,
      Departments: pkg.departments.length,
      Job_Titles: pkg.jobTitles.length,
      Employees: 20,
      Courses: pkg.courses.length,
      Requirements: pkg.requirements.length,
      Training_Records: pkg.trainingRecords.length,
    });
  });

  it('round-trips the sheets through an in-memory buffer', async () => {
    const XLSX = await import('xlsx');
    const pkg = generateSyntheticFullPackage({ employeeCount: 12 });
    const { workbook } = buildWorkbook(pkg);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const reread = XLSX.read(buffer, { type: 'buffer' });
    expect(reread.SheetNames).toEqual(SHEET_ORDER);
    const employees = XLSX.utils.sheet_to_json(reread.Sheets.Employees);
    expect(employees).toHaveLength(12);
    expect(employees[0].employee_code).toBe('TST-0001');
    expect(XLSX.utils.sheet_to_json(reread.Sheets._Contract)).toHaveLength(1);
  });
});
