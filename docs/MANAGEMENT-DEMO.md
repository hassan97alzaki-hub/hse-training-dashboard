# Management Demo Script — HSE Training Compliance Dashboard

**Target audience:** HSE managers, project directors, safety leads  
**Session length:** 5–10 minutes  
**Format:** Live browser walkthrough

---

## Pre-Demo Setup (2 minutes before)

1. `cd ~/Desktop/hse-training-dashboard && npm run dev`
2. Open `http://localhost:5173` in browser
3. Set company name and project name in the header fields
4. Check language toggle works (English ↔ Arabic)
5. Have `public/data/sample-training-data.csv` ready to demonstrate CSV import

---

## Demo Script (5 minutes)

### Step 1 — Load Demo Data (30 seconds)
> "This dashboard processes training records entirely in the browser — nothing is uploaded externally."

Click **Load Demo Data**.

Point out:
- The green success banner (27 records, 26 requirements loaded)
- Company and project name in the header are editable

---

### Step 2 — KPI Cards (1 minute)
> "The top cards give you an immediate compliance picture."

Walk through:
- **Active Employees: 11** — employees in scope
- **Requirements Configured: 9** — employees with at least one mandatory training requirement
- **Not Configured: 1** — one employee's role isn't yet mapped to requirements
- **Requirement Compliance: 66.7%** — 16 of 24 mandatory requirements are currently compliant
- **Fully Compliant Employees: 22.2%** — only 2 of 9 employees have all their mandatory training in good standing

If asked about the percentages: "These numbers are calculated from the requirements matrix — it compares what each role is supposed to have against what records actually exist."

---

### Step 3 — Charts (1 minute)

Point to the **Department Compliance** chart:
> "Operations is the lowest at 62.5% — that's where we should focus first."

Point to the **Status Breakdown** pie:
> "4 expired, 2 missing, 1 in progress, 1 not started — that's 8 non-compliant requirements that need action."

---

### Step 4 — Priority Actions (30 seconds)

Scroll to the Priority Actions table.
> "This table sorts the most urgent items first — Critical means expired or completely missing, which poses the highest risk."

---

### Step 5 — Filters (1 minute)

Apply a department filter (e.g., Operations):
> "Filters narrow the detail table for a specific team. The global KPI cards at the top always reflect the full dataset — only the table below changes."

Clear the filter. Show the "Show Inactive" toggle briefly.

---

### Step 6 — Export (30 seconds)

Click **Export PDF**:
> "This generates a management-ready PDF with all the KPIs, department breakdowns, and priority actions."

Point out the language toggle:
> "The interface is bilingual — switch to Arabic for RTL layout. The PDF exports in English for now; Arabic PDF is on the Phase 2 list."

---

### Step 7 — Import Your Data (optional, 1 minute)

> "The demo data is illustrative. You can import your own training records from Excel or CSV — same columns, your actual data."

Optionally drag in a real file to show the live import.

---

## What to Say — and What NOT to Say

### Say:
- "This consolidates your training records and requirements into one view."
- "It shows exactly what's compliant today, and what needs attention."
- "All calculations are transparent — the methodology is documented in writing."
- "Phase 2 can add automated alerts, historical tracking, and multi-user access."

### Do NOT say:
- ~~"AI-powered"~~ — not implemented
- ~~"Predictive"~~ — not implemented
- ~~"Saves X hours per week"~~ — not measured
- ~~"Real-time sync"~~ — not implemented
- ~~"Incident prevention guaranteed"~~ — cannot be claimed
- ~~"Production-ready for 500 users"~~ — this is a single-user local MVP

---

## Likely Management Questions

**Q: Where is the data stored?**  
A: Only in your browser session. Nothing is uploaded to any server. Refresh the page and it clears.

**Q: Can we connect to our HR system or LMS?**  
A: Phase 2. The current version imports from Excel/CSV which you export from those systems.

**Q: Can multiple people use it at the same time?**  
A: Phase 2. Currently one user, one browser.

**Q: What if our data has different column names?**  
A: The required column names are documented. An Excel template is easy to prepare as a mapping step.

**Q: How often do we need to refresh the data?**  
A: As often as you export from your training system. There's no automatic sync in this version.

**Q: What's the As Of Date?**  
A: Fixed at 2026-07-26 for this demo. In Phase 2, this becomes a date picker.

**Q: Can we get Arabic output?**  
A: The web interface is fully bilingual — toggle in the header. PDF export is English-only for now; Arabic PDF is a known Phase 2 item.

---

## Phase 2 Response

When asked about next steps:

> "Phase 2 can include: automated email alerts when training is expiring, direct connection to your LMS or HR system, multi-user access with role-based views, historical trend tracking, and Arabic PDF export. The scope and timeline would depend on which features have the most value. I can prepare a Phase 2 scope document for review."

Do not commit to specific timelines or costs without a proper scoping exercise.
