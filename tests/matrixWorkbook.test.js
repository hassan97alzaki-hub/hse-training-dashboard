import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { STATUS } from '../src/lib/constants.js';
import {
  isMatrixWorkbook, looksLikeMatrixWorkbook, readWorkbook, readMatrixSheets, convertMatrixWorkbook,
  compareSourceStatus, toImportResult, DERIVED_REQUIREMENT_NOTE,
} from '../src/lib/matrixWorkbook.js';
import { buildComplianceUniverse, calculateKPIs, getPriorityActions } from '../src/lib/complianceEngine.js';
import { filterComplianceItems } from '../src/lib/tableFilters.js';
import { createI18n } from '../src/lib/i18n.js';
import { addCalendarMonths } from '../src/lib/normalization.js';
import MatrixImportPreview from '../src/components/MatrixImportPreview.jsx';
import ComplianceTable from '../src/components/ComplianceTable.jsx';
import { fireEvent } from '@testing-library/react';

const AS_OF = '2026-07-26';

// ── Small synthetic workbooks (fictional values) ────────────────────
const EMPLOYEES = [
  { Employee_ID: 1, Badge: 'XX-00001', Name: 'Test Person A', Department: 'Operations', Role: 'Operator', Join_Date: '2020-01-01', Status: 'Active' },
  { Employee_ID: 2, Badge: 'XX-00002', Name: 'Test Person B', Department: 'Operations', Role: 'Supervisor', Join_Date: '2021-01-01', Status: 'Active' },
  { Employee_ID: 3, Badge: 'XX-00003', Name: 'Test Person C', Department: 'Logistics', Role: 'Driver', Join_Date: '2022-01-01', Status: 'Active' },
];
const COURSES = [
  { Course_ID: 'K01', Course_Name: 'Course One', Validity_Months: 12, Departments: 'Operations, Logistics' },
  { Course_ID: 'K02', Course_Name: 'Course Two', Validity_Months: 24, Departments: 'Operations' },
];
const row = (empIdx, course, completion, expiry, cert, status = 'VALID') => {
  const e = EMPLOYEES[empIdx];
  const c = COURSES.find(x => x.Course_ID === course);
  return { Employee_ID: e.Employee_ID, Badge: e.Badge, Name: e.Name, Department: e.Department,
    Course_ID: course, Course_Name: c.Course_Name, Completion_Date: completion, Expiry_Date: expiry,
    Status: status, Certificate_Number: cert };
};
const TRAINING = [
  row(0, 'K01', '2026-01-10', '2027-01-10', 'CERT-T-1'),            // VALID
  row(0, 'K02', '2024-07-01', '2026-07-01', 'CERT-T-2', 'VALID'),   // source says VALID, actually EXPIRED
  row(1, 'K01', '2025-08-01', '2026-08-01', 'CERT-T-3'),            // EXPIRING_30 (6 days)
  row(1, 'K02', '', '', '', 'MISSING'),                              // no evidence → MISSING
  row(2, 'K01', '', '', '', 'MISSING'),                              // employee C has no evidence at all
];

function workbook({ employees = EMPLOYEES, courses = COURSES, training = TRAINING, omit = [] } = {}) {
  const wb = XLSX.utils.book_new();
  if (!omit.includes('Employees')) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees), 'Employees');
  if (!omit.includes('Courses')) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(courses), 'Courses');
  if (!omit.includes('Training_Records')) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(training), 'Training_Records');
  // Round-trip through bytes, as a real upload does.
  return readWorkbook(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
}
const convert = (opts) => convertMatrixWorkbook(readMatrixSheets(workbook(opts)));
const issue = (res, code) => res.issues.find(i => i.code === code);
const PII = [...EMPLOYEES.flatMap(e => [e.Name, e.Badge]), 'CERT-T-1', 'CERT-T-2', 'CERT-T-3'];

describe('matrix workbook — conversion of a valid small workbook', () => {
  const res = convert();

  it('detects the three-sheet format', () => {
    expect(isMatrixWorkbook(workbook())).toBe(true);
    expect(isMatrixWorkbook(workbook({ omit: ['Courses'] }))).toBe(false);
  });
  it('has no blocking errors', () => {
    expect(res.ok).toBe(true);
    expect(res.errorCount).toBe(0);
  });
  it('uses Badge as Employee_ID and the Employees sheet as master', () => {
    const r = res.trainingRecords.find(x => x.Course_Code === 'K01' && x.Expiry_Date === '2027-01-10');
    expect(r.Employee_ID).toBe('XX-00001');
    expect(r.Job_Title).toBe('Operator');
    expect(r.Completion_Status).toBe('Completed');
    expect(r.Issue_Date).toBe('2026-01-10');
  });
  it('skips rows without evidence and counts them', () => {
    expect(res.counts.skippedNoEvidence).toBe(2);
    expect(res.counts.importedRecords).toBe(3);
  });
  it('returns a separate employee list and no placeholder records', () => {
    expect(res.employees.map(e => e.Employee_ID)).toEqual(['XX-00001', 'XX-00002', 'XX-00003']);
    expect(res.employees[2]).toEqual({ Employee_ID: 'XX-00003', Employee_Name: 'Test Person C',
      Department: 'Logistics', Job_Title: 'Driver', Employment_Status: 'Active' });
    expect(res.trainingRecords).toHaveLength(3);
    expect(res.trainingRecords.every(r => r.Course_Code && r.Completion_Status === 'Completed')).toBe(true);
    expect(res.counts.activeWithoutRecords).toBe(1);
  });
  it('derives requirements only for observed (Department, Role) pairs, marked as department-level', () => {
    // K01: Operations×{Operator,Supervisor} + Logistics×{Driver} = 3; K02: Operations×2 = 2
    expect(res.requirements).toHaveLength(5);
    expect(res.requirements.every(r => r.Description === DERIVED_REQUIREMENT_NOTE && r.Derived === true)).toBe(true);
    expect(res.requirements.find(r => r.Department === 'Logistics' && r.Course_Code === 'K02')).toBeUndefined();
  });
  it('engine recalculates status and ignores the source Status column', () => {
    const cr = buildComplianceUniverse(res.trainingRecords, res.requirements, AS_OF, res.employees);
    const get = (badge, code) => cr.universe.find(i => i.Employee_ID === badge && i.Course_Code === code);
    expect(get('XX-00001', 'K01').Status).toBe(STATUS.VALID);
    expect(get('XX-00001', 'K02').Status).toBe(STATUS.EXPIRED); // source said VALID
    expect(get('XX-00002', 'K01').Status).toBe(STATUS.EXPIRING_30);
    expect(get('XX-00002', 'K02').Status).toBe(STATUS.MISSING);
    expect(get('XX-00003', 'K01').Status).toBe(STATUS.MISSING); // from the employee list, no record
    expect(cr.employees.active).toHaveLength(3);
    const cmp = compareSourceStatus(res.sourceStatuses, cr.universe);
    expect(cmp.matrix['VALID → EXPIRED']).toBe(1);
    expect(cmp.matrix['MISSING → MISSING']).toBe(2);
  });
  it('without the employee list, an employee with no record is not seen (original behaviour)', () => {
    const cr = buildComplianceUniverse(res.trainingRecords, res.requirements, AS_OF);
    expect(cr.employees.active).toHaveLength(2);
    expect(cr.universe.some(i => i.Employee_ID === 'XX-00003')).toBe(false);
  });
  it('no compliance item has an empty course code', () => {
    const cr = buildComplianceUniverse(res.trainingRecords, res.requirements, AS_OF, res.employees);
    expect(cr.universe.every(i => i.Course_Code)).toBe(true);
    expect(cr.duplicates).toHaveLength(0);
  });
  it('import result holds real training records only', () => {
    const r = toImportResult(res, 'x.xlsx');
    expect(r.success).toBe(true);
    expect(r.importSummary.valid).toBe(3);
    expect(r.validRecords).toHaveLength(3);
    expect(r.validRecords).toBe(res.trainingRecords);
  });
  it('inactive employee in the list stays inactive, with no compliance items', () => {
    const employees = [...EMPLOYEES, { Employee_ID: 4, Badge: 'XX-00004', Name: 'Test Person D', Department: 'Operations', Role: 'Operator', Join_Date: '2019-01-01', Status: 'Left' }];
    const r = convert({ employees });
    const cr = buildComplianceUniverse(r.trainingRecords, r.requirements, AS_OF, r.employees);
    expect(cr.employees.inactive.map(e => e.Employee_ID)).toEqual(['XX-00004']);
    expect(cr.universe.some(i => i.Employee_ID === 'XX-00004')).toBe(false);
    expect(r.counts.activeWithoutRecords).toBe(1); // only the active employee C
  });
  it('validity mismatch is a warning, expiry is not recalculated', () => {
    const r = convert({ training: [row(0, 'K01', '2026-01-10', '2026-12-31', 'CERT-T-1')] });
    expect(r.ok).toBe(true);
    expect(issue(r, 'EXPIRY_VALIDITY_MISMATCH').count).toBe(1);
    expect(issue(r, 'EXPIRY_VALIDITY_MISMATCH').daysDistribution).toEqual({ '-10': 1 });
    expect(r.trainingRecords[0].Expiry_Date).toBe('2026-12-31');
  });
  it('issues contain codes, counts and row numbers only — no personal data', () => {
    const bad = convert({ training: [...TRAINING, { ...TRAINING[0], Name: 'Wrong Name' }] });
    const text = JSON.stringify(bad.issues);
    for (const p of [...PII, 'Wrong Name']) expect(text).not.toContain(p);
  });
});

describe('addCalendarMonths (validity warning arithmetic)', () => {
  it('31 Jan + 1 month = last day of February', () => {
    expect(addCalendarMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addCalendarMonths('2028-01-31', 1)).toBe('2028-02-29');
  });
  it('29 Feb + 12 months = 28 Feb of a non-leap year', () => {
    expect(addCalendarMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addCalendarMonths('2028-02-29', 48)).toBe('2032-02-29');
  });
  it('year end', () => {
    expect(addCalendarMonths('2026-12-31', 1)).toBe('2027-01-31');
    expect(addCalendarMonths('2026-12-31', 12)).toBe('2027-12-31');
    expect(addCalendarMonths('2026-12-15', 2)).toBe('2027-02-15');
    expect(addCalendarMonths('2026-10-31', 2)).toBe('2026-12-31');
  });
  it('ordinary dates and invalid input', () => {
    expect(addCalendarMonths('2026-03-15', 24)).toBe('2028-03-15');
    expect(addCalendarMonths('bad', 1)).toBeNull();
  });
  it('month-end expiry that matches calendar validity raises no warning; file expiry is kept', () => {
    const courses = [{ Course_ID: 'K01', Course_Name: 'Course One', Validity_Months: 1, Departments: 'Operations, Logistics' }, COURSES[1]];
    const r = convert({ courses, training: [row(0, 'K01', '2027-01-31', '2027-02-28', 'C1')] });
    expect(issue(r, 'EXPIRY_VALIDITY_MISMATCH')).toBeUndefined();
    const r2 = convert({ courses, training: [row(0, 'K01', '2027-01-31', '2027-03-03', 'C1')] });
    expect(issue(r2, 'EXPIRY_VALIDITY_MISMATCH').daysDistribution).toEqual({ '3': 1 });
    expect(r2.trainingRecords[0].Expiry_Date).toBe('2027-03-03');
  });
});

describe('matrix workbook — blocking errors', () => {
  const blocked = (res, code) => {
    expect(res.ok).toBe(false);
    expect(issue(res, code)?.severity).toBe('error');
  };
  it('missing sheet — names the sheet', () => {
    const r = convertMatrixWorkbook(readMatrixSheets(workbook({ omit: ['Courses'] })));
    blocked(r, 'MISSING_SHEET');
    expect(issue(r, 'MISSING_SHEET').rows).toEqual(['Courses']);
  });
  it('a workbook with two of the three sheets is still treated as a matrix workbook', () => {
    expect(looksLikeMatrixWorkbook(workbook({ omit: ['Courses'] }))).toBe(true);
    expect(isMatrixWorkbook(workbook({ omit: ['Courses'] }))).toBe(false);
    expect(looksLikeMatrixWorkbook(workbook({ omit: ['Courses', 'Employees'] }))).toBe(false);
  });
  it('missing column — names sheet and column', () => {
    const r = convert({ courses: COURSES.map(({ Departments: _omit, ...c }) => c) });
    blocked(r, 'MISSING_COLUMN');
    expect(issue(r, 'MISSING_COLUMN').rows).toEqual(['Courses.Departments']);
  });
  it('missing Badge', () => blocked(convert({ employees: [{ ...EMPLOYEES[0], Badge: '' }, ...EMPLOYEES.slice(1)] }), 'EMPLOYEE_KEY_MISSING'));
  it('duplicate Badge', () => blocked(convert({ employees: [...EMPLOYEES, { ...EMPLOYEES[0], Employee_ID: 9 }] }), 'EMPLOYEE_KEY_DUPLICATE'));
  it('duplicate Employee_ID', () => blocked(convert({ employees: [...EMPLOYEES, { ...EMPLOYEES[0], Badge: 'XX-00009' }] }), 'EMPLOYEE_ID_DUPLICATE'));
  it('duplicate Course_ID', () => blocked(convert({ courses: [...COURSES, COURSES[0]] }), 'COURSE_ID_DUPLICATE'));
  it('training row for unknown employee', () => blocked(convert({ training: [{ ...TRAINING[0], Badge: 'XX-99999' }] }), 'TRAINING_EMPLOYEE_UNKNOWN'));
  it('training row for unknown course', () => blocked(convert({ training: [{ ...TRAINING[0], Course_ID: 'K99' }] }), 'TRAINING_COURSE_UNKNOWN'));
  it('Employee_ID / Badge pairing differs between sheets', () => blocked(convert({ training: [{ ...TRAINING[0], Employee_ID: 2 }] }), 'EMPLOYEE_ID_BADGE_MISMATCH'));
  it('name conflict with Employees sheet', () => blocked(convert({ training: [{ ...TRAINING[0], Name: 'Other' }] }), 'CONFLICT_EMPLOYEE_NAME'));
  it('department conflict with Employees sheet', () => blocked(convert({ training: [{ ...TRAINING[0], Department: 'Logistics' }] }), 'CONFLICT_EMPLOYEE_DEPARTMENT'));
  it('invalid date format', () => blocked(convert({ training: [{ ...TRAINING[0], Expiry_Date: '2027-13-40' }] }), 'INVALID_EXPIRY_DATE'));
  it('invalid completion date', () => blocked(convert({ training: [{ ...TRAINING[0], Completion_Date: 'yesterday' }] }), 'INVALID_COMPLETION_DATE'));
  it('expiry not after completion', () => blocked(convert({ training: [row(0, 'K01', '2026-01-10', '2026-01-10', 'C')] }), 'EXPIRY_NOT_AFTER_COMPLETION'));
  it('empty required employee field', () => blocked(convert({ employees: [{ ...EMPLOYEES[0], Department: '' }, ...EMPLOYEES.slice(1)] }), 'EMPLOYEE_DEPARTMENT_EMPTY'));
  it('invalid employee status', () => blocked(convert({ employees: [{ ...EMPLOYEES[0], Status: 'Retired' }, ...EMPLOYEES.slice(1)] }), 'EMPLOYEE_STATUS_INVALID'));
});

describe('matrix workbook — warnings', () => {
  it('duplicate employee+course pair is reported and all rows are kept', () => {
    const r = convert({ training: [...TRAINING, row(0, 'K01', '2025-01-10', '2026-01-10', 'CERT-OLD')] });
    expect(r.ok).toBe(true);
    expect(issue(r, 'DUPLICATE_EMPLOYEE_COURSE').count).toBe(1);
    const cr = buildComplianceUniverse(r.trainingRecords, r.requirements, AS_OF);
    const item = cr.universe.find(i => i.Employee_ID === 'XX-00001' && i.Course_Code === 'K01');
    expect(item.Expiry_Date).toBe('2027-01-10'); // engine picks the valid record
  });
  it('empty certificate number on a completed row', () => {
    const r = convert({ training: [row(0, 'K01', '2026-01-10', '2027-01-10', '')] });
    expect(issue(r, 'CERTIFICATE_NUMBER_EMPTY').count).toBe(1);
  });
  it('completed without expiry', () => {
    const r = convert({ training: [row(0, 'K01', '2026-01-10', '', 'C1')] });
    expect(issue(r, 'COMPLETED_WITHOUT_EXPIRY').count).toBe(1);
  });
  it('course name differs from Courses sheet', () => {
    const r = convert({ training: [{ ...TRAINING[0], Course_Name: 'Other name' }] });
    expect(r.ok).toBe(true);
    expect(issue(r, 'CONFLICT_COURSE_NAME').severity).toBe('warning');
    expect(r.trainingRecords[0].Course_Name).toBe('Course One');
  });
  it('mapped department without employees', () => {
    const r = convert({ courses: [{ ...COURSES[0], Departments: 'Operations, Civil' }, COURSES[1]] });
    expect(issue(r, 'COURSE_DEPARTMENT_NO_EMPLOYEES').count).toBe(1);
  });
});

describe('matrix import preview component', () => {
  const { t } = createI18n('en');
  const base = (conversion) => ({ conversion, comparison: null, asOfDate: AS_OF, fileName: 'synthetic.xlsx' });

  it('shows counts and enables approval when there are no errors', () => {
    const { container } = render(createElement(MatrixImportPreview, { preview: base(convert()), t, onApprove: () => {}, onCancel: () => {} }));
    expect(screen.getByRole('button', { name: /Approve import/ })).toBeEnabled();
    const text = container.textContent;
    for (const p of PII) expect(text).not.toContain(p);
  });
  it('disables approval when there are blocking errors', () => {
    render(createElement(MatrixImportPreview, { preview: base(convert({ training: [{ ...TRAINING[0], Badge: 'XX-99999' }] })), t, onApprove: () => {}, onCancel: () => {} }));
    expect(screen.getByRole('button', { name: /Approve import/ })).toBeDisabled();
    expect(screen.getByText(/Import blocked/)).toBeInTheDocument();
  });
});

describe('compliance table paging', () => {
  const { t } = createI18n('en');
  const items = Array.from({ length: 60 }, (_, i) => ({
    Employee_ID: `XX-${String(i).padStart(5, '0')}`, Employee_Name: 'Test', Department: i < 30 ? 'Operations' : 'Logistics',
    Job_Title: 'Operator', Course_Code: 'K01', Course_Name: 'Course One', Status: STATUS.MISSING, Employment_Status: 'Active',
  }));
  const props = (filters) => ({ universe: items, inactiveUniverse: [], filters, t, lang: 'en', showInactive: false });

  it('returns to page 1 when the filters change', () => {
    const { container, rerender } = render(createElement(ComplianceTable, props({})));
    fireEvent.click(screen.getByRole('button', { name: t('ariaNextPage') }));
    expect(container.querySelector('.pagination-controls .page-info').textContent).toBe('2 / 3');
    rerender(createElement(ComplianceTable, props({ department: 'Logistics' })));
    expect(container.querySelector('.pagination-controls .page-info').textContent).toBe('1 / 2');
    expect(container.querySelector('.pagination-bar .page-info').textContent).toContain('1–25');
  });
});

// ── Optional integration test: full workbook from HSE_MATRIX_XLSX ───
// Runs only when HSE_MATRIX_XLSX points to a local workbook; skipped otherwise.
const FILE = process.env.HSE_MATRIX_XLSX;
const HAS_FILE = !!FILE && existsSync(FILE);

describe.skipIf(!HAS_FILE)('workbook from HSE_MATRIX_XLSX (expects the 500-employee synthetic file)', () => {
  const wb = HAS_FILE ? readWorkbook(new Uint8Array(readFileSync(FILE))) : null;
  const res = HAS_FILE ? convertMatrixWorkbook(readMatrixSheets(wb)) : null;

  it('converts without blocking errors', () => {
    expect(isMatrixWorkbook(wb)).toBe(true);
    expect(res.ok).toBe(true);
    expect(res.errorCount).toBe(0);
  });
  it('has the expected sheet sizes', () => {
    expect(res.counts).toMatchObject({ employees: 500, courses: 10, trainingRows: 3067,
      importedRecords: 2575, skippedNoEvidence: 492, activeWithoutRecords: 1, departments: 8, roles: 32 });
    expect(res.employees).toHaveLength(500);
  });
  it('every imported record disagrees with completion + Validity_Months (warning only)', () => {
    expect(issue(res, 'EXPIRY_VALIDITY_MISMATCH').count).toBe(2575);
    expect(issue(res, 'EXPIRY_VALIDITY_MISMATCH').severity).toBe('warning');
  });
  it('engine reproduces every source status at 2026-05-16 except the 60-day boundary', () => {
    const cr = buildComplianceUniverse(res.trainingRecords, res.requirements, '2026-05-16', res.employees);
    expect(cr.universe).toHaveLength(3067);
    expect(cr.employees.active).toHaveLength(500);
    const { matrix } = compareSourceStatus(res.sourceStatuses, cr.universe);
    expect(matrix['EXPIRED → EXPIRED']).toBe(973);
    expect(matrix['MISSING → MISSING']).toBe(492);
    expect(matrix['VALID → EXPIRING_60']).toBe(3); // source treats exactly 60 days as VALID
  });
  it('KPIs, priority actions, search and filters run on the full set', () => {
    const cr = buildComplianceUniverse(res.trainingRecords, res.requirements, AS_OF, res.employees);
    const kpis = calculateKPIs(cr.universe, cr.employees, cr.unconfiguredEmployees);
    expect(kpis.totalActiveEmployees).toBe(500);
    expect(kpis.totalMandatoryReqs).toBe(3067);
    expect(getPriorityActions(cr.universe).length).toBeGreaterThan(0);
    const someBadge = cr.universe[100].Employee_ID;
    const hit = filterComplianceItems(cr.universe, { employeeId: someBadge });
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every(i => i.Employee_ID === someBadge)).toBe(true);
    const ops = filterComplianceItems(cr.universe, { department: 'Operations', status: STATUS.EXPIRED });
    expect(ops.every(i => i.Department === 'Operations' && i.Status === STATUS.EXPIRED)).toBe(true);
  });
});
