/**
 * A small, valid `HSE-DC-1.0` package committed as code, used by AT-01.
 *
 * Fictional and reserved values only: organization `TST-ORG`, employees
 * `TST-0001…`, names `Test Employee 001…`, source system `TEST-LMS`, record ids
 * `TR-000001…`, certificates `TST-CERT-000001…`. It carries no validation
 * defect, so every sheet of a `full` package is represented and the batch is
 * approvable.
 */

import { FIXED_DATES, addDays } from './generateSyntheticPackage.js';

const AS_OF = FIXED_DATES.asOfDate;

export const smallFullPackage = Object.freeze({
  asOfDate: AS_OF,
  contract: Object.freeze({
    contract_version: 'HSE-DC-1.0',
    package_type: 'full',
    organization_code: 'TST-ORG',
    source_system: 'TEST-LMS',
    extract_date: FIXED_DATES.extractDate,
    prepared_by_role: 'Training Coordinator',
    requirements_effective_from: FIXED_DATES.requirementsEffectiveFrom,
  }),
  approval: Object.freeze({
    batchId: 'TST-BATCH-SMALL',
    preparedByRole: 'Training Coordinator',
    approvedByRole: 'Training Manager',
    approvedAt: FIXED_DATES.approvedAt,
  }),
  departments: Object.freeze([
    { department_code: 'OPS', name_en: 'Test Operations', name_ar: 'تشغيل اختبار', active: 'Yes' },
    { department_code: 'MNT', name_en: 'Test Maintenance', name_ar: 'صيانة اختبار', active: 'Yes' },
  ]),
  jobTitles: Object.freeze([
    { job_title_code: 'OPR', name_en: 'Test Operator', name_ar: 'مشغل اختبار', department_code: '', active: 'Yes' },
    { job_title_code: 'SUP', name_en: 'Test Supervisor', name_ar: 'مشرف اختبار', department_code: '', active: 'Yes' },
  ]),
  courses: Object.freeze([
    { course_code: 'H2S-01', name_en: 'Test H2S Awareness', name_ar: 'توعية اختبار', suggested_validity_months: 24 },
    { course_code: 'FA-01', name_en: 'Test First Aid', name_ar: 'إسعاف اختبار', suggested_validity_months: 24 },
  ]),
  employees: Object.freeze([
    {
      employee_code: 'TST-0001',
      badge_number: 'TST-B-0001',
      full_name: 'Test Employee 001',
      department_code: 'OPS',
      job_title_code: 'OPR',
      employment_status: 'Active',
      status_effective_date: '',
      hire_date: '2024-02-01',
      site_code: 'SITE-1',
    },
    {
      employee_code: 'TST-0002',
      badge_number: 'TST-B-0002',
      full_name: 'Test Employee 002',
      department_code: 'MNT',
      job_title_code: 'SUP',
      employment_status: 'Active',
      status_effective_date: '',
      hire_date: '2023-05-10',
      site_code: 'SITE-2',
    },
    {
      employee_code: 'TST-0003',
      badge_number: 'TST-B-0003',
      full_name: 'Test Employee 003',
      department_code: 'OPS',
      job_title_code: 'OPR',
      employment_status: 'Left',
      status_effective_date: '2026-12-31',
      hire_date: '2021-09-01',
      site_code: 'SITE-1',
    },
  ]),
  requirements: Object.freeze([
    {
      department_code: 'OPS',
      job_title_code: 'OPR',
      course_code: 'H2S-01',
      requirement_type: 'Mandatory',
      validity_months: 24,
      effective_from: FIXED_DATES.requirementsEffectiveFrom,
      effective_to: '',
      approval_reference: 'TRN-DEC-0001',
      approved_by_role: 'Training Manager',
      approved_on: FIXED_DATES.approvedOn,
      source: 'approved',
    },
    {
      department_code: 'MNT',
      job_title_code: 'SUP',
      course_code: 'H2S-01',
      requirement_type: 'Mandatory',
      validity_months: 24,
      effective_from: FIXED_DATES.requirementsEffectiveFrom,
      effective_to: '',
      approval_reference: 'TRN-DEC-0001',
      approved_by_role: 'Training Manager',
      approved_on: FIXED_DATES.approvedOn,
      source: 'approved',
    },
    {
      department_code: 'MNT',
      job_title_code: 'SUP',
      course_code: 'FA-01',
      requirement_type: 'Recommended',
      validity_months: 24,
      effective_from: FIXED_DATES.requirementsEffectiveFrom,
      effective_to: '',
      approval_reference: 'TRN-DEC-0001',
      approved_by_role: 'Training Manager',
      approved_on: FIXED_DATES.approvedOn,
      source: 'approved',
    },
  ]),
  // `source_system` is a `_Contract` field, so the sheet carries no column of
  // that name (a column would be reported as unknown and ignored).
  trainingRecords: Object.freeze([
    {
      source_record_id: 'TR-000001',
      employee_code: 'TST-0001',
      course_code: 'H2S-01',
      completion_status: 'Completed',
      completion_date: addDays(AS_OF, -300),
      expiry_date: addDays(AS_OF, 200),
      certificate_number: 'TST-CERT-000001',
      training_provider: 'Test Provider',
      remarks: '',
    },
    {
      source_record_id: 'TR-000002',
      employee_code: 'TST-0003',
      course_code: 'H2S-01',
      completion_status: 'Completed',
      completion_date: addDays(AS_OF, -500),
      expiry_date: addDays(AS_OF, 100),
      certificate_number: 'TST-CERT-000002',
      training_provider: 'Test Provider',
      remarks: '',
    },
  ]),
  // TST-0002 carries no record, so its mandatory H2S-01 item must be MISSING.
  expected: Object.freeze({
    departments: 2,
    jobTitles: 2,
    courses: 2,
    employees: 3,
    requirements: 3,
    trainingRecords: 2,
    activeEmployees: 2,
    inactiveEmployees: 1,
    complianceItems: 3,
    mandatoryItems: 2,
    notRequiredItems: 1,
    statusCounts: Object.freeze({ VALID: 1, MISSING: 1 }),
    requirementCompliance: 50,
    fullyCompliantPct: 50,
  }),
});
