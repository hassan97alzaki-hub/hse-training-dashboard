// Adapter for the three-sheet "Training Matrix" workbook
// (sheets: Employees, Courses, Training_Records).
//
// The adapter converts the workbook into the record shapes the existing
// import pipeline already produces (normalizeTrainingRecord /
// normalizeRequirementsRecord) and runs the existing row validators on them.
// It does not compute compliance. Status is always recalculated by
// complianceEngine.js from Expiry_Date and asOfDate.
//
// Decisions (see docs/MATRIX-WORKBOOK-IMPORT.md):
// - Employee key = Badge. Employee_ID must map 1:1 to Badge in both sheets.
//   Names are never used for matching.
// - Employees sheet is the master for name, department, role and status.
//   A Training_Records row that disagrees is a blocking conflict.
// - Source Status column is ignored.
// - Expiry_Date is taken as given. A mismatch with Completion_Date +
//   Validity_Months is a warning only; expiry is never recalculated.
// - Courses.Departments is a DEPARTMENT-level mapping. It is expanded to the
//   (Department, Role) pairs that exist in the Employees sheet, because the
//   engine matches requirements on (Department, Job_Title). These rows are
//   marked as derived; they do not prove role-specific requirements.
// - A Training_Records row with no Completion_Date, no Expiry_Date and no
//   Certificate_Number carries no evidence. It is not imported; the engine
//   reports the requirement as MISSING.
// - The Employees sheet is returned as a separate `employees` list and passed
//   to buildComplianceUniverse, so an active employee with no training record
//   still gets MISSING items. No placeholder records are created.
// - Derived requirement rows carry `Derived: true`. They are test-data
//   scaffolding, not approved job-title requirements, and must not be stored
//   or reused as production requirements.
// - Issues carry codes, counts and row numbers only — never names, badges or
//   certificate numbers.
import * as XLSX from 'xlsx';
import { EMPLOYMENT_STATUS, COMPLETION_STATUS } from './constants.js';
import {
  normalizeTrainingRecord,
  normalizeRequirementsRecord,
  normalizeDate,
  normalizeEmploymentStatus,
  isValidDateStr,
  dateDiffDays,
  addCalendarMonths,
} from './normalization.js';
import { validateTrainingRow, validateRequirementsRow } from './dataImport.js';

export const MATRIX_SHEETS = {
  employees: 'Employees',
  courses: 'Courses',
  training: 'Training_Records',
};

export const MATRIX_COLUMNS = {
  employees: ['Employee_ID', 'Badge', 'Name', 'Department', 'Role', 'Join_Date', 'Status'],
  courses: ['Course_ID', 'Course_Name', 'Validity_Months', 'Departments'],
  training: ['Employee_ID', 'Badge', 'Name', 'Department', 'Course_ID', 'Course_Name',
    'Completion_Date', 'Expiry_Date', 'Status', 'Certificate_Number'],
};

export const EMPLOYEE_KEY = 'Badge';

export const DERIVED_REQUIREMENT_NOTE =
  'Derived from department-level mapping (Courses.Departments); not a job-title-specific requirement';

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

const MAX_ROW_REFS = 20;

// ── Workbook reading ──────────────────────────────────────────────

export function isMatrixWorkbook(workbook) {
  const names = workbook?.SheetNames || [];
  return Object.values(MATRIX_SHEETS).every(n => names.includes(n));
}

export function readWorkbook(data) {
  return XLSX.read(data, { type: 'array', cellDates: false });
}

export function readWorkbookFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(readWorkbook(new Uint8Array(e.target.result))); }
      catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function readMatrixSheets(workbook) {
  const out = {};
  for (const [key, name] of Object.entries(MATRIX_SHEETS)) {
    const ws = workbook.Sheets[name];
    out[key] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) : null;
    out[`${key}Headers`] = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })[0] || []) : [];
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

function createIssueLog() {
  const map = new Map();
  return {
    add(code, severity, sheet, row) {
      if (!map.has(code)) map.set(code, { code, severity, count: 0, rows: [] });
      const issue = map.get(code);
      issue.count++;
      if (sheet && row && issue.rows.length < MAX_ROW_REFS) issue.rows.push(`${sheet}:${row}`);
    },
    note(code, severity, count, extra) {
      map.set(code, { code, severity, count, rows: [], ...(extra || {}) });
    },
    list() { return [...map.values()]; },
  };
}

// Date cell → YYYY-MM-DD, or '' when blank, or null when present but invalid.
function toDate(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const s = normalizeDate(raw);
  return isValidDateStr(s) ? s : null;
}

// ── Conversion ────────────────────────────────────────────────────

export function convertMatrixWorkbook(sheets) {
  const issues = createIssueLog();
  const E = MATRIX_SHEETS.employees, C = MATRIX_SHEETS.courses, T = MATRIX_SHEETS.training;

  // Structure
  let structureOk = true;
  for (const key of ['employees', 'courses', 'training']) {
    if (!sheets[key]) { issues.add('MISSING_SHEET', SEVERITY.ERROR); structureOk = false; continue; }
    const headers = (sheets[`${key}Headers`] || []).map(str);
    for (const col of MATRIX_COLUMNS[key]) {
      if (!headers.includes(col)) { issues.add('MISSING_COLUMN', SEVERITY.ERROR); structureOk = false; }
    }
  }
  if (!structureOk) return finish(issues, null);

  // ── Employees (master)
  const byBadge = new Map();
  const badgeById = new Map();
  const badgeCount = new Map();
  const idCount = new Map();
  sheets.employees.forEach(r => {
    const b = str(r.Badge), id = str(r.Employee_ID);
    if (b) badgeCount.set(b, (badgeCount.get(b) || 0) + 1);
    if (id) idCount.set(id, (idCount.get(id) || 0) + 1);
  });

  sheets.employees.forEach((r, i) => {
    const row = i + 2;
    const badge = str(r.Badge), id = str(r.Employee_ID);
    if (!badge) { issues.add('EMPLOYEE_KEY_MISSING', SEVERITY.ERROR, E, row); return; }
    if (!id) issues.add('EMPLOYEE_ID_MISSING', SEVERITY.ERROR, E, row);
    if (badgeCount.get(badge) > 1) { issues.add('EMPLOYEE_KEY_DUPLICATE', SEVERITY.ERROR, E, row); return; }
    if (id && idCount.get(id) > 1) issues.add('EMPLOYEE_ID_DUPLICATE', SEVERITY.ERROR, E, row);

    const emp = {
      badge,
      id,
      name: str(r.Name),
      department: str(r.Department),
      role: str(r.Role),
      status: normalizeEmploymentStatus(r.Status),
    };
    for (const [field, value] of [['Name', emp.name], ['Department', emp.department], ['Role', emp.role], ['Status', emp.status]]) {
      if (!value) issues.add(`EMPLOYEE_${field.toUpperCase()}_EMPTY`, SEVERITY.ERROR, E, row);
    }
    if (emp.status && !Object.values(EMPLOYMENT_STATUS).includes(emp.status)) {
      issues.add('EMPLOYEE_STATUS_INVALID', SEVERITY.ERROR, E, row);
    }
    const join = toDate(r.Join_Date);
    if (join === null) issues.add('JOIN_DATE_INVALID', SEVERITY.WARNING, E, row);
    byBadge.set(badge, emp);
    if (id) badgeById.set(id, badge);
  });

  // ── Courses
  const courses = new Map();
  const courseCount = new Map();
  sheets.courses.forEach(r => {
    const c = str(r.Course_ID);
    if (c) courseCount.set(c, (courseCount.get(c) || 0) + 1);
  });
  sheets.courses.forEach((r, i) => {
    const row = i + 2;
    const code = str(r.Course_ID);
    if (!code) { issues.add('COURSE_ID_MISSING', SEVERITY.ERROR, C, row); return; }
    if (courseCount.get(code) > 1) { issues.add('COURSE_ID_DUPLICATE', SEVERITY.ERROR, C, row); return; }
    const name = str(r.Course_Name);
    if (!name) issues.add('COURSE_NAME_EMPTY', SEVERITY.ERROR, C, row);
    const validity = r.Validity_Months === '' ? null : Number(r.Validity_Months);
    if (validity === null || !Number.isFinite(validity) || validity <= 0) {
      issues.add('COURSE_VALIDITY_INVALID', SEVERITY.WARNING, C, row);
    }
    const departments = str(r.Departments).split(',').map(s => s.trim()).filter(Boolean);
    if (departments.length === 0) issues.add('COURSE_DEPARTMENTS_EMPTY', SEVERITY.WARNING, C, row);
    courses.set(code, { code, name, validity: Number.isFinite(validity) && validity > 0 ? validity : null, departments });
  });

  // ── Requirements: department mapping → (Department, Role) rows
  const rolesByDept = new Map();
  for (const emp of byBadge.values()) {
    if (!emp.department || !emp.role) continue;
    if (!rolesByDept.has(emp.department)) rolesByDept.set(emp.department, new Set());
    rolesByDept.get(emp.department).add(emp.role);
  }
  const requirements = [];
  const mappedPairs = new Set(); // "Department|Course_Code"
  let deptWithoutEmployees = 0;
  for (const course of courses.values()) {
    for (const dept of course.departments) {
      mappedPairs.add(`${dept}|${course.code}`);
      const roles = rolesByDept.get(dept);
      if (!roles) { deptWithoutEmployees++; continue; }
      for (const role of roles) {
        const req = normalizeRequirementsRecord({
          Department: dept,
          Job_Title: role,
          Course_Code: course.code,
          Course_Name: course.name,
          Mandatory: true,
          Validity_Months: course.validity ?? 0,
          Description: DERIVED_REQUIREMENT_NOTE,
        });
        const errs = validateRequirementsRow(req, requirements.length);
        if (errs.length) issues.add('REQUIREMENT_ROW_INVALID', SEVERITY.ERROR);
        else requirements.push({ ...req, Derived: true });
      }
    }
  }
  if (deptWithoutEmployees > 0) issues.note('COURSE_DEPARTMENT_NO_EMPLOYEES', SEVERITY.WARNING, deptWithoutEmployees);
  issues.note('REQUIREMENTS_DEPARTMENT_LEVEL', SEVERITY.INFO, requirements.length);

  // ── Training records
  const trainingRecords = [];
  const pairCount = new Map();
  const validityDiffs = {};
  let noEvidence = 0;
  const sourceStatuses = [];

  sheets.training.forEach((r, i) => {
    const row = i + 2;
    const badge = str(r.Badge), id = str(r.Employee_ID), code = str(r.Course_ID);
    if (!badge) { issues.add('TRAINING_EMPLOYEE_KEY_MISSING', SEVERITY.ERROR, T, row); return; }
    const emp = byBadge.get(badge);
    if (!emp) { issues.add('TRAINING_EMPLOYEE_UNKNOWN', SEVERITY.ERROR, T, row); return; }
    if (id && badgeById.get(id) !== badge) issues.add('EMPLOYEE_ID_BADGE_MISMATCH', SEVERITY.ERROR, T, row);
    if (!code) { issues.add('TRAINING_COURSE_MISSING', SEVERITY.ERROR, T, row); return; }
    const course = courses.get(code);
    if (!course) { issues.add('TRAINING_COURSE_UNKNOWN', SEVERITY.ERROR, T, row); return; }

    if (str(r.Name) && str(r.Name) !== emp.name) issues.add('CONFLICT_EMPLOYEE_NAME', SEVERITY.ERROR, T, row);
    if (str(r.Department) && str(r.Department) !== emp.department) issues.add('CONFLICT_EMPLOYEE_DEPARTMENT', SEVERITY.ERROR, T, row);
    if (str(r.Course_Name) && str(r.Course_Name) !== course.name) issues.add('CONFLICT_COURSE_NAME', SEVERITY.WARNING, T, row);

    const completion = toDate(r.Completion_Date);
    const expiry = toDate(r.Expiry_Date);
    const cert = str(r.Certificate_Number);
    if (completion === null) issues.add('INVALID_COMPLETION_DATE', SEVERITY.ERROR, T, row);
    if (expiry === null) issues.add('INVALID_EXPIRY_DATE', SEVERITY.ERROR, T, row);
    if (completion === null || expiry === null) return;

    const pairKey = `${badge}|${code}`;
    pairCount.set(pairKey, (pairCount.get(pairKey) || 0) + 1);

    if (!completion && !expiry && !cert) {
      noEvidence++;
      sourceStatuses.push({ badge, code, sourceStatus: str(r.Status) });
      return;
    }
    if (completion && expiry && completion >= expiry) {
      issues.add('EXPIRY_NOT_AFTER_COMPLETION', SEVERITY.ERROR, T, row);
      return;
    }
    if (!completion) issues.add('EXPIRY_WITHOUT_COMPLETION_DATE', SEVERITY.WARNING, T, row);
    if (!expiry) issues.add('COMPLETED_WITHOUT_EXPIRY', SEVERITY.WARNING, T, row);
    if (!cert) issues.add('CERTIFICATE_NUMBER_EMPTY', SEVERITY.WARNING, T, row);

    if (completion && expiry && course.validity) {
      const diff = dateDiffDays(expiry, addCalendarMonths(completion, course.validity));
      if (diff !== 0) {
        issues.add('EXPIRY_VALIDITY_MISMATCH', SEVERITY.WARNING, T, row);
        validityDiffs[diff] = (validityDiffs[diff] || 0) + 1;
      }
    }

    const rec = normalizeTrainingRecord({
      Employee_ID: badge,
      Employee_Name: emp.name,
      Department: emp.department,
      Job_Title: emp.role,
      Employment_Status: emp.status,
      Course_Code: course.code,
      Course_Name: course.name,
      Training_Required: mappedPairs.has(`${emp.department}|${course.code}`),
      Completion_Status: COMPLETION_STATUS.COMPLETED,
      Issue_Date: completion,
      Expiry_Date: expiry,
      Certificate_Number: cert,
    });
    const errs = validateTrainingRow(rec, i);
    if (errs.length) { issues.add('TRAINING_ROW_INVALID', SEVERITY.ERROR, T, row); return; }
    trainingRecords.push(rec);
    sourceStatuses.push({ badge, code, sourceStatus: str(r.Status) });
  });

  // Duplicate employee+course pairs are kept (engine selects the best record).
  const dupPairs = [...pairCount.values()].filter(n => n > 1).length;
  if (dupPairs > 0) issues.note('DUPLICATE_EMPLOYEE_COURSE', SEVERITY.WARNING, dupPairs);
  if (noEvidence > 0) issues.note('NO_EVIDENCE_ROWS_SKIPPED', SEVERITY.INFO, noEvidence);
  if (Object.keys(validityDiffs).length) {
    const mismatch = issues.list().find(x => x.code === 'EXPIRY_VALIDITY_MISMATCH');
    mismatch.daysDistribution = validityDiffs;
  }
  issues.note('SOURCE_STATUS_IGNORED', SEVERITY.INFO, sheets.training.length);


  // Employee master list for the engine (same field names as records).
  const employees = [...byBadge.values()].map(emp => ({
    Employee_ID: emp.badge,
    Employee_Name: emp.name,
    Department: emp.department,
    Job_Title: emp.role,
    Employment_Status: emp.status,
  }));
  const withRecords = new Set(trainingRecords.map(r => r.Employee_ID));
  const activeWithoutRecords = employees.filter(
    e => e.Employment_Status === EMPLOYMENT_STATUS.ACTIVE && !withRecords.has(e.Employee_ID),
  ).length;
  if (activeWithoutRecords) issues.note('EMPLOYEES_WITHOUT_EVIDENCE', SEVERITY.INFO, activeWithoutRecords);

  return finish(issues, {
    trainingRecords,
    employees,
    requirements,
    sourceStatuses,
    counts: {
      employees: sheets.employees.length,
      courses: sheets.courses.length,
      trainingRows: sheets.training.length,
      importedRecords: trainingRecords.length,
      activeWithoutRecords,
      skippedNoEvidence: noEvidence,
      requirementRows: requirements.length,
      departments: rolesByDept.size,
      roles: new Set([...byBadge.values()].map(e => e.role).filter(Boolean)).size,
      departmentRolePairs: [...rolesByDept.values()].reduce((n, s) => n + s.size, 0),
    },
  });
}

function finish(issues, data) {
  const list = issues.list();
  const errorCount = list.filter(x => x.severity === SEVERITY.ERROR).reduce((n, x) => n + x.count, 0);
  return {
    ok: !!data && errorCount === 0,
    errorCount,
    warningCount: list.filter(x => x.severity === SEVERITY.WARNING).reduce((n, x) => n + x.count, 0),
    issues: list,
    trainingRecords: data?.trainingRecords || [],
    employees: data?.employees || [],
    requirements: data?.requirements || [],
    sourceStatuses: data?.sourceStatuses || [],
    counts: data?.counts || null,
  };
}

// ── Source Status vs engine ───────────────────────────────────────

// Cross-tabulate the ignored source Status against the engine's status for
// the same employee+course in the computed universe. Counts only.
export function compareSourceStatus(sourceStatuses, universe) {
  const engineByKey = new Map(universe.map(i => [`${i.Employee_ID}|${i.Course_Code}`, i.Status]));
  const matrix = {};
  let notInUniverse = 0;
  for (const s of sourceStatuses) {
    const engine = engineByKey.get(`${s.badge}|${s.code}`);
    if (!engine) { notInUniverse++; continue; }
    const k = `${s.sourceStatus || '(blank)'} → ${engine}`;
    matrix[k] = (matrix[k] || 0) + 1;
  }
  return { matrix, notInUniverse };
}

// Build the result object the App expects from importTrainingFile().
export function toImportResult(conversion, fileName) {
  const recs = conversion.trainingRecords;
  return {
    success: conversion.ok && conversion.employees.length > 0,
    validRecords: conversion.trainingRecords,
    invalidRecords: [],
    duplicates: [],
    warnings: [],
    errors: [],
    importSummary: {
      total: conversion.counts?.trainingRows || 0,
      valid: recs.length,
      invalid: 0,
      duplicates: conversion.issues.find(x => x.code === 'DUPLICATE_EMPLOYEE_COURSE')?.count || 0,
    },
    sourceFileName: fileName,
    sheetName: MATRIX_SHEETS.training,
  };
}
