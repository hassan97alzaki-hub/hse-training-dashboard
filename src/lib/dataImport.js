import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  REQUIRED_TRAINING_COLUMNS,
  REQUIRED_REQUIREMENTS_COLUMNS,
  EMPLOYMENT_STATUS,
  COMPLETION_STATUS,
} from './constants.js';
import {
  normalizeTrainingRecord,
  normalizeRequirementsRecord,
  isValidDateStr,
} from './normalization.js';

// ============================================================
// CSV IMPORT (PapaParse)
// ============================================================

export async function importCSV(file) {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
      dynamicTyping: false,
      complete: (result) => resolve({ data: result.data, errors: result.errors, meta: result.meta }),
      error: (err) => resolve({ data: [], errors: [err], meta: {} }),
    });
  });
}

// ============================================================
// XLSX IMPORT
// ============================================================

export async function importXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });

        // Find best sheet: prefer one with "training" in name, else first
        let sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('training'));
        if (!sheetName) sheetName = wb.SheetNames[0];

        const ws = wb.Sheets[sheetName];
        if (!ws) {
          resolve({ data: [], sheetName, error: 'Selected sheet is empty' });
          return;
        }

        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        resolve({ data: rows, sheetName, error: null });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// TRAINING DATA VALIDATION
// ============================================================

export function validateTrainingRow(rec, rowIndex) {
  const errors = [];
  const rowNum = rowIndex + 2;

  if (!rec.Employee_ID) errors.push(`Row ${rowNum}: missing Employee_ID`);
  if (!rec.Employee_Name) errors.push(`Row ${rowNum}: missing Employee_Name`);
  if (!rec.Department) errors.push(`Row ${rowNum}: missing Department`);
  if (!rec.Job_Title) errors.push(`Row ${rowNum}: missing Job_Title`);
  if (!rec.Course_Name) errors.push(`Row ${rowNum}: missing Course_Name`);
  if (!rec.Course_Code) errors.push(`Row ${rowNum}: missing Course_Code`);

  if (rec.Training_Required === null) {
    errors.push(`Row ${rowNum}: invalid Training_Required value "${rec._raw_Training_Required}" — expected Yes/No/True/False/1/0`);
  }

  const validEmpStatuses = Object.values(EMPLOYMENT_STATUS);
  if (rec.Employment_Status && !validEmpStatuses.includes(rec.Employment_Status)) {
    errors.push(`Row ${rowNum}: invalid Employment_Status "${rec.Employment_Status}" — expected Active/Inactive/Left`);
  }

  const validCompStatuses = Object.values(COMPLETION_STATUS);
  if (rec.Completion_Status && !validCompStatuses.includes(rec.Completion_Status)) {
    errors.push(`Row ${rowNum}: invalid Completion_Status "${rec.Completion_Status}" — expected Completed/In Progress/Not Started`);
  }

  if (rec.Issue_Date && !isValidDateStr(rec.Issue_Date)) {
    errors.push(`Row ${rowNum}: invalid Issue_Date "${rec.Issue_Date}" — expected YYYY-MM-DD`);
  }
  if (rec.Expiry_Date && !isValidDateStr(rec.Expiry_Date)) {
    errors.push(`Row ${rowNum}: invalid Expiry_Date "${rec.Expiry_Date}" — expected YYYY-MM-DD`);
  }
  if (rec.Issue_Date && rec.Expiry_Date && isValidDateStr(rec.Issue_Date) && isValidDateStr(rec.Expiry_Date)) {
    if (rec.Issue_Date >= rec.Expiry_Date) {
      errors.push(`Row ${rowNum}: Issue_Date (${rec.Issue_Date}) must be before Expiry_Date (${rec.Expiry_Date})`);
    }
  }

  return errors;
}

export function validateRequirementsRow(rec, rowIndex) {
  const errors = [];
  const rowNum = rowIndex + 2;
  if (!rec.Department) errors.push(`Row ${rowNum}: missing Department`);
  if (!rec.Job_Title) errors.push(`Row ${rowNum}: missing Job_Title`);
  if (!rec.Course_Code) errors.push(`Row ${rowNum}: missing Course_Code`);
  if (!rec.Course_Name) errors.push(`Row ${rowNum}: missing Course_Name`);
  if (rec.Mandatory === null) errors.push(`Row ${rowNum}: invalid Mandatory value — expected Yes/No`);
  if (isNaN(rec.Validity_Months)) errors.push(`Row ${rowNum}: invalid Validity_Months — expected a number`);
  return errors;
}

// ============================================================
// MAIN IMPORT ENTRY POINTS
// ============================================================

export async function importTrainingFile(file) {
  let raw = [];
  let sheetName = null;
  let parseErrors = [];

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const result = await importCSV(file);
    raw = result.data;
    parseErrors = result.errors.map(e => e.message || String(e));
  } else if (ext === 'xlsx' || ext === 'xls') {
    try {
      const result = await importXLSX(file);
      raw = result.data;
      sheetName = result.sheetName;
      if (result.error) parseErrors.push(result.error);
    } catch (e) {
      return {
        success: false,
        validRecords: [],
        invalidRecords: [],
        duplicates: [],
        warnings: [],
        errors: [`Failed to parse XLSX: ${e.message}`],
        importSummary: { total: 0, valid: 0, invalid: 0, duplicates: 0 },
        sourceFileName: file.name,
        sheetName: null,
      };
    }
  } else {
    return {
      success: false,
      validRecords: [],
      invalidRecords: [],
      duplicates: [],
      warnings: [],
      errors: [`Unsupported file type ".${ext}". Please upload .csv, .xlsx, or .xls`],
      importSummary: { total: 0, valid: 0, invalid: 0, duplicates: 0 },
      sourceFileName: file.name,
      sheetName: null,
    };
  }

  // Empty file
  if (raw.length === 0) {
    return {
      success: false,
      validRecords: [],
      invalidRecords: [],
      duplicates: [],
      warnings: [],
      errors: ['File contains no data rows', ...parseErrors],
      importSummary: { total: 0, valid: 0, invalid: 0, duplicates: 0 },
      sourceFileName: file.name,
      sheetName,
    };
  }

  // Check required headers
  const headers = Object.keys(raw[0] || {});
  const missing = REQUIRED_TRAINING_COLUMNS.filter(c => !headers.includes(c));
  if (missing.length > 0) {
    return {
      success: false,
      validRecords: [],
      invalidRecords: [],
      duplicates: [],
      warnings: [],
      errors: [`Missing required columns: ${missing.join(', ')}`],
      importSummary: { total: raw.length, valid: 0, invalid: raw.length, duplicates: 0 },
      sourceFileName: file.name,
      sheetName,
    };
  }

  const validRecords = [];
  const invalidRecords = [];
  const allErrors = [...parseErrors];
  const warnings = [];

  for (let i = 0; i < raw.length; i++) {
    const rawRec = raw[i];
    const rawTR = rawRec.Training_Required;
    const normalized = normalizeTrainingRecord(rawRec);
    normalized._raw_Training_Required = rawTR;

    const rowErrors = validateTrainingRow(normalized, i);
    if (rowErrors.length > 0) {
      invalidRecords.push({ row: i + 2, record: rawRec, errors: rowErrors });
      allErrors.push(...rowErrors);
    } else {
      validRecords.push(normalized);
    }
  }

  // Detect duplicates (Employee_ID+Course_Code) within valid records
  const seen = new Map();
  const dupKeys = new Set();
  for (const rec of validRecords) {
    const key = `${rec.Employee_ID}|${rec.Course_Code}`;
    if (seen.has(key)) dupKeys.add(key);
    else seen.set(key, rec);
  }
  const duplicates = [...dupKeys].map(key => {
    const recs = validRecords.filter(r => `${r.Employee_ID}|${r.Course_Code}` === key);
    return { key, records: recs };
  });

  if (duplicates.length > 0) {
    warnings.push(`${duplicates.length} duplicate Employee_ID+Course_Code group(s) detected — kept all rows per duplicate policy`);
  }
  if (invalidRecords.length > 0) {
    warnings.push(`${invalidRecords.length} row(s) failed validation and were excluded`);
  }

  return {
    success: validRecords.length > 0,
    validRecords,
    invalidRecords,
    duplicates,
    warnings,
    errors: allErrors,
    importSummary: {
      total: raw.length,
      valid: validRecords.length,
      invalid: invalidRecords.length,
      duplicates: duplicates.length,
    },
    sourceFileName: file.name,
    sheetName,
  };
}

export async function importRequirementsFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let raw = [];
  let parseErrors = [];

  if (ext === 'csv') {
    const result = await importCSV(file);
    raw = result.data;
    parseErrors = result.errors.map(e => e.message || String(e));
  } else {
    return {
      success: false,
      validRecords: [],
      errors: ['Requirements matrix must be a CSV file'],
      importSummary: { total: 0, valid: 0, invalid: 0 },
      sourceFileName: file.name,
    };
  }

  if (raw.length === 0) {
    return {
      success: false,
      validRecords: [],
      errors: ['Requirements CSV is empty', ...parseErrors],
      importSummary: { total: 0, valid: 0, invalid: 0 },
      sourceFileName: file.name,
    };
  }

  const headers = Object.keys(raw[0] || {});
  const missing = REQUIRED_REQUIREMENTS_COLUMNS.filter(c => !headers.includes(c));
  if (missing.length > 0) {
    return {
      success: false,
      validRecords: [],
      errors: [`Missing required columns: ${missing.join(', ')}`],
      importSummary: { total: raw.length, valid: 0, invalid: raw.length },
      sourceFileName: file.name,
    };
  }

  const validRecords = [];
  const invalidRecords = [];
  const allErrors = [...parseErrors];

  for (let i = 0; i < raw.length; i++) {
    const normalized = normalizeRequirementsRecord(raw[i]);
    normalized._raw_Mandatory = raw[i].Mandatory;
    const rowErrors = validateRequirementsRow(normalized, i);
    if (rowErrors.length > 0) {
      invalidRecords.push({ row: i + 2, record: raw[i], errors: rowErrors });
      allErrors.push(...rowErrors);
    } else {
      validRecords.push(normalized);
    }
  }

  return {
    success: validRecords.length > 0,
    validRecords,
    invalidRecords,
    errors: allErrors,
    warnings: invalidRecords.length > 0 ? [`${invalidRecords.length} requirements row(s) failed validation`] : [],
    importSummary: { total: raw.length, valid: validRecords.length, invalid: invalidRecords.length },
    sourceFileName: file.name,
  };
}
