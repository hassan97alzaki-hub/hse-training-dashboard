# HSE Training Compliance Dashboard

A local browser-based Management Demonstration MVP for HSE training compliance tracking.

**Privacy:** All data is processed in your browser only. No data is uploaded or stored externally.

---

## What It Does

- Imports training records from CSV or XLSX files
- Imports a requirements matrix (which courses are mandatory per role)
- Generates a complete compliance universe: one item per active employee × mandatory requirement
- Detects MISSING mandatory training (no record exists)
- Calculates compliance KPIs: Requirement Compliance %, Fully Compliant Employees %, Department Compliance, Course Compliance
- Bilingual interface: English (LTR) and Arabic (RTL)
- Exports management PDF report (English) and filtered CSV files
- 116 automated tests covering all KPI calculations

## What It Does NOT Do

- No cloud database / server / authentication
- No automated email/SMS alerts, AI predictions, historical analytics
- No Google Sheets sync, mobile app, or multi-user collaboration

See `docs/ROADMAP.md` for Phase 2 features.

---

## Quick Start

```bash
cd ~/Desktop/hse-training-dashboard
npm install
npm run dev
# Open http://localhost:5173
```

Click **Load Demo Data** to see the dashboard with sample data.

---

## Compliance Policy

| Status | Days Remaining | Compliant? |
|---|---|---|
| VALID | > 90 days, or no expiry (one-time) | Yes |
| EXPIRING_90 | 61–90 days | Yes |
| EXPIRING_60 | 31–60 days | Yes |
| EXPIRING_30 | 0–30 days (incl. expiry on As Of Date) | Yes |
| EXPIRED | Expiry strictly before As Of Date | **No** |
| IN_PROGRESS | Completion_Status = In Progress | **No** |
| NOT_STARTED | Completion_Status = Not Started | **No** |
| MISSING | Mandatory course, no record exists | **No** |
| NOT_REQUIRED | Not mandatory for this role | Excluded |

---

## Demo Data Expected Results (As Of 2026-07-26)

- Active employees: 11 | Requirements Configured: 9 | Not Configured: 1
- **Requirement Compliance: 66.7%** (16/24)
- **Fully Compliant Employees: 22.2%** (2/9 — EMP0001, EMP0009)
- Valid: 9 | Expiring90: 2 | Expiring60: 2 | Expiring30: 3 | Expired: 4 | In Progress: 1 | Not Started: 1 | Missing: 2

See `docs/EXPECTED-RESULTS.md` for full derivation and `docs/ASSUMPTIONS.md` for policy details.

---

## Scripts

```bash
npm run dev          # Dev server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
npm run test         # Run 116 tests
npm run test:watch   # Watch mode
```

---

## Known Limitations

1. As Of Date fixed at 2026-07-26 (change `DEMO_AS_OF_DATE` in `src/lib/constants.js`)
2. Arabic PDF not supported — English PDF fallback (see `docs/ASSUMPTIONS.md`)
3. No data persistence — clears on browser refresh
4. Requirements matrix must be re-imported each session
