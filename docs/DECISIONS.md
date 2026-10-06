# Decision Register — Phase 2A

**Purpose:** decisions that the data contracts depend on and that engineering cannot make alone.
**Related:** `docs/PHASE_2A_PLAN.md` §9, `docs/DATA-CONTRACT.md`, `docs/CONTACT-CONTRACT.md`.

## Rules for this register

- **Status** is one of `Pending`, `Approved`, `Rejected`, `Superseded`. A decision is `Approved` only when the owner role has given a dated decision with a reference. This register contains no approvals yet.
- **Phase 2A default** is the technical behaviour used until a decision is approved. A default is a safe engineering placeholder. It is **not** a business, commercial, legal or privacy approval and MUST NOT be presented as one.
- Changing a default to the approved option is done in a separate, reviewed commit that cites the decision ID and its reference.
- No personal names are recorded here; only roles.
- Engineering decisions E-01 – E-10 are documented in `docs/PHASE_2A_PLAN.md` §9.4 and are not repeated here.

Entry template:

| Field | Value |
|---|---|
| Owner | |
| Question | |
| Options | |
| Recommendation | |
| Phase 2A default | |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

## Training / HSE

### T-01 — First approved requirements set

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | Which courses are `Mandatory` or `Recommended` for each `(department_code, job_title_code)`, from which version date? |
| Options | A: provide an approved `requirements` or `full` package per `HSE-DC-1.0` §3.5 |
| Recommendation | A, one version for all departments in scope |
| Phase 2A default | None. No production requirements exist; production import cannot produce compliance results until provided. Derived test requirements are not a substitute |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-02 — Official validity per requirement

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | What is `validity_months` for each requirement (empty = no expiry)? |
| Options | A: one value per course applied to all roles; B: value may differ by role |
| Recommendation | A unless a regulation requires B; the requirement row remains the official source in both cases |
| Phase 2A default | `Requirements.validity_months` is the official source; `Courses.suggested_validity_months` is help only |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-03 — Expiry date vs validity mismatch

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | Should a difference between `expiry_date` and `completion_date + validity_months` block approval, and above which number of days? |
| Options | A: warning only; B: block above N days (N to be set) |
| Recommendation | Decide after reviewing the difference distribution of the first real extract |
| Phase 2A default | `EXPIRY_VALIDITY_MISMATCH` is a warning with the difference shown. `expiry_date` is never recalculated |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-04 — `In Progress` and compliance

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | Does `In Progress` count as compliant? |
| Options | A: no; B: yes until a deadline (engine change) |
| Recommendation | A |
| Phase 2A default | Non-compliant (current engine behaviour) |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-05 — Grace period for new joiners

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | Should a new employee have a period after `hire_date` before missing courses count as non-compliant? |
| Options | A: no grace period; B: N days (engine change, separate reviewed commit) |
| Recommendation | Owner to decide; B requires `hire_date` to be reliable (H-02) |
| Phase 2A default | No grace period |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-06 — Certificate number rules

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | Is `certificate_number` mandatory for `Completed` records? Must it be unique? |
| Options | A: warning for missing and duplicate; B: block missing; C: block duplicate; B and C may be combined |
| Recommendation | Decide after checking how the source system issues certificate numbers |
| Phase 2A default | `CERT_MISSING` and `CERT_DUPLICATE` are warnings. Certificate number is never a record key |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-07 — Completed record without expiry date

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | When the applicable requirement has `validity_months`, may a `Completed` record without `expiry_date` be accepted as one-time training? |
| Options | A: keep blocking; B: accept (engine would count it `VALID` permanently) |
| Recommendation | A |
| Phase 2A default | Blocked (`COMPLETED_WITHOUT_EXPIRY`); the record never reaches the engine. Relaxing requires an approved decision |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-08 — Wildcard job titles in requirements

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager |
| Question | May a later contract version allow one requirement row for all job titles of a department? |
| Options | A: no; B: yes, expanded to explicit rows at import |
| Recommendation | A for `HSE-DC-1.0` |
| Phase 2A default | Not allowed |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### T-09 — Batch approval roles (four-eyes)

| Field | Value |
|---|---|
| Owner | Training Manager / HSE Manager (technical enforcement: engineering, Phase 2B) |
| Question | Which roles may approve an import batch, and must the approver differ from the preparer? |
| Options | A: Training Manager or HSE Manager, never the preparer; B: other role list |
| Recommendation | A |
| Phase 2A default | Preparer and approver roles are recorded only in local mode; not enforced until authentication exists |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

## HR

### H-01 — Meaning of `employee_code`

| Field | Value |
|---|---|
| Owner | HR (agreement of Training Manager / HSE Manager required) |
| Question | Which identifier is the permanent `employee_code`: HR employee number, badge number, or another identifier? |
| Options | A: HR employee number; B: badge number; C: other |
| Recommendation | A, because badges can be reissued; badge kept as `badge_number` |
| Phase 2A default | Neutral name `employee_code`. Existing paths: legacy CSV `Employee_ID`, test workbook `Badge`. Names are never used for matching |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### H-02 — Employment status values

| Field | Value |
|---|---|
| Owner | HR |
| Question | Which employment statuses exist, what does each mean for training compliance, and which date makes a status change effective? |
| Options | A: `Active` / `Inactive` / `Left` with `status_effective_date`; B: another list |
| Recommendation | A |
| Phase 2A default | A. Non-active employees have no compliance items |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### H-03 — Department and job-title code lists

| Field | Value |
|---|---|
| Owner | HR |
| Question | What is the approved source and owner of `department_code` and `job_title_code` lists, and how are codes added, renamed or deactivated? May partial packages change these lists? |
| Options | A: HR system extract, changed only through `full` packages; B: maintained by the training owner; C: other |
| Recommendation | A |
| Phase 2A default | Lists carried in `full` packages; `employees` and `requirements` packages MAY add codes |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

## Privacy / Legal / IT

### P-01 — Communication authorization basis

| Field | Value |
|---|---|
| Owner | Privacy / Legal (with HR) |
| Question | Which `communication_authorization_basis` codes are allowed, and what evidence must each have? |
| Options | To be defined by Privacy / Legal |
| Recommendation | — (not an engineering decision) |
| Phase 2A default | Only `not_defined` is accepted; every eligibility count is 0 |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### P-02 — Channels and providers

| Field | Value |
|---|---|
| Owner | Privacy / Legal / IT |
| Question | Which channels (email, WhatsApp) may be used for training-expiry alerts, and through which approved providers? |
| Options | To be defined |
| Recommendation | — |
| Phase 2A default | No sending; no provider integration |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### P-03 — Retention

| Field | Value |
|---|---|
| Owner | Privacy / Legal (with HR and Training / HSE) |
| Question | How long are contact data and training records kept, and what happens at the end of the period? |
| Options | To be defined |
| Recommendation | — |
| Phase 2A default | Local mode keeps no data beyond the browser session |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### P-04 — Data minimisation (identity columns)

| Field | Value |
|---|---|
| Owner | Privacy / Legal |
| Question | Confirm that national ID, iqama number, date of birth and nationality must not be collected by the training system. |
| Options | A: block these columns; B: allow a defined subset with justification |
| Recommendation | A |
| Phase 2A default | Blocked (`FORBIDDEN_COLUMN`) |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### P-05 — Contact verification

| Field | Value |
|---|---|
| Owner | Privacy / Legal / IT |
| Question | Must a contact be `verified` to be eligible for alerts? |
| Options | A: `verified` only; B: `verified` and `unverified` |
| Recommendation | A |
| Phase 2A default | `verified` only (still 0 while P-01 is pending) |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### P-06 — Storage and transfer of contact files

| Field | Value |
|---|---|
| Owner | Privacy / Legal / IT |
| Question | Where may contact files be stored and how may they be transferred? |
| Options | To be defined |
| Recommendation | — |
| Phase 2A default | Local machine only; never committed to the repository; never part of a training package |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |

### I-01 — Stable source record identifiers

| Field | Value |
|---|---|
| Owner | IT (with the training data owner) |
| Question | Does each source system provide a stable `source_record_id` per training record? If not, who assigns one, and how is it kept stable across extracts? |
| Options | A: source system id; B: id assigned by the data owner in a controlled register; C: other |
| Recommendation | A where available |
| Phase 2A default | `source_record_id` is mandatory; batches without it are blocked. No fallback to fingerprints |
| Status | Pending |
| Decision | — |
| Approval date | — |
| Approving role | — |
| Reference | — |
