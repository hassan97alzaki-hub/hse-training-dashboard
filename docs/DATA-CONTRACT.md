# HSE Data Contract — `HSE-DC-1.0`

**Status:** specification for Phase 2A implementation. Not yet implemented.
**Plan:** `docs/PHASE_2A_PLAN.md` (structure and rationale). This document is the executable specification; where they differ, raise it — do not pick one silently.
**Contact data:** separate contract `docs/CONTACT-CONTRACT.md` (`HSE-CONTACT-1.0`).
**Open decisions:** `docs/DECISIONS.md`. Rules marked *(default, decision X)* are Phase 2A defaults, not approvals.

## 0. Conventions

The key words below are used in this sense:

| Word | Meaning |
|---|---|
| **MUST** / **MUST NOT** | Absolute requirement. A violation is a blocking issue or a defect in the implementation |
| **SHOULD** / **SHOULD NOT** | Expected unless there is a documented reason; a violation in data is a warning |
| **MAY** | Optional; allowed but not required |

Severity of validation issues:

| Severity | Effect |
|---|---|
| `block` | The batch MUST NOT be approved |
| `warn` | Shown in the preview; the batch MAY be approved |
| `info` | Shown in the preview; no action required |

Terms: **package** = one XLSX file; **batch** = one package after parsing, while staged; **approved data** = everything approved in the current session (local mode) or organization (Phase 2B); **As Of Date** = today in `Asia/Riyadh` (architecture §16).

## 1. Package

### 1.1 File format

- A package MUST be one `.xlsx` file. Multi-file CSV packages are not part of `HSE-DC-1.0`.
- Each sheet MUST have one header row followed by data rows.
- Header names MUST match this specification exactly after trimming; matching is case-sensitive.
- Unknown sheets and unknown columns SHOULD NOT be present; they produce `warn` and are ignored.

### 1.2 Sheet `_Contract`

Required in every package: one header row and exactly one value row.

| Field | Required | Rule |
|---|---|---|
| `contract_version` | MUST | Literal `HSE-DC-1.0` |
| `package_type` | MUST | `full`, `employees`, `requirements` or `training` |
| `organization_code` | MUST | Reference code pattern (§2.2). Checked against the organization binding (§6) |
| `source_system` | MUST for `full` and `training` | Reference code pattern. Identifies the system that produced the training records |
| `extract_date` | MUST | Date (§2.3), not after the As Of Date |
| `prepared_by_role` | MUST | Role text, 2–60 characters. MUST NOT be a personal name |
| `requirements_effective_from` | MUST for `full` and `requirements` | Date. Version date of the requirements set (§5) |

### 1.3 Package types and sheets

R = MUST be present; O = MAY be present; — = MUST NOT be present (`warn`, ignored).

| Sheet | `full` | `employees` | `requirements` | `training` |
|---|---|---|---|---|
| `_Contract` | R | R | R | R |
| `Departments` | R | — | — | — |
| `Job_Titles` | R | — | — | — |
| `Employees` | R | R | — | — |
| `Courses` | R | — | O | O |
| `Requirements` | R | — | R | — |
| `Training_Records` | R | — | — | R |

Every code used in a batch MUST exist either in an allowed sheet in the same batch or in the approved data (`REF_UNKNOWN`). Only a `full` package may create or update `Departments` or `Job_Titles`; those sheets in a partial package produce `SHEET_UNEXPECTED` (`warn`). The sheet is then ignored completely: no row of it is read, no code is created, renamed, activated or deactivated, and the approved lists stay exactly as they were. The rest of the package is still validated and may be approved.

## 2. Normalisation

Applied before validation; validation and matching use normalised values.

### 2.1 Text

- Leading and trailing whitespace MUST be removed; inner runs of whitespace MUST be collapsed to one space.
- An empty string after trimming means "no value" (§7.3).

### 2.2 Codes

Reference codes (`organization_code`, `source_system`, `department_code`, `job_title_code`, `course_code`):
- MUST be upper-cased after trimming.
- MUST match `^[A-Z0-9_-]{2,20}$`.
- Are the only matching keys for reference data. Display names MUST NOT be used for matching.
- Duplicate detection and all reference matching happen **after** trimming and upper-casing. Two rows with `ops` and `OPS` are therefore the same key and MUST produce `KEY_DUPLICATE`; a code written `ops` MUST match an approved `OPS`.

Record identifiers:
- `employee_code`: trimmed; MUST match the organization pattern (default `^[A-Za-z0-9-]{3,20}$`); compared **exactly** (case preserved).
- `source_record_id`: trimmed; 1–64 characters; compared exactly.

### 2.3 Dates

- Accepted: text `YYYY-MM-DD` that is a real calendar date, or an Excel date serial number that is a whole number of days.
- Text dates with `/` and serial numbers with a time fraction MUST be rejected (`DATE_INVALID`).
- Dates are calendar days; no time and no time zone conversion is applied. "Today" is the As Of Date in `Asia/Riyadh`.

### 2.4 Enumerations

Values such as `Yes`/`No`, statuses and types are matched case-insensitively and stored in the spelling given in this document.

## 3. Entities

### 3.1 `Departments`

| Field | Required | Rule |
|---|---|---|
| `department_code` | MUST | Key, unique in the organization; a code MUST NOT be reused for a different department |
| `name_en` | MUST | Display only; MAY repeat |
| `name_ar` | MUST | Display only; MAY repeat |
| `active` | MUST | `Yes` / `No`. An inactive code MUST NOT be assigned to an employee or used in a new requirement |

### 3.2 `Job_Titles`

| Field | Required | Rule |
|---|---|---|
| `job_title_code` | MUST | Key, unique in the organization |
| `name_en`, `name_ar` | MUST | Display only; MAY repeat (the same title name can exist in several departments under different codes) |
| `department_code` | MAY | Empty = usable in any department. If set, it MUST be a known department code; an employee or requirement combining this title with another department produces `JOB_TITLE_SCOPE` (`block`) |
| `active` | MUST | As for departments |

Source and owner of both lists: decision H-03.

### 3.3 `Employees`

| Field | Required | Rule |
|---|---|---|
| `employee_code` | MUST | Key, unique in the organization. Meaning (HR number, badge, other): decision H-01. MUST NOT be derived from a name |
| `badge_number` | MAY | Informational; SHOULD be unique. A repeated non-empty value produces `BADGE_DUPLICATE` (`warn`); the badge is never the employee key |
| `full_name` | MUST | 2–120 characters; display only; MUST NOT be used for matching |
| `full_name_ar` | MAY | Display only |
| `department_code` | MUST | Known, active code |
| `job_title_code` | MUST | Known, active code |
| `employment_status` | MUST | `Active` / `Inactive` / `Left` *(default, decision H-02)* |
| `status_effective_date` | MUST when status is not `Active` | Date, not after `extract_date` |
| `hire_date` | MAY | Date, not after `extract_date` |
| `site_code` | MAY | Reference code pattern |

Mapping of existing import paths to `employee_code` (not part of `HSE-DC-1.0`, documented for consistency): legacy CSV `Employee_ID`; three-sheet test workbook `Badge`. In every path names MUST NOT be used for matching.

### 3.4 `Courses`

| Field | Required | Rule |
|---|---|---|
| `course_code` | MUST | Key, unique in the organization |
| `name_en` | MUST | Display |
| `name_ar` | MAY | Display |
| `category` | MAY | Text |
| `regulatory_reference` | MAY | Text |
| `suggested_validity_months` | MAY | Integer 1–120. **Help only**: MAY pre-fill templates and MAY be shown next to the official value. MUST NOT be used to compute any status. A difference from the requirement produces `SUGGESTED_VALIDITY_DIFFERS` (`info`); the requirement wins |

### 3.5 `Requirements`

| Field | Required | Rule |
|---|---|---|
| `department_code` | MUST | Known, active |
| `job_title_code` | MUST | Known, active. Wildcards MUST NOT be used *(default, decision T-08)* |
| `course_code` | MUST | Known |
| `requirement_type` | MUST | `Mandatory` / `Recommended` |
| `validity_months` | MAY | Integer 1–120. **The official validity.** Empty = the course does not expire for this role. Values: decision T-02 |
| `effective_from` | MUST | Date; MUST equal `_Contract.requirements_effective_from` |
| `effective_to` | MAY | Date ≥ `effective_from`; inclusive |
| `approval_reference` | MUST | Reference of the approving decision or memo |
| `approved_by_role` | MUST | Role, not a personal name |
| `approved_on` | MUST | Date, not after the import date |
| `source` | MUST | Literal `approved` |

Key: `(department_code, job_title_code, course_code, effective_from)`.

Engine mapping: `Mandatory` → engine `Mandatory = true`; `Recommended` → `Mandatory = false` (engine status `NOT_REQUIRED`).

### 3.6 `Training_Records`

| Field | Required | Rule |
|---|---|---|
| `source_record_id` | MUST | Record key together with `_Contract.source_system` (§3.7). Availability: decision I-01 |
| `employee_code` | MUST | Known employee |
| `course_code` | MUST | Known course |
| `completion_status` | MUST | `Completed` / `In Progress` / `Not Started` |
| `completion_date` | MUST when `Completed` | Date, not after `extract_date`. On other statuses it is ignored (`DATES_ON_INCOMPLETE`) |
| `expiry_date` | MUST when `Completed` and the applicable requirement is `Mandatory` with `validity_months` | Date after `completion_date`. Taken as given; MUST NOT be recalculated. On other statuses it is ignored |
| `certificate_number` | SHOULD when `Completed` | Not a key. Missing → `CERT_MISSING`; duplicate → `CERT_DUPLICATE` (both `warn`, decision T-06 may promote) |
| `training_provider` | MAY | Text |
| `remarks` | MAY | ≤ 500 characters |

**Applicable requirement** for a record: the requirement for the employee's `(department_code, job_title_code)` and the record's `course_code` that is effective at the As Of Date (§5.4). `COMPLETED_WITHOUT_EXPIRY` applies only when that requirement is `Mandatory` and has `validity_months`. A `Recommended` or absent requirement does not block storage of the evidence. This is a current-state validation and does not claim which rule applied historically on the completion date.

Status rules:
- `Completed` without `expiry_date` while the applicable requirement is `Mandatory` and has `validity_months` → `COMPLETED_WITHOUT_EXPIRY` (`block`, *default, decision T-07*). The preparation layer MUST repeat this check before every engine run; if the requirement becomes applicable after import, the record is excluded and the engine produces `MISSING` rather than permanent `VALID`.
- `In Progress` and `Not Started` with a valid `source_record_id` MUST be accepted without dates or certificate number. The engine reports them `IN_PROGRESS` / `NOT_STARTED` (non-compliant, *default, decision T-04*).
- A requirement with no record at all is reported `MISSING` by the engine; no row is needed for that.

`Training_Required` (legacy column) is not part of `HSE-DC-1.0`.

### 3.7 Record identity

- Key: `(organization, source_system, source_record_id)`.
- Once approved, the key MUST keep its `employee_code` and `course_code`. A batch that changes either for an existing key is blocked (`RECORD_IDENTITY_CHANGED`).
- Changes to any other field create a **new version** of the same record; previous versions are kept.
- Moving evidence to another employee or course: void the existing record and send a new `source_record_id`. Voiding is not available in local mode (Phase 2B).
- A renewal is a new `source_record_id`.

### 3.8 Fingerprint (detection only)

```
values      = ["fp1", employee_code, course_code, completion_status,
               completion_date, expiry_date, normalize(certificate_number)]
canonical   = JSON.stringify(values)            // array of strings, no whitespace
fingerprint = "fp1:" + lowercase hex of SHA-256(UTF-8 bytes of canonical)
normalize(x)= upper-case, trim, collapse inner whitespace; missing → ""
dates       = "YYYY-MM-DD" or ""
```

- The fingerprint MUST be used only to detect possible duplicates: different `source_record_id`, same fingerprint → `POSSIBLE_DUPLICATE_RECORD` (`warn`).
- It MUST NOT be stored as a key and MUST NOT be used to merge records.
- Each value is a separate JSON string, so a `|` or `,` inside a value cannot shift a field boundary.

### 3.9 Relationships

```
Departments 1 ── * Employees * ── 1 Job_Titles
Employees   1 ── * Training_Records * ── 1 Courses
Requirements (department_code, job_title_code, course_code) → Departments, Job_Titles, Courses
Contacts (HSE-CONTACT-1.0): employee_code → Employees
```

### 3.10 Data minimisation

Columns named (case-insensitive, any language variant agreed later) national ID, iqama, date of birth or nationality MUST NOT be present: `FORBIDDEN_COLUMN` (`block`, *default, decision P-04*). This is a governance default, not an approved policy.

## 4. Validation codes

| Code | Severity | Condition |
|---|---|---|
| `CONTRACT_VERSION` | block | `contract_version` missing or not `HSE-DC-1.0` |
| `PACKAGE_TYPE` | block | `package_type` missing or unknown |
| `CONTRACT_FIELD` | block | other `_Contract` field missing or invalid |
| `SHEET_MISSING` | block | required sheet absent (names the sheet) |
| `SHEET_UNEXPECTED` | warn | sheet not allowed for the package type, or unknown; ignored completely (§1.3). Partial packages cannot modify `Departments` or `Job_Titles`; the approved lists stay unchanged |
| `COLUMN_MISSING` | block | required column absent (names `Sheet.Column`) |
| `COLUMN_UNKNOWN` | warn | unknown column; ignored |
| `FORBIDDEN_COLUMN` | block | §3.10 |
| `KEY_MISSING` | block | key field empty |
| `KEY_DUPLICATE` | block | key repeated in the batch after normalisation (§2.2): codes compared upper-cased, `employee_code` / `source_record_id` compared exactly, requirement key. Duplicate display names are not an issue |
| `KEY_PATTERN` | block | code or identifier fails its pattern |
| `REF_UNKNOWN` | block | referenced code not in the batch nor in approved data |
| `REF_INACTIVE_CODE` | block | inactive department or job title on an employee or a new requirement |
| `JOB_TITLE_SCOPE` | block | job title restricted to another department |
| `ORG_MISMATCH` | block | `organization_code` ≠ bound organization (§6) |
| `ORG_NOT_LOADED` | block | non-`full` package while no organization is bound |
| `DATE_INVALID` | block | §2.3 |
| `DATE_FUTURE` | block | date after `extract_date` where not allowed, or `extract_date` after the As Of Date |
| `DATE_ORDER` | block | `expiry_date` ≤ `completion_date`, or `effective_to` < `effective_from` |
| `REQUIRED_EMPTY` | block | required field empty |
| `VALUE_INVALID` | block | enumeration or number out of range |
| `CONFLICT_IN_FILE` | block | same key with different values in the batch |
| `REQ_NOT_APPROVED` | block | requirement without approval fields, `source ≠ approved`, or carrying a derived/test marker |
| `REQ_OVERLAP` | block | overlapping effective ranges for one requirement key |
| `REQ_EFFECTIVE_MISMATCH` | block | row `effective_from` ≠ `_Contract.requirements_effective_from` |
| `REQ_VERSION_OLDER` | block | version date earlier than the approved version of any department in the batch |
| `REQ_VERSION_EXISTS` | block | same version date as the approved one, different content |
| `REQ_ON_DERIVED` | block | production batch would sit on derived test requirements without replacing them (§5.5) |
| `RECORD_IDENTITY_CHANGED` | block | §3.7 |
| `COMPLETED_WITHOUT_EXPIRY` | block (default, T-07) | current effective requirement is `Mandatory` with `validity_months`; see §3.6 |
| `EXPIRY_VALIDITY_MISMATCH` | warn (T-03 may promote) | `expiry_date` ≠ `completion_date` + `validity_months` calendar months (day clamped to the last day of the month); the difference in days is shown per row and as a distribution |
| `CERT_MISSING` | warn (T-06) | completed record without certificate number |
| `CERT_DUPLICATE` | warn (T-06) | same certificate number on two records |
| `POSSIBLE_DUPLICATE_RECORD` | warn | §3.8 |
| `DATES_ON_INCOMPLETE` | warn | dates on `In Progress` / `Not Started`; ignored |
| `BADGE_DUPLICATE` | warn | same non-empty `badge_number` on two employees; informational only, the badge is not the employee key (§3.3) |
| `EMPLOYEE_NOT_CONFIGURED` | warn | active employee with no effective requirement |
| `SUGGESTED_VALIDITY_DIFFERS` | info | §3.4 |
| `RECORD_FOR_INACTIVE` | info | record for a non-active employee; kept as history |
| `RECORD_UNCHANGED` | info | same key and content as approved; no-op |
| `REQ_UNCHANGED` | info | identical requirements version re-imported; no-op |

### 4.1 Privacy of messages

- **Summary** (always visible) MUST contain only codes, counts, sheet names, row numbers and column names. It MUST NOT contain names, `employee_code`, `source_record_id`, certificate numbers or contact values.
- **Details view** (opened by an explicit action; in Phase 2B restricted to roles with import permission) MAY additionally show `employee_code`, `source_record_id`, reference codes and the field name. It MUST NOT show names, certificate numbers or contact values.
- Console output and logs follow the summary rule.

## 5. Requirements versions

### 5.1 Version date

`_Contract.requirements_effective_from` is the version date of the batch. Every `Requirements` row MUST have `effective_from` equal to it.

### 5.2 Complete set per department

A batch is the **complete** requirements set for every `department_code` that appears in its `Requirements` sheet. Departments that do not appear are not affected.

### 5.3 Approval effects

On approval, for each department in the batch:
- currently approved rows of that department without `effective_to`, or with `effective_to` ≥ the version date, get `effective_to = version date − 1 day`;
- the batch rows become the approved set from the version date.

The preview MUST list, before approval: requirements added, changed, unchanged, and approved rows that will be closed (counts in the summary; codes in the details view).

Version checks: a version date earlier than the approved version of any department in the batch → `REQ_VERSION_OLDER`; the same date with different content → `REQ_VERSION_EXISTS`; the same date with identical content → `REQ_UNCHANGED`.

### 5.4 Effective selection

The preparation layer MUST select requirements with `effective_from ≤ As Of Date` and (`effective_to` empty or `As Of Date ≤ effective_to`); both bounds inclusive. Only this set is passed to the engine. Historical reporting (another As Of Date with the requirements in force then) is not supported by `HSE-DC-1.0`.

### 5.5 Approved vs derived

- Only rows with `source = approved` and complete approval fields MAY enter approved data.
- Requirements produced by the three-sheet test workbook (`Derived: true`) are test data. A production batch MUST NOT be approved while derived requirements are loaded unless the batch contains a `Requirements` sheet (`REQ_ON_DERIVED`).
- While derived requirements are loaded, the screen and every CSV/PDF export MUST show the marker "Test requirements — not approved".

## 6. Organization binding (local mode)

- The first approved `full` batch binds the session to its `organization_code`.
- Every later batch (any type) MUST carry the same `organization_code` (`ORG_MISMATCH`).
- `employees`, `requirements` and `training` batches MUST be blocked while no organization is bound (`ORG_NOT_LOADED`).
- Full reset, loading demo data and loading the test workbook MUST clear the binding.
- Phase 2B replaces the binding with database tenancy; the client check remains as a guard.

## 7. Staging, preview, approval, rollback

### 7.1 Steps

1. **Parse** the file.
2. **Normalise** (§2) and **validate** (§4).
3. **Stage**: tag every entity `new`, `changed`, `unchanged` or `conflict` against approved data.
4. **Preview**: counts per entity and tag; field-level change counts; requirement closures (§5.3); issue summary; compliance impact (KPIs before → after at the As Of Date); details view on demand (§4.1).
5. **Approve**: allowed only with zero `block` issues. Records `prepared_by_role`, the approver role and the approval time. Applies the whole batch or nothing.
6. **Cancel / reject**: approved data MUST NOT change.

Four-eyes: the preparer and approver roles are recorded in local mode; technical enforcement starts with authentication in Phase 2B (decision T-09).

### 7.2 Updates by entity

| Entity | Match on | Rule |
|---|---|---|
| Departments, Job_Titles, Courses | code | Display-name and `active` changes are `changed`; codes never change |
| Employees | `employee_code` | Latest approved batch wins, ordered by approval time; an older staged batch MUST NOT overwrite a newer approved value; every changed field is logged (old, new, batch, time, approver role) |
| Requirements | requirement key | Version rules §5 |
| Training_Records | `(source_system, source_record_id)` | Identity rules §3.7; same content → `RECORD_UNCHANGED` |

### 7.3 Empty cells and clearing

- An empty cell means "no information"; the approved value MUST be kept.
- An optional value MAY be cleared only by an explicit per-field choice in the preview.
- Required fields MUST NOT be cleared.

### 7.4 Absence

Absence of an employee, course, record or reference code from a batch MUST NOT delete, deactivate or change it. Leavers MUST be sent with `employment_status = Left` and a `status_effective_date`. The only absence with an effect is §5.2 (complete requirements set per department in the batch).

### 7.5 Duplicates

| Case | Result |
|---|---|
| Same key, same content as approved | `RECORD_UNCHANGED` / no-op |
| Same key twice in one batch, different content | `CONFLICT_IN_FILE` |
| Different `source_record_id`, same fingerprint | `POSSIBLE_DUPLICATE_RECORD`; both kept unless excluded in the preview |
| Same employee and course, different records | History; the engine counts the best record |

### 7.6 Rollback

- **Before approval:** cancel; nothing changes.
- **After approval, local mode:** there is no batch-level undo in `HSE-DC-1.0`. Recovery = full reset and re-import of the previously approved packages.
- **Phase 2B:** batch rollback by voiding the records of an import batch (architecture §5); employee field changes reverted from the change log.

## 8. Engine input (preparation layer)

The preparation layer MUST be the only producer of engine input for this contract. The engine is not changed.

| Engine field | Source |
|---|---|
| `Employee_ID` | `employee_code` |
| `Employee_Name` | `full_name` |
| `Department` | `department_code` |
| `Job_Title` | `job_title_code` |
| `Employment_Status` | `employment_status` |
| `Course_Code` | `course_code` |
| `Course_Name` | `Courses.name_en` (display lookups by code override it on screen) |
| `Completion_Status` | `completion_status` |
| `Issue_Date` | `completion_date` (`Completed` only) |
| `Expiry_Date` | `expiry_date` (`Completed` only) |
| `Certificate_Number`, `Training_Provider`, `Remarks` | same-named fields |
| requirement `Department`, `Job_Title`, `Course_Code`, `Mandatory`, `Validity_Months` | `department_code`, `job_title_code`, `course_code`, `requirement_type`, `validity_months` of the effective set (§5.4) |

Additional rules:
- The approved employee list MUST be passed as the engine's employee list.
- Only non-voided record versions (latest version per key) are passed.
- Before every run, a `Completed` record without `expiry_date` whose current applicable requirement is `Mandatory` with `validity_months` MUST NOT be passed. The engine therefore produces `MISSING`; this also protects records stored before the requirement became applicable. `Recommended` or absent requirements do not block storing the evidence.
- Screens, filters and exports MUST show names looked up by code; a missing name shows the code and a preview warning.

## 9. Examples (fictional)

`_Contract`:

```csv
contract_version,package_type,organization_code,source_system,extract_date,prepared_by_role,requirements_effective_from
HSE-DC-1.0,full,TESTORG,TEST-LMS,2027-01-05,Training Coordinator,2027-01-01
```

`Requirements`:

```csv
department_code,job_title_code,course_code,requirement_type,validity_months,effective_from,effective_to,approval_reference,approved_by_role,approved_on,source
OPS,OPR,H2S-01,Mandatory,12,2027-01-01,,TEST-DEC-0001,Training Manager,2026-12-15,approved
OPS,SUP,FA-01,Recommended,24,2027-01-01,,TEST-DEC-0001,Training Manager,2026-12-15,approved
```

`Training_Records`:

```csv
source_record_id,employee_code,course_code,completion_status,completion_date,expiry_date,certificate_number,training_provider,remarks
TR-000001,TST-0001,H2S-01,Completed,2026-03-10,2027-03-10,TST-CERT-000001,Test Provider,
TR-000002,TST-0002,H2S-01,In Progress,,,,,
```
