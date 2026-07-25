# Setup Guide

## Requirements

- Node.js 18+ (tested on v24.16.0)
- npm 9+

## Installation

```bash
cd ~/Desktop/hse-training-dashboard
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Scripts

| Command | Action |
|---|---|
| `npm run dev` | Start local dev server (http://localhost:5173) |
| `npm run build` | Build for production (output: dist/) |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

---

## Training Data CSV Format

Required columns (exact names, case-sensitive):

| Column | Type | Required | Notes |
|---|---|---|---|
| Employee_ID | string | Yes | Unique identifier |
| Employee_Name | string | Yes | Full name |
| Department | string | Yes | Must match requirements matrix |
| Job_Title | string | Yes | Must match requirements matrix |
| Employment_Status | enum | No | Active / Inactive / Left |
| Course_Name | string | Yes | Full course name |
| Course_Code | string | Yes | Short code |
| Training_Required | boolean | Yes | Yes/No, True/False, 1/0 |
| Completion_Status | enum | Yes | Completed / In Progress / Not Started |
| Issue_Date | date | No | YYYY-MM-DD |
| Expiry_Date | date | No | YYYY-MM-DD |
| Certificate_Number | string | No | Optional |
| Training_Provider | string | No | Optional |
| Remarks | string | No | Optional |

Dates must be YYYY-MM-DD. MM/DD/YYYY is auto-converted. Excel serial numbers are converted automatically.

See `public/data/sample-training-data.csv` for an example.

---

## Requirements Matrix CSV Format

Required columns:

| Column | Type | Notes |
|---|---|---|
| Department | string | Must match training data exactly |
| Job_Title | string | Must match training data exactly |
| Course_Code | string | Must match training data |
| Course_Name | string | Full course name |
| Mandatory | boolean | Yes/No — mandatory for this role? |
| Validity_Months | number | 0 = one-time (no expiry) |
| Description | string | Optional |

See `public/data/sample-requirements.csv` for an example.

---

## Demo Data Files

All files are in `public/data/`:

| File | Purpose |
|---|---|
| `sample-training-data.csv` | 27 rows covering all status types |
| `sample-requirements.csv` | 26 rows, all role-course requirements |
| `invalid-date-test.csv` | Test file for invalid date validation |
| `duplicate-record-test.csv` | Test file for duplicate record policy |

---

## Common Issues

**"Import failed" / missing columns**  
→ Check that column names match exactly (case-sensitive). Use the sample CSV as a template.

**"No data after import"**  
→ All rows failed validation. Check the Data Quality panel for specific error messages.

**"KPIs show 0% compliance"**  
→ Requirements matrix not imported. Import requirements after training data.

**"EMP not appearing in compliance"**  
→ Employee's Department/Job_Title has no matching row in the requirements matrix (shown in Config Warnings).

**Build warning: chunk size > 500kB**  
→ Expected — xlsx, jspdf, and recharts are heavy libraries. Not an error.

---

## Changing the As Of Date

Edit `src/lib/constants.js`:
```js
export const DEMO_AS_OF_DATE = '2026-07-26'; // change this
```

Then rerun `npm run test` to verify the compliance calculations still match your updated expected results.
