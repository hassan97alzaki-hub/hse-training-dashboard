/**
 * HSE Training Data Import Handler
 * 
 * Supports:
 * - Excel (.xlsx) files
 * - CSV files
 * 
 * Features:
 * - Schema validation
 * - Duplicate detection
 * - Invalid date detection
 * - Missing field detection
 * - Data cleaning and normalization
 * - Detailed error reporting
 */

// ============================================
// EXCEL IMPORT (requires SheetJS)
// ============================================

/**
 * Parse Excel file and extract training data
 * 
 * Usage in React:
 * const file = e.target.files[0];
 * const result = await importExcelFile(file);
 * if (result.success) {
 *   setTrainingData(result.records);
 * } else {
 *   setErrors(result.errors);
 * }
 */
async function importExcelFile(file) {
  try {
    // Check file type
    if (
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls") &&
      !file.name.endsWith(".csv")
    ) {
      return {
        success: false,
        error: "Invalid file type. Please upload .xlsx, .xls, or .csv",
        records: [],
        errors: [],
      };
    }

    let records = [];

    if (file.name.endsWith(".csv")) {
      records = await parseCSV(file);
    } else {
      records = await parseExcel(file);
    }

    // Validate records
    const validation = validateImportedRecords(records);

    return {
      success: validation.isValid,
      total_rows: records.length,
      valid_records: validation.validRecords.length,
      invalid_records: validation.invalidRecords.length,
      duplicates: validation.duplicates.length,
      records: validation.validRecords,
      errors: [
        ...validation.schemaErrors,
        ...validation.validationErrors,
        ...validation.duplicateErrors,
      ],
      warnings: validation.warnings,
      summary: {
        imported: validation.validRecords.length,
        skipped: validation.invalidRecords.length,
        duplicates: validation.duplicates.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Import failed: ${error.message}`,
      records: [],
      errors: [`${error.message}`],
    };
  }
}

// ============================================
// EXCEL PARSER (using SheetJS)
// ============================================

/**
 * Parse Excel file using SheetJS library
 * Requires: npm install xlsx
 * 
 * Script tag: <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js"></script>
 */
async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        // SheetJS (XLSX) must be loaded globally
        if (typeof XLSX === "undefined") {
          reject(
            new Error(
              "SheetJS library not loaded. Add script tag: https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js"
            )
          );
          return;
        }

        const data = event.target.result;
        const workbook = XLSX.read(data, { type: "array" });

        // Look for "Training_Data" sheet first, otherwise use first sheet
        let worksheetName =
          workbook.SheetNames.find((name) =>
            name.toLowerCase().includes("training")
          ) || workbook.SheetNames[0];

        const worksheet = workbook.Sheets[worksheetName];
        const records = XLSX.utils.sheet_to_json(worksheet);

        resolve(records);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

// ============================================
// CSV PARSER
// ============================================

/**
 * Parse CSV file
 * Works natively in browser, no dependencies
 */
async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split("\n");

        if (lines.length < 2) {
          reject(new Error("CSV file is empty or has no header row"));
          return;
        }

        // Parse header
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine).map((h) => h.trim());

        // Parse data rows
        const records = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue; // Skip empty lines

          const values = parseCSVLine(line);
          const record = {};

          headers.forEach((header, index) => {
            record[header] = (values[index] || "").trim();
          });

          records.push(record);
        }

        resolve(records);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read CSV file"));
    };

    reader.readAsText(file);
  });
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate all imported records
 */
function validateImportedRecords(records) {
  const validRecords = [];
  const invalidRecords = [];
  const schemaErrors = [];
  const validationErrors = [];
  const duplicateErrors = [];
  const warnings = [];

  // Check for required columns
  if (records.length === 0) {
    return {
      isValid: false,
      validRecords: [],
      invalidRecords: [],
      schemaErrors: ["No data rows found in file"],
      validationErrors: [],
      duplicateErrors: [],
      warnings: [],
      duplicates: [],
    };
  }

  const firstRecord = records[0];
  const requiredColumns = [
    "Employee_ID",
    "Employee_Name",
    "Department",
    "Job_Title",
    "Course_Name",
    "Course_Code",
    "Training_Required",
    "Completion_Status",
  ];

  const hasAllRequiredColumns = requiredColumns.every(
    (col) => col in firstRecord
  );

  if (!hasAllRequiredColumns) {
    const missingColumns = requiredColumns.filter((col) => !(col in firstRecord));
    return {
      isValid: false,
      validRecords: [],
      invalidRecords: [],
      schemaErrors: [
        `Missing required columns: ${missingColumns.join(", ")}`,
        `Required columns: ${requiredColumns.join(", ")}`,
      ],
      validationErrors: [],
      duplicateErrors: [],
      warnings: [],
      duplicates: [],
    };
  }

  // Validate each record
  records.forEach((record, rowIndex) => {
    const rowNumber = rowIndex + 2; // +2 because row 1 is header, 0-indexed

    // Normalize boolean fields
    if (record.Training_Required === "Yes" || record.Training_Required === "1" || record.Training_Required === true) {
      record.Training_Required = true;
    } else if (record.Training_Required === "No" || record.Training_Required === "0" || record.Training_Required === false) {
      record.Training_Required = false;
    }

    // Validate the record
    const validation = validateTrainingRecord(record);

    if (!validation.isValid) {
      invalidRecords.push(record);
      validation.errors.forEach((err) => {
        validationErrors.push(`Row ${rowNumber}: ${err}`);
      });
    } else {
      validRecords.push(record);
    }
  });

  // Check for duplicates
  const duplicates = detectDuplicates(validRecords);
  duplicates.forEach((dup) => {
    duplicateErrors.push(
      `Employee ${dup.employee}, Course ${dup.course}: Found ${dup.records.length} records`
    );
  });

  // Warnings
  if (validRecords.length === 0) {
    warnings.push(
      "No valid records to import after validation. Check error messages above."
    );
  }

  return {
    isValid: validRecords.length > 0 && duplicates.length === 0,
    validRecords,
    invalidRecords,
    schemaErrors,
    validationErrors,
    duplicateErrors,
    warnings,
    duplicates,
  };
}

/**
 * Copy of validation function from 01-DATA-MODEL.js
 * (In production, import from there)
 */
function validateTrainingRecord(record) {
  const errors = [];

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

  if (record.Issue_Date && !isValidDate(record.Issue_Date)) {
    errors.push(`Invalid Issue_Date format: ${record.Issue_Date} (expected YYYY-MM-DD)`);
  }

  if (record.Expiry_Date && !isValidDate(record.Expiry_Date)) {
    errors.push(`Invalid Expiry_Date format: ${record.Expiry_Date} (expected YYYY-MM-DD)`);
  }

  if (record.Issue_Date && record.Expiry_Date) {
    const issueDate = new Date(record.Issue_Date);
    const expiryDate = new Date(record.Expiry_Date);
    if (issueDate >= expiryDate) {
      errors.push("Issue_Date must be before Expiry_Date");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

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
// EXPORT
// ============================================

const DataImport = {
  importExcelFile,
  importCSV: importExcelFile, // Alias for consistency
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = DataImport;
}

if (typeof window !== "undefined") {
  window.DataImport = DataImport;
}
