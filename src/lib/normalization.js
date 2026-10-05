import { BOOLEAN_TRUE_VALUES, BOOLEAN_FALSE_VALUES, EMPLOYMENT_STATUS, COMPLETION_STATUS } from './constants.js';

// Parse YYYY-MM-DD safely without timezone shift
export function parseUTCDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

// Difference in calendar days: d1 - d2 (positive if d1 is after d2)
export function dateDiffDays(dateStr1, dateStr2) {
  const d1 = parseUTCDate(dateStr1);
  const d2 = parseUTCDate(dateStr2);
  if (!d1 || !d2) return null;
  return Math.round((d1.getTime() - d2.getTime()) / 86400000);
}

// Add calendar months to YYYY-MM-DD. The day is clamped to the last valid
// day of the target month (31 Jan + 1 month = 28/29 Feb, not early March).
export function addCalendarMonths(dateStr, months) {
  const d = parseUTCDate(dateStr);
  if (!d) return null;
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function isValidDateStr(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  const [y, m, day] = s.split('-').map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

// Convert Excel serial date number to YYYY-MM-DD string
export function excelSerialToDateStr(serial) {
  if (typeof serial !== 'number') return null;
  // Excel epoch: 1899-12-30
  const utcDays = serial - 25569; // days since Unix epoch
  const ms = utcDays * 86400000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Normalize a raw date value from import (could be string, Excel serial, or MM/DD/YYYY)
export function normalizeDate(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') {
    return excelSerialToDateStr(raw) || '';
  }
  const s = String(raw).trim();
  if (!s) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${String(slash[1]).padStart(2, '0')}-${String(slash[2]).padStart(2, '0')}`;
  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy && Number(dmy[1]) > 12) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  return s; // return as-is; validator will flag it
}

export function normalizeBoolean(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  const s = String(raw).trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(s)) return true;
  if (BOOLEAN_FALSE_VALUES.has(s)) return false;
  return null; // unparseable
}

export function normalizeEmploymentStatus(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // Case-insensitive match
  for (const v of Object.values(EMPLOYMENT_STATUS)) {
    if (v.toLowerCase() === s.toLowerCase()) return v;
  }
  return s; // return original; validator will flag it
}

export function normalizeCompletionStatus(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  for (const v of Object.values(COMPLETION_STATUS)) {
    if (v.toLowerCase() === s.toLowerCase()) return v;
  }
  return s;
}

// Normalize a raw training record without mutating the original
export function normalizeTrainingRecord(raw) {
  return {
    Employee_ID: String(raw.Employee_ID ?? '').trim(),
    Employee_Name: String(raw.Employee_Name ?? '').trim(),
    Department: String(raw.Department ?? '').trim(),
    Job_Title: String(raw.Job_Title ?? '').trim(),
    Employment_Status: normalizeEmploymentStatus(raw.Employment_Status),
    Course_Name: String(raw.Course_Name ?? '').trim(),
    Course_Code: String(raw.Course_Code ?? '').trim(),
    Training_Required: normalizeBoolean(raw.Training_Required),
    Completion_Status: normalizeCompletionStatus(raw.Completion_Status),
    Issue_Date: normalizeDate(raw.Issue_Date),
    Expiry_Date: normalizeDate(raw.Expiry_Date),
    Certificate_Number: String(raw.Certificate_Number ?? '').trim(),
    Training_Provider: String(raw.Training_Provider ?? '').trim(),
    Remarks: String(raw.Remarks ?? '').trim(),
  };
}

// Normalize a raw requirements record without mutating the original
export function normalizeRequirementsRecord(raw) {
  return {
    Department: String(raw.Department ?? '').trim(),
    Job_Title: String(raw.Job_Title ?? '').trim(),
    Course_Code: String(raw.Course_Code ?? '').trim(),
    Course_Name: String(raw.Course_Name ?? '').trim(),
    Mandatory: normalizeBoolean(raw.Mandatory),
    Validity_Months: Number(raw.Validity_Months) || 0,
    Description: String(raw.Description ?? '').trim(),
  };
}

export function formatDateDisplay(dateStr, lang = 'en') {
  if (!dateStr) return '—';
  const d = parseUTCDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', {
    year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC',
  });
}
