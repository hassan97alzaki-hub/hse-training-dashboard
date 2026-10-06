# Phase 2A — Production Data Contract and Import Governance

**Status:** plan, approved in principle (revision 4). Nothing in this document is implemented.
**Baseline:** code tag `v1.1-workbook-import` (`0fee907`), branch `phase-2-supabase`; plan commit `abcd721`, initial contract docs `9e4d2c4`.
**Boundaries:** no Supabase, no real employee data, no email or WhatsApp sending, no secrets or `.env` files, local mode only.

## Revision 3 changes

| # | Change | Sections |
|---|---|---|
| 1 | Engine input uses codes directly: `Department = department_code`, `Job_Title = job_title_code`. Name tables are display only; display names may repeat. Duplicate codes block, duplicate names do not. | §1.3, §2, §4.6 |
| 2 | `COMPLETED_WITHOUT_EXPIRY` is **blocking by default** when the current requirement is `Mandatory` and has `validity_months` (the engine would count it `VALID` forever). Relaxing it needs explicit approval (T-07). Preparation rechecks this on every run. | §1.6, §2, §4.6 |
| 3 | `In Progress` / `Not Started` records with a valid `source_record_id` are accepted without dates or certificate and stay non-compliant. Date rules apply to `Completed` only. | §1.6 |
| 4 | `_Contract.requirements_effective_from` for `full` and `requirements` packages; every requirement row must match it; complete set per listed department; preview lists rows to be closed; older versions blocked. | §1.1, §2, §3 |
| 5 | Local mode binds the session to the `organization_code` of the first approved `full` package; later packages must match; full reset clears the binding; partial package without a loaded organization blocked. | §4.7 |
| 6 | Training record identity is fixed: an existing `(source_system, source_record_id)` cannot change `employee_code` or `course_code` (`RECORD_IDENTITY_CHANGED`). Corrections of other fields become a new version; moving a record = void + new record. | §2, §4.2 |
| 7 | Fingerprint built from a canonical JSON array with the version tag inside, then SHA-256 — no delimiter joining. | §1.7 |

## Revision 4 clarification changes

- All reference codes use `^[A-Z0-9_-]{2,20}$` after trim and upper-casing. `employee_code` and `source_record_id` preserve case and compare exactly pending H-01/I-01.
- Duplicate detection for reference codes runs after normalisation, so `ops` and `OPS` are one key and give `KEY_DUPLICATE`.
- Only `full` packages may create or update department and job-title reference lists. Partial packages must use the approved lists; such a sheet is ignored in full and the approved lists stay unchanged.
- `COMPLETED_WITHOUT_EXPIRY` blocks only when the current effective requirement is `Mandatory` and has `validity_months`; preparation rechecks this on every run.
- A department-scoped job title used outside its department is blocking.

## Revision 2 changes

| # | Change | Sections |
|---|---|---|
| 1 | `validity_months` on approved `Requirements` is the official source. Courses may carry `suggested_validity_months` (help only). On conflict the approved requirement wins. Consistent with architecture `requirements_matrix.validity_months`. | §1.4, §1.5, §3 |
| 2 | Departments and job titles are matched by stable codes (`department_code`, `job_title_code`) from `Departments` / `Job_Titles` sheets. Arabic/English names are display only. | §1.3, §1.6, §4.6 |
| 3 | `_Contract.package_type` = `full` / `employees` / `requirements` / `training`, each with its own required sheets. Version 1 accepts one XLSX file only; multi-file CSV packages deferred. | §1.1 |
| 4 | Training record key = `(source_system, source_record_id)` within the organization. Fingerprint defined exactly, for detection only. Certificate number is not a key; missing or duplicate certificate number is a warning that a decision can promote to blocking. | §1.7, §2, §4.5 |
| 5 | Employee key keeps the neutral name `employee_code`; its meaning (HR number or badge) is an open HR decision. Current mapping documented. Name matching forbidden. | §1.2 |
| 6 | Expiry vs validity mismatch is a warning with the difference shown. No fixed threshold. Imported `expiry_date` never recalculated. | §2, §9 |
| 7 | Contact data is a separate contract `HSE-CONTACT-1.0`. Opt-in replaced by a neutral `communication_authorization_basis`. Basis, consent, retention and channels are Privacy/Legal/HR decisions. | §7 |
| 8 | Summary shows no identifiers; authorised details view may show `employee_code`. AT-03 split. Forbidden identity columns recorded as a governance decision. | §2.1, §8 |
| 9 | Preparation layer selects requirements effective at `asOfDate` before calling the engine. Boundaries and non-overlap tested. No historical reporting claimed. | §4.6, §8 |
| 10 | Measurable performance acceptance criteria. | §8.3 |
| 11 | Decisions grouped by owner: Training/HSE, HR, Privacy/Legal/IT, Engineering. | §9 |
| 12 | Phase defaults fixed (no `*ALL*`, In Progress non-compliant, no grace period, derived requirements blocked, test-requirements marker mandatory, four-eyes recorded only, absence never deletes). | §0.1 |

## 0. Goal and scope

Phase 2A defines **what data the system accepts in production** and **how a file becomes approved data**, and implements that contract locally (pure functions, preview UI, tests). The same validators and staging logic will run before database writes in Phase 2B; they do not depend on Supabase.

In scope: contracts `HSE-DC-1.0` and `HSE-CONTACT-1.0`; validators; staging, diff and preview; a preparation layer that turns approved data into the engine's current input; approved vs derived requirement separation; synthetic fixtures; acceptance tests; a decision log.

Out of scope: database, authentication, sending, engine rule changes (raised as decisions), historical reporting (deferred, architecture decision 12), multi-file CSV packages.

Verified starting point (code at `66d7ac7`):
- Legacy single-file CSV/XLSX training import and requirements CSV (`constants.js`, `dataImport.js`) — unchanged by this phase.
- Three-sheet test workbook adapter (`matrixWorkbook.js`) with preview; derived requirements marked `Derived: true` — unchanged; remains a test path.
- Engine: exact, case-sensitive match on `(Department, Job_Title)` strings; optional employee list; status from `Expiry_Date` and `asOfDate` (Asia/Riyadh, valid through expiry date).

### 0.1 Phase defaults (decided 2026-10-06)

| Default | Effect in Phase 2A |
|---|---|
| No `*ALL*` job-title wildcard | Requirements are explicit rows only |
| `In Progress` is non-compliant | Current engine behaviour kept |
| No grace period for new joiners | New active employee is `MISSING` for unmet mandatory courses |
| Derived requirements blocked from production | Production importer rejects them (§5) |
| "Test requirements" marker mandatory | On screen and on CSV/PDF exports whenever derived requirements are loaded |
| Four-eyes approval | Preparer and approver roles recorded in local mode; technically enforced only after authentication (Phase 2B) |
| Absence from a file | Never deletes, deactivates or changes any record |
| Completed record without expiry where a current `Mandatory` requirement has validity | Blocked (T-07 may relax only by explicit approval) |

## 1. Contract `HSE-DC-1.0`

### 1.1 Package and package types

Version 1: **one `.xlsx` file per import.** Multi-file CSV packages are deferred.

Sheet `_Contract` (always required): one header row + one value row.

| Field | Rule |
|---|---|
| `contract_version` | `HSE-DC-1.0` |
| `package_type` | `full` / `employees` / `requirements` / `training` |
| `organization_code` | must match the loaded organization (local: configured value) |
| `source_system` | short code of the system that produced the records, e.g. `LMS-A`; required for `full` and `training` |
| `extract_date` | `YYYY-MM-DD`, ≤ today (Riyadh) |
| `requirements_effective_from` | `YYYY-MM-DD`; required for `full` and `requirements` packages; the version date of the requirements set (§3) |
| `prepared_by_role` | role text, not a personal name |

Required (R) and optional (O) sheets per package type; other sheets present → warning and ignored:

| Sheet | `full` | `employees` | `requirements` | `training` |
|---|---|---|---|---|
| `Departments` | R | — | — | — |
| `Job_Titles` | R | — | — | — |
| `Employees` | R | R | — | — |
| `Courses` | R | — | O | O |
| `Requirements` | R | — | R | — |
| `Training_Records` | R | — | — | R |

Reference rule: every code used in a package must exist either in an allowed sheet in the same package or in the already approved data. Only `full` may create or update `Departments` and `Job_Titles`; those sheets in a partial package are `SHEET_UNEXPECTED` (warning) and ignored in full, so the approved lists stay unchanged. A `training` package may reference only employees already approved, and may carry `Courses` for new courses.

Common rules: first row = header; header names exact (trimmed, case-sensitive); dates `YYYY-MM-DD` or Excel serial (slash dates rejected in production mode); text trimmed and inner whitespace collapsed; empty cell = no information (§4.3).

### 1.2 Employees

| Field | Req. | Rule |
|---|---|---|
| `employee_code` | **yes** | Neutral, permanent key. Text, unique in the organization, pattern configurable (default `^[A-Za-z0-9-]{3,20}$`). **What it represents (HR number or badge) is decision H-01.** Never derived from or matched by a name |
| `badge_number` | no | Text; informational; unique if present |
| `full_name` | **yes** | Display only |
| `full_name_ar` | no | Display only |
| `department_code` | **yes** | In `Departments` |
| `job_title_code` | **yes** | In `Job_Titles` |
| `employment_status` | **yes** | Values per decision H-02 (default `Active` / `Inactive` / `Left`) |
| `status_effective_date` | conditional | Required when not `Active` |
| `hire_date` | no | ≤ extract date |
| `site_code` | no | Future filter |

Mapping of current sources to `employee_code` (documented, not a decision):
- Legacy CSV: `Employee_ID` → `employee_code`.
- Three-sheet test workbook: `Badge` → `employee_code` (current adapter choice); `Employee_ID` must map 1:1 to `Badge`.
- In all paths, `full_name` is never used to match.

### 1.3 Departments and Job_Titles (reference lists)

| Sheet | Field | Req. | Rule |
|---|---|---|---|
| `Departments` | `department_code` | yes | Key, `^[A-Z0-9_-]{2,20}$`, never reused for a different department |
| | `name_en`, `name_ar` | yes | Display only; may repeat |
| | `active` | yes | `Yes` / `No`; inactive codes cannot be used by new employees or requirements |
| `Job_Titles` | `job_title_code` | yes | Key, same pattern |
| | `name_en`, `name_ar` | yes | Display only; may repeat (the same title name can exist in several departments under different codes) |
| | `department_code` | no | Empty = title used across departments; when set, use with another department blocks as `JOB_TITLE_SCOPE` (decision H-03) |
| | `active` | yes | as above |

Codes are the only matching keys: a duplicate **code** blocks; a duplicate **display name** does not. The approved source and owner of these lists is decision H-03 (HR). Until decided, lists are maintained in the `full` package by the data owner.

### 1.4 Courses

| Field | Req. | Rule |
|---|---|---|
| `course_code` | **yes** | Key, `^[A-Z0-9_-]{2,20}$` |
| `name_en` | **yes** | Display |
| `name_ar` | no | Display |
| `category` | no | Text |
| `regulatory_reference` | no | Text |
| `suggested_validity_months` | no | Integer 1–120. **Help only** — pre-fills a requirements template and is shown beside the official value; never used for status |

### 1.5 Requirements

See §3. Key `(department_code, job_title_code, course_code, effective_from)`. `validity_months` here is the official value.

### 1.6 Training_Records

| Field | Req. | Rule |
|---|---|---|
| `source_record_id` | **yes** | Stable id of the record in `_Contract.source_system`. Key = `(organization, source_system, source_record_id)` |
| `employee_code` | **yes** | Approved or in package |
| `course_code` | **yes** | Approved or in package |
| `completion_status` | **yes** | `Completed` / `In Progress` / `Not Started` |
| `completion_date` | conditional | `Completed` only: required, ≤ extract date. Ignored (warning) on other statuses |
| `expiry_date` | conditional | `Completed` only: **required** when the current effective requirement is `Mandatory` and has `validity_months` (missing → `COMPLETED_WITHOUT_EXPIRY`, blocking); must be after `completion_date`. **Taken as given, never recalculated** |
| `certificate_number` | no | Not a key. Missing or duplicate → warning (§2) unless T-06 promotes it |
| `training_provider` | no | Text |
| `remarks` | no | ≤ 500 chars |

`Training_Required` is not part of `HSE-DC-1.0` (the engine never used it; approved requirements decide). The legacy import keeps accepting it.

Record acceptance by status:
- `Completed`: `completion_date` required; `expiry_date` required when the current effective requirement is `Mandatory` and has `validity_months`; certificate number optional (warning). A `Recommended` or absent requirement does not block storing the evidence.
- `In Progress` and `Not Started`: accepted with a valid `source_record_id` and no dates or certificate. The engine keeps them non-compliant (`IN_PROGRESS`, `NOT_STARTED`). Dates present on these rows are ignored with a warning.
- A requirement with **no record at all** appears as `MISSING`.

### 1.7 Fingerprint (detection only)

```
values      = ["fp1", employee_code, course_code, completion_status,
               completion_date, expiry_date, normalize(certificate_number)]
canonical   = JSON.stringify(values)          // JSON array of strings, no whitespace
fingerprint = "fp1:" + hex(SHA-256(UTF-8(canonical)))
normalize(x): upper-case, trim, collapse inner whitespace; null/empty → ""
dates: "YYYY-MM-DD" or ""
```

JSON encoding escapes every value inside its own quoted string, so no value can shift a field boundary (`["A|B","C"]` and `["A","B|C"]` are different strings). The version tag `fp1` is inside the hashed array and in the prefix; a future `fp2` cannot collide with `fp1`.

Used only to warn "possible duplicate": two records with **different** `source_record_id` and the **same** fingerprint. Never stored as a key, never used to merge.

### 1.8 Relationships

```
Departments 1 ── * Employees * ── 1 Job_Titles
Employees 1 ── * Training_Records * ── 1 Courses
Requirements: (department_code, job_title_code, course_code) → Departments, Job_Titles, Courses
Contacts (separate contract, §7): employee_code → Employees
```

## 2. Validation rules

Severity: **block** = batch cannot be approved; **warn** = shown, approvable; **info**.

| Code | Severity | Rule |
|---|---|---|
| `CONTRACT_VERSION`, `PACKAGE_TYPE` | block | missing or unsupported |
| `SHEET_MISSING`, `COLUMN_MISSING` | block | per package type; names `Sheet` / `Sheet.Column` |
| `FORBIDDEN_COLUMN` | block (default, decision P-04) | national ID, iqama, date of birth, nationality columns |
| `KEY_MISSING`, `KEY_DUPLICATE`, `KEY_PATTERN` | block | per sheet; duplicates are detected after trim and upper-casing, so `ops` and `OPS` collide; includes duplicate department, job-title and course codes (duplicate display names are allowed) |
| `ORG_MISMATCH` | block | `organization_code` differs from the organization bound to the session (§4.7) |
| `ORG_NOT_LOADED` | block | `employees`, `requirements` or `training` package while no organization is bound |
| `REF_UNKNOWN` | block | unknown department, job title, course or employee code |
| `REF_INACTIVE_CODE` | block | new employee or requirement uses an inactive department/job-title code |
| `JOB_TITLE_SCOPE` | block | a department-scoped job title is used with another department |
| `DATE_INVALID`, `DATE_FUTURE`, `DATE_ORDER` | block | format; completion after extract date; expiry ≤ completion |
| `REQUIRED_EMPTY` | block | |
| `CONFLICT_IN_FILE` | block | same key, different values, same file |
| `REQ_NOT_APPROVED` | block | requirement without approval fields, `source ≠ approved`, or `Derived` |
| `REQ_OVERLAP` | block | two rows for the same requirement key with overlapping effective ranges |
| `REQ_EFFECTIVE_MISMATCH` | block | a row's `effective_from` ≠ `_Contract.requirements_effective_from` |
| `REQ_VERSION_OLDER` | block | `requirements_effective_from` earlier than the approved version of any department in the batch |
| `REQ_VERSION_EXISTS` | block | same version date as the approved one with different content (identical content = no-op) |
| `RECORD_IDENTITY_CHANGED` | block | existing `(source_system, source_record_id)` arrives with a different `employee_code` or `course_code` |
| `COMPLETED_WITHOUT_EXPIRY` | block (default) | `Completed` record without `expiry_date` while the current effective requirement is `Mandatory` and has `validity_months`. Preparation rechecks every run so a stored record cannot later become permanently `VALID`. Relaxing needs explicit approval of T-07 |
| `EXPIRY_VALIDITY_MISMATCH` | warn | expiry ≠ completion + official `validity_months` (calendar months, day clamped); shows the difference in days per row and as a distribution. Promotion to block needs decision T-03 with a threshold |
| `CERT_MISSING` | warn | completed without certificate number (T-06 may promote) |
| `CERT_DUPLICATE` | warn | same certificate number on two records (T-06 may promote) |
| `POSSIBLE_DUPLICATE_RECORD` | warn | same fingerprint, different `source_record_id` |
| `SUGGESTED_VALIDITY_DIFFERS` | info | course suggestion ≠ requirement; requirement wins |
| `EMPLOYEE_NOT_CONFIGURED` | warn | active employee without any effective requirement |
| `RECORD_FOR_INACTIVE` | info | evidence for a non-active employee (kept) |
| `RECORD_UNCHANGED` | info | same `source_record_id`, same content → no-op |
| `DATES_ON_INCOMPLETE` | warn | dates on an `In Progress` / `Not Started` record; ignored |

### 2.1 Privacy of messages

- **Summary** (always visible): codes, counts, sheet and row numbers. No names, employee codes, certificate numbers or contact values.
- **Details view** (opened by an explicit action; in Phase 2B only for roles with import permission): may show `employee_code`, `source_record_id`, sheet, row, field name and issue code, so the data owner can fix the row. Never names, certificate numbers or contact values.

## 3. Production requirements (sheet `Requirements`)

| Column | Req. | Rule |
|---|---|---|
| `department_code` | yes | In `Departments`, active |
| `job_title_code` | yes | In `Job_Titles`, active; no wildcard in v1 |
| `course_code` | yes | In `Courses` |
| `requirement_type` | yes | `Mandatory` / `Recommended` (`Recommended` → engine `Mandatory = false` → `NOT_REQUIRED`) |
| `validity_months` | conditional | **Official validity.** Integer 1–120, or empty = no expiry (one-time). Required decision per course by Training/HSE (T-02) |
| `effective_from` | yes | Date |
| `effective_to` | no | Date ≥ `effective_from`; inclusive |
| `approval_reference` | yes | Decision or memo number |
| `approved_by_role` | yes | Role, not a personal name |
| `approved_on` | yes | ≤ import date |
| `source` | yes | Literal `approved` |

Example (fictional codes):

```csv
department_code,job_title_code,course_code,requirement_type,validity_months,effective_from,effective_to,approval_reference,approved_by_role,approved_on,source
OPS,OPR,H2S-01,Mandatory,12,2027-01-01,,TRN-DEC-0001,Training Manager,2026-12-15,approved
OPS,OPR,PTW-01,Mandatory,24,2027-01-01,,TRN-DEC-0001,Training Manager,2026-12-15,approved
OPS,SUP,FA-01,Recommended,24,2027-01-01,,TRN-DEC-0001,Training Manager,2026-12-15,approved
```

Versioning (version 1):
- The batch version is `_Contract.requirements_effective_from`; every row's `effective_from` must equal it (`REQ_EFFECTIVE_MISMATCH`).
- The batch is a **complete set for each department code it contains**. Departments not in the batch are untouched.
- On approval, the currently approved rows of those departments get `effective_to = requirements_effective_from − 1 day`. The preview lists these rows **before** approval (counts in the summary; codes in the details view) together with added and changed requirements.
- A batch older than the approved version of any included department is blocked (`REQ_VERSION_OLDER`). Same version date: identical content is a no-op, different content is blocked (`REQ_VERSION_EXISTS`) — a correction needs a new version date.
- `effective_to` in the file is allowed only to end a requirement within the same set.

## 4. Staging → preview → approval

### 4.1 Flow

1. **Parse** the XLSX → sheets.
2. **Validate** (§2) per package type.
3. **Stage**: build candidate entities and tag each `new` / `changed` / `unchanged` / `conflict` against the currently approved data (local: loaded data; Phase 2B: database).
4. **Preview**: counts per entity and tag; field-level change counts; issue summary; compliance impact (KPI before → after at the current As Of Date); details view on demand (§2.1).
5. **Approve**: only with zero blocking issues; records `prepared_by_role`, approver role and time; applies the whole batch or nothing. **Cancel / reject**: nothing changes.

### 4.2 Updates

- Employees: match on `employee_code`; latest approved batch wins, ordered by approval time (architecture §5.1); each changed field logged (old, new, batch, time, approver role).
- Courses, departments, job titles: match on code; display-name changes logged; codes never change.
- Training records: match on `(source_system, source_record_id)`.
  - Same content → no-op.
  - Different `employee_code` or `course_code` → **blocked** (`RECORD_IDENTITY_CHANGED`). Moving a record to another employee or course = void the old record (Phase 2B void RPC; local mode: not supported) and send a new `source_record_id`.
  - Different dates, status, provider, certificate number or remarks → `changed`, shown field by field; on approval stored as a **new version of the same record**; previous version kept (local: change log; Phase 2B: record-version table — commit 13).
  - A renewal is a new `source_record_id`, never an edit.

### 4.3 Blank cells and clearing

Blank = no information; the existing value stays. Clearing an optional value needs an explicit per-field choice in the preview. Required fields can never be cleared.

### 4.4 Absence and deletion

Absence from a file never deletes, deactivates or changes anything. Leavers must be sent as `employment_status = Left` with a date. Training records are never deleted; corrections arrive as a changed version of the same `source_record_id` or, in Phase 2B, as a void with a reason.

### 4.5 Duplicates

| Case | Handling |
|---|---|
| Same `source_record_id`, same content | `RECORD_UNCHANGED`, no-op |
| Same `source_record_id` twice in one file, different content | block `CONFLICT_IN_FILE` |
| Different `source_record_id`, same fingerprint | warn `POSSIBLE_DUPLICATE_RECORD`; both kept unless the owner excludes one in the preview |
| Same employee + course, different records | history; the engine counts the best record (latest valid expiry) |
| Same certificate number on two records | warn `CERT_DUPLICATE` (T-06 may promote) |

### 4.6 Preparation layer (engine input)

A pure function `prepareEngineInput(approvedData, asOfDate)`; the engine itself is not changed:
1. **Effective requirements:** keep rows with `effective_from ≤ asOfDate` and (`effective_to` empty or `asOfDate ≤ effective_to`), both bounds inclusive, Riyadh calendar day.
2. **Codes go straight into the engine:** `Department = department_code`, `Job_Title = job_title_code` for employees and requirements alike. The engine's exact string match is then a code match; display names never take part in matching.
3. **Display:** tables, charts, filters, exports and the preview look up names (Arabic/English) by code. Missing name → the code is shown, with a warning in the preview.
4. **Employees:** pass the approved employee list (engine's optional fourth argument), so employees with no records still get `MISSING` items.
5. **Records:** pass non-voided records only. Before every engine run, exclude a `Completed` record without `expiry_date` when the current effective requirement is `Mandatory` and has `validity_months`; the engine therefore produces `MISSING`. A `Recommended` or absent requirement does not block storing the evidence. This is a current-state check and does not claim which rule applied historically on the completion date.
6. No historical reporting: only the current `asOfDate` is supported.

### 4.7 Organization binding in local mode

- The first approved `full` package binds the session to its `organization_code`.
- Every later package must carry the same `organization_code` (`ORG_MISMATCH` otherwise).
- `employees`, `requirements` and `training` packages are blocked while no organization is bound (`ORG_NOT_LOADED`), with the message "Load an approved full package for the organization first".
- Full reset clears the binding. Loading demo data or the test workbook also clears it (they are not organization data).
- Phase 2B replaces this with database tenancy (architecture §3); the check stays as a client-side guard.

## 5. Approved vs derived requirements

- Every requirement carries `source`: `approved` (production package with approval fields) or `derived_test` (test workbook adapter; today `Derived: true`).
- Production importer rejects anything not `approved` (`REQ_NOT_APPROVED`).
- A production package cannot be approved on top of derived requirements: if the loaded requirements are derived and the package has no `Requirements` sheet, approval is blocked with an explanation.
- Mandatory marker (phase default): persistent banner "Test requirements — not approved" and a marker line in CSV and PDF exports whenever derived requirements are loaded.
- Phase 2B: database check `source = 'approved'`; derived rows have no table to enter.

## 6. Inactive employees, renewals and history

- Non-active employees: no compliance items, not in KPIs, records kept, visible only with "show inactive"; never eligible for notifications.
- Reactivation: normal compliance from the next calculation.
- Department or job-title change: current codes decide requirements; previous values in the change log; past-date compliance not claimed.
- Renewal: new record (`source_record_id`), old one stays; engine counts the best.
- New joiners: no grace period (phase default); a grace period would change engine rules → decision T-05, separate reviewed change.
- `In Progress`: non-compliant (phase default; T-04 may revisit).

## 7. Contract `HSE-CONTACT-1.0` (separate file, no sending)

Separate XLSX with `_Contract` (`contract_version = HSE-CONTACT-1.0`, `organization_code`, `extract_date`, `prepared_by_role`) and one sheet `Contacts`. Never part of a training package; stored and handled under Privacy/Legal rules (P-03, P-06).

| Field | Req. | Rule |
|---|---|---|
| `employee_code` | yes | Approved employee |
| `email` | no | Basic RFC-5322 pattern, lower-cased |
| `phone_e164` | no | `^\+[1-9][0-9]{7,14}$` |
| `preferred_language` | no | `ar` / `en` |
| `email_allowed` | yes | `Yes` / `No` / `Unknown` |
| `whatsapp_allowed` | yes | `Yes` / `No` / `Unknown` |
| `communication_authorization_basis` | conditional | Code from a list defined by Privacy/Legal (P-01). Until that list exists the only accepted value is `not_defined` |
| `authorization_reference` | conditional | Required when the basis is not `not_defined` |
| `authorization_recorded_at` | conditional | Same |
| `contact_status` | yes | `unverified` / `verified` / `invalid` / `withdrawn` |
| `verified_at` | no | Date |

Eligibility count (displayed only, nothing sent): active employee, channel `Yes`, basis in the approved list, contact status allowed by P-05, and a counted mandatory record expiring in 0–15 days. **Until P-01 is decided every contact is ineligible, so the count is 0 by design.** Phase 2A contains no network code; a test asserts no request is made.

## 8. Synthetic samples and acceptance tests

### 8.1 Fixtures (fictional only, committed)

`tests/fixtures/contract/`: employee codes `TST-0001…`; names `Test Employee 001…`; department codes `OPS`, `MNT`, `LOG`; job-title codes `OPR`, `SUP`, `TEC`; course codes `H2S-01…`; source system `TEST-LMS`, record ids `TR-000001…`; certificate numbers `TST-CERT-000001…`; emails `…@example.invalid` (reserved TLD); phones `+999000000001…` (country code 999 not assigned). A generator script builds a 500-employee package on demand; the generated file is not committed.

### 8.2 Acceptance tests

| ID | Test |
|---|---|
| AT-01 | Valid `full` package → zero blocking issues; preview counts exact |
| AT-02 | Each package type: required sheets enforced, optional sheets accepted, unrelated sheets warned |
| AT-03a | Summary contains no names, employee codes, certificate numbers, emails or phones |
| AT-03b | Details view shows `employee_code` / `source_record_id` / sheet / row / field only — never names, certificate numbers or contacts |
| AT-04 | Every blocking code has a minimal failing fixture and blocks approval |
| AT-05 | Engine receives codes in `Department` / `Job_Title`; display-name spelling, case or repetition never changes matching; duplicate display names allowed; duplicate codes blocked |
| AT-06 | Blank keeps value; explicit clear changes it; required field cannot be cleared |
| AT-07 | Absence from a file changes nothing (employees, records, requirements of other departments) |
| AT-08 | Re-importing the same package is a no-op; same `source_record_id` with new content shows `changed` and keeps history |
| AT-09 | Older approved batch cannot overwrite a newer value |
| AT-10 | Fingerprint: canonical JSON array with `fp1` inside; identical fingerprint with different ids → warning, never merged; shifted field boundaries (`"A|B","C"` vs `"A","B|C"`) give different fingerprints |
| AT-11 | Effective requirements: day before `effective_from` excluded; `effective_from` and `effective_to` days included; day after `effective_to` excluded; overlap blocked; new version closes old rows of the same departments only |
| AT-12 | Official validity from requirement; course suggestion ignored for status; mismatch warning shows days |
| AT-13 | Derived requirements rejected; banner and export marker present when loaded |
| AT-14 | Renewal kept as history; engine counts the newer valid record; non-active employees have no items |
| AT-15 | Contact contract: basis `not_defined` → 0 eligible; no network request (asserted) |
| AT-16 | Scale: 500-employee synthetic package — automated check of sizes and results (item count, KPIs) |
| AT-17 | Existing 225 tests pass; legacy CSV and test-workbook imports unchanged |
| AT-20 | `COMPLETED_WITHOUT_EXPIRY` blocks when a current `Mandatory` requirement has `validity_months`; `Recommended`, no requirement, or no validity does not block storage; if the mandatory requirement becomes applicable later, preparation excludes the record and the engine produces `MISSING` |
| AT-21 | `In Progress` and `Not Started` with valid `source_record_id` and no dates/certificate are accepted; engine statuses `IN_PROGRESS` / `NOT_STARTED`; dates on them ignored with warning |
| AT-22 | Requirements version: row `effective_from` ≠ contract value blocked; preview lists rows to be closed; older version blocked; same version with different content blocked; identical re-import no-op |
| AT-23 | Organization binding: second organization's package blocked; partial package without bound organization blocked; reset clears binding; demo/test workbook clear binding |
| AT-24 | `RECORD_IDENTITY_CHANGED`: same record id with another employee or course blocked; other field changes create a new version |
| AT-25 | A department-scoped job title used with another department blocks approval |
| AT-26 | Partial packages cannot create or update `Departments` / `Job_Titles`; such sheets are `SHEET_UNEXPECTED` (warn) and ignored in full — approved lists byte-identical before and after approval, no code added, renamed or deactivated |
| AT-27 | Reference-code duplicates are detected after normalisation: `ops` and `OPS` in one sheet give `KEY_DUPLICATE`; a row written `ops` matches approved `OPS` instead of `REF_UNKNOWN` |
| AT-18 (manual) | UI walkthrough: each package type, preview, details, approve, cancel, blocked file, Arabic/English |
| AT-19 (manual, documented) | Performance on the reference machine (§8.3) |

### 8.3 Performance acceptance

Reference machine: the development Mac (model, CPU, RAM, macOS, Node and Chrome versions recorded in the report).

| Metric | Criterion |
|---|---|
| Parse + validate + stage + preview render of a 500-employee `full` package | ≤ 3 s, from file selection to preview visible |
| Search or filter change on the 500-employee data set | ≤ 200 ms from input to updated table |
| Also recorded | per-step times, JS heap used, number of compliance items |

Timing is measured in Node (script) and in the browser (manual, `performance.now()` around the action), median of 5 runs. If timing is unstable in CI, CI checks sizes and results only (AT-16) and timing stays a documented manual measurement (AT-19).

## 9. Decisions — by owner

Form for every decision:

```
Decision ID:
Owner:
Question:
Options:
Recommendation:
Phase 2A default until decided:
Decision:            [ ] A  [ ] B  [ ] other: ______
Approved by (role):            Date:            Reference:
```

### 9.1 Training / HSE

| ID | Question | Phase 2A default |
|---|---|---|
| T-01 | First approved requirements set: which courses are mandatory/recommended for which (department code, job title code) | None — production import impossible until provided |
| T-02 | Official `validity_months` per course and role | From the approved requirements file |
| T-03 | Promote expiry/validity mismatch to blocking? If yes, threshold in days | Warning only, difference shown |
| T-04 | Does `In Progress` count as compliant? | No |
| T-05 | Grace period for new joiners (engine change) | None |
| T-06 | Certificate number: mandatory? unique? | Warning for missing and duplicate |
| T-07 | Completed record without expiry where a current `Mandatory` requirement has validity: keep blocking, or accept as one-time | **Blocked**; relaxing needs explicit approval |
| T-08 | Allow `*ALL*` job-title rows in a later version | Not allowed |
| T-09 | Which roles may approve an import batch (four-eyes) | Recorded only in local mode |

### 9.2 HR

| ID | Question | Phase 2A default |
|---|---|---|
| H-01 | What does `employee_code` represent (HR employee number, badge, other) — also needs Training/HSE agreement | Neutral; current mapping `Employee_ID` (CSV) / `Badge` (test workbook); trim, preserve case, compare exactly |
| H-02 | Employment status values and their meaning; effective-date rule | `Active` / `Inactive` / `Left` |
| H-03 | Approved source and owner of department and job-title code lists; change process | Lists may be created or updated only by `full` packages |

### 9.3 Privacy / Legal / IT

| ID | Question | Phase 2A default |
|---|---|---|
| P-01 | Allowed `communication_authorization_basis` codes and required evidence | Only `not_defined` → nobody eligible |
| P-02 | Allowed channels (email, WhatsApp) and approved providers | No sending in Phase 2A |
| P-03 | Retention of contact data and of training records | Not stored beyond the browser session in local mode |
| P-04 | Data-minimisation policy: confirm blocking of national ID, iqama, date of birth, nationality columns | Blocked |
| P-05 | Must a contact be `verified` to be eligible? | Yes (`verified` only) |
| P-06 | Where contact files may be stored and transferred | Local machine only |
| I-01 | Does each source system provide a stable record id (`source_record_id`)? If not, who assigns one | Required field; trim, preserve case, compare exactly; packages without it are rejected |

### 9.4 Engineering (decided, documented)

| ID | Decision |
|---|---|
| E-01 | One XLSX per import; multi-file CSV deferred |
| E-02 | Record key `(source_system, source_record_id)`; fingerprint for detection only |
| E-03 | Staging, preview, all-or-nothing approval; idempotent re-import |
| E-04 | Codes passed directly to the engine (`Department` = `department_code`, `Job_Title` = `job_title_code`); names display only; engine unchanged |
| E-05 | Absence never deletes or deactivates |
| E-06 | Summary/details privacy split (§2.1) |
| E-07 | Local-mode organization binding (§4.7) |
| E-08 | Training record identity immutable; corrections as versions (§4.2) |
| E-09 | Fingerprint = SHA-256 of canonical JSON array with `fp1` inside (§1.7) |
| E-10 | Requirements version = `requirements_effective_from`; complete set per department; older versions blocked (§3) |
| E-11 | Reference codes share `^[A-Z0-9_-]{2,20}$`; employee/source record identifiers preserve case and compare exactly |
| E-12 | Partial packages cannot modify department or job-title reference lists |

## 10. Implementation commits

| # | Commit | Contents | Tests |
|---|---|---|---|
| 1 | `docs: data contracts HSE-DC-1.0, HSE-CONTACT-1.0 and decision log` | `docs/DATA-CONTRACT.md`, `docs/CONTACT-CONTRACT.md`, `docs/DECISIONS.md` (forms §9) | — |
| 2 | `feat(contract): package types and field definitions` | `src/lib/contract/schema.js` (pure data) | AT-02 (schema part) |
| 3 | `feat(contract): reference lists and code validation` | departments, job titles, courses; unified code pattern; scoped titles; partial-package restrictions; duplicate codes block, duplicate names allowed | AT-05, AT-25, AT-26 |
| 4 | `feat(contract): employee and training record validators` | `source_record_id`, canonical fingerprint, status-specific date rules, `COMPLETED_WITHOUT_EXPIRY`, certificate warnings | AT-04, AT-10, AT-20, AT-21 |
| 5 | `feat(contract): approved requirements and effective selection` | contract version date, complete set per department, closure list, older/existing version checks, overlap, derived rejection | AT-11, AT-12, AT-13 (importer part), AT-22 |
| 6 | `feat(contract): staging, diff, batch ordering and organization binding` | blank rule, explicit clear, no-op, record versions, `RECORD_IDENTITY_CHANGED`, org binding | AT-06 – AT-09, AT-23, AT-24 |
| 7 | `feat(contract): engine input preparation` | `prepareEngineInput`: codes into `Department`/`Job_Title`, effective requirements, no expiry-less completed records; engine untouched | AT-05, AT-11, AT-14, AT-20 |
| 8 | `feat(contact): HSE-CONTACT-1.0 validator and eligibility count` | no network code | AT-15 |
| 9 | `test(contract): synthetic fixtures, 500-employee generator, timing script` | | AT-01, AT-16 |
| 10 | `feat(ui): production package preview, details view and code→name display` | new entry point; names looked up by code in tables, charts and filters; legacy and workbook paths untouched | AT-03a/b, AT-18 |
| 11 | `feat(ui): test-requirements banner` | | AT-13 (UI) |
| 12 | `feat(export): test-requirements marker and code→name columns` | isolated change to the v1.0-frozen export; exports carry code and name | export tests |
| 13 | `docs(architecture): align schema with the contracts` | reference tables with codes, `source_system`/`source_record_id` with immutable identity, record versions, requirement `source` and version date, contact contract fields | — |

Commits 2–9 add new modules only. Commits 10–12 touch the UI and exports in isolated changes. Performance report (AT-19) is attached to the review of commit 10.

### Risks

| Risk | Mitigation |
|---|---|
| Decisions late or changed | Rules are configuration with the defaults in §0.1/§9; changing a decision changes constants, not structure |
| Source systems have no stable record ids (I-01) | Packages without `source_record_id` are rejected; raised early with IT; no silent fallback to fingerprints |
| Code lists missing or inconsistent (H-03) | Preview groups unknown codes with counts; production import blocked until lists approved |
| Codes appear on screen or in exports instead of names | Code→name lookup in commit 10 (UI) and commit 12 (exports); preview warns on missing names |
| Expiry-less completed records inflate compliance | Blocked at validation and asserted again in the preparation layer (AT-20) |
| Wrong record moved to another employee by an edited export | `RECORD_IDENTITY_CHANGED` blocks; moves require void + new record |
| Two organizations' data mixed in one local session | Organization binding (AT-23) |
| Requirements batch silently drops rows of a department | Complete-set rule plus closure list shown before approval (AT-22) |
| A validation rule silently changes compliance results | Rules that change computed status are engine changes, raised as decisions, separate commits |
| Personal data in fixtures, logs or messages | Reserved domains/numbers; AT-03a/b; no real files in the repository |
| Contract drifts from future database schema | Commit 13 aligns the architecture; Phase 2B migrations derived from `schema.js` |
| Changing the frozen PDF export (commit 12) | Isolated commit with its own tests; revertable alone |
| Timing tests flaky in CI | Sizes/results automated; timing manual and documented |

### Rollback

- Baseline tag `v1.1-workbook-import`; each commit independent, revertable with `git revert <sha>`.
- New import path is a separate entry point; reverting commit 10 removes it from the UI without touching other code.
- Local mode has no persisted data, so rollback never needs data repair.
