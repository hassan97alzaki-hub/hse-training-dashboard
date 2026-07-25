# Phase 2 Roadmap

## Note

All items below are Phase 2 features — explicitly out of scope for the current Management Demonstration MVP.

Timelines and costs listed below are **preliminary estimates** and require proper scoping before commitment. Do not present these numbers to management as confirmed figures.

---

## Phase 2 Features (Not Yet Implemented)

### P2-01: Date Picker for As Of Date
- Allow user to set any As Of Date for "what-if" analysis
- Currently hardcoded to 2026-07-26

### P2-02: Arabic PDF Export
- Requires Arabic font embedding in jsPDF (e.g. Amiri or Noto Naskh Arabic)
- Requires RTL text shaping (characters must be connected and reversed)
- Risk: instability in jsPDF with complex Arabic glyphs
- Current limitation: English PDF is the fallback

### P2-03: Persistent Storage (Local)
- Save imported data to IndexedDB or localStorage
- Survives page refresh without re-importing
- Still local-only, no cloud

### P2-04: Email / SMS Alerts
- Automated notifications when training is approaching expiry
- Requires email server or integration (SendGrid, AWS SES, etc.)
- Requires scheduled job (cron service)

### P2-05: Google Sheets / LMS Connector
- Direct import from Google Sheets API or LMS API
- Eliminates manual CSV export step
- Requires OAuth setup and API credentials

### P2-06: Historical Analytics
- Compliance trend charts over time
- Month-over-month tracking
- Requires data persistence and timestamps

### P2-07: Multi-User Access
- Role-based views (Admin, Manager, Viewer)
- Requires backend API and authentication
- Shared data store

### P2-08: API Backend + Cloud Database
- Centralized data storage
- Real-time collaboration
- Requires server infrastructure

### P2-09: Mobile Application
- Native iOS / Android app
- Or progressive web app (PWA)

### P2-10: AI-Powered Predictions (if validated)
- Risk scoring for upcoming compliance breaches
- Recommended training scheduling
- Only if validated with real data

---

## What Phase 1 Delivers

For reference, Phase 1 (current MVP) delivers:
- Local browser-based compliance dashboard
- CSV and XLSX import with validation
- Full compliance universe generation (including MISSING detection)
- All KPIs: Requirement Compliance, Fully Compliant Employees, Department, Course
- Bilingual UI (English + Arabic, RTL/LTR)
- PDF export (English) and CSV exports
- 116 automated tests

This is a verified Management Demonstration MVP — not a production multi-user system.
