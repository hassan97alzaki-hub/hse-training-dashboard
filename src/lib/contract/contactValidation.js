/**
 * Validation of a contact package of `HSE-CONTACT-1.0`.
 *
 * Source of truth: docs/CONTACT-CONTRACT.md, with the shared conventions,
 * severities and generic codes of docs/DATA-CONTRACT.md §0, §2 and §4, read
 * through src/lib/contract/schema.js.
 *
 * Contact data is personal data. This module therefore:
 * - puts no name, email address, phone number or any other cell value into an
 *   issue; an issue carries a code, a severity, the sheet, the row number and
 *   the field name only (CONTACT-CONTRACT.md §4);
 * - returns counts that are plain numbers, with no identifier and no list of
 *   employees;
 * - writes nothing to the console, to storage or to an export.
 *
 * Scope limits: input is rows a caller already parsed. There is no XLSX or CSV
 * reading, no staging, no UI, no storage and no network. Phase 2A sends nothing.
 */

import {
  SEVERITY,
  ENTITIES,
  CONTACT_CONTRACT_VERSION,
  CONTACT_CONTRACT_FIELDS,
  CONTACT_SHEET_NAMES,
  ENUMS,
  PRESENCE,
  normalizeReferenceCode,
} from './schema.js';
import {
  HEADER_ROWS,
  columnsOf,
  collapseText,
  issue,
  validateColumns,
  normalizeRow,
  parseContractDate,
  daysBetween,
  finishResult,
} from './core.js';

const SHEET = 'Contacts';
const CONTRACT_SHEET = '_Contract';

/** The basis value that is accepted while decision P-01 is pending. */
export const UNDEFINED_BASIS = 'not_defined';

/** `local@domain.tld`: the basic pattern of the contract, nothing stricter. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** E.164: a plus sign, a non-zero country digit, then 7 to 14 digits. */
export const PHONE_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/**
 * Fields whose own contract code replaces the generic one, so they are
 * normalised as text here and checked below.
 */
const OWN_RULE_FIELDS = Object.freeze([
  'email',
  'phone_e164',
  'communication_authorization_basis',
  'authorization_reference',
  'authorization_recorded_at',
  'verified_at',
]);

function matchEnum(value, allowed) {
  const text = collapseText(value);
  if (!text) return undefined;
  return allowed.find((option) => option.toLowerCase() === text.toLowerCase());
}

/* ------------------------------------------------------------------ *
 * `_Contract` (CONTACT-CONTRACT.md §2.1)
 * ------------------------------------------------------------------ */

function validateContract({ contract, boundOrganizationCode, asOfDate }, issues) {
  const row = contract ?? {};
  const normalised = {};

  const version = collapseText(row.contract_version);
  if (version !== CONTACT_CONTRACT_VERSION) {
    issues.push(issue('CONTRACT_VERSION', CONTRACT_SHEET, undefined, 'contract_version'));
  } else {
    normalised.contract_version = version;
  }

  const organizationCode = normalizeReferenceCode(row.organization_code);
  const bound = normalizeReferenceCode(boundOrganizationCode);
  if (!organizationCode) {
    issues.push(issue('CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'organization_code'));
  } else {
    normalised.organization_code = organizationCode;
    if (!bound) {
      issues.push(issue('ORG_NOT_LOADED', CONTRACT_SHEET, undefined, 'organization_code'));
    } else if (bound !== organizationCode) {
      issues.push(issue('ORG_MISMATCH', CONTRACT_SHEET, undefined, 'organization_code'));
    }
  }

  const extractDate = parseContractDate(row.extract_date);
  if (extractDate === undefined || extractDate === '') {
    issues.push(
      issue(
        extractDate === undefined ? 'DATE_INVALID' : 'CONTRACT_FIELD',
        CONTRACT_SHEET,
        undefined,
        'extract_date',
      ),
    );
  } else {
    normalised.extract_date = extractDate;
    if (asOfDate && daysBetween(extractDate, asOfDate) > 0) {
      issues.push(issue('DATE_FUTURE', CONTRACT_SHEET, undefined, 'extract_date'));
    }
  }

  const preparedByRole = collapseText(row.prepared_by_role);
  const definition = CONTACT_CONTRACT_FIELDS.find((field) => field.name === 'prepared_by_role');
  if (
    !preparedByRole ||
    preparedByRole.length < definition.minLength ||
    preparedByRole.length > definition.maxLength
  ) {
    issues.push(issue('CONTRACT_FIELD', CONTRACT_SHEET, undefined, 'prepared_by_role'));
  } else {
    normalised.prepared_by_role = preparedByRole;
  }

  return normalised;
}

/* ------------------------------------------------------------------ *
 * Sheets
 * ------------------------------------------------------------------ */

/**
 * `_Contract` and `Contacts` are required. Any other sheet, including a sheet
 * of a training package, is `SHEET_UNEXPECTED` (`warn`) and is ignored
 * completely (CONTACT-CONTRACT.md §2).
 */
function validateSheets(sheetNames, issues) {
  if (!Array.isArray(sheetNames)) return;
  for (const name of CONTACT_SHEET_NAMES) {
    if (!sheetNames.includes(name)) {
      issues.push(issue('SHEET_MISSING', name, undefined, undefined));
    }
  }
  for (const name of sheetNames) {
    if (!CONTACT_SHEET_NAMES.includes(name)) {
      issues.push(issue('SHEET_UNEXPECTED', name, undefined, undefined));
    }
  }
}

/* ------------------------------------------------------------------ *
 * `Contacts` (CONTACT-CONTRACT.md §3)
 * ------------------------------------------------------------------ */

function indexEmployees(rows) {
  const index = new Map();
  for (const row of rows ?? []) {
    // `employee_code` keeps its case and is compared exactly.
    if (row?.employee_code && !index.has(row.employee_code)) index.set(row.employee_code, row);
  }
  return index;
}

function validateContactRow(raw, rowNumber, context, issues) {
  const row = normalizeRow(SHEET, raw, rowNumber, issues, { skip: OWN_RULE_FIELDS });
  const { employees, extractDate, approvedBases } = context;

  const employee = row.employee_code ? employees.get(row.employee_code) : undefined;
  if (row.employee_code && !employee) {
    issues.push(issue('REF_UNKNOWN', SHEET, rowNumber, 'employee_code'));
  }
  if (employee && employee.employment_status && employee.employment_status !== 'Active') {
    issues.push(issue('CONTACT_FOR_INACTIVE', SHEET, rowNumber, 'employee_code'));
  }

  const email = collapseText(raw?.email).toLowerCase();
  if (email) {
    if (!EMAIL_PATTERN.test(email)) {
      issues.push(issue('CONTACT_EMAIL_INVALID', SHEET, rowNumber, 'email'));
    } else {
      row.email = email;
    }
  }

  const phone = collapseText(raw?.phone_e164).replace(/\s/g, '');
  if (phone) {
    if (!PHONE_E164_PATTERN.test(phone)) {
      issues.push(issue('CONTACT_PHONE_INVALID', SHEET, rowNumber, 'phone_e164'));
    } else {
      row.phone_e164 = phone;
    }
  }

  // Only `not_defined` is accepted while P-01 is pending. A caller MAY pass the
  // bases an approved decision allows; the default list stays `not_defined`
  // alone, which is importable but never eligible for sending.
  const basisText = collapseText(raw?.communication_authorization_basis);
  const basis = approvedBases.find((option) => option.toLowerCase() === basisText.toLowerCase());
  if (!basisText) {
    issues.push(issue('REQUIRED_EMPTY', SHEET, rowNumber, 'communication_authorization_basis'));
  } else if (!basis) {
    issues.push(issue('CONTACT_BASIS_UNKNOWN', SHEET, rowNumber, 'communication_authorization_basis'));
  } else {
    row.communication_authorization_basis = basis;
  }

  // Evidence is required as soon as the basis is not `not_defined`.
  const reference = collapseText(raw?.authorization_reference);
  const recordedAt = parseContractDate(raw?.authorization_recorded_at);
  if (basis && basis !== UNDEFINED_BASIS) {
    if (!reference || !recordedAt) {
      issues.push(
        issue('CONTACT_BASIS_EVIDENCE_MISSING', SHEET, rowNumber, 'authorization_reference'),
      );
    }
  }
  if (reference) row.authorization_reference = reference;
  if (recordedAt === undefined) {
    issues.push(issue('DATE_INVALID', SHEET, rowNumber, 'authorization_recorded_at'));
  } else if (recordedAt) {
    row.authorization_recorded_at = recordedAt;
    if (extractDate && daysBetween(recordedAt, extractDate) > 0) {
      issues.push(issue('DATE_FUTURE', SHEET, rowNumber, 'authorization_recorded_at'));
    }
  }

  const verifiedAt = parseContractDate(raw?.verified_at);
  if (verifiedAt === undefined) {
    issues.push(issue('DATE_INVALID', SHEET, rowNumber, 'verified_at'));
  } else if (verifiedAt) {
    row.verified_at = verifiedAt;
    if (extractDate && daysBetween(verifiedAt, extractDate) > 0) {
      issues.push(issue('DATE_FUTURE', SHEET, rowNumber, 'verified_at'));
    }
  }

  // A channel that is allowed without its value cannot be used (§3).
  if (row.email_allowed === 'Yes' && !row.email) {
    issues.push(issue('CONTACT_CHANNEL_WITHOUT_VALUE', SHEET, rowNumber, 'email'));
  }
  if (row.whatsapp_allowed === 'Yes' && !row.phone_e164) {
    issues.push(issue('CONTACT_CHANNEL_WITHOUT_VALUE', SHEET, rowNumber, 'phone_e164'));
  }

  return row;
}

/**
 * Validate one contact package.
 *
 * Input:
 * - `contract`: the single `_Contract` value row.
 * - `contacts`: the rows of the `Contacts` sheet.
 * - `sheetNames` MAY list the sheets of the file, for the sheet rules.
 * - `columns` MAY declare the header of an empty `Contacts` sheet.
 * - `boundOrganizationCode`: the organization the session is bound to (§6 of
 *   `HSE-DC-1.0`).
 * - `approvedEmployees`: the approved employee rows; `employee_code` is matched
 *   exactly.
 * - `asOfDate`: today, given by the caller; no clock is read here.
 * - `approvedBases` MAY carry the bases an approved decision allows. The
 *   default is `['not_defined']`, which is importable but not eligible.
 *
 * Returns `{ ok, rows, issues, counts }`, frozen. No input is changed.
 */
export function validateContactPackage({
  contract,
  contacts,
  sheetNames,
  columns,
  boundOrganizationCode,
  approvedEmployees,
  asOfDate,
  approvedBases = [UNDEFINED_BASIS],
} = {}) {
  const rows = Array.isArray(contacts) ? contacts : [];
  const presentColumns = columnsOf(rows, columns);
  const hasHeader = Array.isArray(columns) || rows.length > 0;
  const issues = [];

  validateSheets(sheetNames, issues);
  const contractRow = validateContract({ contract, boundOrganizationCode, asOfDate }, issues);
  if (hasHeader) issues.push(...validateColumns(SHEET, presentColumns));
  const columnBlocked = issues.some(
    (entry) => entry.severity === SEVERITY.BLOCK && entry.sheet === SHEET,
  );

  const context = {
    employees: indexEmployees(approvedEmployees),
    extractDate: contractRow.extract_date ?? '',
    approvedBases: [...approvedBases],
  };

  const accepted = [];
  const seenCodes = new Map();
  let duplicates = 0;
  let rejected = 0;
  let inactive = 0;
  let withEmail = 0;
  let withPhone = 0;

  rows.forEach((raw, index) => {
    const rowNumber = index + 1 + HEADER_ROWS;
    const rowIssues = [];
    const row = validateContactRow(raw, rowNumber, context, rowIssues);

    const code = row.employee_code;
    if (code) {
      if (seenCodes.has(code)) {
        duplicates += 1;
        rowIssues.push(issue('KEY_DUPLICATE', SHEET, rowNumber, 'employee_code'));
      } else {
        seenCodes.set(code, rowNumber);
      }
    }

    if (rowIssues.some((entry) => entry.code === 'CONTACT_FOR_INACTIVE')) inactive += 1;
    issues.push(...rowIssues);

    if (rowIssues.some((entry) => entry.severity === SEVERITY.BLOCK) || columnBlocked) {
      rejected += 1;
      return;
    }
    if (row.email) withEmail += 1;
    if (row.phone_e164) withPhone += 1;
    accepted.push(Object.freeze(row));
  });

  return finishResult({
    contract: Object.freeze(contractRow),
    sheet: SHEET,
    rows: Object.freeze(accepted),
    issues,
    counts: {
      input: rows.length,
      accepted: accepted.length,
      rejected,
      duplicateKeys: duplicates,
      forInactive: inactive,
      withEmail,
      withPhone,
      columns: presentColumns.length,
    },
  });
}

/** The enumerations of the `Contacts` sheet, for callers and tests. */
export const CONTACT_ENUMS = Object.freeze({
  preferred_language: ENUMS.preferred_language,
  allowed_flag: ENUMS.allowed_flag,
  contact_status: ENUMS.contact_status,
});

/** Required field names of the `Contacts` sheet. */
export const CONTACT_REQUIRED_FIELDS = Object.freeze(
  ENTITIES.Contacts.fields
    .filter((field) => field.presence === PRESENCE.REQUIRED)
    .map((field) => field.name),
);

export { CONTACT_CONTRACT_VERSION, matchEnum };
