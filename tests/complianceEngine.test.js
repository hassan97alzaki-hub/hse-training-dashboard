import { describe, it, expect } from 'vitest';
import { STATUS } from '../src/lib/constants.js';
import { determineCompletedStatus, selectBestRecord, buildComplianceUniverse, calculateKPIs } from '../src/lib/complianceEngine.js';
import { dateDiffDays, isValidDateStr } from '../src/lib/normalization.js';
import { TRAINING_RECORDS, REQUIREMENTS, EXPECTED, AS_OF } from './fixtures/records.js';

// ============================================================
// Date utilities
// ============================================================
describe('dateDiffDays', () => {
  it('returns 0 for same date', () => {
    expect(dateDiffDays('2026-07-26', '2026-07-26')).toBe(0);
  });
  it('returns positive when first date is later', () => {
    expect(dateDiffDays('2026-07-27', '2026-07-26')).toBe(1);
  });
  it('returns negative when first date is earlier', () => {
    expect(dateDiffDays('2026-07-25', '2026-07-26')).toBe(-1);
  });
  it('handles leap year (2024 is a leap year)', () => {
    expect(dateDiffDays('2024-03-01', '2024-02-28')).toBe(2); // 28 Feb → 1 Mar = 2 days
  });
  it('returns null for invalid inputs', () => {
    expect(dateDiffDays('bad', '2026-07-26')).toBeNull();
    expect(dateDiffDays('2026-07-26', '')).toBeNull();
  });
});

describe('isValidDateStr', () => {
  it('accepts valid YYYY-MM-DD', () => {
    expect(isValidDateStr('2026-07-26')).toBe(true);
    expect(isValidDateStr('2024-02-29')).toBe(true); // leap year
  });
  it('rejects invalid dates', () => {
    expect(isValidDateStr('2025-13-45')).toBe(false);
    expect(isValidDateStr('not-a-date')).toBe(false);
    expect(isValidDateStr('')).toBe(false);
    expect(isValidDateStr('07/26/2026')).toBe(false);
    expect(isValidDateStr('2023-02-29')).toBe(false); // 2023 not a leap year
  });
});

// ============================================================
// Status determination
// ============================================================
describe('determineCompletedStatus', () => {
  it('EXPIRED — expiry strictly before As Of Date', () => {
    expect(determineCompletedStatus('2026-07-25', AS_OF)).toBe(STATUS.EXPIRED);
  });
  it('EXPIRING_30 — expiry exactly on As Of Date (0 days)', () => {
    expect(determineCompletedStatus('2026-07-26', AS_OF)).toBe(STATUS.EXPIRING_30);
  });
  it('EXPIRING_30 — exactly 30 days remaining (2026-08-25)', () => {
    expect(determineCompletedStatus('2026-08-25', AS_OF)).toBe(STATUS.EXPIRING_30);
  });
  it('EXPIRING_60 — exactly 31 days remaining (2026-08-26)', () => {
    expect(determineCompletedStatus('2026-08-26', AS_OF)).toBe(STATUS.EXPIRING_60);
  });
  it('EXPIRING_60 — exactly 60 days remaining (2026-09-24)', () => {
    expect(determineCompletedStatus('2026-09-24', AS_OF)).toBe(STATUS.EXPIRING_60);
  });
  it('EXPIRING_90 — exactly 61 days remaining (2026-09-25)', () => {
    expect(determineCompletedStatus('2026-09-25', AS_OF)).toBe(STATUS.EXPIRING_90);
  });
  it('EXPIRING_90 — exactly 90 days remaining (2026-10-24)', () => {
    expect(determineCompletedStatus('2026-10-24', AS_OF)).toBe(STATUS.EXPIRING_90);
  });
  it('VALID — exactly 91 days remaining (2026-10-25)', () => {
    expect(determineCompletedStatus('2026-10-25', AS_OF)).toBe(STATUS.VALID);
  });
  it('VALID — no expiry date (one-time training)', () => {
    expect(determineCompletedStatus('', AS_OF)).toBe(STATUS.VALID);
    expect(determineCompletedStatus(null, AS_OF)).toBe(STATUS.VALID);
  });
  it('VALID — future far-off date', () => {
    expect(determineCompletedStatus('2030-01-01', AS_OF)).toBe(STATUS.VALID);
  });
});

// ============================================================
// Duplicate selection policy
// ============================================================
describe('selectBestRecord', () => {
  it('selects record with latest valid expiry', () => {
    const records = [
      { Completion_Status: 'Completed', Expiry_Date: '2026-01-15', Issue_Date: '2025-01-15' }, // expired
      { Completion_Status: 'Completed', Expiry_Date: '2027-01-20', Issue_Date: '2026-01-20' }, // valid
    ];
    const best = selectBestRecord(records, AS_OF);
    expect(best.Expiry_Date).toBe('2027-01-20');
  });
  it('when both expired, selects latest expiry', () => {
    const records = [
      { Completion_Status: 'Completed', Expiry_Date: '2025-01-01', Issue_Date: '2024-01-01' },
      { Completion_Status: 'Completed', Expiry_Date: '2025-06-01', Issue_Date: '2024-06-01' },
    ];
    const best = selectBestRecord(records, AS_OF);
    expect(best.Expiry_Date).toBe('2025-06-01');
  });
  it('single record — returns itself', () => {
    const rec = { Completion_Status: 'Completed', Expiry_Date: '2027-01-01', Issue_Date: '2026-01-01' };
    expect(selectBestRecord([rec], AS_OF)).toBe(rec);
  });
  it('prefers completed records over in-progress', () => {
    const records = [
      { Completion_Status: 'In Progress', Expiry_Date: '', Issue_Date: '2026-01-01' },
      { Completion_Status: 'Completed',   Expiry_Date: '2025-01-01', Issue_Date: '2024-01-01' },
    ];
    const best = selectBestRecord(records, AS_OF);
    expect(best.Completion_Status).toBe('Completed');
  });
});

// ============================================================
// buildComplianceUniverse — employee dedup, inactive exclusion, MISSING generation
// ============================================================
describe('buildComplianceUniverse', () => {
  let result;
  beforeAll(() => { result = buildComplianceUniverse(TRAINING_RECORDS, REQUIREMENTS, AS_OF); });

  it('identifies correct active employee count', () => {
    expect(result.employees.active.length).toBe(EXPECTED.totalActiveEmployees);
  });

  it('excludes inactive employees from universe', () => {
    const inactiveInUniverse = result.universe.filter(i => i.Employment_Status === 'Inactive');
    expect(inactiveInUniverse).toHaveLength(0);
  });

  it('keeps inactive employee records in inactiveUniverse', () => {
    const inactiveBucket = result.inactiveUniverse.filter(i => i.Employee_ID === 'EMP0011');
    expect(inactiveBucket.length).toBeGreaterThan(0);
  });

  it('flags employee with no configured requirements (EMP0012)', () => {
    expect(result.unconfiguredEmployees.some(e => e.Employee_ID === 'EMP0012')).toBe(true);
    expect(result.employees.notConfigured).toBe(EXPECTED.employeesNotConfigured);
  });

  it('generates MISSING item for EMP0005/WAH001', () => {
    const missingItem = result.universe.find(
      i => i.Employee_ID === 'EMP0005' && i.Course_Code === 'WAH001'
    );
    expect(missingItem).toBeDefined();
    expect(missingItem.Status).toBe(STATUS.MISSING);
    expect(missingItem.isMissing).toBe(true);
  });

  it('generates MISSING item for EMP0010/CS001', () => {
    const missingItem = result.universe.find(
      i => i.Employee_ID === 'EMP0010' && i.Course_Code === 'CS001'
    );
    expect(missingItem).toBeDefined();
    expect(missingItem.Status).toBe(STATUS.MISSING);
  });

  it('marks EMP0007 requirements as NOT_REQUIRED (no mandatory)', () => {
    const driverItems = result.universe.filter(i => i.Employee_ID === 'EMP0007');
    expect(driverItems.length).toBeGreaterThan(0);
    driverItems.forEach(i => expect(i.Status).toBe(STATUS.NOT_REQUIRED));
  });

  it('detects duplicate group for EMP0005/CS001', () => {
    expect(result.duplicates.length).toBe(EXPECTED.duplicateGroups);
    expect(result.duplicates[0].key).toBe('EMP0005|CS001');
  });

  it('selects the correct (valid) record for EMP0005/CS001', () => {
    const cs001Item = result.universe.find(
      i => i.Employee_ID === 'EMP0005' && i.Course_Code === 'CS001'
    );
    expect(cs001Item).toBeDefined();
    expect(cs001Item.Status).toBe(STATUS.VALID);
    expect(cs001Item.Expiry_Date).toBe('2027-01-20');
  });

  it('does not count EMP0007 as having mandatory requirements', () => {
    expect(result.employees.noMandatoryReqs).toBe(EXPECTED.employeesNoMandatoryReqs);
  });
});

// ============================================================
// calculateKPIs — against full expected results
// ============================================================
describe('calculateKPIs', () => {
  let kpis;
  beforeAll(() => {
    const cr = buildComplianceUniverse(TRAINING_RECORDS, REQUIREMENTS, AS_OF);
    kpis = calculateKPIs(cr.universe, cr.employees, cr.unconfiguredEmployees);
  });

  it('total active employees matches expected', () => {
    expect(kpis.totalActiveEmployees).toBe(EXPECTED.totalActiveEmployees);
  });

  it('employees with mandatory requirements matches expected', () => {
    expect(kpis.employeesWithMandatoryReqs).toBe(EXPECTED.employeesWithMandatoryReqs);
  });

  it('employees not configured matches expected', () => {
    expect(kpis.employeesNotConfigured).toBe(EXPECTED.employeesNotConfigured);
  });

  it('total mandatory requirements matches expected (24)', () => {
    expect(kpis.totalMandatoryReqs).toBe(EXPECTED.totalMandatoryReqs);
  });

  it('compliant requirements matches expected (16)', () => {
    expect(kpis.compliantReqs).toBe(EXPECTED.compliantReqs);
  });

  it('requirement compliance = 66.7%', () => {
    expect(kpis.requirementCompliance).toBe(EXPECTED.requirementCompliance);
  });

  it('fully compliant employee count = 2 (EMP0001, EMP0009)', () => {
    expect(kpis.fullyCompliantCount).toBe(EXPECTED.fullyCompliantCount);
  });

  it('fully compliant percentage = 22.2%', () => {
    expect(kpis.fullyCompliantPct).toBe(EXPECTED.fullyCompliantPct);
  });

  it('status counts — VALID = 9', () => {
    expect(kpis.statusCounts.VALID).toBe(EXPECTED.statusCounts.VALID);
  });
  it('status counts — EXPIRING_90 = 2', () => {
    expect(kpis.statusCounts.EXPIRING_90).toBe(EXPECTED.statusCounts.EXPIRING_90);
  });
  it('status counts — EXPIRING_60 = 2', () => {
    expect(kpis.statusCounts.EXPIRING_60).toBe(EXPECTED.statusCounts.EXPIRING_60);
  });
  it('status counts — EXPIRING_30 = 3', () => {
    expect(kpis.statusCounts.EXPIRING_30).toBe(EXPECTED.statusCounts.EXPIRING_30);
  });
  it('status counts — EXPIRED = 4', () => {
    expect(kpis.statusCounts.EXPIRED).toBe(EXPECTED.statusCounts.EXPIRED);
  });
  it('status counts — IN_PROGRESS = 1', () => {
    expect(kpis.statusCounts.IN_PROGRESS).toBe(EXPECTED.statusCounts.IN_PROGRESS);
  });
  it('status counts — NOT_STARTED = 1', () => {
    expect(kpis.statusCounts.NOT_STARTED).toBe(EXPECTED.statusCounts.NOT_STARTED);
  });
  it('status counts — MISSING = 2', () => {
    expect(kpis.statusCounts.MISSING).toBe(EXPECTED.statusCounts.MISSING);
  });

  it('EXPIRED + IN_PROGRESS + NOT_STARTED + MISSING = non-compliant in denominator', () => {
    const nonCompliant = EXPECTED.statusCounts.EXPIRED + EXPECTED.statusCounts.IN_PROGRESS +
      EXPECTED.statusCounts.NOT_STARTED + EXPECTED.statusCounts.MISSING;
    expect(nonCompliant).toBe(EXPECTED.totalMandatoryReqs - EXPECTED.compliantReqs);
  });

  it('department compliance — Operations is lowest', () => {
    const ops = kpis.departmentCompliance.find(d => d.department === 'Operations');
    expect(ops).toBeDefined();
    expect(ops.total).toBe(8);
    expect(ops.compliant).toBe(5);
    expect(ops.percentage).toBe(62.5);
  });

  it('department compliance — Admin', () => {
    const admin = kpis.departmentCompliance.find(d => d.department === 'Admin');
    expect(admin).toBeDefined();
    expect(admin.total).toBe(4);
    expect(admin.compliant).toBe(3);
    expect(admin.percentage).toBe(75.0);
  });

  it('course compliance — FF001 = 100%', () => {
    const ff = kpis.courseCompliance.find(c => c.course_code === 'FF001');
    expect(ff).toBeDefined();
    expect(ff.employeesRequired).toBe(2);
    expect(ff.compliant).toBe(2);
    expect(ff.percentage).toBe(100.0);
  });

  it('course compliance — H2S001: 7 compliant of 9 required (77.8%)', () => {
    const h2s = kpis.courseCompliance.find(c => c.course_code === 'H2S001');
    expect(h2s).toBeDefined();
    expect(h2s.employeesRequired).toBe(9);
    expect(h2s.compliant).toBe(7);
    expect(h2s.percentage).toBe(77.8);
  });

  it('course compliance — WAH001: 1 compliant of 3 required (33.3%)', () => {
    const wah = kpis.courseCompliance.find(c => c.course_code === 'WAH001');
    expect(wah).toBeDefined();
    expect(wah.employeesRequired).toBe(3);
    expect(wah.compliant).toBe(1);
    expect(wah.percentage).toBe(33.3);
  });

  it('NOT_REQUIRED items are not counted in mandatory total', () => {
    // NOT_REQUIRED items exist in universe but not counted in totalMandatoryReqs
    expect(kpis.totalMandatoryReqs).toBe(24); // would be 26 if NOT_REQUIRED counted
  });
});

// ============================================================
// Specific status cases
// ============================================================
describe('Individual employee status cases', () => {
  let universe;
  beforeAll(() => {
    const cr = buildComplianceUniverse(TRAINING_RECORDS, REQUIREMENTS, AS_OF);
    universe = cr.universe;
  });

  const get = (empId, courseCode) =>
    universe.find(i => i.Employee_ID === empId && i.Course_Code === courseCode);

  it('EMP0001/H2S001 — VALID (91 days)', () => expect(get('EMP0001', 'H2S001').Status).toBe(STATUS.VALID));
  it('EMP0001/PTW001 — EXPIRING_90 (86 days)', () => expect(get('EMP0001', 'PTW001').Status).toBe(STATUS.EXPIRING_90));
  it('EMP0001/WAH001 — EXPIRING_60 (51 days)', () => expect(get('EMP0001', 'WAH001').Status).toBe(STATUS.EXPIRING_60));
  it('EMP0002/H2S001 — EXPIRING_30 (25 days)', () => expect(get('EMP0002', 'H2S001').Status).toBe(STATUS.EXPIRING_30));
  it('EMP0002/PTW001 — EXPIRED', () => expect(get('EMP0002', 'PTW001').Status).toBe(STATUS.EXPIRED));
  it('EMP0002/CS001 — NOT_STARTED', () => expect(get('EMP0002', 'CS001').Status).toBe(STATUS.NOT_STARTED));
  it('EMP0003/H2S001 — EXPIRED', () => expect(get('EMP0003', 'H2S001').Status).toBe(STATUS.EXPIRED));
  it('EMP0003/PTW001 — EXPIRING_30 (0 days — exactly on As Of Date)', () => expect(get('EMP0003', 'PTW001').Status).toBe(STATUS.EXPIRING_30));
  it('EMP0004/H2S001 — VALID', () => expect(get('EMP0004', 'H2S001').Status).toBe(STATUS.VALID));
  it('EMP0004/WAH001 — IN_PROGRESS', () => expect(get('EMP0004', 'WAH001').Status).toBe(STATUS.IN_PROGRESS));
  it('EMP0005/H2S001 — EXPIRING_30 (15 days)', () => expect(get('EMP0005', 'H2S001').Status).toBe(STATUS.EXPIRING_30));
  it('EMP0005/CS001 — VALID (best record selected from duplicate)', () => expect(get('EMP0005', 'CS001').Status).toBe(STATUS.VALID));
  it('EMP0005/WAH001 — MISSING', () => expect(get('EMP0005', 'WAH001').Status).toBe(STATUS.MISSING));
  it('EMP0006/H2S001 — VALID', () => expect(get('EMP0006', 'H2S001').Status).toBe(STATUS.VALID));
  it('EMP0006/FF001 — EXPIRING_60 (37 days)', () => expect(get('EMP0006', 'FF001').Status).toBe(STATUS.EXPIRING_60));
  it('EMP0006/PTW001 — EXPIRED', () => expect(get('EMP0006', 'PTW001').Status).toBe(STATUS.EXPIRED));
  it('EMP0008/H2S001 — EXPIRED', () => expect(get('EMP0008', 'H2S001').Status).toBe(STATUS.EXPIRED));
  it('EMP0008/FF001 — VALID', () => expect(get('EMP0008', 'FF001').Status).toBe(STATUS.VALID));
  it('EMP0009/H2S001 — EXPIRING_90 (67 days)', () => expect(get('EMP0009', 'H2S001').Status).toBe(STATUS.EXPIRING_90));
  it('EMP0010/CS001 — MISSING (no record)', () => expect(get('EMP0010', 'CS001').Status).toBe(STATUS.MISSING));
});

// ============================================================
// Role-scoped course requirements
// ============================================================
describe('a course scoped to one role', () => {
  // This is the 9797 — JSA case: a course added in the interface used to be
  // broadcast to every role, so everybody was MISSING it.
  const people = [
    { Employee_ID: 'EMP001', Name: 'A', Department: 'Operations', Job_Title: 'Operator', Employment_Status: 'Active' },
    { Employee_ID: 'EMP002', Name: 'B', Department: 'Maintenance', Job_Title: 'Technician', Employment_Status: 'Active' },
  ];
  const requirements = [
    { Department: 'Operations', Job_Title: 'Operator', Course_Code: 'JSA', Course_Name: 'JSA', Mandatory: true, Validity_Months: 12 },
  ];

  it('is missing for the scoped role only', () => {
    const result = buildComplianceUniverse([], requirements, '2026-10-13', people);
    const missing = result.universe.filter(item => item.isMissing);

    expect(missing).toHaveLength(1);
    expect(missing[0].Employee_ID).toBe('EMP001');
  });

  it('generates nothing at all for a role it was not scoped to', () => {
    const result = buildComplianceUniverse([], requirements, '2026-10-13', people);
    const maintenance = result.universe.filter(item => item.Department === 'Maintenance');

    expect(maintenance.map(item => item.Course_Code)).not.toContain('JSA');
  });
});
