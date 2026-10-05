# Training Matrix workbook import

Local-only import path for a three-sheet `.xlsx` workbook with the sheets
`Employees`, `Courses` and `Training_Records`. Code: `src/lib/matrixWorkbook.js`.
The file is read in the browser. Nothing is uploaded or sent anywhere.

The existing CSV/XLSX training import and the requirements CSV import are unchanged.
"Import Training Data" detects the three sheets; any other workbook follows the old path.

## Column map

| Source sheet.column | System field | Rule |
|---|---|---|
| `Employees.Badge` | `Employee_ID` | **Match key.** Must be present and unique. |
| `Employees.Employee_ID` | — (validation only) | Must be present and unique, and map 1:1 to `Badge` in both sheets. |
| `Employees.Name` | `Employee_Name` | Display only. Never used for matching. |
| `Employees.Department` | `Department` | Master value. |
| `Employees.Role` | `Job_Title` | Master value. |
| `Employees.Status` | `Employment_Status` | `Active` / `Inactive` / `Left`. |
| `Employees.Join_Date` | — | Validated (warning if invalid), not used. |
| `Courses.Course_ID` | `Course_Code` | Must be present and unique. |
| `Courses.Course_Name` | `Course_Name` | Master value. |
| `Courses.Validity_Months` | requirement `Validity_Months` | Reference only. Never used to compute expiry. |
| `Courses.Departments` | requirement rows | Comma list of departments, expanded as below. |
| `Training_Records.Badge` | `Employee_ID` | Must exist in `Employees`. |
| `Training_Records.Employee_ID` | — | Must match the same Badge as in `Employees`. |
| `Training_Records.Name`, `.Department` | — | Compared with `Employees`; a difference is a blocking conflict. |
| `Training_Records.Course_ID` | `Course_Code` | Must exist in `Courses`. |
| `Training_Records.Course_Name` | — | Compared with `Courses`; a difference is a warning, `Courses` wins. |
| `Training_Records.Completion_Date` | `Issue_Date` | `YYYY-MM-DD` or Excel serial date. |
| `Training_Records.Expiry_Date` | `Expiry_Date` | Taken as given. |
| `Training_Records.Certificate_Number` | `Certificate_Number` | Empty on a completed row = warning. |
| `Training_Records.Status` | — | **Ignored.** The compliance engine recalculates status from `Expiry_Date` and the As Of Date. |
| (derived) | `Completion_Status` | `Completed` for every row with evidence. |
| (derived) | `Training_Required` | `true` when the course is mapped to the employee's department. |

## Decisions

1. **Employee key = Badge.** Both `Employee_ID` and `Badge` are unique in the provided file. `Badge` is chosen because it is a formatted identifier and searches cleanly; the numeric `Employee_ID` (1–500, contiguous) looks like a row sequence, which is an inference, not a verified fact. To prevent a wrong choice from going unnoticed, the import also requires `Employee_ID ↔ Badge` to be one-to-one across both sheets. If the client confirms `Employee_ID` is the HR number, switch `EMPLOYEE_KEY` and the two places that read `Badge` in `convertMatrixWorkbook`.
2. **Status is recalculated, never imported.**
3. **Expiry is not recalculated.** `Expiry_Date − (Completion_Date + Validity_Months)` is reported as a warning with a day distribution. Months are calendar months; the day is clamped to the last day of the target month (31 Jan + 1 month = 28/29 Feb). This affects only the warning; the imported `Expiry_Date` is unchanged.
4. **Department-level requirements.** `Courses.Departments` names departments, not job titles. The engine matches requirements on exact `(Department, Job_Title)`. Each department rule is therefore expanded to every `(Department, Role)` pair that exists in `Employees`, with `Mandatory = true`, `Derived: true` and the description "Derived from department-level mapping … not a job-title-specific requirement". No requirement is created for a role that does not appear in the file. These rows do not prove role-specific requirements. **They are test-data scaffolding: never store, export or reuse them as approved production requirements.** Production requirements must come from a requirements matrix approved by the training owner.
5. **Rows without evidence.** A `Training_Records` row with no completion date, no expiry date and no certificate number is not imported. The engine then reports that requirement as `MISSING`, which matches the source.
6. **Employee master list.** The Employees sheet is returned as a separate `employees` list and passed to `buildComplianceUniverse(records, requirements, asOfDate, employees)`. Employees come only from that list, so an active employee with no training record still gets `MISSING` items. No placeholder training record is created; `validRecords` holds real training rows only. When the list is not passed (CSV import, demo data), the engine derives employees from the records as before. Inactive employees keep the existing behaviour (counted as inactive, no compliance items).
7. **Blocking vs warning.** Missing sheets/columns, missing or duplicate keys, unknown employees or courses, Employee_ID/Badge mismatch, name or department conflicts between sheets, invalid dates, expiry not after completion, empty required employee fields and invalid employment status block approval. Validity mismatch, empty certificate number, completion without expiry, course-name difference, duplicate employee+course pairs (all rows kept; the engine selects) and mapped departments without employees are warnings.
8. **Preview before approval.** The preview shows counts, issue codes and row references (`sheet:row`) only — no names, badges or certificate numbers — plus a table "source Status → recalculated status". Approval is disabled while any error exists. Approval replaces the loaded training records **and** requirements and sets the As Of Date to today (Asia/Riyadh).

## Measuring

```bash
node scripts/measure-matrix-import.mjs "<path-to-xlsx>" 20
```

Prints timings and counts only.

## Optional integration test

The tests for this adapter build small synthetic workbooks in memory and run everywhere. A test against a full workbook runs only when `HSE_MATRIX_XLSX` points to a local file; otherwise it is skipped:

```bash
HSE_MATRIX_XLSX="<path-to-xlsx>" npx vitest run tests/matrixWorkbook.test.js
```
