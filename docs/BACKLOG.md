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
