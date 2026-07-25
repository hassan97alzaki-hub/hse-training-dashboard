# Testing Guide

## Automated Tests

### Run all tests
```bash
npm run test
```

Expected result: **116 tests pass, 0 failures**

```
Test Files  2 passed (2)
Tests  116 passed (116)
```

### Test coverage areas

**`tests/complianceEngine.test.js`** (74 tests)
- Date utilities: dateDiffDays, isValidDateStr
- Status boundary cases: 0d, 30d, 31d, 60d, 61d, 90d, 91d, negative days, no expiry
- Duplicate selection policy
- buildComplianceUniverse: employee dedup, inactive exclusion, MISSING generation, NOT_REQUIRED
- calculateKPIs: all expected values from docs/EXPECTED-RESULTS.md
- Individual status for every employee/course in demo data

**`tests/dataImport.test.js`** (42 tests)
- normalizeBoolean: all accepted values and edge cases
- normalizeDate: YYYY-MM-DD passthrough, MM/DD/YYYY conversion, Excel serial conversion
- normalizeEmploymentStatus, normalizeCompletionStatus
- importTrainingFile: valid CSV, UTF-8 BOM, quoted comma, empty file, missing header, invalid date, invalid Employment_Status, invalid boolean, duplicate detection, unsupported extension
- importRequirementsFile: valid CSV, non-CSV rejection, empty CSV

---

## Manual Verification Checklist

Run through these checks in the browser after `npm run dev`:

### Load Demo Data
- [ ] Click "Load Demo Data"
- [ ] Green success banner appears
- [ ] KPI cards populate (Requirement Compliance: 66.7%, Fully Compliant: 22.2%)
- [ ] Department chart shows 5 bars
- [ ] Status breakdown pie shows coloured slices
- [ ] Course compliance table shows 5 courses
- [ ] Priority Actions table shows non-compliant items
- [ ] Data Quality panel shows 1 duplicate group and 1 config warning

### KPI Verification (vs EXPECTED-RESULTS.md)
- [ ] Active Employees = 11
- [ ] Requirements Configured = 9
- [ ] Not Configured = 1
- [ ] Requirement Compliance = 66.7%
- [ ] Fully Compliant Employees = 22.2% (2/9)
- [ ] Valid = 9, Expiring90 = 2, Expiring60 = 2, Expiring30 = 3
- [ ] Expired = 4, In Progress = 1, Not Started = 1, Missing = 2

### CSV Import
- [ ] Import `public/data/sample-training-data.csv` directly — same results as Load Demo Data
- [ ] Import `public/data/invalid-date-test.csv` — shows 2 invalid rows in banner/quality panel
- [ ] Import `public/data/duplicate-record-test.csv` — shows 1 duplicate group warning

### Requirements Import
- [ ] Import `public/data/sample-requirements.csv` via "Import Requirements Matrix"
- [ ] After import, compliance recalculates with correct results

### Filters
- [ ] Filter by Department = "Operations" — table shows only Operations rows
- [ ] Filter by Status = "EXPIRED" — table shows 4 rows
- [ ] Filter by Status = "MISSING" — table shows 2 rows (EMP0005/WAH001, EMP0010/CS001)
- [ ] Clear All resets table to all rows
- [ ] Global KPI cards do NOT change when filters are applied (intentional — note label shown)

### Pagination
- [ ] Change page size to 25 — table shows max 25 rows
- [ ] Previous/Next buttons navigate correctly
- [ ] "Showing X–Y of Z records" updates correctly
- [ ] Reset to page 1 when filter changes

### Language Toggle
- [ ] Click Arabic toggle → UI switches to Arabic labels and RTL layout
- [ ] All KPI labels, table headers, filter labels, status labels show in Arabic
- [ ] Click English toggle → reverts to LTR English

### PDF Export
- [ ] Click "Export PDF" — browser downloads a PDF file
- [ ] PDF contains: company name, project name, as-of date, KPI summary, department table, course table, priority actions
- [ ] Page numbers appear on each page
- [ ] In Arabic mode: alert appears noting PDF will be in English (limitation)

### CSV Export
- [ ] Click "Export CSV" — downloads compliance CSV file
- [ ] Open in Excel — columns readable, Arabic names not garbled (UTF-8 BOM present)
- [ ] Click "Export Priority Actions CSV" — downloads priority actions CSV

### Empty State
- [ ] Click "Reset Data" — dashboard clears to empty state
- [ ] Empty state message appears with hint text
- [ ] All export buttons disabled

### Console Errors
- [ ] Open DevTools (F12) → Console
- [ ] Load Demo Data — no red errors in console
- [ ] Navigate all panels — no red errors

---

## Not Manually Verified (Browser Automation Not Available)
The following were verified via code inspection and automated tests but NOT via live browser clicks:
- XLSX file import (requires live browser with FileReader)
- PDF pixel-level rendering quality
- Exact CSV download content (relies on URL.createObjectURL which is not available in jsdom)

These require a manual run of the checklist above in a real browser.
