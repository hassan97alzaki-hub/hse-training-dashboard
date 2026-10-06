/**
 * Primitives shared by the `HSE-DC-1.0` validators: issue building, column
 * checks, field normalisation, date reading and the result shape.
 *
 * Every function here is pure. No file, clock, network or XLSX access.
 * Issues carry a code, a severity, the sheet, the row number, the field name
 * and numeric details only — never a value, a name or a raw row (§4.1).
 */

import {
  PRESENCE,
  FIELD_TYPES,
  SEVERITY,
  ENTITIES,
  REFERENCE_CODE_PATTERN,
  FORBIDDEN_COLUMN_TOPICS,
  normalizeReferenceCode,
  severityOf,
} from './schema.js';
import { isValidDateStr, excelSerialToDateStr, dateDiffDays } from '../normalization.js';

/** Spreadsheet row number of data row `index`: header is row 1. */
export const HEADER_ROWS = 1;

/** Row number key added to a normalised row. Not a contract field. */
export const ROW_NUMBER_KEY = '_row';

/* ------------------------------------------------------------------ *
 * Text, numbers and enumerations (§2.1, §2.4)
 * ------------------------------------------------------------------ */

export function collapseText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

/** Yes/No to boolean; returns undefined when the value is not in the list. */
export function parseYesNo(value) {
  const text = collapseText(value).toLowerCase();
  if (text === 'yes') return true;
  if (text === 'no') return false;
  return undefined;
}

/**
 * Integer of a cell: a JavaScript integer, or decimal digits only.
 * Exponent and hexadecimal forms (`1e2`, `0x10`), a decimal point, a sign and
 * a boolean are not numbers of this contract and return undefined.
 */
export function parseInteger(rawValue, text) {
  if (typeof rawValue === 'number') return Number.isInteger(rawValue) ? rawValue : undefined;
  if (typeof rawValue === 'boolean') return undefined;
  return /^[0-9]+$/.test(text) ? Number(text) : undefined;
}

/* ------------------------------------------------------------------ *
 * Dates (§2.3)
 * ------------------------------------------------------------------ */

/**
 * Read a date cell. Accepted: text `YYYY-MM-DD` that is a real calendar day,
 * or an Excel serial that is a whole number of days. Slash separators and a
 * serial with a day fraction are rejected.
 *
 * Returns the `YYYY-MM-DD` string, `''` for an empty cell, or `undefined` when
 * the value is not a date of this contract.
 */
export function parseContractDate(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  if (typeof rawValue === 'boolean') return undefined;
  if (typeof rawValue === 'number') {
    if (!Number.isInteger(rawValue) || rawValue <= 0) return undefined;
    return excelSerialToDateStr(rawValue) ?? undefined;
  }
  const text = String(rawValue).trim();
  if (text === '') return '';
  // A whole-number serial may also arrive as text.
  if (/^[0-9]+$/.test(text)) return excelSerialToDateStr(Number(text)) ?? undefined;
  return isValidDateStr(text) ? text : undefined;
}

/** `a` - `b` in calendar days, or null when either date is missing. */
export function daysBetween(a, b) {
  return dateDiffDays(a, b);
}

/* ------------------------------------------------------------------ *
 * Issues and results
 * ------------------------------------------------------------------ */

/**
 * Build one issue. `details` MAY carry numbers only (for example the day
 * difference of `EXPIRY_VALIDITY_MISMATCH`); any other type is dropped.
 */
export function issue(code, sheet, row, field, details) {
  const entry = { code, severity: severityOf(code) ?? SEVERITY.BLOCK, sheet };
  if (row !== undefined && row !== null) entry.row = row;
  if (field) entry.field = field;
  if (details && typeof details === 'object') {
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'number' && Number.isFinite(value)) entry[key] = value;
    }
  }
  return entry;
}

export function countSeverities(issues) {
  return {
    blocking: issues.filter((entry) => entry.severity === SEVERITY.BLOCK).length,
    warnings: issues.filter((entry) => entry.severity === SEVERITY.WARN).length,
    info: issues.filter((entry) => entry.severity === SEVERITY.INFO).length,
  };
}

/** Freeze a validator result and add `ok` plus the severity counts. */
export function finishResult(result) {
  const severities = countSeverities(result.issues);
  return Object.freeze({
    ...result,
    ok: severities.blocking === 0,
    issues: Object.freeze(result.issues),
    counts: Object.freeze({ ...result.counts, ...severities }),
  });
}

/* ------------------------------------------------------------------ *
 * Columns (§1.1, §3.10)
 * ------------------------------------------------------------------ */

function columnToken(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Spellings of the forbidden topics beyond the topic name itself. Every topic
 * of `FORBIDDEN_COLUMN_TOPICS` is always detected; these are extra aliases.
 * Language variants are added once agreed (§3.10, decision P-04).
 */
const FORBIDDEN_COLUMN_ALIASES = Object.freeze([
  'nationalidnumber',
  'iqamanumber',
  'iqamaid',
  'birthdate',
  'dob',
]);

const FORBIDDEN_COLUMN_TOKENS = Object.freeze([
  ...FORBIDDEN_COLUMN_TOPICS.map(columnToken),
  ...FORBIDDEN_COLUMN_ALIASES,
]);

export function isForbiddenColumn(name) {
  return FORBIDDEN_COLUMN_TOKENS.includes(columnToken(name));
}

/** Union of the column names seen in the rows, in first-seen order. */
export function columnsOf(rows, declared) {
  if (Array.isArray(declared)) return [...declared];
  const seen = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (!seen.includes(key)) seen.push(key);
    }
  }
  return seen;
}

/**
 * Check the header of one sheet against its field definitions.
 * Returns issues only; no value is included.
 */
export function validateColumns(sheet, columns) {
  const entity = ENTITIES[sheet];
  if (!entity) return [];
  const issues = [];
  const known = entity.fields.map((field) => field.name);
  const present = new Set(columns);

  for (const field of entity.fields) {
    if (field.presence === PRESENCE.REQUIRED && !present.has(field.name)) {
      issues.push(issue('COLUMN_MISSING', sheet, undefined, field.name));
    }
  }
  for (const column of columns) {
    if (isForbiddenColumn(column)) {
      issues.push(issue('FORBIDDEN_COLUMN', sheet, undefined, column));
    } else if (!known.includes(column)) {
      issues.push(issue('COLUMN_UNKNOWN', sheet, undefined, column));
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * Field and row normalisation driven by the definitions
 * ------------------------------------------------------------------ */

/**
 * Normalise and check one cell against its field definition.
 * Returns the normalised value, or `undefined` when the cell is empty or
 * rejected; rejections are pushed onto `issues`.
 *
 * A `conditional` field is never reported as missing here: its rule depends on
 * other fields of the row, so the entity validator decides.
 */
export function validateField(field, rawValue, sheet, rowNumber, issues) {
  const isCode = field.type === FIELD_TYPES.CODE;
  const isDate = field.type === FIELD_TYPES.DATE;

  if (isDate) {
    const date = parseContractDate(rawValue);
    if (date === undefined) {
      issues.push(issue('DATE_INVALID', sheet, rowNumber, field.name));
      return undefined;
    }
    if (date === '') {
      if (field.presence === PRESENCE.REQUIRED) {
        issues.push(issue('REQUIRED_EMPTY', sheet, rowNumber, field.name));
      }
      return undefined;
    }
    return date;
  }

  const value = isCode ? normalizeReferenceCode(rawValue) : collapseText(rawValue);

  if (value === '') {
    if (field.presence === PRESENCE.REQUIRED) {
      issues.push(
        issue(field.key ? 'KEY_MISSING' : 'REQUIRED_EMPTY', sheet, rowNumber, field.name),
      );
    }
    return undefined;
  }

  if (isCode) {
    if (!REFERENCE_CODE_PATTERN.test(value)) {
      issues.push(issue('KEY_PATTERN', sheet, rowNumber, field.name));
      return undefined;
    }
    return value;
  }

  if (field.type === FIELD_TYPES.ENUM) {
    const match = field.values.find((allowed) => allowed.toLowerCase() === value.toLowerCase());
    if (!match) {
      issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
      return undefined;
    }
    return match;
  }

  if (field.type === FIELD_TYPES.INTEGER) {
    const number = parseInteger(rawValue, value);
    const invalid =
      number === undefined ||
      (field.min !== undefined && number < field.min) ||
      (field.max !== undefined && number > field.max);
    if (invalid) {
      issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
      return undefined;
    }
    return number;
  }

  if (field.minLength !== undefined && value.length < field.minLength) {
    issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
    return undefined;
  }
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    issues.push(issue('VALUE_INVALID', sheet, rowNumber, field.name));
    return undefined;
  }
  return value;
}

/**
 * Normalise one row of `sheet` against its field definitions.
 * `pattern` MAY give a per-field pattern check for identifier fields.
 * The input row is never changed.
 */
export function normalizeRow(sheet, raw, rowNumber, issues, { patterns = {} } = {}) {
  const entity = ENTITIES[sheet];
  const normalised = { [ROW_NUMBER_KEY]: rowNumber };
  for (const field of entity.fields) {
    const value = validateField(field, raw?.[field.name], sheet, rowNumber, issues);
    if (value === undefined) continue;
    const pattern = patterns[field.name] ?? (field.pattern ? new RegExp(field.pattern) : undefined);
    if (pattern && typeof value === 'string' && !pattern.test(value)) {
      issues.push(issue('KEY_PATTERN', sheet, rowNumber, field.name));
      continue;
    }
    normalised[field.name] = field.name === 'active' ? parseYesNo(value) : value;
  }
  return normalised;
}

/**
 * `DATE_FUTURE` for every field whose definition carries `notAfter`.
 * `limits` maps a limit name (`extract_date`, `as_of_date`) to a date string.
 */
export function checkDateLimits(sheet, normalised, limits, issues) {
  const entity = ENTITIES[sheet];
  for (const field of entity.fields) {
    if (!field.notAfter) continue;
    const value = normalised[field.name];
    const limit = limits?.[field.notAfter];
    if (!value || !limit) continue;
    if (daysBetween(value, limit) > 0) {
      issues.push(issue('DATE_FUTURE', sheet, normalised[ROW_NUMBER_KEY], field.name));
    }
  }
}

export { SEVERITY, ENTITIES, PRESENCE, FIELD_TYPES, normalizeReferenceCode, severityOf };
