/**
 * Static definitions of the HSE data contracts.
 *
 * Source of truth: docs/DATA-CONTRACT.md (HSE-DC-1.0) and
 * docs/CONTACT-CONTRACT.md (HSE-CONTACT-1.0).
 *
 * This module contains declarative data only: contract versions, package
 * types, sheet presence per package type, field definitions, value domains and
 * the register of validation codes. It performs no file parsing, no validation
 * and no staging. Those layers are added in later commits and must read their
 * rules from here so that specification and implementation cannot drift apart.
 *
 * The only executable helpers exported here are the reference-code
 * normalisation functions, because normalisation is part of the definition of a
 * key (DATA-CONTRACT.md §2.2) rather than a validation step.
 */

/** Recursively freeze an object so definitions cannot be changed by accident. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

/* ------------------------------------------------------------------ *
 * Contract versions (DATA-CONTRACT.md §1.2, CONTACT-CONTRACT.md §2.1)
 * ------------------------------------------------------------------ */

export const TRAINING_CONTRACT_VERSION = 'HSE-DC-1.0';
export const CONTACT_CONTRACT_VERSION = 'HSE-CONTACT-1.0';

export const CONTRACT_VERSIONS = deepFreeze({
  training: TRAINING_CONTRACT_VERSION,
  contact: CONTACT_CONTRACT_VERSION,
});

/* ------------------------------------------------------------------ *
 * Package types and sheets (DATA-CONTRACT.md §1.3)
 * ------------------------------------------------------------------ */

export const PACKAGE_TYPES = deepFreeze(['full', 'employees', 'requirements', 'training']);

export const SHEET_NAMES = deepFreeze([
  '_Contract',
  'Departments',
  'Job_Titles',
  'Employees',
  'Courses',
  'Requirements',
  'Training_Records',
]);

export const CONTACT_SHEET_NAMES = deepFreeze(['_Contract', 'Contacts']);

/** Presence of a sheet or field. */
export const PRESENCE = deepFreeze({
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  CONDITIONAL: 'conditional',
  FORBIDDEN: 'forbidden',
});

/**
 * Sheet presence per package type.
 * `required` = MUST be present; `optional` = MAY be present;
 * `forbidden` = MUST NOT be present (SHEET_UNEXPECTED, warn, ignored in full).
 *
 * Only a `full` package may create or update `Departments` or `Job_Titles`.
 */
export const PACKAGE_SHEETS = deepFreeze({
  full: {
    _Contract: PRESENCE.REQUIRED,
    Departments: PRESENCE.REQUIRED,
    Job_Titles: PRESENCE.REQUIRED,
    Employees: PRESENCE.REQUIRED,
    Courses: PRESENCE.REQUIRED,
    Requirements: PRESENCE.REQUIRED,
    Training_Records: PRESENCE.REQUIRED,
  },
  employees: {
    _Contract: PRESENCE.REQUIRED,
    Departments: PRESENCE.FORBIDDEN,
    Job_Titles: PRESENCE.FORBIDDEN,
    Employees: PRESENCE.REQUIRED,
    Courses: PRESENCE.FORBIDDEN,
    Requirements: PRESENCE.FORBIDDEN,
    Training_Records: PRESENCE.FORBIDDEN,
  },
  requirements: {
    _Contract: PRESENCE.REQUIRED,
    Departments: PRESENCE.FORBIDDEN,
    Job_Titles: PRESENCE.FORBIDDEN,
    Employees: PRESENCE.FORBIDDEN,
    Courses: PRESENCE.OPTIONAL,
    Requirements: PRESENCE.REQUIRED,
    Training_Records: PRESENCE.FORBIDDEN,
  },
  training: {
    _Contract: PRESENCE.REQUIRED,
    Departments: PRESENCE.FORBIDDEN,
    Job_Titles: PRESENCE.FORBIDDEN,
    Employees: PRESENCE.FORBIDDEN,
    Courses: PRESENCE.OPTIONAL,
    Requirements: PRESENCE.FORBIDDEN,
    Training_Records: PRESENCE.REQUIRED,
  },
});

/** Sheets whose rows may create or update reference lists, per package type. */
export const REFERENCE_LIST_SHEETS = deepFreeze(['Departments', 'Job_Titles']);

/** Package types allowed to create or update the reference lists above. */
export const REFERENCE_LIST_WRITERS = deepFreeze(['full']);

/* ------------------------------------------------------------------ *
 * Normalisation (DATA-CONTRACT.md §2)
 * ------------------------------------------------------------------ */

export const REFERENCE_CODE_PATTERN = /^[A-Z0-9_-]{2,20}$/;
export const EMPLOYEE_CODE_PATTERN = /^[A-Za-z0-9-]{3,20}$/;
export const SOURCE_RECORD_ID_MAX_LENGTH = 64;
export const DATE_TEXT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Fields normalised as reference codes: trimmed, then upper-cased. */
export const REFERENCE_CODE_FIELDS = deepFreeze([
  'organization_code',
  'source_system',
  'department_code',
  'job_title_code',
  'course_code',
  'site_code',
]);

/**
 * Identifiers that keep their case. Final meaning of `employee_code` is open
 * decision H-01; availability of `source_record_id` is open decision I-01.
 */
export const CASE_PRESERVED_FIELDS = deepFreeze(['employee_code', 'source_record_id']);

export const NORMALIZATION_RULES = deepFreeze({
  text: {
    trim: true,
    collapseInnerWhitespace: true,
    emptyMeansNoValue: true,
  },
  referenceCode: {
    fields: REFERENCE_CODE_FIELDS,
    trim: true,
    upperCase: true,
    pattern: REFERENCE_CODE_PATTERN.source,
    // Duplicate detection and reference matching run on the normalised value,
    // so `ops` and `OPS` are one key (KEY_DUPLICATE).
    duplicateDetectionAfterNormalization: true,
    matchByDisplayName: false,
  },
  caseSensitiveIdentifier: {
    fields: CASE_PRESERVED_FIELDS,
    trim: true,
    upperCase: false,
    compare: 'exact',
  },
  date: {
    textPattern: DATE_TEXT_PATTERN.source,
    acceptExcelSerial: true,
    acceptExcelSerialWithDayFraction: false,
    acceptSlashSeparators: false,
    timeZone: 'Asia/Riyadh',
  },
  enumeration: {
    matchCaseInsensitively: true,
    storeSpellingFromContract: true,
  },
});

/**
 * Normalise a reference code: trim, then upper-case.
 * Returns an empty string for missing values. No validation is applied here.
 */
export function normalizeReferenceCode(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
}

/**
 * Normalise a case-preserving identifier: trim only.
 */
export function normalizeIdentifier(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Duplicate-detection key for a value of `field`.
 * Reference codes collapse to their upper-cased form; identifiers keep case.
 */
export function duplicateKeyFor(field, value) {
  return REFERENCE_CODE_FIELDS.includes(field)
    ? normalizeReferenceCode(value)
    : normalizeIdentifier(value);
}

/* ------------------------------------------------------------------ *
 * Value domains (DATA-CONTRACT.md §2.4, §3)
 * ------------------------------------------------------------------ */

export const ENUMS = deepFreeze({
  yes_no: ['Yes', 'No'],
  employment_status: ['Active', 'Inactive', 'Left'],
  requirement_type: ['Mandatory', 'Recommended'],
  completion_status: ['Completed', 'In Progress', 'Not Started'],
  requirement_source: ['approved'],
  contact_status: ['unverified', 'verified', 'invalid', 'withdrawn'],
  preferred_language: ['ar', 'en'],
  allowed_flag: ['Yes', 'No', 'Unknown'],
  communication_authorization_basis: ['not_defined'],
});

/** Value types used by field definitions. */
export const FIELD_TYPES = deepFreeze({
  CODE: 'code',
  IDENTIFIER: 'identifier',
  TEXT: 'text',
  DATE: 'date',
  INTEGER: 'integer',
  ENUM: 'enum',
  EMAIL: 'email',
  PHONE: 'phone',
});

/* ------------------------------------------------------------------ *
 * `_Contract` fields (DATA-CONTRACT.md §1.2, CONTACT-CONTRACT.md §2.1)
 * ------------------------------------------------------------------ */

export const CONTRACT_FIELDS = deepFreeze([
  {
    name: 'contract_version',
    presence: PRESENCE.REQUIRED,
    type: FIELD_TYPES.TEXT,
    literal: TRAINING_CONTRACT_VERSION,
  },
  {
    name: 'package_type',
    presence: PRESENCE.REQUIRED,
    type: FIELD_TYPES.ENUM,
    values: PACKAGE_TYPES,
  },
  { name: 'organization_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE },
  {
    name: 'source_system',
    presence: PRESENCE.CONDITIONAL,
    type: FIELD_TYPES.CODE,
    condition: 'required for package types full and training',
    requiredForPackageTypes: ['full', 'training'],
  },
  {
    name: 'extract_date',
    presence: PRESENCE.REQUIRED,
    type: FIELD_TYPES.DATE,
    notAfter: 'as_of_date',
  },
  {
    name: 'prepared_by_role',
    presence: PRESENCE.REQUIRED,
    type: FIELD_TYPES.TEXT,
    minLength: 2,
    maxLength: 60,
    note: 'role text; must not be a personal name',
  },
  {
    name: 'requirements_effective_from',
    presence: PRESENCE.CONDITIONAL,
    type: FIELD_TYPES.DATE,
    condition: 'required for package types full and requirements',
    requiredForPackageTypes: ['full', 'requirements'],
  },
]);

export const CONTACT_CONTRACT_FIELDS = deepFreeze([
  {
    name: 'contract_version',
    presence: PRESENCE.REQUIRED,
    type: FIELD_TYPES.TEXT,
    literal: CONTACT_CONTRACT_VERSION,
  },
  { name: 'organization_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE },
  {
    name: 'extract_date',
    presence: PRESENCE.REQUIRED,
    type: FIELD_TYPES.DATE,
    notAfter: 'as_of_date',
  },
  {
    name: 'prepared_by_role',
    presence: PRESENCE.REQUIRED,
    type: FIELD_TYPES.TEXT,
    minLength: 2,
    maxLength: 60,
    note: 'role text; must not be a personal name',
  },
]);

/* ------------------------------------------------------------------ *
 * Entity field definitions (DATA-CONTRACT.md §3)
 * ------------------------------------------------------------------ */

export const ENTITIES = deepFreeze({
  Departments: {
    section: '3.1',
    key: ['department_code'],
    fields: [
      {
        name: 'department_code',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.CODE,
        key: true,
        note: 'a code must not be reused for a different department',
      },
      { name: 'name_en', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.TEXT, displayOnly: true },
      { name: 'name_ar', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.TEXT, displayOnly: true },
      {
        name: 'active',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.yes_no,
      },
    ],
  },

  Job_Titles: {
    section: '3.2',
    key: ['job_title_code'],
    fields: [
      { name: 'job_title_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE, key: true },
      { name: 'name_en', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.TEXT, displayOnly: true },
      { name: 'name_ar', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.TEXT, displayOnly: true },
      {
        name: 'department_code',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.CODE,
        note: 'empty = usable in any department; if set, use with another department is JOB_TITLE_SCOPE (block)',
      },
      {
        name: 'active',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.yes_no,
      },
    ],
  },

  Employees: {
    section: '3.3',
    key: ['employee_code'],
    fields: [
      {
        name: 'employee_code',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.IDENTIFIER,
        key: true,
        pattern: EMPLOYEE_CODE_PATTERN.source,
        decision: 'H-01',
      },
      { name: 'badge_number', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.TEXT },
      {
        name: 'full_name',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.TEXT,
        minLength: 2,
        maxLength: 120,
        displayOnly: true,
      },
      {
        name: 'full_name_ar',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.TEXT,
        displayOnly: true,
      },
      { name: 'department_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE },
      { name: 'job_title_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE },
      {
        name: 'employment_status',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.employment_status,
        decision: 'H-02',
      },
      {
        name: 'status_effective_date',
        presence: PRESENCE.CONDITIONAL,
        type: FIELD_TYPES.DATE,
        condition: 'required when employment_status is not Active',
        notAfter: 'extract_date',
      },
      { name: 'hire_date', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.DATE, notAfter: 'extract_date' },
      { name: 'site_code', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.CODE },
    ],
  },

  Courses: {
    section: '3.4',
    key: ['course_code'],
    fields: [
      { name: 'course_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE, key: true },
      { name: 'name_en', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.TEXT, displayOnly: true },
      { name: 'name_ar', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.TEXT, displayOnly: true },
      { name: 'category', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.TEXT },
      { name: 'regulatory_reference', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.TEXT },
      {
        name: 'suggested_validity_months',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.INTEGER,
        min: 1,
        max: 120,
        note: 'help only; must not be used to compute any status',
      },
    ],
  },

  Requirements: {
    section: '3.5',
    key: ['department_code', 'job_title_code', 'course_code', 'effective_from'],
    fields: [
      { name: 'department_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE, key: true },
      {
        name: 'job_title_code',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.CODE,
        key: true,
        note: 'wildcards must not be used',
        decision: 'T-08',
      },
      { name: 'course_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE, key: true },
      {
        name: 'requirement_type',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.requirement_type,
      },
      {
        name: 'validity_months',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.INTEGER,
        min: 1,
        max: 120,
        note: 'official validity; empty = no expiry for this role',
        decision: 'T-02',
      },
      {
        name: 'effective_from',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.DATE,
        key: true,
        note: 'must equal _Contract.requirements_effective_from',
      },
      {
        name: 'effective_to',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.DATE,
        note: 'inclusive; must not be before effective_from',
      },
      { name: 'approval_reference', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.TEXT },
      {
        name: 'approved_by_role',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.TEXT,
        note: 'role, not a personal name',
      },
      { name: 'approved_on', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.DATE },
      {
        name: 'source',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.requirement_source,
        literal: 'approved',
      },
    ],
  },

  Training_Records: {
    section: '3.6',
    key: ['source_record_id'],
    keyNote: 'full key is (organization, _Contract.source_system, source_record_id)',
    fields: [
      {
        name: 'source_record_id',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.IDENTIFIER,
        key: true,
        minLength: 1,
        maxLength: SOURCE_RECORD_ID_MAX_LENGTH,
        decision: 'I-01',
      },
      { name: 'employee_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.IDENTIFIER },
      { name: 'course_code', presence: PRESENCE.REQUIRED, type: FIELD_TYPES.CODE },
      {
        name: 'completion_status',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.completion_status,
      },
      {
        name: 'completion_date',
        presence: PRESENCE.CONDITIONAL,
        type: FIELD_TYPES.DATE,
        condition: 'required when completion_status is Completed; ignored otherwise (DATES_ON_INCOMPLETE)',
        notAfter: 'extract_date',
      },
      {
        name: 'expiry_date',
        presence: PRESENCE.CONDITIONAL,
        type: FIELD_TYPES.DATE,
        condition:
          'required when completion_status is Completed and the requirement effective at the As Of Date is Mandatory with validity_months; never recalculated',
        decision: 'T-07',
      },
      {
        name: 'certificate_number',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.TEXT,
        note: 'SHOULD be present when Completed; never a key',
        decision: 'T-06',
      },
      { name: 'training_provider', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.TEXT },
      { name: 'remarks', presence: PRESENCE.OPTIONAL, type: FIELD_TYPES.TEXT, maxLength: 500 },
    ],
  },

  Contacts: {
    contract: CONTACT_CONTRACT_VERSION,
    section: 'CONTACT-CONTRACT.md §3',
    key: ['employee_code'],
    fields: [
      {
        name: 'employee_code',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.IDENTIFIER,
        key: true,
        pattern: EMPLOYEE_CODE_PATTERN.source,
      },
      {
        name: 'email',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.EMAIL,
        note: 'lower-cased; basic pattern local@domain.tld',
      },
      {
        name: 'phone_e164',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.PHONE,
        pattern: '^\\+[1-9][0-9]{7,14}$',
      },
      {
        name: 'preferred_language',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.preferred_language,
      },
      {
        name: 'email_allowed',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.allowed_flag,
      },
      {
        name: 'whatsapp_allowed',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.allowed_flag,
      },
      {
        name: 'communication_authorization_basis',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.communication_authorization_basis,
        note: 'only not_defined is accepted until P-01 is approved',
        decision: 'P-01',
      },
      {
        name: 'authorization_reference',
        presence: PRESENCE.CONDITIONAL,
        type: FIELD_TYPES.TEXT,
        condition: 'required when communication_authorization_basis is not not_defined',
      },
      {
        name: 'authorization_recorded_at',
        presence: PRESENCE.CONDITIONAL,
        type: FIELD_TYPES.DATE,
        condition: 'required when communication_authorization_basis is not not_defined',
        notAfter: 'extract_date',
      },
      {
        name: 'contact_status',
        presence: PRESENCE.REQUIRED,
        type: FIELD_TYPES.ENUM,
        values: ENUMS.contact_status,
      },
      {
        name: 'verified_at',
        presence: PRESENCE.OPTIONAL,
        type: FIELD_TYPES.DATE,
        notAfter: 'extract_date',
      },
    ],
  },
});

/** Column names that must never appear in any package (§3.10, decision P-04). */
export const FORBIDDEN_COLUMN_TOPICS = deepFreeze([
  'national_id',
  'iqama',
  'date_of_birth',
  'nationality',
]);

/* ------------------------------------------------------------------ *
 * Validation codes (DATA-CONTRACT.md §4, CONTACT-CONTRACT.md §3)
 * ------------------------------------------------------------------ */

export const SEVERITY = deepFreeze({ BLOCK: 'block', WARN: 'warn', INFO: 'info' });

/**
 * One entry per validation code, with the severity given in the specification.
 * `decision` names the open decision that may change the severity later; it
 * does not change the Phase 2A behaviour.
 */
export const VALIDATION_CODES = deepFreeze({
  CONTRACT_VERSION: { severity: SEVERITY.BLOCK },
  PACKAGE_TYPE: { severity: SEVERITY.BLOCK },
  CONTRACT_FIELD: { severity: SEVERITY.BLOCK },
  SHEET_MISSING: { severity: SEVERITY.BLOCK },
  SHEET_UNEXPECTED: { severity: SEVERITY.WARN },
  COLUMN_MISSING: { severity: SEVERITY.BLOCK },
  COLUMN_UNKNOWN: { severity: SEVERITY.WARN },
  FORBIDDEN_COLUMN: { severity: SEVERITY.BLOCK, decision: 'P-04' },
  KEY_MISSING: { severity: SEVERITY.BLOCK },
  KEY_DUPLICATE: { severity: SEVERITY.BLOCK },
  KEY_PATTERN: { severity: SEVERITY.BLOCK },
  REF_UNKNOWN: { severity: SEVERITY.BLOCK },
  REF_INACTIVE_CODE: { severity: SEVERITY.BLOCK },
  JOB_TITLE_SCOPE: { severity: SEVERITY.BLOCK },
  ORG_MISMATCH: { severity: SEVERITY.BLOCK },
  ORG_NOT_LOADED: { severity: SEVERITY.BLOCK },
  DATE_INVALID: { severity: SEVERITY.BLOCK },
  DATE_FUTURE: { severity: SEVERITY.BLOCK },
  DATE_ORDER: { severity: SEVERITY.BLOCK },
  REQUIRED_EMPTY: { severity: SEVERITY.BLOCK },
  VALUE_INVALID: { severity: SEVERITY.BLOCK },
  CONFLICT_IN_FILE: { severity: SEVERITY.BLOCK },
  REQ_NOT_APPROVED: { severity: SEVERITY.BLOCK },
  REQ_OVERLAP: { severity: SEVERITY.BLOCK },
  REQ_EFFECTIVE_MISMATCH: { severity: SEVERITY.BLOCK },
  REQ_VERSION_OLDER: { severity: SEVERITY.BLOCK },
  REQ_VERSION_EXISTS: { severity: SEVERITY.BLOCK },
  REQ_ON_DERIVED: { severity: SEVERITY.BLOCK },
  RECORD_IDENTITY_CHANGED: { severity: SEVERITY.BLOCK },
  COMPLETED_WITHOUT_EXPIRY: { severity: SEVERITY.BLOCK, decision: 'T-07' },
  EXPIRY_VALIDITY_MISMATCH: { severity: SEVERITY.WARN, decision: 'T-03' },
  CERT_MISSING: { severity: SEVERITY.WARN, decision: 'T-06' },
  CERT_DUPLICATE: { severity: SEVERITY.WARN, decision: 'T-06' },
  POSSIBLE_DUPLICATE_RECORD: { severity: SEVERITY.WARN },
  DATES_ON_INCOMPLETE: { severity: SEVERITY.WARN },
  EMPLOYEE_NOT_CONFIGURED: { severity: SEVERITY.WARN },
  SUGGESTED_VALIDITY_DIFFERS: { severity: SEVERITY.INFO },
  RECORD_FOR_INACTIVE: { severity: SEVERITY.INFO },
  RECORD_UNCHANGED: { severity: SEVERITY.INFO },
  REQ_UNCHANGED: { severity: SEVERITY.INFO },
  CONTACT_EMAIL_INVALID: { severity: SEVERITY.BLOCK, contract: CONTACT_CONTRACT_VERSION },
  CONTACT_PHONE_INVALID: { severity: SEVERITY.BLOCK, contract: CONTACT_CONTRACT_VERSION },
  CONTACT_BASIS_UNKNOWN: {
    severity: SEVERITY.BLOCK,
    contract: CONTACT_CONTRACT_VERSION,
    decision: 'P-01',
  },
  CONTACT_BASIS_EVIDENCE_MISSING: {
    severity: SEVERITY.BLOCK,
    contract: CONTACT_CONTRACT_VERSION,
  },
  CONTACT_CHANNEL_WITHOUT_VALUE: { severity: SEVERITY.WARN, contract: CONTACT_CONTRACT_VERSION },
  CONTACT_FOR_INACTIVE: { severity: SEVERITY.INFO, contract: CONTACT_CONTRACT_VERSION },
});

export const VALIDATION_CODE_NAMES = deepFreeze(Object.keys(VALIDATION_CODES));

/* ------------------------------------------------------------------ *
 * Lookup helpers over the definitions (no validation logic)
 * ------------------------------------------------------------------ */

/** Sheet presence for a package type; unknown sheets count as forbidden. */
export function sheetPresence(packageType, sheetName) {
  const sheets = PACKAGE_SHEETS[packageType];
  if (!sheets) return undefined;
  return sheets[sheetName] ?? PRESENCE.FORBIDDEN;
}

/** Sheets that MUST be present for a package type. */
export function requiredSheets(packageType) {
  const sheets = PACKAGE_SHEETS[packageType];
  if (!sheets) return [];
  return Object.keys(sheets).filter((name) => sheets[name] === PRESENCE.REQUIRED);
}

/** Sheets that MAY be present for a package type (required + optional). */
export function allowedSheets(packageType) {
  const sheets = PACKAGE_SHEETS[packageType];
  if (!sheets) return [];
  return Object.keys(sheets).filter((name) => sheets[name] !== PRESENCE.FORBIDDEN);
}

/** True when the package type may create or update the reference lists. */
export function mayWriteReferenceLists(packageType) {
  return REFERENCE_LIST_WRITERS.includes(packageType);
}

/** Field definition by sheet and field name. */
export function fieldDefinition(sheetName, fieldName) {
  const entity = ENTITIES[sheetName];
  if (!entity) return undefined;
  return entity.fields.find((field) => field.name === fieldName);
}

/** Severity of a validation code. */
export function severityOf(code) {
  return VALIDATION_CODES[code]?.severity;
}
