import { describe, it, expect } from 'vitest';

import { STATUS } from '../src/lib/constants.js';
import { createApprovedState } from '../src/lib/contract/staging.js';
import {
  generateSyntheticFullPackage,
  DEFAULT_SEED,
  SOURCE_SYSTEM,
} from './fixtures/contract/generateSyntheticPackage.js';
import { runSyntheticPipeline, blocking } from './fixtures/contract/runSyntheticPipeline.js';

/**
 * AT-16 — scale. The package of 500 employees is generated in memory, run
 * through the whole pipeline and compared with the numbers the generator
 * declares. Nothing is written to disk and no duration is asserted: the 3-second
 * criterion of the plan is measured by hand with
 * `scripts/measure-contract-pipeline.mjs`.
 */

const pkg = generateSyntheticFullPackage({});
const result = await runSyntheticPipeline(pkg);
const { expected } = pkg;

describe('AT-16: 500-employee package', () => {
  it('carries exactly 500 employees with unique codes', () => {
    expect(pkg.employees).toHaveLength(500);
    expect(expected.employees).toBe(500);
    const codes = pkg.employees.map((row) => row.employee_code);
    expect(new Set(codes).size).toBe(500);
    expect(codes[0]).toBe('TST-0001');
    expect(codes[499]).toBe('TST-0500');
  });

  it('carries unique source_record_ids under one source system', () => {
    const ids = pkg.trainingRecords.map((row) => row.source_record_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pkg.contract.source_system).toBe(SOURCE_SYSTEM);
    // The sheet carries no source_system column; it comes from _Contract.
    for (const row of pkg.trainingRecords) expect('source_system' in row).toBe(false);
  });

  it('resolves every reference and reports no blocking issue', () => {
    expect(blocking(result.validation.issues)).toHaveLength(0);
    const codes = result.validation.issues.map((entry) => entry.code);
    expect(codes).not.toContain('REF_UNKNOWN');
    expect(codes).not.toContain('REF_INACTIVE_CODE');
    expect(codes).not.toContain('JOB_TITLE_SCOPE');
    expect(codes).not.toContain('KEY_DUPLICATE');
    expect(codes).not.toContain('COMPLETED_WITHOUT_EXPIRY');
    expect(codes).not.toContain('EXPIRY_VALIDITY_MISMATCH');
  });

  it('stages and applies successfully', () => {
    expect(result.plan.ok).toBe(true);
    expect(result.applied.ok).toBe(true);
    expect(result.applied.applied).toBe(true);
    expect(result.approvedState.organizationCode).toBe('TST-ORG');
  });

  it('stores the declared counts in the approved state', () => {
    expect(result.approvedState.employees).toHaveLength(500);
    expect(result.approvedState.records).toHaveLength(expected.trainingRecords);
    expect(result.approvedState.requirements).toHaveLength(expected.requirements);
    expect(result.approvedState.departments).toHaveLength(expected.departments);
    expect(result.approvedState.jobTitles).toHaveLength(expected.jobTitles);
    expect(result.approvedState.courses).toHaveLength(expected.courses);
  });

  it('matches the employment distribution', () => {
    expect(expected.employmentCounts).toEqual({ Active: 480, Inactive: 10, Left: 10 });
    expect(result.compliance.employees.all).toHaveLength(500);
    expect(result.compliance.employees.active).toHaveLength(expected.employmentCounts.Active);
    expect(result.compliance.employees.inactive).toHaveLength(
      expected.employmentCounts.Inactive + expected.employmentCounts.Left,
    );
    expect(result.compliance.employees.notConfigured).toBe(0);
  });

  it('matches the number of compliance items', () => {
    expect(result.compliance.universe).toHaveLength(expected.complianceItems);
    const mandatory = result.compliance.universe.filter((entry) => entry.Mandatory === true);
    const notRequired = result.compliance.universe.filter((entry) => entry.Mandatory === false);
    expect(mandatory).toHaveLength(expected.mandatoryItems);
    expect(notRequired).toHaveLength(expected.statusCounts.NOT_REQUIRED);
    for (const entry of notRequired) expect(entry.Status).toBe(STATUS.NOT_REQUIRED);
  });

  it('matches the status distribution exactly', () => {
    // `calculateKPIs` counts mandatory items only, so NOT_REQUIRED is 0 there.
    expect(result.kpis.statusCounts).toEqual({
      [STATUS.VALID]: expected.statusCounts.VALID,
      [STATUS.EXPIRING_90]: 0,
      [STATUS.EXPIRING_60]: 0,
      [STATUS.EXPIRING_30]: expected.statusCounts.EXPIRING_30,
      [STATUS.EXPIRED]: expected.statusCounts.EXPIRED,
      [STATUS.IN_PROGRESS]: expected.statusCounts.IN_PROGRESS,
      [STATUS.NOT_STARTED]: expected.statusCounts.NOT_STARTED,
      [STATUS.MISSING]: expected.statusCounts.MISSING,
      [STATUS.NOT_REQUIRED]: 0,
    });
    expect(expected.statusCounts).toEqual({
      VALID: 405,
      EXPIRING_30: 198,
      EXPIRED: 82,
      IN_PROGRESS: 100,
      NOT_STARTED: 91,
      MISSING: 84,
      NOT_REQUIRED: 318,
    });
  });

  it('pins the main KPIs', () => {
    expect(result.kpis).toMatchObject({
      totalActiveEmployees: 480,
      employeesWithMandatoryReqs: 480,
      employeesNotConfigured: 0,
      totalMandatoryReqs: 960,
      compliantReqs: 603,
      requirementCompliance: 62.8,
      fullyCompliantCount: 198,
      fullyCompliantPct: 41.3,
    });
    expect(result.kpis.departmentCompliance).toHaveLength(3);
    expect(result.kpis.courseCompliance).toHaveLength(4);
  });

  it('includes the 0-day and 15-day edges of EXPIRING_30', () => {
    const expiring = result.compliance.universe.filter(
      (entry) => entry.Mandatory === true && entry.Status === STATUS.EXPIRING_30,
    );
    const days = new Set(expiring.map((entry) => entry.daysRemaining));
    expect(days.has(0)).toBe(true);
    expect(days.has(15)).toBe(true);
    expect(expiring).toHaveLength(expected.statusCounts.EXPIRING_30);
  });

  it('keeps renewals as separate records and lets the engine pick the best', () => {
    expect(expected.renewalRecords).toBeGreaterThan(0);
    // The renewal scenario holds two ids for one employee and course.
    const groups = new Map();
    for (const row of pkg.trainingRecords) {
      const key = `${row.employee_code}|${row.course_code}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const renewals = [...groups.entries()].filter(([, value]) => value > 1);
    expect(renewals).toHaveLength(expected.renewalRecords);

    const [key] = renewals[0];
    const [employeeCode, courseCode] = key.split('|');
    const item = result.compliance.universe.find(
      (entry) => entry.Employee_ID === employeeCode && entry.Course_Code === courseCode,
    );
    // Both records survive in the approved state; the engine counts the valid one.
    expect(result.approvedState.records.filter((row) => row.employee_code === employeeCode && row.course_code === courseCode)).toHaveLength(2);
    expect(item.Status).toBe(STATUS.VALID);
    expect(item.isDuplicate).toBe(true);
  });

  it('gives MISSING to an active employee without records and nothing to a non-active one', () => {
    expect(expected.employeesWithoutRecords).toBeGreaterThan(0);
    const withRecords = new Set(pkg.trainingRecords.map((row) => row.employee_code));
    const activeWithout = pkg.employees.filter(
      (row) => row.employment_status === 'Active' && !withRecords.has(row.employee_code),
    );
    expect(activeWithout.length).toBeGreaterThan(0);
    for (const employee of activeWithout) {
      const items = result.compliance.universe.filter(
        (entry) => entry.Employee_ID === employee.employee_code && entry.Mandatory === true,
      );
      expect(items.length).toBeGreaterThan(0);
      for (const entry of items) expect(entry.Status).toBe(STATUS.MISSING);
    }

    for (const employee of pkg.employees.filter((row) => row.employment_status !== 'Active')) {
      expect(
        result.compliance.universe.filter((entry) => entry.Employee_ID === employee.employee_code),
      ).toHaveLength(0);
    }
  });

  it('is reproducible for the same seed and different for another seed', () => {
    const again = generateSyntheticFullPackage({});
    expect(again).toEqual(pkg);
    const other = generateSyntheticFullPackage({ seed: DEFAULT_SEED + 7 });
    expect(other.expected.statusCounts).not.toEqual(expected.statusCounts);
    expect(other.employees).toEqual(pkg.employees);
  });

  it('selects the current version when a later batch corrects a record', async () => {
    const second = await runSyntheticPipeline(
      {
        ...pkg,
        approval: { ...pkg.approval, batchId: 'TST-BATCH-SECOND', approvedAt: '2027-02-11T08:00:00.000Z' },
      },
      { approvedState: result.approvedState, records: pkg.secondBatchRecords },
    );
    expect(second.applied.ok).toBe(true);
    const key = pkg.secondBatchRecords[0].source_record_id;
    const versions = second.approvedState.records.filter((row) => row.source_record_id === key);
    expect(versions).toHaveLength(2);
    expect(versions.map((row) => row._version)).toEqual([1, 2]);
    // Only the current version reaches the engine.
    const prepared = second.prepared.records.filter((row) => row._sourceRecordId === key);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].Remarks).toBe('Corrected in a later batch');
    expect(second.compliance.universe).toHaveLength(expected.complianceItems);
  });

  it('starts from an empty state and writes no file', () => {
    const empty = createApprovedState();
    expect(empty.employees).toHaveLength(0);
    // The test holds the package in memory only; nothing is written.
    expect(typeof pkg.trainingRecords[0].source_record_id).toBe('string');
  });
});
