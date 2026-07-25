# Expected Results — As Of 2026-07-26

These are the exact, deterministic results produced by loading:
- `public/data/sample-training-data.csv` (27 rows)
- `public/data/sample-requirements.csv` (26 rows)

with As Of Date = **2026-07-26**.

All automated tests in `tests/complianceEngine.test.js` assert these values.

---

## Employee Summary

| Category | Count |
|---|---|
| Total employees in training data | 12 |
| Active employees | 11 |
| Inactive/Left employees | 1 (EMP0011) |
| Active employees with ≥1 mandatory requirement | 9 |
| Active employees with 0 mandatory requirements (role configured, all non-mandatory) | 1 (EMP0007 Driver) |
| Active employees with no requirements configured in matrix | 1 (EMP0012 HR Officer) |

---

## KPI Results

| KPI | Value |
|---|---|
| Total mandatory employee-course requirements | 24 |
| Compliant requirements | 16 |
| **Requirement Compliance** | **66.7%** (16 ÷ 24) |
| Employees with mandatory requirements | 9 |
| Fully compliant employees | 2 (EMP0001, EMP0009) |
| **Fully Compliant Employees %** | **22.2%** (2 ÷ 9) |

---

## Status Counts (Mandatory Requirements Only)

| Status | Count | Notes |
|---|---|---|
| VALID | 9 | EMP0001/H2S001, EMP0004/H2S001, EMP0004/PTW001, EMP0005/CS001, EMP0006/H2S001, EMP0008/FF001, EMP0008/PTW001, EMP0010/H2S001, EMP0010/PTW001 |
| EXPIRING_90 | 2 | EMP0001/PTW001 (86d), EMP0009/H2S001 (67d) |
| EXPIRING_60 | 2 | EMP0001/WAH001 (51d), EMP0006/FF001 (37d) |
| EXPIRING_30 | 3 | EMP0002/H2S001 (25d), EMP0003/PTW001 (0d), EMP0005/H2S001 (15d) |
| EXPIRED | 4 | EMP0002/PTW001, EMP0003/H2S001, EMP0006/PTW001, EMP0008/H2S001 |
| IN_PROGRESS | 1 | EMP0004/WAH001 |
| NOT_STARTED | 1 | EMP0002/CS001 |
| MISSING | 2 | EMP0005/WAH001, EMP0010/CS001 |
| **Total** | **24** | ✓ matches mandatory requirements count |

Compliant = VALID+EXPIRING_90+EXPIRING_60+EXPIRING_30 = 9+2+2+3 = **16** ✓

---

## Department Compliance

| Department | Total Reqs | Compliant | % |
|---|---|---|---|
| Operations | 8 | 5 | 62.5% |
| Maintenance | 6 | 4 | 66.7% |
| Logistics | 3 | 2 | 66.7% |
| Admin | 4 | 3 | 75.0% |
| Planning | 3 | 2 | 66.7% |

**Active employees NOT in dept compliance:** EMP0007 (Driver, no mandatory), EMP0012 (not configured)

---

## Course Compliance

| Course | Code | Required | Compliant | % |
|---|---|---|---|---|
| H2S Safety | H2S001 | 9 | 7 | 77.8% |
| PTW | PTW001 | 7 | 5 | 71.4% |
| Working at Height | WAH001 | 3 | 1 | 33.3% |
| Confined Space | CS001 | 3 | 1 | 33.3% |
| Fire Fighting | FF001 | 2 | 2 | 100.0% |

---

## Derivation — Individual Employee Status

### EMP0001 Ahmed Al-Mansouri (Operations/Field Supervisor) — **Fully Compliant**
- H2S001: Expiry 2026-10-25, 91d → **VALID** ✓
- PTW001: Expiry 2026-10-20, 86d → **EXPIRING_90** ✓
- WAH001: Expiry 2026-09-15, 51d → **EXPIRING_60** ✓

### EMP0002 Fatima Al-Dosari (Operations/Equipment Operator)
- H2S001: Expiry 2026-08-20, 25d → **EXPIRING_30** ✓
- PTW001: Expiry 2026-04-30, past → **EXPIRED** ✗
- CS001: Not Started → **NOT_STARTED** ✗

### EMP0003 Mohammed Hassan (Operations/Site Coordinator)
- H2S001: Expiry 2025-08-20, -340d → **EXPIRED** ✗
- PTW001: Expiry 2026-07-26, 0d (exactly on As Of Date) → **EXPIRING_30** ✓

### EMP0004 Sara Al-Khalifa (Maintenance/Technician)
- H2S001: Expiry 2027-01-10, 168d → **VALID** ✓
- PTW001: Expiry 2027-02-08, 197d → **VALID** ✓
- WAH001: In Progress → **IN_PROGRESS** ✗

### EMP0005 Omar Al-Shehri (Maintenance/Maintenance Lead) — duplicate CS001 group
- H2S001: Expiry 2026-08-10, 15d → **EXPIRING_30** ✓
- CS001: Two records — old (expired 2026-01-15) + new (valid 2027-01-20). Best selected: **VALID** ✓ (duplicate policy: latest valid expiry wins)
- WAH001: No record → **MISSING** ✗

### EMP0006 Amira Al-Otaibi (Logistics/Warehouse Manager)
- H2S001: Expiry 2027-01-05, 163d → **VALID** ✓
- FF001: Expiry 2026-09-01, 37d → **EXPIRING_60** ✓
- PTW001: Expiry 2026-05-30, -57d → **EXPIRED** ✗

### EMP0007 Hassan Al-Nasser (Logistics/Driver) — NOT_REQUIRED (0 mandatory)
- H2S001: Mandatory=No → **NOT_REQUIRED** (excluded from KPIs)
- PTW001: Mandatory=No → **NOT_REQUIRED** (excluded from KPIs)

### EMP0008 Layla Al-Jaber (Admin/Safety Officer)
- H2S001: Expiry 2025-06-10, -411d → **EXPIRED** ✗
- FF001: Expiry 2027-01-30, 188d → **VALID** ✓
- PTW001: Expiry 2027-03-01, 217d → **VALID** ✓

### EMP0009 Khalid Al-Malik (Admin/Manager) — **Fully Compliant**
- H2S001: Expiry 2026-10-01, 67d → **EXPIRING_90** ✓

### EMP0010 Zainab Al-Rashid (Planning/Safety Consultant)
- H2S001: Expiry 2027-02-01, 190d → **VALID** ✓
- PTW001: Expiry 2027-03-01, 217d → **VALID** ✓
- CS001: No record → **MISSING** ✗

### EMP0011 Ali Al-Harbi (Operations/Field Supervisor, **Inactive**)
- Excluded from all KPI denominators.
- Records visible in raw data table when "Show Inactive" is toggled.

### EMP0012 Nora Al-Ghamdi (Human Resources/HR Officer — **Not Configured**)
- Human Resources/HR Officer has no rows in the requirements matrix.
- Excluded from compliance KPI denominators.
- Flagged in Config Warnings panel.

---

## Data Quality

| Item | Count |
|---|---|
| Duplicate groups in training data | 1 (EMP0005/CS001) |
| Config warnings (not configured) | 1 (EMP0012) |
| Invalid rows in sample data | 0 |

---

## Date Boundary Verification

All boundary cases are covered in the demo data:

| Days | Date | Status | Employee/Course |
|---|---|---|---|
| -411 | 2025-06-10 | EXPIRED | EMP0008/H2S001 |
| -340 | 2025-08-20 | EXPIRED | EMP0003/H2S001 |
| -87 | 2026-04-30 | EXPIRED | EMP0002/PTW001 |
| -57 | 2026-05-30 | EXPIRED | EMP0006/PTW001 |
| 0 | 2026-07-26 | EXPIRING_30 | EMP0003/PTW001 |
| 15 | 2026-08-10 | EXPIRING_30 | EMP0005/H2S001 |
| 25 | 2026-08-20 | EXPIRING_30 | EMP0002/H2S001 |
| 37 | 2026-09-01 | EXPIRING_60 | EMP0006/FF001 |
| 51 | 2026-09-15 | EXPIRING_60 | EMP0001/WAH001 |
| 67 | 2026-10-01 | EXPIRING_90 | EMP0009/H2S001 |
| 86 | 2026-10-20 | EXPIRING_90 | EMP0001/PTW001 |
| 91 | 2026-10-25 | VALID | EMP0001/H2S001 |
| 163+ | ≥2027-01-05 | VALID | Multiple |
