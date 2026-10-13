# Requirements matrix and training records in the interface

Date: 2026-10-13
Status: approved design, not yet implemented

## Problem

A course added through `ManagementDrawer` → `CourseManager` cannot be scoped to
particular roles, and a completion date cannot be recorded for a person. Both
still require a CSV or XLSX import.

The visible symptom: course `9797 — JSA`, added through the interface, shows
`MISSING` for all nine employees across Operations, Maintenance, Logistics and
Admin, with an empty expiry.

The cause is `mergeManualCourses` in `src/lib/dataService.js:237`. It turns a
manual course into a requirement row for *every* role it can find:

```js
for (const course of manualCourses) {
  for (const role of roles.values()) {   // every Department|Job_Title
    merged.push({ Department: role.Department, Job_Title: role.Job_Title, ... });
```

So the course becomes mandatory for everyone, and because no completion record
exists for anyone, `buildComplianceUniverse` generates a `MISSING` item per
employee (`src/lib/complianceEngine.js:196`).

Two capabilities are missing, not one:

| Missing | What exists today |
| --- | --- |
| Scoping a course to roles (an editable requirements matrix) | No table in `0001_init.sql`, no UI. Import only. |
| A completion and expiry date per employee per course | The `certificates` table exists, but nothing writes to it from the table |

## Decisions

Confirmed with the user before this design was written:

1. **Assignment granularity: Department + Job_Title.** This matches what
   `complianceEngine.js:148` already compares and matches the `HSE-DC-1.0`
   workbook, so the engine needs no change.
2. **Completion recording: both a batch form and a row-level edit.** Training
   usually happens as a session for several people on one day, but correcting a
   single person is also needed. Both write to the same table.
3. **Provenance: a new `MANAGED` classification with an internal approval
   step.** A matrix built in the interface starts as `DRAFT` and carries the
   test banner; an explicit approval (approver name and timestamp, stored)
   moves it to `MANAGED`. Reports print who approved it and when.
4. **Import conflict: replace, after an explicit confirmation.** Importing a
   matrix while a managed one exists shows what will be removed and what will
   be added, then replaces. One active source at a time.

## Data model

Three stores change in parallel: a new `supabase/migrations/0002_requirements.sql`,
`src/lib/db/schema.sql`, and `src/lib/db/dbService.js` (version `3` → `4`).

### `requirements`

One row per role per course.

```sql
CREATE TABLE IF NOT EXISTS public.requirements (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  job_title TEXT NOT NULL DEFAULT '',
  course_code TEXT NOT NULL,
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  validity_months INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, department, job_title, course_code)
);
```

`job_title` is `NOT NULL DEFAULT ''` rather than nullable, because a Postgres
`UNIQUE` constraint does not constrain `NULL`: two otherwise identical rows
with `job_title IS NULL` would both be accepted. An empty string is
constrained. An empty `job_title` means every job title in that department,
including ones added later.

There is deliberately no foreign key to `courses.code`. An import may carry a
requirement for a course that was never registered, and rejecting it would
break the existing CSV path. The check lives in the service layer and surfaces
as a warning in `DataQualityPanel`.

### `training_records`

One row per completion.

```sql
CREATE TABLE IF NOT EXISTS public.training_records (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  course_code TEXT NOT NULL,
  completion_status TEXT NOT NULL DEFAULT 'Completed'
    CHECK (completion_status IN ('Completed', 'In Progress', 'Not Started')),
  issue_date DATE,
  expiry_date DATE,
  certificate_number TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

There is deliberately no `UNIQUE (owner_id, employee_id, course_code)`. The
engine already has a duplicate policy — `selectBestRecord`
(`src/lib/complianceEngine.js:41`) picks the record with the latest valid
expiry and the rest are reported as duplicates. Enforcing uniqueness would
prevent recording a renewal, which is legitimate: an H2S course in 2024 and
another in 2026 for the same person.

### `requirements_approval`

One row per account.

```sql
CREATE TABLE IF NOT EXISTS public.requirements_approval (
  owner_id UUID NOT NULL DEFAULT auth.uid() PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'managed')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1
);
```

`revision` increments on any edit after approval, and the status returns to
`draft`, so an edited matrix can never be read as an approved one.

`owner_id` is the primary key here, written as
`owner_id UUID NOT NULL DEFAULT auth.uid() PRIMARY KEY` rather than
`owner_id UUID PRIMARY KEY DEFAULT auth.uid()`. The two are equivalent to
Postgres, but the migration test counts occurrences of the exact string
`owner_id UUID NOT NULL DEFAULT auth.uid()` and expects one per table, so the
spelling has to stay uniform across all nine tables.

All three tables get the same protection as the existing six: `ENABLE ROW LEVEL
SECURITY` plus four policies `TO authenticated USING (owner_id = auth.uid())`,
generated by the same `DO $$` loop used in `0001_init.sql`.

## Interface

Three entry points. No fourth tab in the drawer.

### 1. An "applies to" field inside `CourseManager`

The existing `formData` (`src/components/CourseManager.jsx:24`) gains a fifth
key:

```js
const [formData, setFormData] = useState({
  code: '', name: '', mandatory: false, validityMonths: 12, description: '',
  appliesTo: [],   // [{ department, jobTitle }]
});
```

A new `src/components/RoleScopePicker.jsx` lists roles grouped by department:

```
[ ] Operations            (3 employees)   [select all]
      [x] Operator          2
      [ ] Supervisor        1
[ ] Maintenance           (2 employees)   [select all]
      [ ] Technician        2
```

Roles are derived from `mergedPeople` (`src/App.jsx:278`) rather than typed, so
a misspelling cannot create a phantom role that matches nobody. Checking a
department writes `jobTitle: ''`, which covers any job title added to that
department later. A counter under the field reads `5 employees will be
required`.

Saving writes one `requirements` row per selected role and removes the rows of
roles that were unselected.

### 2. `TrainingSessionForm` — a batch

A new `src/components/TrainingSessionForm.jsx`, opened from a toolbar button
next to the drawer trigger.

| Field | Behaviour |
| --- | --- |
| Course | Selected from `courses` |
| Completion date | `issue_date` |
| Expiry date | Computed as `issue_date + validity_months`, manually overridable |
| Certificate number | Optional, prefix plus auto-increment |
| Attendees | Only the employees this course is required for, with `select all` |

Restricting the attendee list to the required employees is what links the two
entry points: the matrix decides who appears. A secondary `show all employees`
button covers training someone who is not required to take it.

Saving writes one `training_records` row per attendee with `source: 'manual'`.

### 3. A row edit button in `ComplianceTable`

`ComplianceTable` already has the cell-click pattern
(`src/components/ComplianceTable.jsx:120`, `onCertificateClick`). A trailing
column with a pencil button is added, plus one prop, `onRecordEdit?.(item)`.
It opens the same `TrainingSessionForm` in single-employee mode, prefilled. A
`MISSING` row creates a record; an existing row edits it.

The `9797 — JSA` case resolves through this path: edit the course, select
`Operations/Operator` only, and `MISSING` disappears for the six people in
Maintenance, Logistics and Admin immediately; then record the completion date
for the remaining three.

### Language

Every new string goes through `src/lib/i18n.js` with an EN and an AR key. No
text written inside JSX. `CourseManager.jsx:7` currently pins
`createI18n('en')`; the new components take `t` as a prop instead of pinning
it.

## Engine and state wiring

### Replacing `mergeManualCourses`

`src/App.jsx:310` currently reads:

```js
const mergedRequirements = useMemo(
  () => mergeManualCourses(requirements, manualCourses, mergedPeople),
  [requirements, manualCourses, mergedPeople],
);
```

It becomes:

```js
const mergedRequirements = useMemo(
  () => mergeRequirements(requirements, managedRequirements, mergedPeople, manualCourses),
  [requirements, managedRequirements, mergedPeople, manualCourses],
);
```

`mergeRequirements(importedRows, managedRows, people, courses)` is a new pure
function in `src/lib/dataService.js`. It merges the manual matrix rows with the
imported rows and does two translations the engine needs:

- Expands `job_title: ''` into one row per job title present in that
  department, because `complianceEngine.js:148` compares
  `r.Job_Title === emp.Job_Title` by equality. `people` is the source of the
  job titles in a department. The difference from the old broadcast is that
  expansion is confined to a named department rather than every role.
- Maps the stored snake_case columns (`department`, `job_title`,
  `course_code`, `mandatory`, `validity_months`) to the PascalCase keys the
  engine reads, and fills `Course_Name` and the fallback `Validity_Months`
  from the `courses` catalogue, because the `requirements` table does not
  store a course name.

The engine itself is not touched.

`mergeManualCourses` and its test are removed. A manual course no longer
generates a requirement by itself; only `appliesTo` does. A course with no
`appliesTo` is in the catalogue and required of nobody.

### Training records

`trainingRecords` comes from the import today (`src/App.jsx:84`). The state is
renamed to `importedRecords` and `trainingRecords` becomes derived:

```js
const trainingRecords = useMemo(
  () => [...importedRecords, ...manualRecords],
  [importedRecords, manualRecords],
);
```

One call site must *not* follow the rename. `mergedPeople`
(`src/App.jsx:279`) falls back to the training records as its employee source
when no employee master is loaded:

```js
mergeManualEmployees(employeeMaster ?? trainingRecords, manualEmployees)
```

That fallback has to keep reading `importedRecords`. A manually entered record
carries only an employee id and a course code — no name, department or job
title — so feeding it to the employee derivation would invent an employee with
empty fields, who would then match no requirement row and appear as
unconfigured.

No deduplication here. `selectBestRecord` already handles it and
`DataQualityPanel` already reports duplicates. A manual record and an imported
record for the same person and course is a visible duplicate, which is correct
behaviour rather than a fault: the user sees the conflict and resolves it.

### Persistence

The existing course-saving pattern (`src/App.jsx:185`) is a `useEffect` that
reconciles the screen against the database and tracks a `loadedCourses` set.
Repeating it for matrix rows would be wrong: a matrix may hold hundreds of
rows, and a full reconciliation on every edit writes far too much.

Instead, writes are explicit at save time. Closing `RoleScopePicker` calls
`saveRequirementsForCourse(code, appliesTo)`, which computes the difference and
writes only the additions and deletions. `TrainingSessionForm` calls
`addTrainingRecords(rows)`. React state is updated from the write result.

### Provenance

`src/lib/contract/requirementsProvenance.js` gains two values:

```js
export const REQUIREMENTS_PROVENANCE = Object.freeze({
  NONE: 'none',
  APPROVED: 'approved',
  MANAGED: 'managed',   // interface matrix, internally approved
  DRAFT: 'draft',       // interface matrix, before approval
  DERIVED: 'derived',
  DEMO: 'demo',
  LEGACY: 'legacy',
});
```

`TEST_PROVENANCES` gains `DRAFT` only, so an unapproved matrix carries
`TestRequirementsBanner`. `MANAGED` carries no banner but is not `APPROVED`:
reports print a different source line (`internally approved by {approved_by} on
{approved_at}` against `HSE-DC-1.0`). `isDerivedRequirement` is unchanged and
still overrides any declaration, so a test row is never presented as approved.

Any edit to a row after approval returns the status to `draft` and increments
`revision`. That logic lives in a new `src/lib/contract/requirementsApproval.js`
— pure, no clock and no storage, like the other contract modules.

### Import conflict

When a matrix is imported and the account status is `managed`, `ImportPanel`
shows a confirmation before any write: `N rows from your matrix will be
removed, M rows from the file will be added`. On confirmation all
`requirements` rows are deleted and the file's rows are written, and the
provenance becomes whatever the import path declares (`approved` for an
`HSE-DC-1.0` sheet). `training_records` is **not** touched — those are actual
completions, not requirements.

## Testing

Test first, then code. Pure modules before components.

| Test file | Covers |
| --- | --- |
| `tests/requirementsApproval.test.js` (new) | `draft` → `managed` on approval; an edit after approval returns `draft` and increments `revision`; `MANAGED` is not in `TEST_PROVENANCES`; `isDerivedRequirement` overrides a `managed` declaration |
| `tests/dataService.test.js` (existing) | `mergeRequirements` expands `job_title: ''` to the job titles of that department only; leaves other departments alone; imported and manual rows coexist; no duplicate when a row matches |
| `tests/requirementsService.test.js` (new) | `saveRequirementsForCourse` writes only the difference; unselecting a role deletes its row; `addTrainingRecords` computes `expiry_date` from `validity_months` and honours a manual override |
| `tests/complianceEngine.test.js` (existing) | Regression: a course scoped to `Operations/Operator` generates `MISSING` for them only, not for Maintenance — the case that produced `9797` |
| `tests/supabaseBackend.test.js` (existing) | The six migration assertions extend to nine tables; RLS on `requirements`, `training_records`, `requirements_approval`; `owner_id` is never sent by the client. The `describe('the migration')` block currently reads only `0001_init.sql` (line 231) and must read every file in `supabase/migrations/` concatenated, so a later migration cannot escape the checks |
| `tests/productionAppIntegration.test.js` (existing) | A manually entered training record does not become an employee when no employee master is loaded |
| `tests/dbService.test.js` (existing) | `LocalDbService` declares version `4`; every store in `onupgradeneeded` is created behind a `objectStoreNames.contains` guard and nothing calls `deleteObjectStore`, so an existing browser database is extended rather than rebuilt. This is a source-text assertion: the suite runs in jsdom with a `MemoryDb` stand-in and has no real IndexedDB to upgrade |

One manual test is not replaceable by unit tests: the full path in the browser.
Add a course, scope it to `Operations/Operator`, confirm `MISSING` disappears
for the other six, record a batch, reload, confirm persistence.

## Risks

| Risk | Mitigation |
| --- | --- |
| The IndexedDB upgrade loses data for an existing user | `onupgradeneeded` creates and never deletes. The unit suite can only assert this from the source text, so the manual browser test must be run against a browser profile that already holds a version `3` database |
| A large matrix slows `mergeRequirements` on every keystroke | The function sits in a `useMemo` keyed only on `[requirements, managedRequirements]`; `tests/contractScale500.test.js` already measures 500 employees |
| `MANAGED` is read as a formal approval during an inspection | The report prints the approver and the date explicitly and never uses the words `HSE-DC-1.0` |

## Out of scope

- `RequirementsMatrixView`, the read-only roles-by-courses grid. Excellent for a
  report or an inspection, poor for data entry. A later phase.
- Ready-made requirement templates for oil and gas.
- An audit trail of who edited which row and when.
- Actual renewal notifications.

## Order of work

1. Migration and the two data stores
2. The contract module and provenance
3. The pure `dataService` functions
4. The service layer
5. `RoleScopePicker`
6. `TrainingSessionForm`
7. The table row button
8. i18n
9. The manual browser test

Phase one — the migration, `appliesTo`, and removing the broadcast — resolves
the visible problem on its own. `TrainingSessionForm` is phase two.
