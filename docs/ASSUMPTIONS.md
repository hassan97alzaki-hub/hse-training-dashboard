# Assumptions & Methodology

## Status Policy

### Compliance Status Definitions

| Status | Condition | Compliant? |
|---|---|---|
| VALID | Expiry date > 90 calendar days after As Of Date, OR completed with no expiry date (one-time training) | Yes |
| EXPIRING_90 | 61–90 calendar days remaining until expiry | Yes |
| EXPIRING_60 | 31–60 calendar days remaining until expiry | Yes |
| EXPIRING_30 | 0–30 calendar days remaining, **including** expiry exactly on the As Of Date | Yes |
| EXPIRED | Expiry date is **strictly earlier** than As Of Date (days < 0) | **No** |
| IN_PROGRESS | Required training exists but Completion_Status = "In Progress" | **No** |
| NOT_STARTED | Required training exists but Completion_Status = "Not Started" | **No** |
| MISSING | Course is mandatory for the employee's role but no training record exists | **No** |
| NOT_REQUIRED | Training is not mandatory for the employee's role (per requirements matrix) | Excluded |

Status boundaries are computed as integer calendar days, UTC-safe (dates parsed as YYYY-MM-DDT00:00:00Z to avoid daylight saving shifts).

Compliance = VALID + EXPIRING_90 + EXPIRING_60 + EXPIRING_30.
NOT_REQUIRED items are excluded from both numerator and denominator.

---

## KPI Definitions

### KPI 1 — Requirement Compliance
```
Compliant mandatory requirements ÷ Total mandatory requirements (for active employees with ≥1 configured requirement)
```
Denominator includes EXPIRED, IN_PROGRESS, NOT_STARTED, and MISSING.

### KPI 2 — Fully Compliant Employees
```
Active employees with ALL mandatory requirements compliant ÷ Active employees with ≥1 mandatory requirement
```
Employees with no configured requirements are excluded from both numerator and denominator.
Employees with a role configured in the matrix but zero mandatory entries are counted separately (0 mandatory requirements — vacuously compliant but reported distinctly).

### KPI 3 — Department Compliance
Per department: compliant mandatory requirements ÷ all mandatory requirements for active employees in that department.

### KPI 4 — Course Compliance
Per course: active employees compliant in that course ÷ active employees for whom that course is mandatory.

---

## Duplicate Record Policy

When multiple records exist for the same Employee_ID + Course_Code:
- All rows are kept in the raw data table.
- For compliance KPI calculation, the **most relevant** record is selected:
  1. Among completed records: the one with the **latest valid (future) Expiry_Date**
  2. If all are expired, the one with the **latest Expiry_Date**
  3. If no Expiry_Date, the one with the **latest Issue_Date**
- The pair/group is flagged as a duplicate in the Data Quality panel.
- It is counted **once** in KPI denominators (not double-counted).

---

## Requirements Not Configured Policy

If an active employee's Department + Job_Title has **no rows at all** in the requirements matrix:
- The employee is flagged as "Requirements Not Configured" in the Data Quality panel.
- The employee is **excluded** from:
  - Fully Compliant Employees denominator
  - Requirement Compliance denominator
  - Department and Course compliance denominators
- Their training records remain visible in the raw data table.
- A configuration warning message is displayed in the UI.

If an active employee's role IS in the requirements matrix but ALL entries have Mandatory=No:
- Reported as "0 mandatory requirements" (separate from "not configured").
- All training records show as NOT_REQUIRED.
- Employee is excluded from Fully Compliant Employees denominator (no mandatory requirements to check).

---

## Inactive / Left Employee Policy

- Employees with Employment_Status = Inactive or Left are **excluded** from all KPI denominators.
- Their training records are stored separately (inactiveUniverse) and visible in the compliance detail table when the "Show Inactive/Left employees" toggle is enabled.
- They do not affect compliance percentages.

---

## As Of Date

The As Of Date is fixed at **2026-07-26** for this MVP demo. It is not dynamically set to today's date. This ensures deterministic, auditable results that match the test suite and `docs/EXPECTED-RESULTS.md`.

To change the As Of Date, update `DEMO_AS_OF_DATE` in `src/lib/constants.js` and regenerate the expected results.

---

## Import Notes

- CSV imports use PapaParse (handles BOM, CRLF, quoted commas, escaped double-quotes, blank lines, whitespace trimming).
- XLSX/XLS imports use the xlsx package. Excel serial date numbers are converted to YYYY-MM-DD.
- The training data requirements matrix must be provided separately as a CSV import.
- Boolean fields (Training_Required, Mandatory) accept: Yes/No, True/False, 1/0 (case-insensitive).
- Dates must be in YYYY-MM-DD format after normalization. MM/DD/YYYY is auto-converted.
- Invalid rows are reported in the Data Quality panel and excluded from compliance calculations.

---

## Arabic PDF Export Limitation

The web interface is fully bilingual (English + Arabic, RTL/LTR). PDF export is **English only**.

jsPDF requires custom Arabic font embedding (with RTL shaping via a library such as `jsPDF-CustomFonts-support` or `arabic-reshaper`) to render Arabic glyphs correctly. Without this, Arabic text appears as disconnected, reversed characters (garbled).

Implementing Arabic PDF font embedding was assessed as high-risk for the MVP timeline and may introduce rendering instability. The English PDF export is stable and fully functional.

**Workaround for Arabic PDF:** Export the English PDF and share alongside the Arabic web interface session.

Arabic PDF export is targeted for Phase 2.

---

## Scope Exclusions (This MVP)

This tool is a local browser-based Management Demonstration MVP. It intentionally excludes:

- Cloud database or server-side storage
- User authentication or multi-user collaboration
- Automatic email/SMS alerts
- AI predictions or anomaly detection
- Historical trend analytics
- Google Sheets synchronisation
- Mobile application
- API backend
- GitHub / cloud deployment

None of these were removed; they were never part of Phase 1 scope.

---

## Known Limitations

1. As Of Date is fixed (2026-07-26) — must update `constants.js` to change it
2. Arabic PDF export produces garbled text (English PDF used as fallback)
3. No persistence — data clears on browser refresh
4. Large files (>5000 rows) may cause noticeable delay during compliance universe build
5. The requirements matrix must be imported each session (not persisted)
6. XLSX sheet selection is automatic (first sheet with "training" in name, else first sheet); no manual sheet picker in this version
