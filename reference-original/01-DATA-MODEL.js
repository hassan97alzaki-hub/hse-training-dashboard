/**
 * HSE Training Compliance Dashboard - Data Model
 * 
 * Defines the correct data structure, validation rules,
 * and compliance calculation logic.
 * 
 * NO random data generation.
 * NO mock calculations.
 * ONLY validated real data.
 */

// ============================================
// TRAINING RECORD SCHEMA
// ============================================

/**
 * Each training record must contain:
 */
const TRAINING_RECORD_SCHEMA = {
  Employee_ID: "string (required)",
  Employee_Name: "string (required)",
  Department: "string (required)",
  Job_Title: "string (required)",
  Employment_Status: "enum: ['Active', 'Inactive', 'Left']",
  Course_Name: "string (required)",
  Course_Code: "string (required)",
  Training_Required: "boolean",
  Completion_Status: "enum: ['Completed', 'In Progress', 'Not Started']",
  Issue_Date: "YYYY-MM-DD format",
  Expiry_Date: "YYYY-MM-DD format",
  Certificate_Number: "string (optional)",
  Training_Provider: "string (optional)",
  Remarks: "string (optional)",
};

// ============================================
// TRAINING REQUIREMENTS SCHEMA
// ============================================

/**
 * Matrix of which courses are required by department/job role
 */
const REQUIREMENTS_SCHEMA = {
  Department: "string (required)",
  Job_Title: "string (required)",
  Course_Code: "string (required)",
  Course_Name: "string (required)",
  Mandatory: "boolean (required)",
  Validity_Months: "number (required)",
  Description: "string (optional)",
};

// ============================================
// STATUS DEFINITIONS
// ============================================

const TRAINING_STATUS = {
  VALID: "Compliant - valid until expiry date",
  EXPIRING_90: "Expiring within 90 days",
  EXPIRING_60: "Expiring within 60 days",
  EXPIRING_30: "Expiring within 30 days",
  EXPIRED: "Certificate has expired",
  MISSING: "Required training not completed",
  NOT_REQUIRED: "Not required for this role",
  IN_PROGRESS: "Training in progress",
};

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate a single training record
 */
function validateTrainingRecord(record) {
  const errors = [];

  // Check required fields
  if (!record.Employee_ID || typeof record.Employee_ID !== "string") {
    errors.push("Invalid or missing Employee_ID");
  }
  if (!record.Employee_Name || typeof record.Employee_Name !== "string") {
    errors.push("Invalid or missing Employee_Name");
  }
  if (!record.Department || typeof record.Department !== "string") {
    errors.push("Invalid or missing Department");
  }
  if (!record.Job_Title || typeof record.Job_Title !== "string") {
    errors.push("Invalid or missing Job_Title");
  }
  if (!record.Course_Name || typeof record.Course_Name !== "string") {
    errors.push("Invalid or missing Course_Name");
  }
  if (!record.Course_Code || typeof record.Course_Code !== "string") {
    errors.push("Invalid or missing Course_Code");
  }

  // Validate dates
  if (record.Issue_Date) {
    if (!isValidDate(record.Issue_Date)) {
      errors.push(`Invalid Issue_Date format: ${record.Issue_Date}`);
    }
  }

  if (record.Expiry_Date) {
    if (!isValidDate(record.Expiry_Date)) {
      errors.push(`Invalid Expiry_Date format: ${record.Expiry_Date}`);
    }
  }

  // Check if Issue_Date is before Expiry_Date
  if (record.Issue_Date && record.Expiry_Date) {
    const issueDate = new Date(record.Issue_Date);
    const expiryDate = new Date(record.Expiry_Date);
    if (issueDate >= expiryDate) {
      errors.push("Issue_Date must be before Expiry_Date");
    }
  }

  // Validate Employment_Status
  const validStatuses = ["Active", "Inactive", "Left"];
  if (
    record.Employment_Status &&
    !validStatuses.includes(record.Employment_Status)
  ) {
    errors.push(
      `Invalid Employment_Status: ${record.Employment_Status}. Must be one of: ${validStatuses.join(", ")}`
    );
  }

  // Validate Completion_Status
  const validCompletionStatuses = ["Completed", "In Progress", "Not Started"];
  if (
    record.Completion_Status &&
    !validCompletionStatuses.includes(record.Completion_Status)
  ) {
    errors.push(
      `Invalid Completion_Status: ${record.Completion_Status}. Must be one of: ${validCompletionStatuses.join(", ")}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    record: record,
  };
}

/**
 * Check if date string is valid YYYY-MM-DD
 */
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

/**
 * Detect duplicate records (same employee, same course)
 */
function detectDuplicates(records) {
  const seen = new Map();
  const duplicates = [];

  records.forEach((record) => {
    const key = `${record.Employee_ID}|${record.Course_Code}`;

    if (seen.has(key)) {
      duplicates.push({
        employee: record.Employee_ID,
        course: record.Course_Code,
        records: [seen.get(key), record],
      });
    } else {
      seen.set(key, record);
    }
  });

  return duplicates;
}

// ============================================
// COMPLIANCE CALCULATION ENGINE
// ============================================

/**
 * Determine the status of a single training record
 * Based on: issue date, expiry date, completion status, requirements
 */
function determineTrainingStatus(record, requirements, asOfDate = new Date()) {
  // If not marked as required, it's not applicable
  if (record.Training_Required === false) {
    return TRAINING_STATUS.NOT_REQUIRED;
  }

  // If training not yet completed
  if (
    record.Completion_Status === "In Progress" ||
    record.Completion_Status === "Not Started"
  ) {
    return TRAINING_STATUS.IN_PROGRESS;
  }

  // No expiry date = assume valid (one-time training)
  if (!record.Expiry_Date) {
    return TRAINING_STATUS.VALID;
  }

  const expiryDate = new Date(record.Expiry_Date);

  // If expired
  if (asOfDate > expiryDate) {
    return TRAINING_STATUS.EXPIRED;
  }

  // Calculate days until expiry
  const daysUntilExpiry = Math.ceil(
    (expiryDate - asOfDate) / (1000 * 60 * 60 * 24)
  );

  // If expiring within 30 days
  if (daysUntilExpiry <= 30) {
    return TRAINING_STATUS.EXPIRING_30;
  }

  // If expiring within 60 days
  if (daysUntilExpiry <= 60) {
    return TRAINING_STATUS.EXPIRING_60;
  }

  // If expiring within 90 days
  if (daysUntilExpiry <= 90) {
    return TRAINING_STATUS.EXPIRING_90;
  }

  // Otherwise, valid
  return TRAINING_STATUS.VALID;
}

/**
 * Identify missing required training for an employee
 */
function identifyMissingTraining(
  employeeId,
  department,
  jobTitle,
  allRecords,
  requirementsMatrix
) {
  // Find requirements for this role
  const roleRequirements = requirementsMatrix.filter(
    (req) => req.Department === department && req.Job_Title === jobTitle
  );

  // Find records for this employee
  const employeeRecords = allRecords.filter(
    (rec) => rec.Employee_ID === employeeId
  );

  const missingTraining = [];

  roleRequirements.forEach((requirement) => {
    const hasRecord = employeeRecords.find(
      (rec) => rec.Course_Code === requirement.Course_Code
    );

    if (!hasRecord && requirement.Mandatory) {
      missingTraining.push({
        course_code: requirement.Course_Code,
        course_name: requirement.Course_Name,
        mandatory: requirement.Mandatory,
        reason: "No training record found",
      });
    }
  });

  return missingTraining;
}

// ============================================
// KPI CALCULATIONS (CORRECT DEFINITIONS)
// ============================================

/**
 * KPI 1: Training Record Compliance
 *
 * Definition:
 * (Count of compliant required records) ÷ (Total required records)
 *
 * A record is "compliant" if:
 * - It's marked as Training_Required = true
 * - It's marked as Completion_Status = "Completed"
 * - Its status is VALID (not expired, not expiring soon)
 * - The employee is Active
 *
 * Example:
 * 150 records are marked as required.
 * 120 of those are currently valid (not expired, not expiring <30 days).
 * Compliance = 120 / 150 = 80%
 */
function calculateTrainingRecordCompliance(records, asOfDate = new Date()) {
  // Filter only required training records
  const requiredRecords = records.filter(
    (r) =>
      r.Training_Required === true &&
      r.Employment_Status === "Active" &&
      r.Completion_Status === "Completed"
  );

  if (requiredRecords.length === 0) {
    return {
      metric: "Training Record Compliance",
      definition:
        "Valid required training records ÷ Total required records",
      total_required: 0,
      compliant: 0,
      percentage: 0,
      warning: "No required training records found",
    };
  }

  // Count compliant records (VALID status only)
  const compliantRecords = requiredRecords.filter((record) => {
    const status = determineTrainingStatus(record, null, asOfDate);
    return status === TRAINING_STATUS.VALID;
  });

  const percentage = (
    (compliantRecords.length / requiredRecords.length) *
    100
  ).toFixed(1);

  return {
    metric: "Training Record Compliance",
    definition:
      "Valid required training records ÷ Total required records",
    total_required: requiredRecords.length,
    compliant: compliantRecords.length,
    non_compliant: requiredRecords.length - compliantRecords.length,
    percentage: parseFloat(percentage),
  };
}

/**
 * KPI 2: Fully Compliant Employees
 *
 * Definition:
 * (Employees with all required training valid) ÷ (Total active employees)
 *
 * An employee is "fully compliant" if:
 * - They are Active
 * - All of their required courses (per requirements matrix) are either:
 *   - Completed with VALID status, OR
 *   - Not required for their role
 *
 * Example:
 * 500 active employees.
 * 385 employees have all their required training valid.
 * Fully Compliant = 385 / 500 = 77%
 */
function calculateFullyCompliantEmployees(
  records,
  requirementsMatrix,
  asOfDate = new Date()
) {
  // Get unique active employees
  const activeEmployees = [
    ...new Set(
      records
        .filter((r) => r.Employment_Status === "Active")
        .map((r) => ({
          id: r.Employee_ID,
          name: r.Employee_Name,
          department: r.Department,
          job_title: r.Job_Title,
        }))
    ),
  ];

  if (activeEmployees.length === 0) {
    return {
      metric: "Fully Compliant Employees",
      definition:
        "Active employees with all required training valid ÷ Total active employees",
      total_employees: 0,
      fully_compliant: 0,
      percentage: 0,
      warning: "No active employees found",
    };
  }

  let fullyCompliantCount = 0;

  activeEmployees.forEach((employee) => {
    // Find all required courses for this employee
    const employeeRequirements = requirementsMatrix.filter(
      (req) =>
        req.Department === employee.department &&
        req.Job_Title === employee.job_title &&
        req.Mandatory === true
    );

    if (employeeRequirements.length === 0) {
      // Employee has no required training, so they're compliant
      fullyCompliantCount++;
      return;
    }

    // Check if employee has all required training as VALID
    let allRequiredValid = true;

    employeeRequirements.forEach((requirement) => {
      const hasValidRecord = records.find(
        (rec) =>
          rec.Employee_ID === employee.id &&
          rec.Course_Code === requirement.Course_Code &&
          rec.Training_Required === true &&
          rec.Completion_Status === "Completed" &&
          determineTrainingStatus(rec, null, asOfDate) === TRAINING_STATUS.VALID
      );

      if (!hasValidRecord) {
        allRequiredValid = false;
      }
    });

    if (allRequiredValid) {
      fullyCompliantCount++;
    }
  });

  const percentage = (
    (fullyCompliantCount / activeEmployees.length) *
    100
  ).toFixed(1);

  return {
    metric: "Fully Compliant Employees",
    definition:
      "Active employees with all required training valid ÷ Total active employees",
    total_employees: activeEmployees.length,
    fully_compliant: fullyCompliantCount,
    non_compliant: activeEmployees.length - fullyCompliantCount,
    percentage: parseFloat(percentage),
  };
}

/**
 * KPI 3: Department Compliance
 *
 * Definition:
 * For each department:
 * (Valid required records in dept) ÷ (All required records in dept)
 */
function calculateDepartmentCompliance(records, asOfDate = new Date()) {
  const departments = [
    ...new Set(records.map((r) => r.Department).filter(Boolean)),
  ];

  const results = departments.map((dept) => {
    const deptRecords = records.filter(
      (r) => r.Department === dept && r.Employment_Status === "Active"
    );
    const deptRequiredRecords = deptRecords.filter(
      (r) => r.Training_Required === true && r.Completion_Status === "Completed"
    );

    if (deptRequiredRecords.length === 0) {
      return {
        department: dept,
        total_records: 0,
        compliant: 0,
        percentage: 0,
        warning: "No required training records",
      };
    }

    const deptCompliantRecords = deptRequiredRecords.filter((record) => {
      const status = determineTrainingStatus(record, null, asOfDate);
      return status === TRAINING_STATUS.VALID;
    });

    const percentage = (
      (deptCompliantRecords.length / deptRequiredRecords.length) *
      100
    ).toFixed(1);

    return {
      department: dept,
      total_records: deptRequiredRecords.length,
      compliant: deptCompliantRecords.length,
      non_compliant: deptRequiredRecords.length - deptCompliantRecords.length,
      percentage: parseFloat(percentage),
    };
  });

  return results;
}

/**
 * KPI 4: Course Compliance
 *
 * Definition:
 * For each course:
 * (Employees with valid training) ÷ (Employees required to take course)
 */
function calculateCourseCompliance(
  records,
  requirementsMatrix,
  asOfDate = new Date()
) {
  const courses = [
    ...new Set(records.map((r) => r.Course_Code).filter(Boolean)),
  ];

  const results = courses.map((courseCode) => {
    // Find course info
    const courseInfo = records.find((r) => r.Course_Code === courseCode);
    const courseName = courseInfo ? courseInfo.Course_Name : courseCode;

    // Find all requirements for this course
    const courseRequirements = requirementsMatrix.filter(
      (req) => req.Course_Code === courseCode && req.Mandatory === true
    );

    if (courseRequirements.length === 0) {
      return {
        course_code: courseCode,
        course_name: courseName,
        employees_required: 0,
        compliant: 0,
        percentage: 0,
        warning: "No required employees for this course",
      };
    }

    // Count unique employees required for this course
    const employeesRequired = new Set();
    courseRequirements.forEach((req) => {
      const matchingEmployees = records.filter(
        (r) =>
          r.Department === req.Department &&
          r.Job_Title === req.Job_Title &&
          r.Employment_Status === "Active"
      );
      matchingEmployees.forEach((emp) =>
        employeesRequired.add(emp.Employee_ID)
      );
    });

    // Count employees with valid training for this course
    let compliantCount = 0;
    employeesRequired.forEach((empId) => {
      const hasValidRecord = records.find(
        (rec) =>
          rec.Employee_ID === empId &&
          rec.Course_Code === courseCode &&
          rec.Training_Required === true &&
          rec.Completion_Status === "Completed" &&
          determineTrainingStatus(rec, null, asOfDate) === TRAINING_STATUS.VALID
      );
      if (hasValidRecord) compliantCount++;
    });

    const percentage = (
      (compliantCount / employeesRequired.size) *
      100
    ).toFixed(1);

    return {
      course_code: courseCode,
      course_name: courseName,
      employees_required: employeesRequired.size,
      compliant: compliantCount,
      non_compliant: employeesRequired.size - compliantCount,
      percentage: parseFloat(percentage),
    };
  });

  return results;
}

// ============================================
// EXPORT FOR USE IN REACT & NODE
// ============================================

const ComplianceEngine = {
  SCHEMAS: {
    TRAINING_RECORD_SCHEMA,
    REQUIREMENTS_SCHEMA,
  },
  STATUSES: TRAINING_STATUS,
  VALIDATION: {
    validateTrainingRecord,
    isValidDate,
    detectDuplicates,
  },
  STATUS: {
    determineTrainingStatus,
    identifyMissingTraining,
  },
  KPI: {
    calculateTrainingRecordCompliance,
    calculateFullyCompliantEmployees,
    calculateDepartmentCompliance,
    calculateCourseCompliance,
  },
};

// Export for Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = ComplianceEngine;
}

// Export for React
if (typeof window !== "undefined") {
  window.ComplianceEngine = ComplianceEngine;
}
