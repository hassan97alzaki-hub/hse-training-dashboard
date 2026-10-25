# Backlog

Open items found during development and acceptance. Each item states where it was found and what blocks on it.

## BL-001 — Mobile layout: sticky header covers most of the screen

- **Status:** resolved for the private-trial release; verified at 375, 390, 768, 1024 and 1440 px in Arabic and English.

- **Found:** 2026-10-06, UI acceptance test of `v1.1-workbook-import` (commit `0fee907`).
- **Exists since:** `v1.0-management-demo` (Executive UI/UX polish). Not caused by the workbook import.
- **Symptom:** at a 375 px viewport the sticky `.app-header` is 495 px tall in an 848 px window (≈ 58 % of the screen, always visible while scrolling). The page also scrolls horizontally (document width 391 px > 375 px). At ~280 px the header is 659 px of 711 px.
- **Reproduce:** run the app, load demo data or a workbook, set the viewport to 375 × 812, scroll the page.
- **Expected:** header compact or non-sticky below a breakpoint; no horizontal page scroll at 375 px.
- **Priority:** must be fixed **before any external or mobile demonstration**.
- **Scope rule:** not part of `v1.1-workbook-import`; fix in a separate, reviewed change.

## BL-002 — Compliance table has no column sorting

- **Found:** 2026-10-06, same acceptance test (item 7).
- **Status:** feature never implemented; not a regression.
- **Priority:** to be decided with the training owner.

## BL-003 — Reminder email must be sent from the account's own registered address

- **Found:** 2026-10-12, review of the Phase 2B reminder preview.
- **Status:** not implemented. The reminder sender only previews and simulates; no message leaves the browser.
- **Requirement:** when real sending is added, the From address must be the email address registered on the account, not a shared or vendor-owned sender. The owner's own address should appear to recipients.
- **Depends on:** Phase 2C delivery work (SMTP or SendGrid), plus sender verification (SPF/DKIM) for the customer domain.
- **Priority:** required before the first real send; not blocking the demo.

## BL-004 — Edit of an imported row is saved but not shown

- **Found:** 2026-10-25, browser check of `main` (`08ad3b9`) after PR #14, Local Mode.
- **Status:** confirmed in the browser; not fixed.
- **Reproduce:** load `public/data/sample-requirements.csv` and `public/data/sample-training-data.csv`; edit EMP0001 / H2S001 (✎), change the expiry date, save.
- **Observed:** the row is written to IndexedDB (`training_records`, id `imp_row_2`, new expiry), but the compliance table still shows the old expiry.
- **Cause:** the save callback in `App.jsx` replaces the edited record only inside `manualRecords`; an imported row lives in `importedRecords`, so nothing is replaced.
- **Priority:** medium — the user believes the edit failed.

## BL-005 — Re-importing after an edit creates a duplicate record

- **Found / status:** same check; confirmed in the browser; not fixed.
- **Reproduce:** after BL-004, reload the page, load the same requirements and training files again.
- **Observed:** EMP0001 / H2S001 has two records (the imported original and the stored edit); Data Quality shows "Duplicate group: EMP0001|H2S001 (2 records)". The engine picks the later expiry, so the status looks right, but the duplicate that PR #14 meant to prevent is still there.
- **Cause:** imported rows are kept only in memory; the stored edit is not linked to the imported row when the file is loaded again.
- **Priority:** medium.

## BL-006 — Course field empty when editing an imported row

- **Found / status:** same check; confirmed in the browser; not fixed.
- **Observed:** the course select shows "—" when the imported courses are not registered in Manage Data. Saving still keeps the course from the prefill, so the data is right but the form is misleading.
- **Priority:** low.

## BL-007 — `imp_row_<n>` record ids can collide in the cloud database

- **Found:** 2026-10-25, code and schema review. **Not reproduced on the cloud** (needs two trial accounts).
- **Facts:** `dataImport.js` gives every imported row the id `imp_row_<row number>`; `public.training_records.id` is `TEXT PRIMARY KEY` for the whole table, not per workspace (migration `20261013140610_requirements.sql`; not changed by `20261019100039_workspaces.sql`). `updateTrainingRecord` reads the id and inserts it when no row is visible.
- **Expected effects:** (a) when a second workspace edits an imported row with the same row number, RLS hides the first workspace's row, the insert hits the primary key and the edit fails; (b) in one workspace, editing row *n* of a different file updates the row stored from an earlier file, i.e. another employee's record can be overwritten.
- **Verify:** owner, with two trial accounts on production: import any file in both, edit row 2 in both; then in one account import a different file and edit row 2 again.
- **Priority:** high if confirmed — affects trial users during the measurement window.

## BL-008 — Imported training rows are never stored; the gate counts only typed records

- **Found:** 2026-10-25, code review during the BL-004..BL-007 check. **From code; not checked against production data.**
- **Facts:** the only writers to `training_records` are `addTrainingRecords` and `updateTrainingRecord` (`src/lib/requirementsService.js`), called only from the "Record training" form. `handleTrainingImport`, `handleApproveMatrix` and `handleApproveProductionPackage` in `App.jsx` put imported rows in React state (`importedRecords`) only.
- **Effects:**
  1. A trial user who imports a file and reloads the page sees the data gone and must import again.
  2. The cloud privacy line says "Your data is stored in your own account" (`privacyNoteCloud`), which is not true for imported training rows.
  3. Gate item "uploaded training data" (`docs/TRIAL_MEASUREMENT.md`, SPECS-TRIAL §4 task 3) counts workspaces with rows in `training_records`. A workspace that only imported a file counts as **0**. The item measures "typed or edited a record in the app", not "uploaded data", and undercounts.
- **Priority:** high for the gate decision of 2026-11-07/08; product decision needed.
