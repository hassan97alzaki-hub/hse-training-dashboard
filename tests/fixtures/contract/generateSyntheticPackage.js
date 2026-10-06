/**
 * Deterministic generator of a synthetic `HSE-DC-1.0` production package.
 *
 * Everything here is fictional and uses reserved values only: organization
 * `TST-ORG`, employee codes `TST-0001…`, names `Test Employee 001…`, source
 * system `TEST-LMS`, record ids `TR-000001…`, certificates `TST-CERT-000001…`,
 * emails in `example.invalid` and phone numbers under the unassigned country
 * code 999. No national id, iqama, date of birth or nationality is produced.
 *
 * The generator reads no clock, no time zone, no file and no network. The same
 * seed and the same arguments always produce a deep-equal package, and the
 * expected engine results are declared in `expected` so the tests assert fixed
 * numbers instead of recomputing them.
 */

import { addCalendarMonths } from '../../../src/lib/normalization.js';

/** Documented default seed: the fixed As Of Date written as digits. */
export const DEFAULT_SEED = 20270112;

/** Fixed dates of the fixtures. Nothing is derived from the current date. */
export const FIXED_DATES = Object.freeze({
  asOfDate: '2027-01-12',
  extractDate: '2027-01-10',
  requirementsEffectiveFrom: '2027-01-01',
  approvedAt: '2027-01-11T08:00:00.000Z',
  approvedOn: '2026-12-15',
});

export const ORGANIZATION_CODE = 'TST-ORG';
export const SOURCE_SYSTEM = 'TEST-LMS';

export const DEPARTMENT_CODES = Object.freeze(['OPS', 'MNT', 'LOG']);
export const JOB_TITLE_CODES = Object.freeze(['OPR', 'SUP', 'TEC']);
export const COURSE_CODES = Object.freeze(['H2S-01', 'FA-01', 'PTW-01', 'WAH-01']);

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

/** mulberry32: a small deterministic generator. No system randomness is used. */
function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Add calendar days to `YYYY-MM-DD` with UTC arithmetic only. */
export function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const pad = (value, width) => String(value).padStart(width, '0');

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

const DEPARTMENT_NAMES = Object.freeze({
  OPS: 'Test Operations',
  MNT: 'Test Maintenance',
  LOG: 'Test Logistics',
});

const JOB_TITLE_NAMES = Object.freeze({
  OPR: 'Test Operator',
  SUP: 'Test Supervisor',
  TEC: 'Test Technician',
});

const COURSE_NAMES = Object.freeze({
  'H2S-01': 'Test H2S Awareness',
  'FA-01': 'Test First Aid',
  'PTW-01': 'Test Permit To Work',
  'WAH-01': 'Test Work At Height',
});

/**
 * The course suggestion is help only. It is set to the official validity of the
 * matrix so the sound package carries no `SUGGESTED_VALIDITY_DIFFERS` note.
 */
const COURSE_SUGGESTED_VALIDITY = Object.freeze({
  'H2S-01': 24,
  'FA-01': 24,
  'PTW-01': 12,
  'WAH-01': 36,
});

/** Requirements per job title: the same matrix for every department. */
const ROLE_MATRIX = Object.freeze({
  OPR: Object.freeze([
    { course_code: 'H2S-01', requirement_type: 'Mandatory', validity_months: 24 },
    { course_code: 'PTW-01', requirement_type: 'Mandatory', validity_months: 12 },
  ]),
  SUP: Object.freeze([
    { course_code: 'H2S-01', requirement_type: 'Mandatory', validity_months: 24 },
    { course_code: 'FA-01', requirement_type: 'Mandatory', validity_months: 24 },
    { course_code: 'WAH-01', requirement_type: 'Recommended', validity_months: 36 },
  ]),
  TEC: Object.freeze([
    { course_code: 'H2S-01', requirement_type: 'Mandatory', validity_months: 24 },
    { course_code: 'WAH-01', requirement_type: 'Mandatory', validity_months: 36 },
    { course_code: 'FA-01', requirement_type: 'Recommended', validity_months: 24 },
  ]),
});

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */

/**
 * One scenario per mandatory compliance item. `status` is the engine status the
 * scenario must produce at the As Of Date, so the tests compare the engine with
 * a declared expectation instead of with a second implementation.
 */
export const SCENARIOS = Object.freeze({
  valid: { status: 'VALID', records: 1 },
  expiring30_day0: { status: 'EXPIRING_30', records: 1 },
  expiring30_day15: { status: 'EXPIRING_30', records: 1 },
  expired: { status: 'EXPIRED', records: 1 },
  in_progress: { status: 'IN_PROGRESS', records: 1 },
  not_started: { status: 'NOT_STARTED', records: 1 },
  missing: { status: 'MISSING', records: 0 },
  // A renewal: two different source_record_ids, the older one expired.
  renewal: { status: 'VALID', records: 2 },
});

const SCENARIO_ORDER = Object.freeze([
  'valid',
  'valid',
  'valid',
  'expiring30_day0',
  'expiring30_day15',
  'expired',
  'in_progress',
  'not_started',
  'missing',
  'renewal',
]);

/** The official validity of a requirement entry, in months. */
function validityMonthsOf(entry) {
  return entry.validity_months;
}

/** Employment status of employee number `index` (1-based), fixed by position. */
function employmentStatusOf(index) {
  if (index % 50 === 0) return 'Left';
  if (index % 25 === 0) return 'Inactive';
  return 'Active';
}

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

/**
 * Build a complete synthetic `full` package.
 *
 * Returns `{ seed, asOfDate, contract, approval, departments, jobTitles,
 * courses, employees, requirements, trainingRecords, secondBatchRecords,
 * expected }`. `secondBatchRecords` is a separate later batch that creates a
 * second version of one record; a single batch may not carry two versions of
 * one key, because that is `KEY_DUPLICATE`.
 */
export function generateSyntheticFullPackage({
  employeeCount = 500,
  seed = DEFAULT_SEED,
  asOfDate = FIXED_DATES.asOfDate,
  extractDate = FIXED_DATES.extractDate,
  requirementsEffectiveFrom = FIXED_DATES.requirementsEffectiveFrom,
} = {}) {
  const random = createRandom(seed);

  const departments = DEPARTMENT_CODES.map((code) => ({
    department_code: code,
    name_en: DEPARTMENT_NAMES[code],
    name_ar: DEPARTMENT_NAMES[code],
    active: 'Yes',
  }));

  const jobTitles = JOB_TITLE_CODES.map((code) => ({
    job_title_code: code,
    name_en: JOB_TITLE_NAMES[code],
    name_ar: JOB_TITLE_NAMES[code],
    department_code: '',
    active: 'Yes',
  }));

  const courses = COURSE_CODES.map((code) => ({
    course_code: code,
    name_en: COURSE_NAMES[code],
    name_ar: COURSE_NAMES[code],
    category: 'Test Category',
    regulatory_reference: 'TST-REG-0001',
    suggested_validity_months: COURSE_SUGGESTED_VALIDITY[code],
  }));

  const requirements = [];
  for (const department of DEPARTMENT_CODES) {
    for (const title of JOB_TITLE_CODES) {
      for (const entry of ROLE_MATRIX[title]) {
        requirements.push({
          department_code: department,
          job_title_code: title,
          course_code: entry.course_code,
          requirement_type: entry.requirement_type,
          validity_months: entry.validity_months,
          effective_from: requirementsEffectiveFrom,
          effective_to: '',
          approval_reference: 'TRN-DEC-0001',
          approved_by_role: 'Training Manager',
          approved_on: FIXED_DATES.approvedOn,
          source: 'approved',
        });
      }
    }
  }

  const employees = [];
  const trainingRecords = [];
  const statusCounts = {
    VALID: 0,
    EXPIRING_30: 0,
    EXPIRED: 0,
    IN_PROGRESS: 0,
    NOT_STARTED: 0,
    MISSING: 0,
    NOT_REQUIRED: 0,
  };
  const scenarioCounts = Object.fromEntries(Object.keys(SCENARIOS).map((name) => [name, 0]));
  const employmentCounts = { Active: 0, Inactive: 0, Left: 0 };
  let recordNumber = 0;
  let certificateNumber = 0;
  let employeesWithoutRecords = 0;
  const renewalGroups = [];

  const nextRecordId = () => `TR-${pad(++recordNumber, 6)}`;
  const nextCertificate = () => `TST-CERT-${pad(++certificateNumber, 6)}`;

  for (let index = 1; index <= employeeCount; index += 1) {
    const code = `TST-${pad(index, 4)}`;
    const department = DEPARTMENT_CODES[index % DEPARTMENT_CODES.length];
    const title = JOB_TITLE_CODES[Math.floor((index - 1) / 3) % JOB_TITLE_CODES.length];
    const employmentStatus = employmentStatusOf(index);
    employmentCounts[employmentStatus] += 1;

    employees.push({
      employee_code: code,
      badge_number: `TST-B-${pad(index, 4)}`,
      full_name: `Test Employee ${pad(index, 3)}`,
      full_name_ar: `موظف اختبار ${pad(index, 3)}`,
      department_code: department,
      job_title_code: title,
      employment_status: employmentStatus,
      status_effective_date: employmentStatus === 'Active' ? '' : '2026-12-31',
      hire_date: addDays('2020-01-01', (index * 7) % 1800),
      site_code: `SITE-${(index % 3) + 1}`,
    });

    const roleEntries = ROLE_MATRIX[title];
    const mandatory = roleEntries.filter((entry) => entry.requirement_type === 'Mandatory');
    const recommended = roleEntries.filter((entry) => entry.requirement_type !== 'Mandatory');
    let recordsForEmployee = 0;

    for (const entry of mandatory) {
      // The first employees take every scenario in order, so the edge cases are
      // always present; the rest are drawn from the seeded generator.
      const scenarioName =
        index <= SCENARIO_ORDER.length
          ? SCENARIO_ORDER[index - 1]
          : SCENARIO_ORDER[Math.floor(random() * SCENARIO_ORDER.length)];
      const scenario = SCENARIOS[scenarioName];

      if (employmentStatus === 'Active') {
        scenarioCounts[scenarioName] += 1;
        statusCounts[scenario.status] += 1;
      }

      const base = {
        // `source_system` is a `_Contract` field, not a column of the sheet.
        employee_code: code,
        course_code: entry.course_code,
        training_provider: 'Test Provider',
        remarks: '',
      };

      if (scenarioName === 'missing') continue;

      if (scenarioName === 'in_progress' || scenarioName === 'not_started') {
        trainingRecords.push({
          ...base,
          source_record_id: nextRecordId(),
          completion_status: scenarioName === 'in_progress' ? 'In Progress' : 'Not Started',
          completion_date: '',
          expiry_date: '',
          certificate_number: '',
        });
        recordsForEmployee += 1;
        continue;
      }

      const expiryOffset = {
        valid: 200,
        expiring30_day0: 0,
        expiring30_day15: 15,
        expired: -40,
        renewal: 300,
      }[scenarioName];

      if (scenarioName === 'renewal') {
        // The older certificate expired, the renewal is valid; both are kept.
        trainingRecords.push({
          ...base,
          source_record_id: nextRecordId(),
          completion_status: 'Completed',
          completion_date: addCalendarMonths(addDays(asOfDate, -70), -validityMonthsOf(entry)),
          expiry_date: addDays(asOfDate, -70),
          certificate_number: nextCertificate(),
        });
        renewalGroups.push(`${code}|${entry.course_code}`);
        recordsForEmployee += 1;
      }

      const expiry = addDays(asOfDate, expiryOffset);
      trainingRecords.push({
        ...base,
        source_record_id: nextRecordId(),
        completion_status: 'Completed',
        // The completion date is the expiry minus the official validity in
        // calendar months, so the sound package carries no mismatch warning.
        // The expiry itself is taken as given and never recalculated.
        completion_date: addCalendarMonths(expiry, -validityMonthsOf(entry)),
        expiry_date: expiry,
        certificate_number: nextCertificate(),
      });
      recordsForEmployee += 1;
    }

    if (employmentStatus === 'Active') statusCounts.NOT_REQUIRED += recommended.length;

    // A non-active employee keeps one historical record, which produces no
    // compliance item. The course is outside the mandatory set of the role, so
    // it never joins a renewal group of the same employee and course.
    if (employmentStatus !== 'Active') {
      trainingRecords.push({
        source_record_id: nextRecordId(),
        employee_code: code,
        course_code: title === 'OPR' ? 'FA-01' : 'PTW-01',
        completion_status: 'Completed',
        completion_date: addCalendarMonths(addDays(asOfDate, 200), -24),
        expiry_date: addDays(asOfDate, 200),
        certificate_number: nextCertificate(),
        training_provider: 'Test Provider',
        remarks: '',
      });
      recordsForEmployee += 1;
    }

    if (recordsForEmployee === 0) employeesWithoutRecords += 1;
  }

  // A later batch that corrects one record, so the preparation layer has two
  // versions of one logical record to choose from.
  const secondBatchRecords =
    trainingRecords.length > 0
      ? [{ ...trainingRecords[0], remarks: 'Corrected in a later batch' }]
      : [];

  const mandatoryItems = Object.entries(statusCounts)
    .filter(([status]) => status !== 'NOT_REQUIRED')
    .reduce((total, [, value]) => total + value, 0);
  const compliant = statusCounts.VALID + statusCounts.EXPIRING_30;

  return Object.freeze({
    seed,
    asOfDate,
    contract: Object.freeze({
      contract_version: 'HSE-DC-1.0',
      package_type: 'full',
      organization_code: ORGANIZATION_CODE,
      source_system: SOURCE_SYSTEM,
      extract_date: extractDate,
      prepared_by_role: 'Training Coordinator',
      requirements_effective_from: requirementsEffectiveFrom,
    }),
    approval: Object.freeze({
      batchId: `TST-BATCH-${seed}`,
      preparedByRole: 'Training Coordinator',
      approvedByRole: 'Training Manager',
      approvedAt: FIXED_DATES.approvedAt,
    }),
    departments,
    jobTitles,
    courses,
    employees,
    requirements,
    trainingRecords,
    secondBatchRecords,
    expected: Object.freeze({
      employees: employeeCount,
      employmentCounts: Object.freeze(employmentCounts),
      departments: departments.length,
      jobTitles: jobTitles.length,
      courses: courses.length,
      requirements: requirements.length,
      trainingRecords: trainingRecords.length,
      employeesWithoutRecords,
      renewalGroups: Object.freeze([...renewalGroups]),
      renewalRecords: renewalGroups.length,
      scenarioCounts: Object.freeze(scenarioCounts),
      statusCounts: Object.freeze(statusCounts),
      mandatoryItems,
      complianceItems: mandatoryItems + statusCounts.NOT_REQUIRED,
      compliantMandatoryItems: compliant,
      requirementCompliance: mandatoryItems > 0 ? Math.round((compliant / mandatoryItems) * 1000) / 10 : 0,
    }),
  });
}
