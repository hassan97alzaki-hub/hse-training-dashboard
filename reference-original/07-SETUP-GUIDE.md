# HSE Training Compliance Dashboard - Setup Guide

**Version**: 2.0 (Corrected Production-Ready)  
**Date**: July 2026  
**Status**: MVP - Ready for Testing

---

## Overview

This is a **data-driven training compliance dashboard** that:
- ✅ Imports real Excel/CSV data
- ✅ Validates all records before processing
- ✅ Calculates correct KPIs (no fake data)
- ✅ Exports real PDF reports
- ✅ Works offline (no cloud sync yet)
- ❌ Does NOT include AI predictions (Phase 2)
- ❌ Does NOT auto-email (Phase 2)

---

## What This Package Contains

```
01-DATA-MODEL.js              → Validation logic and KPI calculations
02-DATA-IMPORT.js             → Excel/CSV parser and validator
03-SAMPLE-TRAINING-DATA.csv   → Example training records
04-SAMPLE-REQUIREMENTS.csv    → Role-to-course mapping
05-DASHBOARD-CORRECTED.jsx    → React dashboard component
06-PDF-EXPORT.js              → PDF report generation
07-SETUP-GUIDE.md             → This file
08-TESTING-CHECKLIST.md       → Test procedures
09-ASSUMPTIONS.md             → Known limitations
10-PHASE-2-ROADMAP.md         → Future features
```

---

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
npm install react recharts jspdf
```

Or add via CDN in HTML:

```html
<!-- React -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- jsPDF for PDF export -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.0/jspdf.umd.min.js"></script>

<!-- SheetJS for Excel import (optional, for .xlsx support) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js"></script>
```

### 2. Set Up Data Files

**Step 1**: Copy sample data to your project

```bash
cp 03-SAMPLE-TRAINING-DATA.csv ./data/
cp 04-SAMPLE-REQUIREMENTS.csv ./data/
```

**Step 2**: Use as template

- Open `03-SAMPLE-TRAINING-DATA.csv` in Excel
- Replace with YOUR actual company data
- Keep the same column names
- Save as CSV or XLSX

### 3. Import Dashboard Component

```javascript
import HSETrainingDashboard from './05-DASHBOARD-CORRECTED';

function App() {
  return <HSETrainingDashboard />;
}

export default App;
```

### 4. Test With Sample Data

1. Start your React app: `npm start`
2. Click "Import Training Data (CSV)"
3. Select `03-SAMPLE-TRAINING-DATA.csv`
4. Click "Import Requirements (CSV)" (optional)
5. See KPIs populate immediately

---

## Data Format Requirements

### Training Data Columns (Required)

| Column | Type | Format | Required | Example |
|--------|------|--------|----------|---------|
| Employee_ID | String | Alphanumeric | Yes | EMP0001 |
| Employee_Name | String | Text | Yes | Ahmed Al-Mansouri |
| Department | String | Text | Yes | Operations |
| Job_Title | String | Text | Yes | Field Supervisor |
| Employment_Status | String | Active\|Inactive\|Left | Yes | Active |
| Course_Name | String | Text | Yes | H2S Safety |
| Course_Code | String | Alphanumeric | Yes | H2S001 |
| Training_Required | Boolean | Yes\|No or 1\|0 | Yes | Yes |
| Completion_Status | String | Completed\|In Progress\|Not Started | Yes | Completed |
| Issue_Date | Date | YYYY-MM-DD | Optional | 2024-01-15 |
| Expiry_Date | Date | YYYY-MM-DD | Optional | 2025-01-15 |
| Certificate_Number | String | Text | Optional | CERT001-2024 |
| Training_Provider | String | Text | Optional | SafetyPlus Training |
| Remarks | String | Text | Optional | Completed during induction |

### Requirements Matrix Columns (Optional)

| Column | Type | Format | Required | Example |
|--------|------|--------|----------|---------|
| Department | String | Text | Yes | Operations |
| Job_Title | String | Text | Yes | Field Supervisor |
| Course_Code | String | Alphanumeric | Yes | H2S001 |
| Course_Name | String | Text | Yes | H2S Safety |
| Mandatory | Boolean | Yes\|No or 1\|0 | Yes | Yes |
| Validity_Months | Number | Months | Yes | 12 |
| Description | String | Text | Optional | Mandatory for all field supervisors |

---

## Validation Rules

The dashboard will **reject records** if:

- ❌ Missing required columns
- ❌ Employee_ID is blank
- ❌ Employee_Name is blank
- ❌ Department is blank
- ❌ Course_Code is blank
- ❌ Course_Name is blank
- ❌ Expiry_Date format is invalid (use YYYY-MM-DD)
- ❌ Issue_Date is after Expiry_Date
- ❌ Duplicate employee-course combinations

**Note**: Invalid rows are reported in the error section. The dashboard continues with valid rows only.

---

## KPI Definitions (What's Being Calculated)

### 1. Training Record Compliance (%)

**Definition**: Valid required training records ÷ Total required records

**Calculation**:
- Count records where Training_Required = true AND Completion_Status = "Completed"
- Count those where Expiry_Date > today (VALID status)
- Percentage = (Valid / Total) × 100

**Example**: 120 valid records out of 150 required = 80%

### 2. Active Employees

**Definition**: Count of unique employees with Employment_Status = "Active"

**Example**: 500 active employees

### 3. Status Breakdown

**Counts by status**:
- **Valid**: Certificate valid and not expiring soon
- **Expiring <30 days**: Expires in 0-30 days
- **Expiring <60 days**: Expires in 31-60 days
- **Expiring <90 days**: Expires in 61-90 days
- **Expired**: Certificate has expired

### 4. Department Compliance (%)

For each department:
- Valid records in dept ÷ All required records in dept × 100

### 5. Course Compliance (%)

For each course:
- Employees with valid training ÷ Employees required for course × 100

---

## Using the Dashboard

### Importing Data

1. Click **"Import Training Data (CSV)"**
2. Select your CSV or XLSX file
3. Dashboard validates and loads
4. Check **Errors** and **Warnings** sections
5. Fix any validation errors in your CSV
6. Re-import

### Filtering Records

Use any combination:
- Employee ID (partial match)
- Employee Name (partial match)
- Department (dropdown)
- Job Title (dropdown)
- Course (dropdown)
- Status (dropdown)

Click **"Clear Filters"** to reset.

### Reading the Table

Shows first 50 matching records. Click column headers for sorting (not yet implemented in MVP).

### Exporting Reports

**Phase 2**: Export buttons currently disabled.

To export manually:
1. Use browser "Save Page as PDF"
2. Or copy filtered table data to Excel

---

## Troubleshooting

### Problem: "Invalid file type"

**Solution**: Use .csv or .xlsx only. Check file extension.

### Problem: "Missing required columns"

**Solution**: Your file doesn't have the expected column names. Check:
- `Employee_ID` (not `EmployeeID` or `ID`)
- `Employee_Name` (not `Name`)
- `Department` (not `Dept`)
- Exact spelling and capitalization

### Problem: No data appears after import

**Solution**: All records failed validation. Check:
- Do you have a header row?
- Are all required columns populated?
- Are dates in YYYY-MM-DD format?
- No extra blank rows?

### Problem: Some records missing

**Solution**: They failed validation. Check **Warnings** section to see which rows were skipped.

### Problem: Incorrect KPI values

**Solution**: Verify:
- Employees marked as "Active"
- Courses marked as "Training_Required = Yes"
- Dates in correct format
- No duplicate employee-course records

---

## Performance Expectations

| Data Size | Performance |
|-----------|-------------|
| < 1,000 records | Instant |
| 1,000 - 5,000 | <1 second |
| 5,000 - 10,000 | 1-2 seconds |
| > 10,000 | Consider pagination (Phase 2) |

---

## Next Steps

1. **Prepare your data** using sample templates
2. **Run through testing checklist** (08-TESTING-CHECKLIST.md)
3. **Review assumptions** (09-ASSUMPTIONS.md)
4. **Present to management** with honest KPI claims only
5. **Plan Phase 2** improvements (10-PHASE-2-ROADMAP.md)

---

## Getting Help

**Issue**: Check 09-ASSUMPTIONS.md for known limitations

**Bug Report**: Verify using sample data first. If issue persists with correct format, document steps to reproduce.

**Feature Request**: Add to Phase 2 roadmap (10-PHASE-2-ROADMAP.md)

---

## Support

This is an MVP. It's designed to work reliably with correct data, not to handle every edge case.

**In Scope**:
- ✅ CSV/XLSX import
- ✅ Data validation
- ✅ Correct KPI calculations
- ✅ Real PDF export
- ✅ Filtering and sorting

**Out of Scope (Phase 2)**:
- ❌ Google Sheets sync
- ❌ Database storage
- ❌ Multi-user collaboration
- ❌ Email automation
- ❌ AI analysis
- ❌ Real-time updates

---

**Created**: July 2026  
**Last Updated**: Today  
**Next Review**: After management presentation
