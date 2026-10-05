import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATUS, DEMO_AS_OF_DATE, REPORTING_TIME_ZONE } from '../src/lib/constants.js';
import { toReportingDateStr, getRuntimeAsOfDate } from '../src/lib/clock.js';
import { dateDiffDays } from '../src/lib/normalization.js';
import { determineCompletedStatus, buildComplianceUniverse, calculateKPIs } from '../src/lib/complianceEngine.js';
import { TRAINING_RECORDS, REQUIREMENTS, EXPECTED, AS_OF } from './fixtures/records.js';

// Add N calendar days to a YYYY-MM-DD string (UTC arithmetic, no device zone).
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ============================================================
// Demo constant vs runtime date
// ============================================================
describe('demo As Of Date is separate from runtime date', () => {
  it('demo date is the fixed fixture date', () => {
    expect(DEMO_AS_OF_DATE).toBe('2026-07-26');
    expect(AS_OF).toBe(DEMO_AS_OF_DATE);
  });
  it('reporting time zone is Asia/Riyadh', () => {
    expect(REPORTING_TIME_ZONE).toBe('Asia/Riyadh');
  });
  it('runtime date follows the injected instant, not the demo constant', () => {
    expect(getRuntimeAsOfDate(new Date('2030-03-15T10:00:00Z'))).toBe('2030-03-15');
  });
  it('demo date passed explicitly reproduces the verified KPI results', () => {
    const cr = buildComplianceUniverse(TRAINING_RECORDS, REQUIREMENTS, DEMO_AS_OF_DATE);
    const kpis = calculateKPIs(cr.universe, cr.employees, cr.unconfiguredEmployees);
    expect(kpis.requirementCompliance).toBe(EXPECTED.requirementCompliance);
    expect(kpis.statusCounts[STATUS.EXPIRED]).toBe(4);
  });
  it('a different runtime date changes results (date is an input, not hardcoded)', () => {
    const runtime = '2026-08-26'; // 31 days after demo date
    const cr = buildComplianceUniverse(TRAINING_RECORDS, REQUIREMENTS, runtime);
    const kpis = calculateKPIs(cr.universe, cr.employees, cr.unconfiguredEmployees);
    expect(kpis.statusCounts[STATUS.EXPIRED]).toBeGreaterThan(4);
    const ptw = cr.universe.find(i => i.Employee_ID === 'EMP0003' && i.Course_Code === 'PTW001');
    expect(ptw.Status).toBe(STATUS.EXPIRED); // expiry 2026-07-26 is 31 days in the past
  });
});

// ============================================================
// Expiry-day rule: valid THROUGH the expiry date, expired the next day
// ============================================================
describe('expiry day rule', () => {
  const EXPIRY = '2026-07-26';
  it('day before expiry — EXPIRING_30 (1 day left)', () => {
    expect(determineCompletedStatus(EXPIRY, '2026-07-25')).toBe(STATUS.EXPIRING_30);
  });
  it('expiry day itself — still compliant, EXPIRING_30 (0 days left)', () => {
    expect(determineCompletedStatus(EXPIRY, '2026-07-26')).toBe(STATUS.EXPIRING_30);
  });
  it('day after expiry — EXPIRED (-1 day)', () => {
    expect(determineCompletedStatus(EXPIRY, '2026-07-27')).toBe(STATUS.EXPIRED);
  });
});

// ============================================================
// 30 / 60 / 90 day boundaries at several As Of Dates
// ============================================================
describe.each([
  ['demo date', '2026-07-26'],
  ['runtime-style date', '2026-10-06'],
  ['leap day', '2028-02-29'],
  ['year end', '2026-12-31'],
])('status boundaries relative to %s', (_label, asOf) => {
  const cases = [
    [-1, STATUS.EXPIRED],
    [0, STATUS.EXPIRING_30],
    [30, STATUS.EXPIRING_30],
    [31, STATUS.EXPIRING_60],
    [60, STATUS.EXPIRING_60],
    [61, STATUS.EXPIRING_90],
    [90, STATUS.EXPIRING_90],
    [91, STATUS.VALID],
  ];
  it.each(cases)('expiry = asOf %i days → %s', (offset, expected) => {
    expect(determineCompletedStatus(addDays(asOf, offset), asOf)).toBe(expected);
  });
});

// ============================================================
// Month end and leap year arithmetic
// ============================================================
describe('month end and leap year', () => {
  it('28 Feb → 29 Feb in a leap year is 1 day', () => {
    expect(dateDiffDays('2028-02-29', '2028-02-28')).toBe(1);
  });
  it('28 Feb → 1 Mar in a non-leap year is 1 day', () => {
    expect(dateDiffDays('2027-03-01', '2027-02-28')).toBe(1);
  });
  it('28 Feb → 1 Mar in a leap year is 2 days', () => {
    expect(dateDiffDays('2028-03-01', '2028-02-28')).toBe(2);
  });
  it('31 Dec → 1 Jan is 1 day', () => {
    expect(dateDiffDays('2027-01-01', '2026-12-31')).toBe(1);
  });
  it('31 Jan → 28 Feb is 28 days', () => {
    expect(dateDiffDays('2027-02-28', '2027-01-31')).toBe(28);
  });
  it('leap year has 365 days between 1 Jan and 31 Dec; 366 in a full year', () => {
    expect(dateDiffDays('2028-12-31', '2028-01-01')).toBe(365);
    expect(dateDiffDays('2029-01-01', '2028-01-01')).toBe(366);
    expect(dateDiffDays('2027-01-01', '2026-01-01')).toBe(365);
  });
  it('expiry on 29 Feb 2028 with As Of 28 Feb 2028 → EXPIRING_30; with As Of 1 Mar → EXPIRED', () => {
    expect(determineCompletedStatus('2028-02-29', '2028-02-28')).toBe(STATUS.EXPIRING_30);
    expect(determineCompletedStatus('2028-02-29', '2028-02-29')).toBe(STATUS.EXPIRING_30);
    expect(determineCompletedStatus('2028-02-29', '2028-03-01')).toBe(STATUS.EXPIRED);
  });
});

// ============================================================
// Reporting day: Asia/Riyadh (UTC+3), independent of device time zone
// ============================================================
describe('reporting day in Asia/Riyadh', () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
    vi.useRealTimers();
  });

  it('23:59:59 Riyadh is still the same day', () => {
    expect(toReportingDateStr(new Date('2026-07-25T20:59:59Z'))).toBe('2026-07-25');
  });
  it('00:00:00 Riyadh starts the next day', () => {
    expect(toReportingDateStr(new Date('2026-07-25T21:00:00Z'))).toBe('2026-07-26');
  });
  it('year rollover', () => {
    expect(toReportingDateStr(new Date('2026-12-31T20:59:59Z'))).toBe('2026-12-31');
    expect(toReportingDateStr(new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01');
  });
  it('leap day rollover', () => {
    expect(toReportingDateStr(new Date('2028-02-28T21:00:00Z'))).toBe('2028-02-29');
    expect(toReportingDateStr(new Date('2028-02-29T21:00:00Z'))).toBe('2028-03-01');
    expect(toReportingDateStr(new Date('2027-02-28T21:00:00Z'))).toBe('2027-03-01');
  });
  it('explicit time zone argument is honoured', () => {
    expect(toReportingDateStr(new Date('2026-07-25T21:00:00Z'), 'UTC')).toBe('2026-07-25');
  });

  const instants = ['2026-07-25T20:59:59Z', '2026-07-25T21:00:00Z', '2026-12-31T21:00:00Z', '2028-02-29T21:00:00Z'];
  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Riyadh', 'Europe/London'])(
    'runtime As Of Date does not depend on device time zone (%s)',
    (tz) => {
      process.env.TZ = tz;
      const results = instants.map(i => getRuntimeAsOfDate(new Date(i)));
      expect(results).toEqual(['2026-07-25', '2026-07-26', '2027-01-01', '2028-03-01']);
    },
  );

  it('test is sensitive: a naive device-local date WOULD differ under UTC+14', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    const naive = new Date('2026-07-25T20:59:59Z').getDate();
    expect(naive).toBe(26); // device says 26th; Riyadh says 25th
    expect(getRuntimeAsOfDate(new Date('2026-07-25T20:59:59Z'))).toBe('2026-07-25');
  });

  it('compliance results do not change with device time zone or system clock', () => {
    const run = () => {
      const cr = buildComplianceUniverse(TRAINING_RECORDS, REQUIREMENTS, DEMO_AS_OF_DATE);
      return JSON.stringify(calculateKPIs(cr.universe, cr.employees, cr.unconfiguredEmployees));
    };
    process.env.TZ = 'UTC';
    vi.useFakeTimers(); vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const a = run();
    process.env.TZ = 'Pacific/Kiritimati';
    vi.setSystemTime(new Date('2035-06-30T23:59:59Z'));
    const b = run();
    process.env.TZ = 'America/Los_Angeles';
    vi.setSystemTime(new Date('2026-07-26T03:00:00Z'));
    const c = run();
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});

// ============================================================
// Guard: logic modules must not read the system clock
// ============================================================
describe('logic modules do not read the system clock', () => {
  it.each(['src/lib/complianceEngine.js', 'src/lib/normalization.js'])('%s', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/new Date\(\s*\)/);
  });
});
