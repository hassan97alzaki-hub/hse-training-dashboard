import { STATUS, COMPLIANT_STATUSES, EMPLOYMENT_STATUS, COMPLETION_STATUS } from './constants.js';
import { dateDiffDays, isValidDateStr } from './normalization.js';

// ============================================================
// STATUS DETERMINATION
// ============================================================

/**
 * Determine compliance status of a single completed training record.
 * Precondition: record.Completion_Status === 'Completed', mandatory requirement confirmed.
 *
 * Status boundaries (calendar days from asOfDate):
 *   EXPIRED      : days < 0  (expiry strictly before asOf)
 *   EXPIRING_30  : 0 ≤ days ≤ 30 (includes expiry on As Of Date)
 *   EXPIRING_60  : 31 ≤ days ≤ 60
 *   EXPIRING_90  : 61 ≤ days ≤ 90
 *   VALID        : days > 90  OR no expiry date (one-time training)
 */
export function determineCompletedStatus(expiryDateStr, asOfDateStr) {
  if (!expiryDateStr || !isValidDateStr(expiryDateStr)) return STATUS.VALID; // one-time training
  const days = dateDiffDays(expiryDateStr, asOfDateStr);
  if (days === null) return STATUS.VALID;
  if (days < 0) return STATUS.EXPIRED;
  if (days <= 30) return STATUS.EXPIRING_30;
  if (days <= 60) return STATUS.EXPIRING_60;
  if (days <= 90) return STATUS.EXPIRING_90;
  return STATUS.VALID;
}

// ============================================================
// DUPLICATE SELECTION POLICY
// ============================================================

/**
 * From a group of records for the same Employee_ID+Course_Code,
 * select the most relevant record for compliance:
 *   1. The record with the latest valid (not expired) Expiry_Date
 *   2. If all expired, the one with the latest Expiry_Date
 *   3. If no Expiry_Date, latest Issue_Date
 */
export function selectBestRecord(records, asOfDateStr) {
  if (records.length === 1) return records[0];

  const completed = records.filter(r => r.Completion_Status === COMPLETION_STATUS.COMPLETED);
  const pool = completed.length > 0 ? completed : records;

  // Sort: valid records (future expiry) first, then by expiry desc, then issue desc
  const sorted = [...pool].sort((a, b) => {
    const aDays = a.Expiry_Date ? dateDiffDays(a.Expiry_Date, asOfDateStr) : null;
    const bDays = b.Expiry_Date ? dateDiffDays(b.Expiry_Date, asOfDateStr) : null;
    const aValid = aDays !== null && aDays >= 0;
    const bValid = bDays !== null && bDays >= 0;
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (a.Expiry_Date && b.Expiry_Date) {
      if (a.Expiry_Date > b.Expiry_Date) return -1;
      if (a.Expiry_Date < b.Expiry_Date) return 1;
    }
    if (a.Issue_Date && b.Issue_Date) {
      if (a.Issue_Date > b.Issue_Date) return -1;
      if (a.Issue_Date < b.Issue_Date) return 1;
    }
    return 0;
  });
  return sorted[0];
}

// ============================================================
// COMPLIANCE UNIVERSE BUILDER
// ============================================================

/**
 * Build the full compliance universe:
 * - One item per active employee × mandatory requirement
 * - Connects existing records or generates MISSING items
 * - Handles duplicates (keeps best, flags rest)
 * - Identifies employees with no configured requirements
 *
 * Employees:
 * - `employeeList` omitted (CSV/XLSX training import, demo): employees are
 *   derived from the training records, first record per Employee_ID wins.
 *   This is the original behaviour.
 * - `employeeList` given (employee master, e.g. the three-sheet workbook):
 *   employees come ONLY from the list, so an active employee with no
 *   training record still gets MISSING items. Records are used only as
 *   training evidence.
 *
 * Returns:
 * {
 *   universe: ComplianceItem[],
 *   employees: { all, active, inactive, withMandatoryReqs, noMandatoryReqs, notConfigured },
 *   duplicates: { key, records }[],
 *   unconfiguredEmployees: Employee[],
 *   configWarnings: string[],
 * }
 */
export function buildComplianceUniverse(allRecords, requirements, asOfDateStr, employeeList) {
  // ── Step 1: Collect unique employees (from the master list, or from records)
  const employeeMap = new Map(); // Employee_ID → employee info (first entry wins)
  const allEmployees = [];
  const employeeSource = Array.isArray(employeeList) ? employeeList : allRecords;

  for (const rec of employeeSource) {
    const id = rec.Employee_ID;
    if (!id) continue;
    if (!employeeMap.has(id)) {
      const emp = {
        Employee_ID: id,
        Employee_Name: rec.Employee_Name,
        Department: rec.Department,
        Job_Title: rec.Job_Title,
        Employment_Status: rec.Employment_Status,
      };
      employeeMap.set(id, emp);
      allEmployees.push(emp);
    }
  }

  const activeEmployees = allEmployees.filter(
    e => e.Employment_Status === EMPLOYMENT_STATUS.ACTIVE
  );
  const inactiveEmployees = allEmployees.filter(
    e => e.Employment_Status !== EMPLOYMENT_STATUS.ACTIVE
  );

  // ── Step 2: Group all records by Employee_ID+Course_Code
  const recordGroups = new Map(); // "EMP|COURSE" → record[]
  for (const rec of allRecords) {
    if (!rec.Employee_ID || !rec.Course_Code) continue;
    const key = `${rec.Employee_ID}|${rec.Course_Code}`;
    if (!recordGroups.has(key)) recordGroups.set(key, []);
    recordGroups.get(key).push(rec);
  }

  // ── Step 3: Identify duplicates
  const duplicates = [];
  for (const [key, recs] of recordGroups.entries()) {
    if (recs.length > 1) duplicates.push({ key, records: recs });
  }

  // ── Step 4: For each active employee, look up mandatory requirements
  const universe = [];
  const configWarnings = [];
  const notConfigured = [];
  let withMandatoryReqs = 0;
  let noMandatoryReqs = 0;

  for (const emp of activeEmployees) {
    const roleReqs = requirements.filter(
      r => r.Department === emp.Department && r.Job_Title === emp.Job_Title
    );

    const mandatoryReqs = roleReqs.filter(r => r.Mandatory === true);

    if (roleReqs.length === 0) {
      // No rows at all in requirements matrix for this role
      notConfigured.push(emp);
      configWarnings.push(
        `${emp.Employee_Name} (${emp.Employee_ID}) — ${emp.Department}/${emp.Job_Title}: no requirements configured in matrix`
      );
      continue;
    }

    if (mandatoryReqs.length === 0) {
      // Role is in matrix but all entries are non-mandatory
      noMandatoryReqs++;
      // Add NOT_REQUIRED items for non-mandatory entries
      for (const req of roleReqs) {
        const groupKey = `${emp.Employee_ID}|${req.Course_Code}`;
        const recs = recordGroups.get(groupKey) || [];
        const record = recs.length > 0 ? selectBestRecord(recs, asOfDateStr) : null;
        universe.push({
          Employee_ID: emp.Employee_ID,
          Employee_Name: emp.Employee_Name,
          Department: emp.Department,
          Job_Title: emp.Job_Title,
          Employment_Status: emp.Employment_Status,
          Course_Code: req.Course_Code,
          Course_Name: req.Course_Name,
          Mandatory: false,
          Status: STATUS.NOT_REQUIRED,
          record,
          isDuplicate: recs.length > 1,
          isMissing: false,
          isNotRequired: true,
          daysRemaining: null,
          Validity_Months: req.Validity_Months,
        });
      }
      continue;
    }

    withMandatoryReqs++;

    // Generate one compliance item per mandatory requirement
    for (const req of mandatoryReqs) {
      const groupKey = `${emp.Employee_ID}|${req.Course_Code}`;
      const recs = recordGroups.get(groupKey) || [];

      if (recs.length === 0) {
        // MISSING
        universe.push({
          Employee_ID: emp.Employee_ID,
          Employee_Name: emp.Employee_Name,
          Department: emp.Department,
          Job_Title: emp.Job_Title,
          Employment_Status: emp.Employment_Status,
          Course_Code: req.Course_Code,
          Course_Name: req.Course_Name,
          Mandatory: true,
          Status: STATUS.MISSING,
          record: null,
          isDuplicate: false,
          isMissing: true,
          isNotRequired: false,
          daysRemaining: null,
          Validity_Months: req.Validity_Months,
        });
        continue;
      }

      const best = selectBestRecord(recs, asOfDateStr);
      let status;

      if (best.Completion_Status === COMPLETION_STATUS.IN_PROGRESS) {
        status = STATUS.IN_PROGRESS;
      } else if (best.Completion_Status === COMPLETION_STATUS.NOT_STARTED) {
        status = STATUS.NOT_STARTED;
      } else if (best.Completion_Status === COMPLETION_STATUS.COMPLETED) {
        status = determineCompletedStatus(best.Expiry_Date, asOfDateStr);
      } else {
        status = STATUS.NOT_STARTED;
      }

      const daysRemaining = best.Expiry_Date ? dateDiffDays(best.Expiry_Date, asOfDateStr) : null;

      universe.push({
        Employee_ID: emp.Employee_ID,
        Employee_Name: emp.Employee_Name,
        Department: emp.Department,
        Job_Title: emp.Job_Title,
        Employment_Status: emp.Employment_Status,
        Course_Code: req.Course_Code,
        Course_Name: req.Course_Name,
        Mandatory: true,
        Status: status,
        record: best,
        isDuplicate: recs.length > 1,
        isMissing: false,
        isNotRequired: false,
        daysRemaining,
        Validity_Months: req.Validity_Months,
        Issue_Date: best.Issue_Date,
        Expiry_Date: best.Expiry_Date,
        Certificate_Number: best.Certificate_Number,
        Training_Provider: best.Training_Provider,
        Remarks: best.Remarks,
      });
    }

    // Also add NOT_REQUIRED items for non-mandatory entries of this employee
    const nonMandatoryReqs = roleReqs.filter(r => r.Mandatory !== true);
    for (const req of nonMandatoryReqs) {
      const groupKey = `${emp.Employee_ID}|${req.Course_Code}`;
      const recs = recordGroups.get(groupKey) || [];
      const record = recs.length > 0 ? selectBestRecord(recs, asOfDateStr) : null;
      universe.push({
        Employee_ID: emp.Employee_ID,
        Employee_Name: emp.Employee_Name,
        Department: emp.Department,
        Job_Title: emp.Job_Title,
        Employment_Status: emp.Employment_Status,
        Course_Code: req.Course_Code,
        Course_Name: req.Course_Name,
        Mandatory: false,
        Status: STATUS.NOT_REQUIRED,
        record,
        isDuplicate: recs.length > 1,
        isMissing: false,
        isNotRequired: true,
        daysRemaining: null,
        Validity_Months: req.Validity_Months,
      });
    }
  }

  // ── Step 5: Raw records for inactive employees (not in universe, but available for table)
  const inactiveUniverse = [];
  for (const emp of inactiveEmployees) {
    const empRecs = allRecords.filter(r => r.Employee_ID === emp.Employee_ID);
    for (const rec of empRecs) {
      inactiveUniverse.push({
        Employee_ID: emp.Employee_ID,
        Employee_Name: emp.Employee_Name,
        Department: emp.Department,
        Job_Title: emp.Job_Title,
        Employment_Status: emp.Employment_Status,
        Course_Code: rec.Course_Code,
        Course_Name: rec.Course_Name,
        Mandatory: null,
        Status: null, // not tracked
        record: rec,
        isDuplicate: false,
        isMissing: false,
        isNotRequired: false,
        daysRemaining: null,
        Issue_Date: rec.Issue_Date,
        Expiry_Date: rec.Expiry_Date,
        Certificate_Number: rec.Certificate_Number,
        Training_Provider: rec.Training_Provider,
      });
    }
  }

  return {
    universe,
    inactiveUniverse,
    employees: {
      all: allEmployees,
      active: activeEmployees,
      inactive: inactiveEmployees,
      withMandatoryReqs,
      noMandatoryReqs,
      notConfigured: notConfigured.length,
    },
    duplicates,
    unconfiguredEmployees: notConfigured,
    configWarnings,
  };
}

// ============================================================
// KPI CALCULATIONS
// ============================================================

export function calculateKPIs(universe, employees, unconfiguredEmployees) {
  const mandatoryItems = universe.filter(i => i.Mandatory === true);

  // ── KPI 1: Requirement Compliance
  const totalMandatoryReqs = mandatoryItems.length;
  const compliantReqs = mandatoryItems.filter(i => COMPLIANT_STATUSES.has(i.Status)).length;
  const requirementCompliance = totalMandatoryReqs > 0
    ? Math.round((compliantReqs / totalMandatoryReqs) * 1000) / 10 // 1 decimal
    : 0;

  // ── KPI 2: Fully Compliant Employees
  // Denominator: active employees with at least 1 mandatory requirement
  const empWithMandatoryReqs = employees.withMandatoryReqs;
  let fullyCompliantCount = 0;
  const empIds = [...new Set(mandatoryItems.map(i => i.Employee_ID))];
  for (const empId of empIds) {
    const empItems = mandatoryItems.filter(i => i.Employee_ID === empId);
    if (empItems.every(i => COMPLIANT_STATUSES.has(i.Status))) fullyCompliantCount++;
  }
  const fullyCompliantPct = empWithMandatoryReqs > 0
    ? Math.round((fullyCompliantCount / empWithMandatoryReqs) * 1000) / 10
    : 0;

  // ── Status counts (mandatory items only)
  const statusCounts = {};
  for (const s of Object.values(STATUS)) statusCounts[s] = 0;
  for (const item of mandatoryItems) {
    if (statusCounts[item.Status] !== undefined) statusCounts[item.Status]++;
  }

  // ── KPI 3: Department Compliance
  const deptMap = new Map();
  for (const item of mandatoryItems) {
    if (!deptMap.has(item.Department)) deptMap.set(item.Department, { total: 0, compliant: 0 });
    const d = deptMap.get(item.Department);
    d.total++;
    if (COMPLIANT_STATUSES.has(item.Status)) d.compliant++;
  }
  const departmentCompliance = [...deptMap.entries()].map(([dept, d]) => ({
    department: dept,
    total: d.total,
    compliant: d.compliant,
    nonCompliant: d.total - d.compliant,
    percentage: d.total > 0 ? Math.round((d.compliant / d.total) * 1000) / 10 : 0,
  })).sort((a, b) => a.percentage - b.percentage);

  // ── KPI 4: Course Compliance
  const courseMap = new Map();
  for (const item of mandatoryItems) {
    if (!courseMap.has(item.Course_Code)) {
      courseMap.set(item.Course_Code, {
        course_code: item.Course_Code,
        course_name: item.Course_Name,
        required: new Set(),
        compliant: new Set(),
      });
    }
    const c = courseMap.get(item.Course_Code);
    c.required.add(item.Employee_ID);
    if (COMPLIANT_STATUSES.has(item.Status)) c.compliant.add(item.Employee_ID);
  }
  const courseCompliance = [...courseMap.values()].map(c => ({
    course_code: c.course_code,
    course_name: c.course_name,
    employeesRequired: c.required.size,
    compliant: c.compliant.size,
    nonCompliant: c.required.size - c.compliant.size,
    percentage: c.required.size > 0 ? Math.round((c.compliant.size / c.required.size) * 1000) / 10 : 0,
  })).sort((a, b) => a.percentage - b.percentage);

  return {
    totalActiveEmployees: employees.active.length,
    employeesWithMandatoryReqs: empWithMandatoryReqs,
    employeesNoMandatoryReqs: employees.noMandatoryReqs,
    employeesNotConfigured: unconfiguredEmployees.length,
    totalMandatoryReqs,
    compliantReqs,
    requirementCompliance,
    fullyCompliantCount,
    fullyCompliantPct,
    empWithMandatoryReqs,
    statusCounts,
    departmentCompliance,
    courseCompliance,
  };
}

// ============================================================
// PRIORITY ACTIONS
// ============================================================

export function getPriorityActions(universe) {
  const actions = [];

  for (const item of universe) {
    if (!item.Mandatory) continue;
    if (COMPLIANT_STATUSES.has(item.Status)) continue;

    let priority, actionKey;
    if (item.Status === STATUS.EXPIRED) {
      priority = 'Critical';
      actionKey = 'renewImmediately';
    } else if (item.Status === STATUS.MISSING) {
      priority = 'Critical';
      actionKey = 'startTraining';
    } else if (item.Status === STATUS.NOT_STARTED) {
      priority = 'High';
      actionKey = 'startTraining';
    } else if (item.Status === STATUS.IN_PROGRESS) {
      priority = 'Medium';
      actionKey = 'completePending';
    } else {
      priority = 'Low';
      actionKey = 'scheduleRenewal';
    }

    actions.push({
      Employee_ID: item.Employee_ID,
      Employee_Name: item.Employee_Name,
      Department: item.Department,
      Job_Title: item.Job_Title,
      Course_Code: item.Course_Code,
      Course_Name: item.Course_Name,
      Status: item.Status,
      Expiry_Date: item.Expiry_Date || '',
      daysRemaining: item.daysRemaining,
      priority,
      actionKey,
    });
  }

  // Sort: Critical first, then High, Medium, Low; within same priority by days remaining asc
  const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  actions.sort((a, b) => {
    const po = order[a.priority] - order[b.priority];
    if (po !== 0) return po;
    const aDays = a.daysRemaining ?? -999;
    const bDays = b.daysRemaining ?? -999;
    return aDays - bDays;
  });

  return actions;
}
