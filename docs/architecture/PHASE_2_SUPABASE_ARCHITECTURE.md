# Phase 2 — Supabase Architecture Plan

**Status:** Architecture only. No implementation code has been written against this plan.
**Frozen baseline:** tag `v1.0-management-demo` (commit `12ecfbc`), branch `phase-2-supabase`.
**Author context:** grounded directly in the current codebase's actual field names
(`Employee_ID`, `Department`, `Job_Title`, `Course_Code`, `Issue_Date`, `Expiry_Date`,
`Certificate_Number`, `Completion_Status`, `Training_Required`, `Validity_Months`,
`Employment_Status`) so an implementing engineer does not have to reverse-map anything.

---

## Revision 2 — corrections after code review (2026-10-06)

Revision 1 contained assumptions not backed by the code. Each is corrected below and in the sections named. Evidence = `HSE_Training_Dashboard` Vite code at commit `12ecfbc` plus the read-only review of the `hse-matrix-pro` Next.js copy.

| # | Revision 1 assumption | Verified fact | Fix |
|---|---|---|---|
| 1 | `courses.validity_months` is course metadata | `Validity_Months` is a column of the **requirements CSV**, so it belongs to a `(Department, Job_Title, Course_Code)` row. The engine only copies it onto output items; it never computes expiry from it. | Moved to `requirements_matrix.validity_months` (§1.2). |
| 2 | `training_records` has `is_current` / `superseded_by`, set on import or renewal | The engine already receives **all** rows for an employee+course and picks one with `selectBestRecord` (latest valid expiry, else latest expiry, else latest issue). A stored "current" flag set by arrival order can disagree with that rule (e.g. an older certificate imported after a newer one). | Records are **append-only**. No authoritative current flag. "Current" = engine selection at read time. Optional informational `renews_record_id` (§1.2, §1.4). |
| 3 | Import upserts `employees`, updating name/department/title | The engine has **no employee master**. It builds employees from training rows; the first row for an Employee_ID wins (code comment says "latest", code does first). | The DB adds an `employees` master — a deliberate behaviour addition. **Decided (2026-10-06):** the latest *approved* import batch wins; match on employee code within the organization; changes and conflicts are previewed before approval; blanks never erase; every change is logged with batch, old/new value, time and actor (§5.1). |
| 4 | Tenant isolation by an RLS check plus a trigger | The RLS snippet in Revision 1 contained a tautology (`organization_id = training_records.organization_id`) and did not put a real membership test first. | Policies now start with `organization_id in (select private.user_org_ids())`. Parent/child org match is enforced by **composite foreign keys**, not triggers (§1.3, §3.2). |
| 5 | "Void" is allowed only for owner/admin/HSE manager, enforced by UPDATE policy | An UPDATE policy cannot restrict which column changes, so a Training Manager with UPDATE could set `deleted_at`. | Voiding goes through one `void_training_record()` RPC plus a trigger that rejects `deleted_at` changes by other roles (§3.2). |
| 6 | Notification log | Not in Revision 1. The Vite app has **no** alert code. The Next.js copy has send helpers with **zero callers**, a 60-day window, and no log. | New tables `employee_contacts`, `notification_log` and a design for the 15-day alert (§1.2, §15). Nothing is implemented. |
| 7 | Move the engine into SQL for Cloud Mode; client-side "slows past a few hundred employees" | Unmeasured. 500 employees × ~12 courses ≈ 6,000 items; the JS engine runs this in milliseconds. A SQL port is the highest drift risk in the plan. | Recommendation changed: keep the JS engine for dashboards in both modes; run the **same JS module** in an Edge Function only for the notification job (§13.1). |
| 8 | Dates | The engine takes `asOfDate` as a parameter and does day math in UTC on `YYYY-MM-DD` strings. The fixed demo date was used for **all** real use in `App.jsx`. | Done in code (commit pending review): `lib/clock.js`, `REPORTING_TIME_ZONE = Asia/Riyadh`. Rule in §16. |
| 9 | PDPL wording | Revision 1 stated the law's effect more firmly than an engineering document can. | Softened; counsel must confirm (§10). |
| 10 | Cross-references | Several pointed at wrong section numbers. | Fixed. |
| 11 | Organization deletion by `ON DELETE CASCADE` | Cascade lets one statement destroy a tenant's compliance history, contradicting "training records are never hard-deleted". | **Decided (2026-10-06):** all foreign keys to `organizations` (and other parents) are `RESTRICT`. Normal operation disables or archives an organization. Permanent deletion is a separate, audited, reviewed purge procedure — not designed in detail and not built in Phase 2 (§1.5). |
| 12 | Requirement history | Revision 1 implied historical reports work. | **Decided (2026-10-06):** v1 computes only the requirements effective at `asOfDate`. Full historical reporting is **deferred and not claimed** until a historical reader exists and is tested (§1.4). |

Decisions recorded on 2026-10-06 by the project owner are marked **Decided** in the sections they affect. They are documentation only; no database exists yet.

---

## Revision 3 — alignment with `HSE-DC-1.0` and `HSE-CONTACT-1.0` (2026-10-06)

Phase 2A defined the data contracts and built them in code (`src/lib/contract/`,
`docs/DATA-CONTRACT.md`, `docs/CONTACT-CONTRACT.md`). The schema below is
aligned with them, so a Phase 2B migration can be derived from `schema.js`
instead of being reinvented. Still documentation only; no database exists.

| # | Revision 2 schema | Contract rule | Change |
|---|---|---|---|
| 1 | `department` and `job_title` as free text on `employees` and `requirements_matrix` | Codes are the only matching keys; display names may repeat and must never match (`HSE-DC-1.0` §2.2, §3.1, §3.2) | New reference tables `departments` and `job_titles` with a code, English and Arabic names and an `active` flag; both parents are referenced by composite foreign key. A job title may be scoped to one department (`JOB_TITLE_SCOPE`) |
| 2 | Records keyed by a generated id, with a content fingerprint as the uniqueness rule | A record's key is `(organization, source_system, source_record_id)`, its identity is immutable, and the fingerprint detects possible duplicates only (`HSE-DC-1.0` §3.7, §3.8) | `training_records` carries `source_system`, `source_record_id` and `version`; the unique index moves to the record key plus version; a trigger refuses a change of `employee_id` or `course_id`; the fingerprint becomes an advisory `fp1:` column with a non-unique index |
| 3 | One active requirement row per role and course | A requirements version is a dated set with an approval reference, an approving role and an approval date; only `approved` rows may be loaded (`HSE-DC-1.0` §3.5, §5) | `requirements_matrix` gains `requirements_effective_from`, `approval_reference`, `approved_by_role`, `approved_on` and `source`, with `source = 'approved'` enforced |
| 4 | `employee_contacts` with opt-in booleans and `consent_recorded_at` | Contact data follows its own contract with a neutral authorization basis, its evidence and a contact status (`HSE-CONTACT-1.0` §3) | Columns become `email_allowed`, `whatsapp_allowed`, `communication_authorization_basis`, `authorization_reference`, `authorization_recorded_at`, `contact_status`, `preferred_language` and `verified_at`; while decision P-01 is pending only `not_defined` is accepted, so no contact is eligible for an alert |
| 5 | `import_batches` as an import log | A batch is approved by a role at a recorded instant, and an older batch never overwrites a newer value (`HSE-DC-1.0` §7) | `import_batches` gains `package_type`, `prepared_by_role`, `approved_by_role` and `approved_at`; `approved_at` is the ordering key already used by `employees.last_batch_approved_at` |

The engine is unchanged by all of this: the preparation layer
(`src/lib/contract/enginePreparation.js`) still hands it `Department`,
`Job_Title` and `Course_Code` as codes.

---

## Stage 0 — Safety report

| Item | Result |
|---|---|
| Pre-existing git status | **Not clean** — the Phase 2 UI/UX Polish work (Header, KPI cards, Charts, Filters, ComplianceTable, PriorityActions, DataQualityPanel, ExecutiveSummary, Footer, i18n, dashboard.css) was uncommitted. Per explicit user decision, this was committed first (commit `12ecfbc`, "Phase 2 — Executive UI/UX polish for management demo") so the frozen tag reflects the actual approved-on-screen demo, not a stale prior state. |
| Tag | `v1.0-management-demo` created as an **annotated** tag on commit `12ecfbc`. |
| Branch | `phase-2-supabase` created and checked out from that commit. All architecture-planning work happens here; `main` is untouched beyond the one polish commit. |
| Remote | **None configured.** This is a local-only repository (`git remote -v` returns nothing). Tags and branches exist locally only — nothing has been (or can be) pushed. If a remote is added later, push both `main` and `phase-2-supabase`, and push the tag explicitly (`git push origin v1.0-management-demo`), since `git push` does not push tags by default. |
| Application files | Untouched beyond the Stage-0 commit of already-approved work. No Supabase code, dependencies, or config exist in the repo yet. |

---

## 0. Design philosophy (read this first)

Four constraints shape every decision below:

1. **The compliance engine is the single source of truth and stays unchanged.** `complianceEngine.js` computes `Status`, `Priority`, and all KPIs from raw facts (`Issue_Date`, `Expiry_Date`, `Completion_Status`, `as_of_date`). The database therefore stores **only raw facts** — it never persists a computed `Status` column. If it did, that stored value would drift from the authoritative logic the moment `as_of_date` moves forward a day. This single decision eliminates an entire class of "database says VALID, app says EXPIRED" bugs.
2. **Local Mode is frozen and must not regress.** Cloud Mode is additive, behind an adapter interface, opt-in. The current no-login, browser-only "Load Demo Data" workflow keeps working byte-for-byte identically whether or not Supabase is ever configured.
3. **Isolation is a database property, not an application habit.** Every table carries `organization_id` directly (not just reachable via a join), RLS is enabled with no default-permissive policy, and the Service Role Key — the only thing that can bypass RLS — never reaches a browser.
4. **"Today" is an input, never a side effect.** Logic receives `asOfDate`; the UI gets it from one module (`lib/clock.js`, time zone `Asia/Riyadh`). SQL and Edge Functions must follow the same rule (§16).

---

## 1. Database schema

### 1.1 Entity overview

```
organizations
  └── organization_members (user ↔ org, role)
  └── organization_invitations
  └── departments                       (reference list, HSE-DC-1.0 §3.1)
  └── job_titles ──── departments       (optional scope, HSE-DC-1.0 §3.2)
  └── employees ──┬── departments
                   └── job_titles
        └── training_records ──┬── courses
                                └── certificates (storage pointer)
        └── employee_contacts            (HSE-CONTACT-1.0)
  └── requirements_matrix ──┬── departments
                             ├── job_titles
                             └── courses
  └── courses
  └── import_batches ──── import_row_errors
  └── audit_log

profiles (1:1 with auth.users, not org-scoped)
```

`organization_id` is a column on **every** org-scoped table below, including child tables that could technically derive it via a join (e.g. `training_records` could derive org from `employees.organization_id`). This is deliberate denormalization — see §3.3 for why.

### 1.2 DDL

All tables use `uuid` primary keys (`gen_random_uuid()`, pgcrypto — enabled by default on Supabase). Timestamps are `timestamptz`. This is schema documentation, not an applied migration — an implementing engineer would split this into ordered migration files.

```sql
-- ─── Identity & tenancy ─────────────────────────────────────────────
create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  plan              text not null default 'trial' check (plan in ('trial','standard','enterprise')),
  region            text not null default 'unassigned',   -- see §10
  settings          jsonb not null default '{}',
  status            text not null default 'active'
                      check (status in ('active','disabled','archived')),
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users(id),
  created_at        timestamptz not null default now()
  -- No deleted_at: an organization is never soft- or hard-deleted in normal
  -- operation. See section 1.5 (disable / archive / separate purge procedure).
);

-- One row per auth.users row (created by trigger on auth.users insert)
create table profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  full_name                text,
  avatar_url               text,
  default_organization_id  uuid references organizations(id) on delete set null,
  created_at               timestamptz not null default now()
);

create type org_role as enum ('owner','admin','hse_manager','training_manager','viewer','auditor');

create table organization_members (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  user_id           uuid not null references auth.users(id) on delete cascade,
  role              org_role not null default 'viewer',
  status            text not null default 'active' check (status in ('active','suspended')),
  invited_by        uuid references auth.users(id),
  joined_at         timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index idx_org_members_user on organization_members(user_id);

create table organization_invitations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  email             citext not null,
  role              org_role not null default 'viewer',
  token             uuid not null default gen_random_uuid(),
  invited_by        uuid not null references auth.users(id),
  expires_at        timestamptz not null default (now() + interval '7 days'),
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (organization_id, email)
);

-- ─── Reference data ─────────────────────────────────────────────────
-- ─── Reference lists (HSE-DC-1.0 §3.1, §3.2) ───────────────────────
-- Codes are the only matching keys. Display names may repeat and are never
-- used for matching; both names are kept so the interface can show either
-- language (`projectForDisplay` in src/lib/contract/productionPackage.js).
-- Codes are stored upper-cased: trim then upper-case, pattern ^[A-Z0-9_-]{2,20}$.
create table departments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  department_code   text not null check (department_code ~ '^[A-Z0-9_-]{2,20}$'),
  name_en           text not null,
  name_ar           text not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, department_code),
  unique (organization_id, id)
);
-- A code is never reused for a different department; renaming changes the
-- names, never the code.

create table job_titles (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  job_title_code    text not null check (job_title_code ~ '^[A-Z0-9_-]{2,20}$'),
  name_en           text not null,
  name_ar           text not null,
  -- null = usable in any department. When set, using the title with another
  -- department is blocked at import (JOB_TITLE_SCOPE) and by chk_job_title_scope
  -- on employees and requirements_matrix.
  department_id     uuid,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, job_title_code),
  unique (organization_id, id),
  foreign key (organization_id, department_id) references departments(organization_id, id) on delete restrict
);

create table courses (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  course_code       text not null check (course_code ~ '^[A-Z0-9_-]{2,20}$'),
  course_name       text not null,              -- HSE-DC-1.0: name_en
  course_name_ar    text,                       -- HSE-DC-1.0: name_ar
  category          text,
  regulatory_reference text,
  -- Help only. The official validity is requirements_matrix.validity_months;
  -- a difference is reported as SUGGESTED_VALIDITY_DIFFERS (info).
  suggested_validity_months integer check (suggested_validity_months between 1 and 120),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (organization_id, course_code),
  unique (organization_id, id)          -- target for composite foreign keys (§1.3)
);
-- Note: validity is NOT a course attribute. It lives on requirements_matrix
-- because the requirements CSV carries Validity_Months per (dept, job, course).

-- Revision 3: Department and Job_Title are reference tables, not free text.
-- The engine still matches on the CODE string: the preparation layer passes
-- `Department = department_code` and `Job_Title = job_title_code`, so the
-- engine is untouched while the database holds one approved list per
-- organization (HSE-DC-1.0 §2.2, H-03).

create table employees (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete restrict,
  -- Trimmed, case preserved, compared exactly. Final meaning: decision H-01.
  employee_code      text not null,               -- HSE-DC-1.0 §3.3
  badge_number       text,                        -- informational, never the key
  full_name          text not null,               -- display only, never matched
  full_name_ar       text,
  department_id      uuid not null,
  job_title_id       uuid not null,
  site_code          text check (site_code is null or site_code ~ '^[A-Z0-9_-]{2,20}$'),
  employment_status  text not null default 'Active'
                       check (employment_status in ('Active','Inactive','Left')),
  status_effective_date date,                     -- required when status <> 'Active'
  hire_date          date,
  last_batch_id      uuid,                         -- approved batch that last changed this row
  last_batch_approved_at timestamptz,              -- ordering key for "latest approved batch wins"
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (organization_id, employee_code),
  unique (organization_id, id),
  constraint chk_status_date check (employment_status = 'Active' or status_effective_date is not null),
  foreign key (organization_id, department_id) references departments(organization_id, id) on delete restrict,
  foreign key (organization_id, job_title_id)  references job_titles(organization_id, id)  on delete restrict
);
-- A department-scoped job title may not be used with another department.
-- Enforced by a trigger, because a check constraint cannot read another table.
create index idx_employees_org_dept_job on employees(organization_id, department_id, job_title_id)
  where deleted_at is null;
create index idx_employees_org_status on employees(organization_id, employment_status)
  where deleted_at is null;

-- Contact data is personal data (PDPL). Kept apart from employees so it can
-- have a stricter RLS policy and be dropped/exported independently.
create table employee_contacts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete restrict,
  employee_id        uuid not null,
  email              citext,
  phone_e164         text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  preferred_language text check (preferred_language in ('ar','en')),
  -- HSE-CONTACT-1.0 §3: a channel flag is a statement about the channel, not a
  -- legal basis. The basis is separate and carries its own evidence.
  email_allowed      text not null default 'Unknown' check (email_allowed in ('Yes','No','Unknown')),
  whatsapp_allowed   text not null default 'Unknown' check (whatsapp_allowed in ('Yes','No','Unknown')),
  -- Decision P-01 is pending, so `not_defined` is the only accepted value and
  -- no contact is eligible for an alert. Widening this list is a decision, not
  -- a migration detail.
  communication_authorization_basis text not null default 'not_defined'
                       check (communication_authorization_basis in ('not_defined')),
  authorization_reference   text,
  authorization_recorded_at date,
  contact_status     text not null default 'unverified'
                       check (contact_status in ('unverified','verified','invalid','withdrawn')),
  verified_at        date,
  updated_at         timestamptz not null default now(),
  -- Evidence is required as soon as a basis other than `not_defined` exists.
  constraint chk_basis_evidence check (
    communication_authorization_basis = 'not_defined'
    or (authorization_reference is not null and authorization_recorded_at is not null)
  ),
  unique (organization_id, employee_id),
  foreign key (organization_id, employee_id) references employees(organization_id, id) on delete restrict
);

-- Matching rule used by the unchanged engine: EXACT, case-sensitive string
-- equality on the CODES the preparation layer passes as (Department, Job_Title).
-- A role with no rows = "not configured".
-- A role whose rows are all mandatory = false = NOT_REQUIRED items only.
create table requirements_matrix (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  department_id     uuid not null,
  job_title_id      uuid not null,
  course_id         uuid not null,
  -- HSE-DC-1.0 §3.5: Mandatory / Recommended. The engine reads `mandatory`.
  requirement_type  text not null check (requirement_type in ('Mandatory','Recommended')),
  mandatory         boolean not null generated always as (requirement_type = 'Mandatory') stored,
  -- The official validity. Empty = the course does not expire for this role.
  -- The engine never derives an expiry from it (decision T-02).
  validity_months   integer check (validity_months between 1 and 120),
  -- Version date of the whole requirements set this row belongs to; every row
  -- of one approved package carries the same value (§5 of the contract).
  requirements_effective_from date not null,
  effective_from    date not null,
  effective_to      date,                              -- null = currently active
  -- Approval metadata. A row without it is never loaded (REQ_NOT_APPROVED),
  -- and a derived test row is refused outright (REQ_ON_DERIVED).
  approval_reference text not null,
  approved_by_role   text not null,                    -- a role, never a person
  approved_on        date not null,
  source            text not null default 'approved' check (source = 'approved'),
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  constraint chk_effective_range check (effective_to is null or effective_to >= effective_from),
  constraint chk_version_date check (effective_from = requirements_effective_from),
  foreign key (organization_id, department_id) references departments(organization_id, id) on delete restrict,
  foreign key (organization_id, job_title_id)  references job_titles(organization_id, id)  on delete restrict,
  foreign key (organization_id, course_id)     references courses(organization_id, id)     on delete restrict
);
-- Only one ACTIVE requirement per (department, job title, course) at a time.
create unique index uq_requirements_active
  on requirements_matrix(organization_id, department_id, job_title_id, course_id)
  where effective_to is null;
create index idx_requirements_org_dept_job on requirements_matrix(organization_id, department_id, job_title_id);
-- The requirement key of the contract is
-- (department_code, job_title_code, course_code, effective_from); the index
-- above is its surrogate form. Two rows of one key with overlapping ranges are
-- REQ_OVERLAP at import and are refused before they reach the database.
-- NOTE: effective_from/effective_to is NEW capability; the engine has no
-- requirement history. v1 (Decided 2026-10-06): reads pass the engine ONLY the
-- rows effective at asOfDate (effective_from <= asOf and (effective_to is null
-- or asOf <= effective_to)). Historical reports are deferred (section 1.4).
-- effective_from defaults are set by the app from the As Of Date rule in section 16, never by SQL current_date.

-- ─── Training facts (raw only — no computed Status/Priority) ────────
-- APPEND-ONLY history. Every certificate/attempt is a row. The engine picks
-- the record that counts (selectBestRecord); the DB does not.
create table training_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete restrict,
  employee_id        uuid not null,
  course_id          uuid not null,
  -- Record key of the contract: (organization, source_system, source_record_id).
  -- The identity is immutable: a key keeps its employee and its course for
  -- ever (RECORD_IDENTITY_CHANGED). Availability of a stable id: decision I-01.
  source_system      text not null check (source_system ~ '^[A-Z0-9_-]{2,20}$'),
  source_record_id   text not null check (length(source_record_id) between 1 and 64),
  -- Append-only versions of one key. A correction adds a version and keeps the
  -- previous one; the reader takes the highest version (HSE-DC-1.0 §3.7).
  version            integer not null default 1 check (version >= 1),
  completion_status  text not null default 'Not Started'
                        check (completion_status in ('Completed','In Progress','Not Started')),
  training_required  boolean,                  -- legacy CSV column; not part of HSE-DC-1.0
  issue_date         date,
  expiry_date        date,                     -- null on a Completed row = one-time training (engine: VALID)
  certificate_number text,
  training_provider  text,
  remarks            text,
  renews_record_id   uuid,                     -- optional, informational link to the record this one renews
  -- Detection only (HSE-DC-1.0 §3.8): `fp1:` plus the SHA-256 of the canonical
  -- JSON array. Never a key, never a merge rule.
  fingerprint        text check (fingerprint is null or fingerprint ~ '^fp1:[0-9a-f]{64}$'),
  import_batch_id    uuid references import_batches(id),
  approved_at        timestamptz,              -- approval instant of the batch, ordering key
  source             text not null default 'import' check (source in ('import','manual')),
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,   -- "voided", see §1.4 — never a real DELETE
  unique (organization_id, id),
  constraint chk_dates check (issue_date is null or expiry_date is null or issue_date < expiry_date),
  foreign key (organization_id, employee_id) references employees(organization_id, id) on delete restrict,
  foreign key (organization_id, course_id)   references courses(organization_id, id)   on delete restrict,
  foreign key (organization_id, renews_record_id) references training_records(organization_id, id)
);
create index idx_training_org_emp_course on training_records(organization_id, employee_id, course_id)
  where deleted_at is null;
create index idx_training_expiry on training_records(organization_id, expiry_date)
  where deleted_at is null;
-- Revision 3: idempotency is the record key plus its version, not a content
-- hash. Re-importing the same content is a no-op because the content signature
-- of the key is unchanged (RECORD_UNCHANGED); a correction adds version + 1.
create unique index uq_training_record_version
  on training_records(organization_id, source_system, source_record_id, version);
create index idx_training_record_key
  on training_records(organization_id, source_system, source_record_id)
  where deleted_at is null;
-- The fingerprint only finds records that look alike under two different ids
-- (POSSIBLE_DUPLICATE_RECORD, a warning). It is deliberately NOT unique:
-- a renewal may legitimately repeat the content of an earlier record.
create index idx_training_fingerprint on training_records(organization_id, fingerprint)
  where deleted_at is null and fingerprint is not null;

-- The immutable identity of a record key, enforced in the database as well as
-- at import, because an edited export is the likeliest way to move a record
-- to the wrong employee.
create or replace function private.reject_record_identity_change()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from training_records t
    where t.organization_id = new.organization_id
      and t.source_system = new.source_system
      and t.source_record_id = new.source_record_id
      and (t.employee_id <> new.employee_id or t.course_id <> new.course_id)
  ) then
    raise exception 'RECORD_IDENTITY_CHANGED: % / % already belongs to another employee or course',
      new.source_system, new.source_record_id;
  end if;
  return new;
end $$;

create trigger trg_record_identity
  before insert or update on training_records
  for each row execute function private.reject_record_identity_change();

create table certificates (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete restrict,
  training_record_id uuid not null,
  storage_path       text not null,     -- see §8 for path convention
  original_filename  text,
  mime_type          text,
  file_size_bytes    bigint,
  uploaded_by        uuid references auth.users(id),
  uploaded_at        timestamptz not null default now(),
  deleted_at         timestamptz,
  foreign key (organization_id, training_record_id) references training_records(organization_id, id) on delete restrict
);
create index idx_certificates_org_record on certificates(organization_id, training_record_id);

-- ─── Expiry notifications (design in §15; nothing is sent in Phase 2.0-2.3) ──
create table notification_log (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete restrict,
  employee_id        uuid not null,
  course_id          uuid not null,
  expiry_date        date not null,            -- the expiry being warned about; a renewal changes it
  channel            text not null check (channel in ('email','whatsapp')),
  days_before        integer not null,         -- 15 by default; one row per threshold
  status             text not null default 'pending'
                       check (status in ('pending','sent','failed','cancelled','skipped_no_consent','dry_run')),
  attempt_count      integer not null default 0,
  last_error         text,
  provider_message_id text,
  created_at         timestamptz not null default now(),
  sent_at            timestamptz,
  foreign key (organization_id, employee_id) references employees(organization_id, id) on delete restrict,
  foreign key (organization_id, course_id)   references courses(organization_id, id)   on delete restrict,
  -- anti-duplicate key: one alert per employee+course+expiry+channel+threshold
  unique (organization_id, employee_id, course_id, expiry_date, channel, days_before)
);
create index idx_notification_pending on notification_log(organization_id, status) where status in ('pending','failed');

-- ─── Import pipeline (in the real migration order, create import_batches BEFORE training_records)
create table import_batches (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  file_type         text not null check (file_type in ('hse_dc_1_0','training_csv_xlsx','requirements_csv')),
  -- HSE-DC-1.0 §1.3. Null for a legacy file.
  package_type      text check (package_type in ('full','employees','requirements','training')),
  contract_version  text,                       -- 'HSE-DC-1.0' for a contract package
  source_system     text,                       -- _Contract.source_system
  extract_date      date,
  file_name         text not null,
  -- Roles, never personal names. Four-eyes is recorded; in local mode it is
  -- not enforced technically (decision T-09).
  prepared_by_role  text,
  approved_by_role  text,
  imported_by       uuid not null references auth.users(id),
  imported_at       timestamptz not null default now(),
  row_count         integer not null default 0,
  valid_count       integer not null default 0,
  invalid_count     integer not null default 0,
  duplicate_count   integer not null default 0,
  status            text not null default 'staged'
                      check (status in ('staged','approved','rejected','failed')),
  approved_by       uuid references auth.users(id),
  -- Ordering key of §7: a batch approved earlier never overwrites a value an
  -- later batch approved. Stored as an instant in UTC.
  approved_at       timestamptz,
  notes             text
);

create table import_row_errors (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid not null references import_batches(id) on delete restrict,
  row_number        integer not null,
  raw_data          jsonb,
  errors            jsonb not null
);
create index idx_import_errors_batch on import_row_errors(import_batch_id);

-- Staged employee rows of a batch, compared with the master before approval (section 5.1).
create table import_employee_staging (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  import_batch_id   uuid not null references import_batches(id) on delete restrict,
  employee_code     text not null,
  proposed          jsonb not null,      -- {full_name, department_code, job_title_code, employment_status, ...}; blank fields omitted
  explicit_clears   text[] not null default '{}',  -- fields the approver chose to clear
  change_kind       text not null check (change_kind in ('new','changed','unchanged','conflict')),
  conflict_detail   jsonb,               -- e.g. two different job titles for one code in the same file
  unique (import_batch_id, employee_code)
);

-- Field-level history of the employee master. One row per changed field.
create table employee_change_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  employee_id       uuid not null,
  import_batch_id   uuid references import_batches(id) on delete restrict,  -- null for a manual edit
  field_name        text not null,
  old_value         text,
  new_value         text,
  changed_by        uuid not null references auth.users(id),
  changed_at        timestamptz not null default now(),
  foreign key (organization_id, employee_id) references employees(organization_id, id) on delete restrict
);
create index idx_employee_change_log on employee_change_log(organization_id, employee_id, changed_at desc);

-- ─── Audit ────────────────────────────────────────────────────────
create table audit_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  actor_user_id     uuid references auth.users(id),
  action            text not null,        -- e.g. 'training_record.void', 'member.role_changed'
  entity_type       text not null,
  entity_id         uuid,
  before            jsonb,
  after             jsonb,
  created_at        timestamptz not null default now()
);
create index idx_audit_org_time on audit_log(organization_id, created_at desc);
create index idx_audit_entity on audit_log(entity_type, entity_id);
```

### 1.3 Why `organization_id` is denormalized onto every table

`training_records` and `certificates` could technically resolve their org via `employee_id → employees.organization_id`. Storing it directly anyway is deliberate:

- **RLS policies stay single-hop.** `organization_id in (select private.user_org_ids())` is an index-friendly test on the row itself; a join-based policy runs a subquery per row-visibility check and is a well-known Supabase RLS performance trap.
- **Parent/child org agreement is enforced by the database, not by hope.** Every child table has a **composite foreign key** `(organization_id, parent_id) → parent(organization_id, id)` (parents carry `unique (organization_id, id)`). A row in org A can therefore never reference an employee, course or training record of org B — the insert fails with a foreign-key error. This replaces the trigger proposed in Revision 1 (a declarative constraint cannot be forgotten or bypassed by a code path that skips the trigger).
- **`organization_id` is immutable.** A `BEFORE UPDATE` trigger on every org-scoped table raises an exception if `NEW.organization_id <> OLD.organization_id`. Without it, an UPDATE `WITH CHECK` that merely tests membership of the *new* org could let a user who belongs to two orgs move rows between them.

### 1.4 Soft delete & training history — enforced at the database level

- **Training records are never hard-deleted — enforced, not conventional.** A `BEFORE DELETE` trigger on `training_records` raises an exception unconditionally:

  ```sql
  create or replace function block_training_record_hard_delete()
  returns trigger language plpgsql as $$
  begin
    raise exception 'training_records rows cannot be hard-deleted; use deleted_at (void) instead';
  end;
  $$;
  create trigger trg_block_training_delete
    before delete on training_records
    for each row execute function block_training_record_hard_delete();
  ```

  There is also **no DELETE policy** on the table. `ON DELETE RESTRICT` on every foreign key into `employees`/`courses` means a parent row with history cannot be removed either; parents are soft-deleted. Corrections use `deleted_at` (a "void"): the row stays queryable by the `auditor`/`admin`/`owner` roles, and is excluded from normal reads and KPI input.
  No foreign key cascades a delete into compliance data: every reference to `organizations`, `employees`, `courses`, `training_records` and `import_batches` is `ON DELETE RESTRICT`. The only cascades left are from `auth.users` to identity rows (`profiles`, `organization_members.user_id`), which hold no compliance facts.

- **Certificate renewal preserves history by appending, not by flagging.** A renewal is a new `training_records` row. Old rows are never touched. Which row counts toward compliance is decided at read time by the **unchanged** engine (`selectBestRecord`: latest valid expiry; if all expired, latest expiry; if no expiry, latest issue). This is why Revision 1's `is_current` flag was removed: a flag set at write time follows arrival order, while the engine's rule follows dates, and the two disagree whenever an older certificate is imported after a newer one. `renews_record_id` may be filled by the UI when a user explicitly records "this renews that"; it is informational and never read by compliance logic.

- **Requirements are versioned by date range, not overwritten.** `effective_from`/`effective_to` plus the partial unique index keep one *active* row per `(department, job title, course)`. A change closes the old row and inserts a new one, so no requirement row is lost.
  **Decided (2026-10-06):** version 1 evaluates compliance only against the requirements **effective at `asOfDate`**. Full historical reporting ("compliance as of a past date, using the requirements in force then, and the employee's title then") is **deferred**. The product must not claim it, and no report may offer a past As Of Date with historical requirements, until a historical reader is built and has its own tests. Storing the date ranges now only keeps that option open.

- **Employee changes (title, department, status) are logged, not versioned for compliance.** Compliance uses the current master values, like the engine. Every field change is written to `employee_change_log` (batch, old value, new value, time, actor; §5.1). A historical-assignment model for past-date compliance is part of the deferred historical reporting above.

### 1.5 Organization lifecycle — disable, archive, separate purge

**Decided (2026-10-06).**

- **No direct delete.** All foreign keys to `organizations` are `RESTRICT`, there is no DELETE policy on `organizations`, and a `BEFORE DELETE` trigger on `organizations` raises an exception. An organization cannot be removed by a client, an owner, or an accidental SQL statement.
- **Normal operation uses status.** `organizations.status`: `active` → `disabled` (temporary: members cannot read or write; data intact; reversible by a platform administrator) → `archived` (contract ended: read-only export available to the owner for a defined period; no writes). `private.user_org_ids()` returns only organizations with `status = 'active'` (archived read-only export goes through a dedicated, audited export path, not normal RLS). Every status change is written to `audit_log`.
- **Permanent deletion is a separate purge procedure.** It is not an org role capability and not a button. Requirements for its future design: platform-administrator only; written request; two-person review; full export handed to the client first; check against the retention policy and any legal hold or regulatory retention obligation; run as a reviewed, versioned administrative procedure (not an ad-hoc query); produce a purge record kept outside the purged tenant. **No purge script is created in Phase 2.**
- The training-record delete trigger (§1.4) stays in force; the future purge design must state explicitly how, and under whose authority, it is bypassed.

---

## 2. Role & Permission Matrix

| Capability | Owner | Admin | HSE Manager | Training Manager | Viewer | Auditor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View dashboard / KPIs / charts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View compliance table & priority actions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export PDF / CSV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Import training CSV/XLSX | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit requirements matrix | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit employee records | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Upload / delete certificates | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Void a training record (soft delete) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Invite / remove members | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Change member roles | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit organization settings/branding | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| View soft-deleted (voided) records | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Request disable / archive of organization | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Permanently purge organization | — platform administrator only, separate procedure (§1.5) — | | | | | |
| Trigger/see raw import error rows | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

**Design notes:**
- `auditor` is intentionally read-only and cross-cutting (audit log + voided records) — modeled for eventual client compliance audits (Aramco/SATORP-style vendor audits) without granting write access.
- There is no `viewer`-vs-`training_manager` split on *which employees* they see — Phase 2 scopes visibility at the organization level, not sub-department ACLs. If a client needs "Training Manager only sees their own department," that's an additional RLS predicate on `employees.department_id` tied to a new `organization_members.scoped_department_id` column — flagged here as a known Phase 3 extension, not built now to avoid speculative complexity.
- Role is enforced twice: once in RLS `WITH CHECK` clauses (§3), and once in the UI (disable/hide buttons) purely for UX — the RLS layer is the actual security boundary; the UI layer just avoids showing users controls that would fail.

---

## 3. Row Level Security design

### 3.1 Membership helper functions

One set of `SECURITY DEFINER`, `STABLE` helpers in a `private` schema (not exposed through PostgREST) is used by every policy:

```sql
create schema if not exists private;

-- Orgs the caller actively belongs to. Policies start with this test.
create or replace function private.user_org_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id
  from organization_members m
  join organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and o.status = 'active';           -- disabled/archived orgs are invisible (section 1.5)
$$;

-- Caller's role in one org (null when not a member).
create or replace function private.user_org_role(target_org uuid)
returns org_role
language sql stable security definer set search_path = public as $$
  select role from organization_members
  where organization_id = target_org
    and user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;
```

`SECURITY DEFINER` is required so a policy on another table can read `organization_members` without being blocked by that table's own RLS (which would make the policies recurse). Each function returns ids or a role, never a row, to stay a narrow surface. `(select auth.uid())` is wrapped so Postgres evaluates it once per statement, not per row.

### 3.2 Policy pattern (applied to every org-scoped table)

Every table has **RLS enabled and no default-permissive policy**: until a policy grants access, nobody sees any row, including through the auto-generated REST API. **Rule: the first condition of every policy is the tenant test `organization_id in (select private.user_org_ids())`.** Role tests come second. Example for `training_records`:

```sql
alter table training_records enable row level security;

-- Read: active member of the row's org; voided rows only for owner/admin/auditor.
create policy training_records_select on training_records
  for select to authenticated
  using (
    organization_id in (select private.user_org_ids())
    and (deleted_at is null or private.user_org_role(organization_id) in ('owner','admin','auditor'))
  );

-- Insert: tenant test first, then role.
create policy training_records_insert on training_records
  for insert to authenticated
  with check (
    organization_id in (select private.user_org_ids())
    and private.user_org_role(organization_id) in ('owner','admin','hse_manager','training_manager')
  );

-- Update: tenant test first, then role. Column limits are NOT expressible here — see below.
create policy training_records_update on training_records
  for update to authenticated
  using (
    organization_id in (select private.user_org_ids())
    and private.user_org_role(organization_id) in ('owner','admin','hse_manager','training_manager')
  )
  with check (
    organization_id in (select private.user_org_ids())
    and private.user_org_role(organization_id) in ('owner','admin','hse_manager','training_manager')
  );

-- No DELETE policy, and the BEFORE DELETE trigger in §1.4 blocks it anyway.
```

**Column-level rules need a trigger or RPC.** An UPDATE policy cannot say "this role may change field X but not `deleted_at`". Therefore:
- a `BEFORE UPDATE` trigger on `training_records` raises an exception if `deleted_at` changes and the caller's role is not `owner`/`admin`/`hse_manager`;
- the UI voids through `void_training_record(record_id, reason)` — a `SECURITY INVOKER` function that sets `deleted_at` and writes the `audit_log` row in one transaction;
- the `organization_id`-immutability trigger from §1.3 runs on every table.

Other tables follow the same shape with roles from §2. `employee_contacts` is **narrower**: SELECT/INSERT/UPDATE only for `owner`/`admin`/`hse_manager`/`training_manager`; `viewer` and `auditor` get no access to contact data. `notification_log` is SELECT for those four roles and `auditor`; **all writes come from the Edge Function (service role)**, so a client cannot forge "sent" rows. `organizations` and `organization_members` have narrower policies (select only own orgs; `update` only owner/admin; membership rows insertable only through the invitation Edge Function). `audit_log` has SELECT for owner/admin/auditor and **no client write policy**: rows are written by triggers or Edge Functions.

**Required test (Phase 2.0 gate):** log in as user A (org 1) and user B (org 2); for every table and every operation (SELECT/INSERT/UPDATE/DELETE) assert A cannot see, insert, update or delete org 2 rows, including by passing org 2's `organization_id` in the payload and by changing `organization_id` on an org 1 row.

### 3.3 How users are bound to an organization

1. Sign-up creates an `auth.users` row (Supabase Auth). A trigger (`on auth.users insert`) creates the matching `profiles` row.
2. A user becomes a member of an organization one of two ways:
   - **Creating** an organization (self-service "Create your organization" flow): client inserts into `organizations`, then a second insert into `organization_members` with `role = 'owner'`. Both wrapped in one RPC (`create_organization(name)` `SECURITY DEFINER` function) so the two inserts are atomic and the client never needs elevated privileges to bootstrap its own first membership row.
   - **Being invited**: an admin/owner creates an `organization_invitations` row. The invitee (existing or new user) redeems the token via an Edge Function (needs to run with the service role because, before redemption, the invitee has no `organization_members` row yet and RLS would otherwise block them from doing anything org-related — see §9).
3. A user can belong to **multiple** organizations (e.g. a consultant working with two contractors). `profiles.default_organization_id` plus a client-side "active organization" switcher decides which org's data the UI *currently displays* — but that is a UX convenience, not a security boundary. RLS evaluates membership against **every** org the JWT's user is a member of, every query, regardless of which org is "active" in the UI. The active-org selector just adds an additional `WHERE organization_id = :activeOrg` filter on top for a clean single-tenant view in the UI.

### 3.4 How organization membership is managed

- Role changes: only `owner`/`admin` can `UPDATE organization_members.role` (enforced via RLS `WITH CHECK` mirroring §2's matrix), and every change is written to `audit_log` via an `AFTER UPDATE` trigger on `organization_members` (captures `before`/`after` role as jsonb).
- Removal: `owner`/`admin` can set `status = 'suspended'` (soft) or delete the membership row (hard remove access); either path is logged the same way.
- Self-service leave: a user can always delete their own `organization_members` row for orgs they belong to (`user_id = auth.uid()`), with a guard preventing the *last* `owner` from leaving without transferring ownership first (enforced in the same RPC/trigger, not left to the client).

### 3.5 How cross-tenant data leakage is prevented

- RLS is **enabled with zero default-permissive policies** on every table — the safe failure mode is "returns nothing," not "returns everything." A forgotten policy is a bug that shows as missing data, never as leaked data.
- Because Supabase auto-exposes every table over a REST API (PostgREST) using the same Postgres role and RLS context regardless of which client library or raw `fetch()` call is used, there is no code path — buggy React state, a hand-crafted `fetch`, a malicious browser extension replaying requests, a future mobile app hitting the same backend — that can see another org's rows without also compromising a Postgres role or the service role key itself. The isolation guarantee sits below the entire application layer.
- The **Service Role Key is the only bypass**, and it is confined to Edge Functions (§9) that re-validate `organization_id` and role manually in code before doing anything, precisely because they no longer have RLS as a backstop. This is called out explicitly as the one place where "isolation at the database level" temporarily becomes "isolation by code review discipline," which is why the list of operations allowed to use it is kept as short as possible (§9).

### 3.6 Why database-level, not UI-level

UI-level filtering (`if (record.organization_id === activeOrg) render(...)`) only controls what gets *rendered*. It does nothing to what gets *fetched* — a Supabase client configured with a valid anon key and a logged-in user's JWT can query any table PostgREST exposes, with any filter (or none) the caller writes, independent of what the React app's own code happens to ask for. Without RLS, "the UI only shows your org's data" and "the database only returns your org's data" are two different, and the first one is trivially bypassable by opening devtools and calling `supabase.from('training_records').select('*')` directly. RLS makes them the same statement.

---

## 4. Dual operating modes

### 4.1 One codebase, adapter-pattern data layer

Local Mode and Cloud Mode share **one codebase**, split behind a thin data-access interface (`dataAdapter`) that both `complianceEngine.js` and the components already consume indirectly through `App.jsx` state. Concretely:

- **`LocalAdapter`** = the current implementation, verbatim: `trainingRecords`/`requirements` held in React state, `loadDemoDataFromPublic()`, `importTrainingFile()`, `importRequirementsFile()`, all unchanged. This is the *default* adapter — an unconfigured environment (no `VITE_SUPABASE_URL`) behaves identically to today, byte-for-byte, including the "Load Demo Data" button and no-login flow. This literally answers "how is the current presentation workflow preserved" — it isn't touched; it becomes one of two adapters instead of the only option.
- **`SupabaseAdapter`** (new) implements the same interface (`getTrainingRecords()`, `getRequirements()`, `importTraining(records)`, `importRequirements(rows)`) but reads/writes the schema in §1 instead of React state, scoped to the active organization.
- A new, **additive** header control ("Sign in for Cloud Mode") is the only new UI surface for this — it does not alter any existing button, layout, or workflow. Absent Supabase config, this control does not render at all.

### 4.2 Local → Cloud migration

"Import to Cloud" is a deliberately thin bridge, not a re-implementation of import logic:

1. User is authenticated and has an active organization.
2. User clicks "Import to Cloud". The button is shown only for records loaded through **Import Training Data** — never while the demo dataset is loaded (§4.3).
3. The **already-validated** in-memory records (`validRecords` from the current `dataImport.js`: invalid rows already filtered out; duplicate rows are **kept**, because the engine selects among them — see §5) are sent as-is to `SupabaseAdapter.importTraining()`.
4. That adapter method wraps the whole batch in a single `import_batches` row + bulk insert transaction (via an Edge Function for anything above a safe single-request row count — see §5), tagging every inserted row with `organization_id` and the new `import_batch_id`.
5. No re-parsing or re-validating happens, and no rows are dropped or merged — the browser has already done that work under the exact same rules the 116 tests verify. Cloud persistence is "save what you already trust," which is why this step cannot introduce data loss or divergence from local behavior.

### 4.3 "Load Demo Data" stays local-only, forever

The demo button remains wired to `LocalAdapter` unconditionally, even when the user is signed into Cloud Mode. Demo data is synthetic and presentation-only (§12) — routing it into a real tenant's database would pollute compliance KPIs with fake records and create a cleanup problem. If a user wants to see demo data *in* Cloud Mode (e.g. to demo the persistence layer itself), that is a distinct, explicit action ("Load Demo Data into a Sandbox Organization") — out of scope for Phase 2, noted here so it isn't silently conflated with the existing button.

---

## 5. CSV/XLSX Migration Strategy

"Migration" here means the pipeline for getting a CSV/XLSX file into Supabase, in Cloud Mode. It has two entry points that converge on the same validated shape:

1. **Interactive import** (small-to-medium files, the common case): identical to today — `dataImport.js`'s existing `parseTrainingFile`/`parseRequirementsFile` + validation run **client-side, unchanged**, producing the same `{ validRecords, invalidRecords, errors, warnings, importSummary }` shape the 116 tests already assert against. Only the *last step* differs by mode: Local Mode sets React state; Cloud Mode calls `SupabaseAdapter.importTraining(validRecords)`.
2. **Bulk/large-file import**: same client-side validation, but the resulting valid-record array is POSTed to an Edge Function instead of inserted directly from the browser, because (a) very large batches risk PostgREST's default statement/row limits and connection-held-open time from a browser tab, and (b) it lets the batch be inserted inside one server-side transaction with the service role, so a failure partway through can `ROLLBACK` the whole `import_batch_id` cleanly instead of leaving half an import committed.

**Mapping from validated in-memory record → rows.** Input is exactly what `dataImport.js` produces today. Fields are the real CSV names.

| In-memory field | Destination and rule |
|---|---|
| `Employee_ID`, `Employee_Name`, `Department`, `Job_Title`, `Employment_Status` | Staged in `import_employee_staging`, matched on `(organization_id, employee_code)`, previewed, applied to `employees` only when the batch is **approved**. Rules in §5.1. |
| `Course_Code`, `Course_Name` | Upsert `courses` on `(organization_id, course_code)`; a changed name is logged, code never changes. |
| `Completion_Status`, `Training_Required`, `Issue_Date`, `Expiry_Date`, `Certificate_Number`, `Training_Provider`, `Remarks` | **Insert** a `training_records` row. Never update or supersede existing rows. The unique `uq_training_fingerprint` index makes re-importing the same file a no-op (`on conflict do nothing`). A renewal (different dates/number) is simply a second row; the engine picks the winner. |
| Requirements CSV: `Department`, `Job_Title`, `Course_Code`, `Mandatory`, `Validity_Months` | Compare to the active row for the same key. Unchanged `mandatory` and `validity_months` → no-op. Changed → close the old row (`effective_to` = As Of Date − 1 day, per §16) and insert a new row with `effective_from` = As Of Date. Keys missing from the new file are **not** closed automatically (a partial file must not wipe requirements); a separate explicit "replace matrix" action does that. |
| Import counts (`valid`, `invalid`, `duplicates`) | One `import_batches` row. |
| Invalid rows | `import_row_errors` (`raw_data`, `errors` as jsonb). Today invalid rows are only shown once in the banner; persisting them is a new audit trail. |

### 5.1 Employee master update rules

**Decided (2026-10-06).** Documentation only; nothing is applied to a real database in Phase 2.

1. **Match key** = employee code (`Employee_ID`, trimmed) **within the organization**. The same code in two organizations is two different people.
2. **Stage, preview, approve.** An import creates a batch with `status = 'staged'`. For every employee code the app computes `new`, `changed`, `unchanged` or `conflict` against the master and shows the field-level differences. Nothing reaches `employees` until a user with import permission approves the batch. A batch can be rejected; rejected batches change nothing.
3. **Conflicts block approval.** If one file contains different values for the same code (e.g. two job titles), the code is a `conflict`. The approver must pick the value or exclude the employee. The app never silently takes the first or last row.
4. **Latest approved batch wins** — ordered by `approved_at`, not by row order and not by file date. On approval, a field is updated only if this batch's `approved_at` is later than `employees.last_batch_approved_at`. Approving an older staged batch after a newer one therefore cannot overwrite newer values; the preview shows those fields as "superseded by a later approved batch".
5. **Blank never erases.** An empty cell means "no information", not "delete". A value is cleared only when the approver ticks an explicit "clear this field" choice in the preview (`explicit_clears`). Required fields (`full_name`, `department_id`, `job_title_id`, `employment_status`) cannot be cleared at all.
6. **Change log.** Each changed field writes one `employee_change_log` row: batch id, field, old value, new value, `changed_at`, `changed_by` (the approver). Manual edits write the same row with `import_batch_id` null.
7. **Training rows** of the batch are inserted on approval as well, so compliance never mixes approved training facts with unapproved employee data.
8. **Local Mode is unchanged.** These rules apply to Cloud Mode only. Local Mode keeps the current engine behaviour (first row per Employee_ID).

**Duplicate policy stays where it is.** The client-side duplicate-group detection (`Employee_ID|Course_Code`) is unchanged and still reports duplicates. Revision 1 said duplicates are discarded before insert; that is wrong for the engine: it keeps **all** rows as input and selects the best one. Cloud Mode therefore stores all rows too (append-only), and the engine reports the same duplicate groups from the same data. Local and Cloud results match because both feed the same rows to the same function.

**Idempotency / re-import safety.** Employees and courses upsert by natural key; training rows dedupe by the fingerprint index; requirements compare-then-version. Running the same import twice changes nothing.

**Rollback of a bad import.** Every inserted `training_records` row carries `import_batch_id`. Undo = void all rows of that batch (`deleted_at`) through the void RPC. Employee field changes made by the batch are listed in `employee_change_log` (with old values), and course/requirement changes in `audit_log`, so they can be reverted deliberately.

---

## 6. Environment Variable Plan

| Variable | Scope | Where it lives | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | **Public** (frontend) | `.env` (committed as `.env.example` only, real value in local `.env`/hosting provider's build-time env config) | Safe to expose — it's just the project's API endpoint. |
| `VITE_SUPABASE_ANON_KEY` | **Public** (frontend) | Same as above | Safe by design *because* RLS is enabled on every table (§3). This key alone, without a valid RLS policy granting access, returns nothing. If RLS is ever accidentally disabled on a table, this key becomes dangerous — which is exactly why §3.2 mandates "RLS enabled, zero default policies" as the starting state for every new table, not an afterthought. |
| `VITE_APP_MODE` (optional) | Public | `.env` | Not strictly required (§4.1 auto-detects Cloud availability from the presence of the two vars above), but useful for explicitly forcing Local Mode in a demo/offline environment even if Supabase vars are present. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only, secret** | Supabase Edge Function secrets (`supabase secrets set`) and/or CI/CD secret manager for any scheduled job runner. **Never** in any `.env` file that ships to a browser build. | See hard rules below. |
| `SUPABASE_DB_URL` (direct Postgres connection string) | **Server-only, secret** | CI secret manager, used only by migration-runner tooling (e.g. `supabase db push` in a deploy pipeline) and one-off admin scripts run from a developer's machine against a non-prod project. Never used by the running application at all. | |
| `RESEND_API_KEY` / email provider key (for invitation & expiry-reminder emails, §9) | **Server-only, secret** | Edge Function secrets | Same handling as the service role key — used only inside Edge Functions. |
| `STORAGE_BUCKET_NAME` | Public (frontend needs it to build storage paths for signed-URL requests) | `.env` | Not sensitive; it's a bucket name, not a credential. Actual read/write is gated by Storage RLS (§7), not by secrecy of the bucket name. |

**Hard rules for `SUPABASE_SERVICE_ROLE_KEY` (non-negotiable, and each one maps to a concrete check):**

- **Never `VITE_`-prefixed.** Vite inlines any `VITE_*` variable into the client bundle at build time — prefixing this key that way would ship it to every visitor's browser. This is enforced by convention + a CI grep step (`grep -r VITE_SUPABASE_SERVICE` failing the build if it ever matches) rather than trusted to memory.
- **Never committed to git.** `.env` is already gitignored in this repo; a pre-commit hook (or CI secret-scanning step, e.g. `gitleaks`) should additionally block any commit whose diff contains a string matching the service role key's JWT structure, as a second line of defense against someone pasting it into a comment or a debug `console.log`.
- **Never logged.** Edge Functions must never `console.log` the key itself, request headers containing it, or full Supabase client instances that might serialize it. Structured logging in Edge Functions should log *decisions* ("granted invite for org X") not *credentials*.
- **Never in `localStorage`/`sessionStorage`/cookies.** It has no reason to ever exist client-side, so this rule is really "it never leaves the Edge Function runtime," full stop — not "it's stored safely in the browser."
- **Lives only inside Edge Functions and trusted CI jobs**, both of which are covered in §9.

---

## 7. Backup & Rollback Strategy

- **Managed backups.** Supabase Pro-tier-and-above projects include automated daily backups with a retention window (7 days on Pro, longer on higher tiers), plus **Point-in-Time Recovery (PITR)** as an add-on for tighter RPO. Given this is compliance data with a "never hard delete" requirement already baked into the schema (§1.4), **PITR should be enabled**, not treated as optional — it's the difference between "we can restore to any second in the last N days" and "we can restore to last night."
- **Independent logical backups.** In addition to Supabase-managed backups (which are provider-controlled and tied to that project), a scheduled job (GitHub Actions cron, or a Supabase Scheduled Edge Function) runs `pg_dump` against the database on a daily cadence and pushes the encrypted dump to a **separate** cloud storage provider/account. Rationale: compliance/audit data for a client like Aramco/SATORP should not have its only backup living in the same vendor account as the primary — a billing dispute, account suspension, or provider-side incident shouldn't be a single point of failure for both the live data and its backup.
- **Migration strategy: forward-only, tested against staging first.** Schema changes are versioned migration files (Supabase CLI's `supabase/migrations/`), applied first to a staging project that mirrors production, verified against a smoke-test suite, then applied to production. Rather than relying on hand-written `down` migrations (which are frequently untested and wrong when actually needed under pressure), the recommended rollback path for a bad migration is: **restore from PITR to just before the migration ran**, then fix-forward with a corrected migration. This is safer than trusting an untested reverse script mid-incident.
- **Fast, narrow rollback for bad imports** (the most common real-world "oops," far more likely than a schema-level disaster): because every import is tagged with `import_batch_id`, a bad CSV import is undone by soft-deleting (`deleted_at = now()`) every `training_records` row with that batch ID, and reverting any `employees`/`courses` upserts the batch performed (tracked via the same batch ID on an `upsert_log` — noted here as a small addition to §1's schema if this granularity is wanted: an `import_batches`-linked table recording which existing rows were touched vs newly created, so an undo can distinguish "delete this new employee" from "don't touch this employee we only updated a field on"). This is a one-click, seconds-scale recovery path that doesn't require touching backups at all for the common case.
- **RPO/RTO targets** (to be confirmed with the client, stated here as a reasonable starting proposal): RPO ≤ 5 minutes (via PITR), RTO ≤ 1 hour for a full project restore, RTO ≤ 5 minutes for an import-batch rollback.
- **Rehearsal is part of the plan, not a one-time setup step.** A quarterly "restore drill" (restore the latest backup into a scratch project, run the test/smoke suite against it) is the only way to know the backups actually work before a real incident forces the question.

---

## 8. Certificate Storage Design

- **Bucket:** a single **private** Supabase Storage bucket (e.g. `certificates`) — never public. All access goes through either a signed URL or an authenticated request evaluated against Storage RLS.
- **Path convention:** `{organization_id}/{employee_id}/{training_record_id}/{uuid}-{original_filename}`. Embedding `organization_id` as the **first path segment** is deliberate: Storage RLS policies on `storage.objects` can then be written as a cheap prefix check (`(storage.foldername(name))[1] = auth.jwt() ->> ...`-style, or joined against `organization_members` the same way as §3) without needing to look up the parent `training_records`/`employees` rows at all — mirroring the same "denormalize the tenant boundary into the row/path itself" principle from §1.3.
- **Access pattern:** the client never gets a permanent public link. It requests a **signed URL** (short TTL — recommend 10 minutes) at view/download time via the Supabase client SDK, which itself is subject to Storage RLS using the user's own JWT — **no Edge Function is required for the common read path**, because path-prefix-based RLS is sufficient to express "you may only sign URLs for objects under your org's folder." An Edge Function is only needed if finer-grained logic is ever required (e.g. "only the uploader or an admin may download," which is a per-row check the path prefix alone can't express) — noted as a Phase 3 refinement, not needed for Phase 2's role model in §2.
- **Retention:** certificates (and their parent `training_records` rows) are retained **indefinitely by default** — this matches the "never hard delete" training-history requirement and is consistent with typical HSE contractor audit expectations (multi-year look-back). If a client contractually requires a fixed retention+purge period, that becomes a per-organization `settings.retention_months` value (already has a home in `organizations.settings jsonb`, §1.2) enforced by the orphan-cleanup job below rather than a global constant.
- **Orphan cleanup:** a scheduled Edge Function (Supabase Scheduled Functions / `pg_cron` triggering an Edge Function webhook) runs periodically (recommend weekly) and does two passes:
  1. **Storage → DB:** list objects in the bucket, check each path against `certificates.storage_path`; any object with no matching row is orphaned (e.g. an upload that succeeded in Storage but whose DB insert failed) and is deleted after a grace period (e.g. 48 hours old, to avoid racing an in-flight upload).
  2. **DB → Storage (soft-deleted only):** for `certificates` rows soft-deleted **and** older than the org's configured retention window (only relevant for orgs that opted into a finite retention period — indefinite-retention orgs, the default, are skipped entirely), the underlying Storage object is actually removed and the row is finally hard-deleted — this is the **one** place in the schema where a real, physical delete is intentional, and it is scoped to `certificates` (a file pointer) only, never to `training_records` (the compliance fact itself, which per §1.4 is never hard-deleted regardless of retention settings).

---

## 9. Security-sensitive operations requiring Edge Functions (or another trusted backend)

The rule from §6 — "if it needs the service role key, it needs to run outside the browser" — applies to exactly these operations:

| Operation | Why it can't be a plain client call |
|---|---|
| **Redeeming an organization invitation** | The invitee has no `organization_members` row yet, so RLS blocks them from inserting one for themselves (by design — a user granting themselves membership would defeat the whole permission model). An Edge Function validates the invitation token + expiry server-side, then inserts the membership row using the service role. |
| **Bulk/large CSV-XLSX import** (§5) | Needs one large multi-table transaction (upserts and inserts across `employees`, `courses`, `training_records`, `requirements_matrix`) with rollback-on-failure semantics, and may exceed what's safe to run as a sequence of individual client-issued requests from a browser tab that could be closed mid-import. |
| **Scheduled orphan cleanup** (§8) | Needs to list and delete Storage objects across the *entire* bucket (all orgs) to reconcile against the DB — no single tenant's RLS-scoped credentials can see across orgs, and this job legitimately needs to. |
| **Scheduled hard-purge of retention-expired certificates** (§8) | Same reasoning — a cross-tenant sweep, plus it's the one legitimate physical-delete path in the system and should not be reachable by any client-issued request at all. |
| **Expiry notification dispatch** (design in §15) | A scheduled job querying "certificates expiring in the next N days across all orgs" to send emails needs cross-tenant read access to do the query efficiently, then must carefully scope *who receives what* per org — the query needs elevated access even though the output must stay tenant-scoped. |
| **Role changes / member removal by an admin** | Could technically be a direct RLS-gated client update (the policy in §3.4 already allows it for `owner`/`admin`) — called out here explicitly as **not** needing an Edge Function, to keep the "what actually needs elevated privilege" list honest and as short as it really is, rather than routing everything through a backend by default. |

Every Edge Function on this list independently re-checks `organization_id` and the caller's role from the *caller's own JWT* before touching anything — the service role key grants the Edge Function the *ability* to bypass RLS, it does not grant the *caller* any authority the function doesn't explicitly verify first. This is the one place in the architecture where "isolation at the database level" (§3.6) is supplemented by "isolation by code review of a small, enumerable set of functions" — which is precisely why this list should be treated as exhaustive and any addition to it should get its own security review, not be added casually during later feature work.

---

## 10. Saudi PDPL & Data Residency Assessment

**This section is a risk flag, not a green light — it should go to the client's legal/compliance function before any real personnel data touches Supabase, regardless of which region is chosen.**

- **Saudi PDPL (Personal Data Protection Law, enforced by SDAIA)** restricts transfer of personal data of Saudi-resident data subjects outside the Kingdom to cases meeting specific conditions; counsel must confirm the current rules and implementing regulations. Possible bases (e.g. SDAIA-approved adequacy determination for the destination country, documented contractual safeguards, or explicit, informed consent for the specific cross-border transfer). Employee training/compliance records — names, national/company ID-adjacent badge numbers, employment status, department — are personal data under PDPL. Training/contact data identifies people, so PDPL applies. This section is an engineering risk assessment, not legal advice.
- **Supabase region availability, at the time of this assessment:** Supabase Cloud's published regions are AWS-backed and do not currently include a Kingdom of Saudi Arabia region. The nearest options are typically Bahrain or UAE-region equivalents *if and when* Supabase enables them for a given project tier — **this must be re-verified against Supabase's current region list at implementation time**, since it changes; this document should not be treated as a permanent source of truth on region availability. Absent an in-Kingdom region, any managed-Supabase-Cloud deployment is, by definition, a cross-border transfer under PDPL.
- **Aramco/SATORP-specific implications go beyond PDPL itself.** Large Saudi operators in this sector typically run their own vendor cybersecurity and data-handling standards (informed by, but often stricter than, PDPL's statutory minimum) for contractor/HSE data — commonly including requirements around approved hosting, network isolation, and vendor security assessments before *any* third-party SaaS is allowed to touch personnel or safety-compliance data tied to their sites. **It should be assumed, until confirmed otherwise by Aramco/SATORP's own IT security and legal teams, that public managed-cloud SaaS (any vendor, not specifically Supabase) may not be an acceptable hosting model for this data at all** — independent of which AWS region Supabase uses.
- **Recommendation (in priority order):**
  1. **Do not put real Aramco/SATORP personnel or training data into Supabase Cloud at any point in Phase 2.** Development, testing, and demos use only the synthetic data generator in §12, full stop, until a formal sign-off exists.
  2. **Get explicit, written confirmation from the client's IT security and legal/compliance function** on (a) whether third-party managed cloud SaaS is permissible at all for this data class, and (b) if so, under what regional/contractual conditions — before scoping any further Cloud Mode rollout beyond internal testing.
  3. **If managed cloud is disallowed**, the fallback architecture is **self-hosted Supabase** (the platform is open-source and deployable via Docker/Kubernetes) inside infrastructure the client controls — a KSA-based data center, or the client's own approved cloud tenancy/region. This preserves everything in §1–§9 (schema, RLS, auth, storage model) unchanged, since none of it is Supabase-Cloud-specific; only the hosting location and operational ownership change.
  4. **If a region is ultimately approved for managed Supabase Cloud**, document the specific legal basis relied on for the cross-border transfer (consent, contractual safeguard, SDAIA mechanism) as part of the project's compliance record, not just as an engineering decision — this is a legal artifact, not a config value.

---

## 11. Phase-by-phase Implementation Roadmap

Estimates assume one focused engineer already familiar with this codebase; treat them as planning inputs, not commitments.

| Phase | Scope | Est. effort | Checkpoint |
|---|---|---|---|
| **2.0 — Foundation** | Schema (§1) as ordered migrations, RLS policies (§3), auth trigger wiring (`profiles` on signup), synthetic data generator (§12) built against staging | 1.5–2 weeks | **Gate:** independent RLS review — automated tests that log in as two different orgs' users and assert zero cross-visibility on every table, before any UI work begins |
| **2.1 — Adapter layer** | Introduce `dataAdapter` interface, refactor `App.jsx`/components to go through it, `LocalAdapter` = current behavior verbatim | 3–5 days | **Gate:** full existing 116-test suite plus a manual Local-Mode regression pass shows **zero behavior change** with Supabase env vars entirely absent |
| **2.2 — Auth & org onboarding** | Sign up/in, create-organization flow, invitation send/redeem (Edge Function), org switcher UI | 1–1.5 weeks | Manual walkthrough: two test accounts, cross-invite, confirm each only ever sees their own org's data in the UI |
| **2.3 — Cloud import pipeline** | `SupabaseAdapter` implementing import/read against schema, "Import to Cloud" bridge (§4.2), bulk-import Edge Function (§5) | 1–1.5 weeks | Re-run identical CSV fixtures used by the 116-test suite through the cloud path; diff resulting KPIs against the known-good local-path output — must match exactly |
| **2.4 — Certificate storage** | Bucket + Storage RLS policies, upload/signed-URL UI, orphan-cleanup scheduled function | 4–6 days | Security check: attempt to fetch another org's certificate path directly with a valid-but-wrong-org JWT; must fail |
| **2.5 — Engine placement** | Keep the JS engine for dashboards (Local and Cloud). Package the same module for use inside the notification Edge Function (§13.1). No SQL port. | 2–4 days | Parity test: Edge Function run on the 116-test fixtures returns the same statuses as the client |
| **2.5b — Expiry notifications (15-day)** | `employee_contacts`, `notification_log`, scheduled Edge Function, dry-run mode, email first then WhatsApp (§15) | 1.5–2 weeks | Run twice in one day → one message per key; renewal cancels a pending alert; dry-run sends nothing |
| **2.6 — Legal/PDPL sign-off** | External — client legal & IT security review per §10 | **Unbounded / externally gated** | **Hard blocker**: no real personnel data enters the system before this closes, regardless of how "done" the engineering is |
| **2.7 — Backup/rollback rehearsal + load test** | Enable PITR, set up independent `pg_dump` job, run a restore drill, load-test with synthetic data at realistic org size (hundreds–low thousands of employees) | 1 week | Restore drill must actually succeed against a scratch project, not just be documented as a plan |
| **2.8 — Pilot cutover** | Onboard one real (or first fully-approved) organization, monitor closely, keep Local Mode as the documented fallback if anything regresses | 1 week + monitoring | Go/no-go review before a second organization is onboarded |

**Highest-risk stages, called out explicitly:**
1. **RLS correctness (2.0)** — a silent cross-tenant leak is the single worst possible outcome of this entire project; it gets a dedicated automated test suite, not just manual spot-checks.
2. **PDPL/data residency (2.6)** — external, not fully controllable by engineering timeline, and can invalidate the "managed Supabase Cloud" assumption entirely (§10), potentially forcing a re-architecture to self-hosted mid-project if not raised early. This is why it's sequenced as its own phase rather than a footnote — it should start in parallel with 2.0, not wait until engineering is "done."
3. **Compliance engine placement (2.5)** — the highest technical-debt risk if done carelessly: any second implementation of the engine (a SQL port, or a drifting copy in an Edge Function) silently produces wrong compliance numbers; the plan avoids it by running the same module in both places, which for HSE data is a safety-communication failure, not just a bug.
4. **Cloud import parity (2.3)** — the whole migration strategy's safety claim (§5) rests on "cloud numbers match local numbers exactly"; this checkpoint is where that claim gets tested, not assumed.

---

## 12. Synthetic Test Data Generator — Specification

No real personnel data is used at any point before §11's Phase 2.6 gate closes. Specification for a generator (implementation deferred — this is architecture, not code):

- **Names:** a pool of realistic Saudi given + family names in both transliterated-English and Arabic script forms (e.g. `Ahmed Al-Mansouri` / `أحمد المنصوري`, `Fatima Al-Dosari` / `فاطمة الدوسري`, `Mohammed Al-Ghamdi`, `Sara Al-Khalifa`, `Omar Al-Shehri`, `Nora Al-Rashid`, `Khalid Al-Otaibi`, `Layla Al-Jaber` — matching the naming pattern already present in the current demo dataset), combined randomly with weighted family-name frequency so generated cohorts don't look obviously templated (avoid literally reusing the demo's 9-employee set verbatim for larger synthetic runs).
- **Badge/employee numbers:** `EMP{4-digit sequential or padded random}` — matches the existing `EMP0001` format exactly, so generated data is drop-in compatible with the current CSV import validation without any format changes.
- **Departments:** weighted pool reflecting a realistic industrial-contractor org shape — `Operations`, `Maintenance`, `Logistics`, `Planning`, `Admin`, `HSE`, `Process`, `Instrumentation`, `Electrical` — with headcount weighted toward Operations/Maintenance (the largest crews on a typical site), matching the current demo's department distribution rather than a flat/uniform split.
- **Job titles:** paired per department (e.g. Operations → `Field Supervisor`, `Equipment Operator`, `Process Technician`; Maintenance → `Technician`, `Maintenance Lead`, `Mechanical Fitter`), so `(Department, Job_Title)` combinations look like a real org chart rather than random cross-products that would never occur.
- **Course codes:** extend the existing style (`H2S001`, `WAH001`, `CS001`, `PTW001`, `FF001`) with additional realistic Aramco/SATORP-adjacent HSE course codes for larger synthetic sets — e.g. `LOTO101` (Lockout-Tagout), `SCBA201` (Self-Contained Breathing Apparatus), `RIGG301` (Rigging & Signaling), `DEFDRV01` (Defensive Driving), `HSEIND01` (HSE Site Induction), `CSRESC01` (Confined Space Rescue) — plausible naming, not real proprietary Aramco course codes.
- **Certificate numbers:** `CERT-{course_code}-{6-digit random}`, unique per row.
- **Expiry date distribution:** weighted, not uniform-random, to reproduce a realistic compliance curve rather than an unrealistically clean or unrealistically bad dataset — e.g. roughly 35–40% `VALID` (comfortably in-date), 15–20% spread across the three `EXPIRING_*` bands, 10–15% `EXPIRED`, remainder split across `IN_PROGRESS`/`NOT_STARTED`/`MISSING`, deliberately similar in shape to the current demo dataset's ~66.7% compliance figure so generated data continues to exercise every KPI/status branch the existing 116 tests already cover, just at a larger, randomized volume for load-testing purposes (§11, Phase 2.7).
- **Volume knob:** generator takes an employee-count parameter so the same spec can produce a 9-employee smoke-test set (matching today's demo exactly) or a 2,000-employee load-test set (for Phase 2.7) from the same weighted pools.

---

## 13. Open Questions — answered

### 13.1 Should the compliance engine remain client-side or move server-side?

**Recommendation (revised): keep it client-side for dashboards in both modes; reuse the same JS module on the server only where a server job needs it (notifications). Do not port it to SQL.**

- **Evidence.** The engine is a pure function of `(records, requirements, asOfDate)`. At 500 employees × ~12 mandatory courses ≈ 6,000 items the work is trivial for a browser; Revision 1's claim that it slows "past a few hundred employees" was not measured and is withdrawn. If a 2,000-employee test (Phase 2.7) shows a real problem, revisit with data.
- **Local Mode** has no server, so the engine must stay client-side there regardless.
- **Why not SQL.** A SQL copy of the selection, status, duplicate and KPI rules creates a second source of truth. Divergence on HSE data is a silent wrong-number risk. It also forces every future rule change to be made twice.
- **Where a server must evaluate compliance:** the 15-day alert job (§15) needs "which employees have a counted record expiring in 15 days" for all tenants without a browser. **Supabase Edge Functions run Deno, which can import the same ES-module engine file.** The function loads rows for one organization, calls `buildComplianceUniverse(records, requirements, asOfDate)` with `asOfDate` from the clock rule in §16, and reads the resulting items. One implementation, two runtimes. CI runs the 116 fixtures through the Edge Function entry point to prove parity.
- **Data exposure.** Cloud Mode fetches only the caller's organization (RLS). Fetching 6,000 rows to a logged-in HSE user of that organization is within their role; this is not an extra exposure.
- **Judgement call.** If the client later requires that raw rows never reach browsers (e.g. a department-scoped viewer), aggregated server-side KPIs become necessary. That is a new requirement and should be decided then, using the shared-module approach above rather than SQL.

### 13.2 What happens when Supabase is offline?

Phase 2 does **not** attempt full offline-write support — that's a materially larger scope (conflict resolution, sync queues) than "Cloud Mode connectivity handling." Phase 2's behavior:

- The `SupabaseAdapter` wraps all reads with a health/reachability check. On failure, the UI shows an explicit, unambiguous banner ("Cloud connection unavailable — showing last synced data, read-only") rather than a silent stale view or a confusing error.
- The **last successfully fetched dataset is cached locally** (IndexedDB, not localStorage, given realistic dataset sizes) so a transient outage doesn't blank the dashboard — the user sees their last-known compliance picture, clearly labeled as potentially stale, and cannot perform writes (import, edits, uploads) until connectivity returns; all write actions are disabled with an explanation, not silently queued.
- This deliberately does **not** try to be clever about queuing writes made while offline — see 13.3 for why that's scoped out rather than half-built.

### 13.3 How is offline work synchronized later?

Not built in Phase 2; specified here so a future phase has a starting design rather than a blank page:

- **Outbox pattern:** pending local mutations (an import, a manual edit) get queued in IndexedDB with a client-generated idempotency key, rather than attempted immediately.
- **Replay on reconnect:** the queue drains automatically once connectivity is confirmed, submitting each mutation with its idempotency key so a partially-successful earlier attempt (e.g. the request left before a connectivity drop but the server actually processed it) doesn't get double-applied — the server checks the idempotency key against a small dedup table before applying.
- **Conflict handling:** genuine conflicts (two different users editing the same `training_records` row while one was offline) are surfaced to the user rather than silently resolved by last-write-wins, given this is compliance data where silently discarding one side's edit is a worse outcome than asking a human to pick. A minimal conflict-resolution UI ("this record changed since you started editing — keep yours / take theirs / view both") is the expected shape.
- This is flagged as a **Phase 3+ candidate**, only worth building if real field usage shows genuine offline gaps (e.g. site locations with unreliable connectivity) rather than built speculatively now.

---

## 14. Disagreements with the brief, stated explicitly

Per the instruction to flag disagreements rather than silently comply: two decisions above deliberately go beyond exactly what was asked, for stated reasons —

1. **Computed `Status`/`Priority` are explicitly *not* stored anywhere in the schema**, even though nothing in the brief said not to store them. Storing a derived value that depends on `as_of_date` (which changes every single day, by definition) as if it were a fact is the single most likely source of a "the database disagrees with the app" bug in this entire design, and it directly touches the one thing the brief is most emphatic about protecting — the compliance engine's authority. This is called out because an implementing engineer, following normal instincts, might otherwise add a `status` column to `training_records` "for convenience" (e.g. to sort/filter in SQL without a join to logic) — that convenience is exactly the trap.
2. **Real client data is blocked from entering Supabase at all until Phase 2.6 (§11) closes**, which is a stronger and earlier gate than "assess PDPL as one of several deliverables" implies. Given the specific mention of Aramco/SATORP by name in the brief, treating data residency as a parallel, potentially project-redirecting risk from day one — rather than a document produced alongside otherwise-unblocked engineering work — is the more honest read of how much that risk actually matters here.

---

## 15. Expiry notification design (15 days before expiry)

**Status: design only. Nothing in either code base sends alerts today.** The Next.js copy has `sendEmail`/`sendWhatsApp` helpers that no code calls, a 60-day status window, no schedule and no log. Do not reuse its design.

**Rule.** For each active employee and each mandatory requirement, take the record the engine counts (`selectBestRecord` via `buildComplianceUniverse`). If `Status` is a completed-and-expiring status and `daysRemaining` is between `0` and `15` inclusive, the item is eligible. (`daysRemaining` is `dateDiffDays(expiry, asOfDate)`; expiry day counts as day 0, consistent with §16.) A record already expired is **not** a 15-day alert; it belongs to a separate "expired" report decision.

**Catch-up window.** Eligibility is `0 ≤ daysRemaining ≤ 15` plus "no row exists for this key", not "exactly 15". If the job fails for two days, the first successful run still sends. Each message states the actual days remaining.

**Anti-duplicate key.** `notification_log` unique key = `(organization_id, employee_id, course_id, expiry_date, channel, days_before)`. The job inserts the row (`status='pending'`) before sending; the unique index makes a second run in the same day, or a retry race, insert nothing. A **renewal changes `expiry_date`**, so it produces a different key and a new alert cycle for the new expiry.

**Cancellation after renewal.** Before sending, the function re-evaluates the item with the engine. If the counted record no longer expires within 15 days (renewed, voided, employee inactive, requirement removed), the row is set `cancelled` and nothing is sent.

**Retry.** `failed` rows with `attempt_count < 3` are retried by the next run; the provider error is stored in `last_error`; after 3 failures the row stays `failed` and appears in an admin view. No unbounded retry.

**Consent and contacts.** Send only to channels with an opt-in recorded in `employee_contacts` (`email_opt_in`, `whatsapp_opt_in`, `consent_recorded_at`). No consent → row `skipped_no_consent`. Phone numbers are E.164. Contact data is PDPL-sensitive; see §10 before loading any real contacts.

**Execution.** `pg_cron` (or Supabase Scheduled Functions) calls an Edge Function once per day at a fixed Riyadh time. The function: (1) for each organization, loads records and requirements; (2) evaluates with the shared engine at `asOfDate = Riyadh today`; (3) writes `notification_log`; (4) sends through the provider. It uses the service role key, and therefore re-checks `organization_id` in code (§9).

**Providers.** Email: Resend or equivalent. WhatsApp: Twilio or Meta Cloud API — business-initiated messages need **pre-approved templates**; template approval is a lead-time item outside engineering control. Provider keys are server-only secrets (§6).

**Dry-run mode.** An organization setting `notifications.mode = 'dry_run'` (default) writes `dry_run` rows and sends nothing. Production sending is enabled per organization by an explicit owner action, after a dry-run review with the training manager.

**Acceptance tests.** (a) Run twice the same day → one message per key. (b) Skip two days, run → message sent once with correct days. (c) Renew the certificate before the run → no message, row `cancelled`. (d) No consent → `skipped_no_consent`. (e) Provider failure → retried up to 3 times, then visible. (f) Two organizations → no cross-organization row or message.

---

## 16. As Of Date and time-zone rule

Implemented in the Vite app (change pending review); the same rule binds SQL and Edge Functions.

- **Logic never reads the clock.** `complianceEngine.js` and `normalization.js` receive `asOfDate` (`YYYY-MM-DD`). A test fails if either file contains `Date.now(` or `new Date()`.
- **One source of "today" for real use:** `lib/clock.js` → `getRuntimeAsOfDate(now)`. The calendar day is the day in `REPORTING_TIME_ZONE = 'Asia/Riyadh'` (UTC+3, no daylight saving), not the device zone. Two devices in different zones agree on the date.
- **Demo date.** `DEMO_AS_OF_DATE = '2026-07-26'` is used only while demo data is loaded and in test fixtures. Importing real training data, or resetting, switches to today's Riyadh date.
- **Expiry-day rule (unchanged, now documented here and tested):** a certificate is valid **through** its `Expiry_Date`. On the expiry date itself it is still compliant (status `EXPIRING_30`, 0 days left). It becomes `EXPIRED` on the next calendar day (−1). Boundaries: 0–30 → `EXPIRING_30`, 31–60 → `EXPIRING_60`, 61–90 → `EXPIRING_90`, > 90 or no expiry → `VALID`.
- **SQL/Edge rule.** Never use `current_date` or `now()::date` (Supabase runs in UTC; between 00:00 and 03:00 Riyadh the UTC date is still yesterday). Use `(now() at time zone 'Asia/Riyadh')::date` in SQL, or call the shared clock module in Edge Functions.

