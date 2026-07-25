// Authoritative As Of Date for demo and tests
export const DEMO_AS_OF_DATE = '2026-07-26';

// Status constants — single source of truth
export const STATUS = {
  VALID: 'VALID',
  EXPIRING_90: 'EXPIRING_90',
  EXPIRING_60: 'EXPIRING_60',
  EXPIRING_30: 'EXPIRING_30',
  EXPIRED: 'EXPIRED',
  IN_PROGRESS: 'IN_PROGRESS',
  NOT_STARTED: 'NOT_STARTED',
  MISSING: 'MISSING',
  NOT_REQUIRED: 'NOT_REQUIRED',
};

// Compliance policy: which statuses are compliant (excluded: NOT_REQUIRED)
export const COMPLIANT_STATUSES = new Set([
  STATUS.VALID,
  STATUS.EXPIRING_90,
  STATUS.EXPIRING_60,
  STATUS.EXPIRING_30,
]);

// Status display colours (Tailwind-compatible class tokens and hex for PDF)
export const STATUS_COLORS = {
  [STATUS.VALID]:        { bg: '#16a34a', text: '#ffffff', label: 'Valid' },
  [STATUS.EXPIRING_90]:  { bg: '#2563eb', text: '#ffffff', label: 'Expiring 90d' },
  [STATUS.EXPIRING_60]:  { bg: '#d97706', text: '#ffffff', label: 'Expiring 60d' },
  [STATUS.EXPIRING_30]:  { bg: '#ea580c', text: '#ffffff', label: 'Expiring 30d' },
  [STATUS.EXPIRED]:      { bg: '#dc2626', text: '#ffffff', label: 'Expired' },
  [STATUS.IN_PROGRESS]:  { bg: '#7c3aed', text: '#ffffff', label: 'In Progress' },
  [STATUS.NOT_STARTED]:  { bg: '#6b7280', text: '#ffffff', label: 'Not Started' },
  [STATUS.MISSING]:      { bg: '#1e1b4b', text: '#ffffff', label: 'Missing' },
  [STATUS.NOT_REQUIRED]: { bg: '#d1d5db', text: '#374151', label: 'Not Required' },
};

export const EMPLOYMENT_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  LEFT: 'Left',
};

export const COMPLETION_STATUS = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In Progress',
  NOT_STARTED: 'Not Started',
};

// Acceptable import boolean values (case-insensitive)
export const BOOLEAN_TRUE_VALUES = new Set(['yes', 'true', '1']);
export const BOOLEAN_FALSE_VALUES = new Set(['no', 'false', '0']);

export const REQUIRED_TRAINING_COLUMNS = [
  'Employee_ID', 'Employee_Name', 'Department', 'Job_Title',
  'Course_Name', 'Course_Code', 'Training_Required', 'Completion_Status',
];

export const REQUIRED_REQUIREMENTS_COLUMNS = [
  'Department', 'Job_Title', 'Course_Code', 'Course_Name', 'Mandatory', 'Validity_Months',
];

export const DEFAULT_COMPANY = 'Your Company';
export const DEFAULT_PROJECT = 'HSE Training Compliance';
export const PAGE_SIZE_OPTIONS = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;
