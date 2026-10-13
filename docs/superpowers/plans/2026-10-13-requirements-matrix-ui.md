# Requirements Matrix and Training Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user scope a course to Department/Job_Title roles and record a completion date per employee entirely inside the interface, so a manually added course no longer becomes `MISSING` for everybody.

**Architecture:** Three new stores (`requirements`, `training_records`, `requirements_approval`) are added to both backends behind the existing `getDbService()` surface. A new pure `mergeRequirements()` in `dataService.js` replaces the `mergeManualCourses()` broadcast and translates stored snake_case rows into the PascalCase keys `complianceEngine.js` already reads, so the engine itself is untouched. Writes are explicit at save time through a thin service layer, not through the existing reconciling `useEffect`.

**Tech Stack:** React 19, Vite, vitest 4 + jsdom + @testing-library/react, Supabase Postgres (row-level security), IndexedDB for the local backend.

**Spec:** `docs/superpowers/specs/2026-10-13-requirements-matrix-ui-design.md`

## Global Constraints

- Run tests with `npm test` (= `vitest run`). A single file: `npx vitest run tests/<file>.test.js`.
- Every new Postgres table carries `owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`, written with that **exact** spelling. `tests/supabaseBackend.test.js` counts occurrences of the string and expects one per table.
- Every new Postgres table gets `ENABLE ROW LEVEL SECURITY` plus four policies `TO authenticated USING (owner_id = auth.uid())`, created by the same `DO $$` loop style as `0001_init.sql`. Never `TO anon`, never `USING (true)`.
- The client never sends `owner_id`. `SupabaseDbService._table` already deletes it from every payload.
- A `service_role` key must never appear in any `VITE_`-prefixed variable: everything `VITE_` ships inside the browser bundle.
- `src/lib/complianceEngine.js` is not modified by any task in this plan.
- Every user-visible string goes through `src/lib/i18n.js` with both an `en` and an `ar` key. No literal text inside JSX.
- New components receive `t` as a prop. Do not copy `CourseManager.jsx:7`'s `const t = createI18n('en').t;`.
- IndexedDB `onupgradeneeded` only ever creates stores, each behind `if (!db.objectStoreNames.contains(...))`. Never call `deleteObjectStore`.
- Snake_case in storage (`course_code`, `job_title`, `validity_months`), PascalCase with underscores in engine-facing objects (`Course_Code`, `Job_Title`, `Validity_Months`).
- Commit after every task. Conventional prefixes: `feat:`, `fix:`, `test:`, `refactor:`.

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0002_requirements.sql` (create) | The three new Postgres tables, their indexes, RLS and policies |
| `src/lib/db/schema.sql` (modify) | The same three tables without `owner_id`, for the local/portable schema |
| `src/lib/db/dbService.js` (modify) | `LocalDbService` version `4`, three new object stores, three new method groups |
| `src/lib/db/supabaseDbService.js` (modify) | Three new `_table()` wirings plus the named lookups |
| `src/lib/contract/requirementsApproval.js` (create) | Pure approval state machine: draft → managed, edit-after-approval → draft + revision++ |
| `src/lib/contract/requirementsProvenance.js` (modify) | `MANAGED` and `DRAFT` values; `DRAFT` joins `TEST_PROVENANCES` |
| `src/lib/dataService.js` (modify) | `mergeRequirements()` in, `mergeManualCourses()` out |
| `src/lib/requirementsService.js` (create) | Database-touching functions: save/load requirements, add training records, replace on import |
| `src/components/RoleScopePicker.jsx` (create) | The roles-by-department checkbox tree used by `CourseManager` |
| `src/components/TrainingSessionForm.jsx` (create) | Batch and single-employee completion entry |
| `src/components/CourseManager.jsx` (modify) | The `appliesTo` field |
| `src/components/ComplianceTable.jsx` (modify) | A trailing edit column and the `onRecordEdit` prop |
| `src/components/ImportPanel.jsx` (modify) | The replace confirmation when the account is `managed` |
| `src/App.jsx` (modify) | State rename, `managedRequirements`, the `mergedRequirements` memo |
| `src/lib/i18n.js` (modify) | All new keys, `en` and `ar` |

New tests: `tests/requirementsApproval.test.js`, `tests/requirementsService.test.js`, `tests/roleScopePicker.test.js`, `tests/trainingSessionForm.test.js`. Extended: `tests/supabaseBackend.test.js`, `tests/dbService.test.js`, `tests/dataService.test.js`, `tests/complianceEngine.test.js`, `tests/productionAppIntegration.test.js`.

**Phase one is Tasks 1-12** and resolves the reported `9797 — JSA` bug on its own; in fact Task 6 ends the symptom and Task 10 restores the capability. Tasks 13 and 14 are phase two — recording a completion. Task 15 is a manual browser verification and cannot be replaced by a unit test.

---

### Task 1: The Postgres migration

**Files:**
- Create: `supabase/migrations/0002_requirements.sql`
- Modify: `src/lib/db/schema.sql` (append three tables at the end)
- Test: `tests/supabaseBackend.test.js:227-272` (the `describe('the migration')` block)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `requirements`, `training_records`, `requirements_approval` with the columns listed below. Task 3 and Task 4 wire the service layer to these exact column names.

- [ ] **Step 1: Make the migration test read every migration file, and expect nine tables**

The block currently reads only `0001_init.sql`, so a table defined in a later file would never be checked. Replace the `beforeEach` and the `TABLES` constant in `tests/supabaseBackend.test.js`:

```js
describe('the migration', () => {
  let sql;

  beforeEach(() => {
    // Every migration, concatenated. Reading only 0001 would let a later
    // migration define a table that escapes all of the checks below.
    const dir = resolve(process.cwd(), 'supabase/migrations');
    sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(dir, f), 'utf8'))
      .join('\n');
  });

  const TABLES = [
    'courses', 'certificates', 'departments', 'employees',
    'employee_contacts', 'reminders_sent',
    'requirements', 'training_records', 'requirements_approval',
  ];
```

Change the import on line 2 to:

```js
import { readFileSync, readdirSync } from 'node:fs';
```

And add one assertion inside the same block, after `'scopes every unique key to the account'`:

```js
  it('scopes the requirements key to the account', () => {
    expect(sql).toContain('UNIQUE (owner_id, department, job_title, course_code)');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/supabaseBackend.test.js -t "the migration"`
Expected: FAIL — `expected '...' to contain 'CREATE TABLE IF NOT EXISTS public.requirements'`, and the `owner_id` count is 6 against an expected 9.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0002_requirements.sql`:

```sql
-- Requirements matrix and training records
--
-- Adds the three tables that let a course be scoped to roles and a completion
-- be recorded, both from inside the interface. Same ownership model as
-- 0001_init.sql: owner_id defaults to auth.uid(), so the client never sends it.

-- ===== Requirements =====
-- One row per role per course. An empty job_title means every job title in
-- that department, including ones added later.
CREATE TABLE IF NOT EXISTS public.requirements (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  -- NOT NULL DEFAULT '' rather than nullable: a Postgres UNIQUE constraint
  -- does not constrain NULL, so two identical rows would both be accepted.
  job_title TEXT NOT NULL DEFAULT '',
  course_code TEXT NOT NULL,
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  validity_months INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, department, job_title, course_code)
);
-- Deliberately no foreign key to courses.code: an import may carry a
-- requirement for a course that was never registered, and rejecting it would
-- break the CSV path. The service layer warns instead.

-- ===== Training records =====
-- One row per completion. Deliberately no UNIQUE on (employee_id,
-- course_code): a renewal is a second legitimate row, and selectBestRecord
-- already picks the one with the latest valid expiry.
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

-- ===== Requirements approval =====
-- One row per account. revision increments on any edit after approval and the
-- status returns to draft, so an edited matrix is never read as approved.
CREATE TABLE IF NOT EXISTS public.requirements_approval (
  owner_id UUID NOT NULL DEFAULT auth.uid() PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'managed')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_requirements_owner ON public.requirements(owner_id);
CREATE INDEX IF NOT EXISTS idx_requirements_course ON public.requirements(owner_id, course_code);
CREATE INDEX IF NOT EXISTS idx_training_records_owner ON public.training_records(owner_id);
CREATE INDEX IF NOT EXISTS idx_training_records_employee ON public.training_records(owner_id, employee_id);

-- ===== Row-level security =====
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirements_approval ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'requirements', 'training_records', 'requirements_approval'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_owner_select', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_owner_insert', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_owner_update', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_owner_delete', target);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (owner_id = auth.uid())',
      target || '_owner_select', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid())',
      target || '_owner_insert', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())',
      target || '_owner_update', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (owner_id = auth.uid())',
      target || '_owner_delete', target);
  END LOOP;
END $$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/supabaseBackend.test.js -t "the migration"`
Expected: PASS, all seven assertions.

- [ ] **Step 5: Mirror the tables in the portable schema**

Append to `src/lib/db/schema.sql` — same columns, no `owner_id`, no policies:

```sql
-- Requirements matrix: one row per role per course. An empty job_title means
-- every job title in that department.
CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  department TEXT NOT NULL,
  job_title TEXT NOT NULL DEFAULT '',
  course_code TEXT NOT NULL,
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  validity_months INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (department, job_title, course_code)
);

-- One row per completion. No unique key: a renewal is a second legitimate row.
CREATE TABLE IF NOT EXISTS training_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  course_code TEXT NOT NULL,
  completion_status TEXT NOT NULL DEFAULT 'Completed',
  issue_date DATE,
  expiry_date DATE,
  certificate_number TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One row only: the approval state of this installation's matrix.
CREATE TABLE IF NOT EXISTS requirements_approval (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT,
  approved_at TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 1
);
```

- [ ] **Step 6: Run the whole suite and commit**

Run: `npm test`
Expected: PASS, no regression.

```bash
git add supabase/migrations/0002_requirements.sql src/lib/db/schema.sql tests/supabaseBackend.test.js
git commit -m "feat: add requirements, training_records and approval tables"
```

---

### Task 2: The IndexedDB upgrade

**Files:**
- Modify: `src/lib/db/dbService.js:86` (the version) and `:102-138` (`onupgradeneeded`)
- Test: `tests/dbService.test.js`

**Interfaces:**
- Consumes: Task 1's column names.
- Produces: three IndexedDB object stores named `requirements`, `training_records`, `requirements_approval`, keyed on `id`. Task 4 adds the methods that read them.

**Why the test is a source-text assertion:** `tests/dbService.test.js` runs in jsdom against an in-memory `MemoryDb` class. There is no real IndexedDB in the suite, so an actual version 3 → 4 upgrade cannot be exercised here. What the test can guarantee is that the upgrade code is *shaped* so it cannot destroy data. The real upgrade is verified by hand in Task 14.

- [ ] **Step 1: Write the failing test**

Append to `tests/dbService.test.js`:

```js
describe('the IndexedDB upgrade', () => {
  // The suite has no real IndexedDB, so this asserts the shape of the upgrade
  // code: an existing browser database must be extended, never rebuilt.
  const source = readFileSync(resolve(process.cwd(), 'src/lib/db/dbService.js'), 'utf8');

  it('declares version 4', () => {
    expect(source).toMatch(/this\.version\s*=\s*4/);
  });

  it('creates every store behind an existence guard', () => {
    const creates = source.match(/db\.createObjectStore\('([a-z_]+)'/g) ?? [];
    const guards = source.match(/db\.objectStoreNames\.contains\('([a-z_]+)'\)/g) ?? [];
    expect(creates).toHaveLength(9);
    expect(guards).toHaveLength(creates.length);
  });

  it('never deletes a store', () => {
    expect(source).not.toContain('deleteObjectStore');
  });

  it('creates the three new stores', () => {
    for (const store of ['requirements', 'training_records', 'requirements_approval']) {
      expect(source, store).toContain(`db.createObjectStore('${store}'`);
    }
  });
});
```

Add to the top of `tests/dbService.test.js`:

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dbService.test.js -t "the IndexedDB upgrade"`
Expected: FAIL — `this.version = 3` does not match `/this\.version\s*=\s*4/`, and the store count is 6 against an expected 9.

- [ ] **Step 3: Raise the version and add the stores**

In `src/lib/db/dbService.js`, replace the version comment and value at line 83:

```js
    // Version 2 added the employees store, version 3 the departments store,
    // version 4 the requirements matrix and the training records. Raising this
    // number is what runs onupgradeneeded for a browser that already holds an
    // older database. onupgradeneeded only ever creates, so nothing is lost.
    this.version = 4;
```

Add the three fields to the constructor, after `this.remindersSent = {};`:

```js
    this.requirements = {};
    this.trainingRecords = {};
    this.requirementsApproval = {};
```

Add the three stores inside `onupgradeneeded`, after the `reminders_sent` block:

```js
        if (!db.objectStoreNames.contains('requirements')) {
          const requirementStore = db.createObjectStore('requirements', { keyPath: 'id' });
          requirementStore.createIndex('course_code', 'course_code');
          requirementStore.createIndex('department', 'department');
        }

        if (!db.objectStoreNames.contains('training_records')) {
          const recordStore = db.createObjectStore('training_records', { keyPath: 'id' });
          recordStore.createIndex('employee_id', 'employee_id');
          recordStore.createIndex('course_code', 'course_code');
        }

        if (!db.objectStoreNames.contains('requirements_approval')) {
          db.createObjectStore('requirements_approval', { keyPath: 'id' });
        }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/dbService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/dbService.js tests/dbService.test.js
git commit -m "feat: raise the local database to version 4 for the matrix stores"
```

---

### Task 3: Wire the three tables into the Supabase backend

**Files:**
- Modify: `src/lib/db/supabaseDbService.js:46-67` (the `init()` body and the header comment)
- Test: `tests/supabaseBackend.test.js`

**Interfaces:**
- Consumes: Task 1's tables.
- Produces:
  - `db.requirements` — `add, get, list, update, delete`
  - `db.requirements.listByCourse(courseCode)` → `Promise<Array<row>>`
  - `db.trainingRecords` — `add, get, list, update, delete`
  - `db.trainingRecords.listByEmployee(employeeId)` → `Promise<Array<row>>`
  - `db.requirementsApproval` — `add, get, list, update, delete`

  Task 7 calls exactly these. `owner_id` is stripped by `_table`, which both backends rely on.

- [ ] **Step 1: Write the failing test**

Append to `tests/supabaseBackend.test.js`, using the existing `fakeClient` double:

```js
describe('the requirements tables', () => {
  it('exposes the three new stores', async () => {
    const db = await new SupabaseDbService(fakeClient({})).init();
    for (const group of ['requirements', 'trainingRecords', 'requirementsApproval']) {
      expect(db[group], group).toBeTruthy();
      expect(typeof db[group].add, group).toBe('function');
      expect(typeof db[group].list, group).toBe('function');
    }
  });

  it('never sends owner_id, so the database fills it in', async () => {
    const client = fakeClient({});
    const db = await new SupabaseDbService(client).init();
    await db.requirements.add({
      id: 'req_1', owner_id: 'forged', department: 'Operations',
      job_title: 'Operator', course_code: 'H2S', mandatory: true,
    });
    const inserted = client.calls.find((c) => c.method === 'insert');
    expect(inserted.args[0]).not.toHaveProperty('owner_id');
    expect(inserted.args[0].department).toBe('Operations');
  });

  it('lists the requirements of one course', async () => {
    const client = fakeClient({});
    const db = await new SupabaseDbService(client).init();
    await db.requirements.listByCourse('H2S');
    const filtered = client.calls.find((c) => c.method === 'eq');
    expect(filtered.args).toEqual(['course_code', 'H2S']);
  });
});
```

If `fakeClient` does not already record a `calls` array of `{ method, args }`, read its definition at `tests/supabaseBackend.test.js:1-46` and use whatever recording shape it provides; do not change the double's contract, because the existing tests depend on it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/supabaseBackend.test.js -t "the requirements tables"`
Expected: FAIL — `expected undefined to be truthy` for `db.requirements`.

- [ ] **Step 3: Wire them in `init()`**

In `src/lib/db/supabaseDbService.js`, add to the constructor after `this.remindersSent = {};`:

```js
    this.requirements = {};
    this.trainingRecords = {};
    this.requirementsApproval = {};
```

Add to `init()` after the `remindersSent` line:

```js
    this.requirements = this._table('requirements', { uniqueColumn: 'course_code' });
    this.trainingRecords = this._table('training_records', { uniqueColumn: 'id' });
    this.requirementsApproval = this._table('requirements_approval', { uniqueColumn: 'owner_id' });
```

`uniqueColumn` here only decides whether `update` and `delete` exist — all three need them, so any non-null value works; the column named is the one that identifies a row for a human reader.

Add the named lookups beside the existing ones:

```js
    this.requirements.listByCourse = async (courseCode) =>
      unwrap(await this.client.from('requirements').select('*').eq('course_code', courseCode)) ?? [];
    this.trainingRecords.listByEmployee = async (employeeId) =>
      unwrap(await this.client.from('training_records').select('*').eq('employee_id', employeeId)) ?? [];
```

Extend the header comment's surface list:

```js
 *   requirements:        add, get, list, update, delete, listByCourse
 *   trainingRecords:     add, get, list, update, delete, listByEmployee
 *   requirementsApproval: add, get, list, update, delete
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/supabaseBackend.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/supabaseDbService.js tests/supabaseBackend.test.js
git commit -m "feat: expose the requirements tables on the Supabase backend"
```

---

### Task 4: The same three stores on the local backend

**Files:**
- Modify: `src/lib/db/dbService.js` (three new `_init*` methods, called from `init()`)
- Test: `tests/dbService.test.js`

**Interfaces:**
- Consumes: Task 2's object stores.
- Produces: the identical surface Task 3 produced on the Supabase side — `db.requirements` (`add, get, list, update, delete, listByCourse`), `db.trainingRecords` (`add, get, list, update, delete, listByEmployee`), `db.requirementsApproval` (`add, get, list, update, delete`). Task 7 is written against this surface and must not care which backend answers.

- [ ] **Step 1: Write the failing test**

The suite has no real IndexedDB, so extend the existing `MemoryDb` double in `tests/dbService.test.js` with the three stores and assert the surfaces match. Add to `MemoryDb`'s `constructor`, inside `this.stores`:

```js
      requirements: new Map(),
      training_records: new Map(),
      requirements_approval: new Map(),
```

Then append a new describe block:

```js
describe('the local and cloud surfaces agree', () => {
  // dataService.js must not know which backend answers, so the two services
  // have to expose the same method names for the new stores.
  const source = readFileSync(resolve(process.cwd(), 'src/lib/db/dbService.js'), 'utf8');

  it('initializes the three new method groups', () => {
    expect(source).toContain('this._initRequirements()');
    expect(source).toContain('this._initTrainingRecords()');
    expect(source).toContain('this._initRequirementsApproval()');
  });

  it('exposes listByCourse and listByEmployee', () => {
    expect(source).toContain('listByCourse');
    expect(source).toContain('listByEmployee');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dbService.test.js -t "surfaces agree"`
Expected: FAIL — `expected '...' to contain 'this._initRequirements()'`.

- [ ] **Step 3: Add the three method groups**

In `src/lib/db/dbService.js`, call them at the end of `init()`:

```js
    this._initRequirements();
    this._initTrainingRecords();
    this._initRequirementsApproval();
```

Then add the methods. They follow the verbose hand-written transaction style the file already uses, so the diff reads like its neighbours:

```js
  _initRequirements() {
    this.requirements = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readwrite');
          const request = tx.objectStore('requirements')
            .add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readonly');
          const request = tx.objectStore('requirements').get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readonly');
          const request = tx.objectStore('requirements').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      listByCourse: async (courseCode) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readonly');
          const request = tx.objectStore('requirements').index('course_code').getAll(courseCode);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readwrite');
          const request = tx.objectStore('requirements')
            .put({ ...data, id, updated_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readwrite');
          const request = tx.objectStore('requirements').delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initTrainingRecords() {
    this.trainingRecords = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readwrite');
          const request = tx.objectStore('training_records')
            .add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readonly');
          const request = tx.objectStore('training_records').get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readonly');
          const request = tx.objectStore('training_records').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      listByEmployee: async (employeeId) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readonly');
          const request = tx.objectStore('training_records').index('employee_id').getAll(employeeId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readwrite');
          const request = tx.objectStore('training_records')
            .put({ ...data, id, updated_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readwrite');
          const request = tx.objectStore('training_records').delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initRequirementsApproval() {
    this.requirementsApproval = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readwrite');
          const request = tx.objectStore('requirements_approval').put({ ...data });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readonly');
          const request = tx.objectStore('requirements_approval').get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readonly');
          const request = tx.objectStore('requirements_approval').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readwrite');
          const request = tx.objectStore('requirements_approval').put({ ...data, id });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readwrite');
          const request = tx.objectStore('requirements_approval').delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }
```

`requirementsApproval.add` uses `put`, not `add`: there is exactly one approval row per installation, and saving it twice must overwrite rather than throw.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/dbService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/dbService.js tests/dbService.test.js
git commit -m "feat: expose the requirements tables on the local backend"
```

---

### Task 5: The approval state machine and the two new provenances

**Files:**
- Create: `src/lib/contract/requirementsApproval.js`
- Modify: `src/lib/contract/requirementsProvenance.js`
- Test: `tests/requirementsApproval.test.js` (create)

**Interfaces:**
- Consumes: `REQUIREMENTS_PROVENANCE` from `requirementsProvenance.js`.
- Produces:
  - `createApproval()` → `{ status: 'draft', approvedBy: null, approvedAt: null, revision: 1 }`
  - `approve(state, { approvedBy, approvedAt })` → a new state with `status: 'managed'`
  - `markEdited(state)` → `managed` becomes `draft` with `revision + 1`; `draft` is returned unchanged
  - `provenanceForApproval(state)` → `'managed'` or `'draft'`
  - `REQUIREMENTS_PROVENANCE.MANAGED` = `'managed'`, `.DRAFT` = `'draft'`

  Task 7 persists this state; Task 11 reads `provenanceForApproval` to decide whether the import needs a confirmation.

**Why pure:** every other module in `src/lib/contract/` has no clock, no storage and no network, which is what makes the contract rules testable. `approvedAt` is therefore a parameter, never `new Date()`.

- [ ] **Step 1: Write the failing test**

Create `tests/requirementsApproval.test.js`:

```js
import { describe, it, expect } from 'vitest';

import {
  createApproval,
  approve,
  markEdited,
  provenanceForApproval,
} from '../src/lib/contract/requirementsApproval.js';
import {
  REQUIREMENTS_PROVENANCE,
  TEST_PROVENANCES,
  isTestRequirements,
  resolveRequirementsProvenance,
} from '../src/lib/contract/requirementsProvenance.js';

describe('createApproval', () => {
  it('starts as an unapproved first revision', () => {
    expect(createApproval()).toEqual({
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      revision: 1,
    });
  });
});

describe('approve', () => {
  it('records who approved it and when', () => {
    const state = approve(createApproval(), {
      approvedBy: 'Hassan Ali',
      approvedAt: '2026-10-13T09:00:00.000Z',
    });

    expect(state.status).toBe('managed');
    expect(state.approvedBy).toBe('Hassan Ali');
    expect(state.approvedAt).toBe('2026-10-13T09:00:00.000Z');
    expect(state.revision).toBe(1);
  });

  it('does not mutate the state it was given', () => {
    const before = createApproval();
    approve(before, { approvedBy: 'A', approvedAt: '2026-10-13T09:00:00.000Z' });

    expect(before.status).toBe('draft');
  });

  it('refuses an approval with no approver named', () => {
    expect(() => approve(createApproval(), { approvedAt: '2026-10-13T09:00:00.000Z' }))
      .toThrow(/approver/i);
  });
});

describe('markEdited', () => {
  it('returns an approved matrix to draft and increments the revision', () => {
    const approved = approve(createApproval(), {
      approvedBy: 'Hassan Ali',
      approvedAt: '2026-10-13T09:00:00.000Z',
    });
    const edited = markEdited(approved);

    expect(edited.status).toBe('draft');
    expect(edited.revision).toBe(2);
    // The previous approval is cleared, so it can never be printed as current.
    expect(edited.approvedBy).toBeNull();
    expect(edited.approvedAt).toBeNull();
  });

  it('leaves a draft alone, so editing a draft does not inflate the revision', () => {
    const draft = createApproval();
    expect(markEdited(draft)).toEqual(draft);
  });
});

describe('provenanceForApproval', () => {
  it('maps the two states onto the two provenances', () => {
    expect(provenanceForApproval(createApproval())).toBe(REQUIREMENTS_PROVENANCE.DRAFT);
    const approved = approve(createApproval(), {
      approvedBy: 'A', approvedAt: '2026-10-13T09:00:00.000Z',
    });
    expect(provenanceForApproval(approved)).toBe(REQUIREMENTS_PROVENANCE.MANAGED);
  });
});

describe('the new provenances', () => {
  it('banners a draft matrix but not a managed one', () => {
    expect(isTestRequirements(REQUIREMENTS_PROVENANCE.DRAFT)).toBe(true);
    expect(isTestRequirements(REQUIREMENTS_PROVENANCE.MANAGED)).toBe(false);
  });

  it('keeps managed distinct from approved', () => {
    // MANAGED carries no banner, but it is not an HSE-DC-1.0 approval either.
    expect(REQUIREMENTS_PROVENANCE.MANAGED).not.toBe(REQUIREMENTS_PROVENANCE.APPROVED);
    expect(TEST_PROVENANCES).not.toContain(REQUIREMENTS_PROVENANCE.MANAGED);
  });

  it('still lets a derived row override a managed declaration', () => {
    const rows = [{ Department: 'Operations', Job_Title: 'Operator', Derived: true }];
    expect(resolveRequirementsProvenance(rows, REQUIREMENTS_PROVENANCE.MANAGED))
      .toBe(REQUIREMENTS_PROVENANCE.DERIVED);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/requirementsApproval.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/contract/requirementsApproval.js"`.

- [ ] **Step 3: Write the module**

Create `src/lib/contract/requirementsApproval.js`:

```js
/**
 * The approval state of a requirements matrix built inside the interface.
 *
 * A matrix entered by hand is not an approved `HSE-DC-1.0` sheet, so it cannot
 * carry the same weight. It starts as a draft and carries the test banner. An
 * explicit internal approval — an approver's name and a timestamp — moves it
 * to `managed`: no banner, but reports print who approved it rather than
 * claiming the data contract.
 *
 * Any edit after an approval returns the matrix to `draft` and increments the
 * revision, so an edited matrix can never be read as an approved one.
 *
 * Pure module: no clock, no storage, no network. `approvedAt` is a parameter.
 */

import { REQUIREMENTS_PROVENANCE } from './requirementsProvenance.js';

/** A fresh, unapproved matrix. */
export function createApproval() {
  return { status: 'draft', approvedBy: null, approvedAt: null, revision: 1 };
}

/**
 * Approve a matrix internally.
 * @param {object} state - the current approval state
 * @param {{approvedBy: string, approvedAt: string}} by - approver and ISO timestamp
 * @returns {object} a new state
 */
export function approve(state, { approvedBy, approvedAt } = {}) {
  if (!approvedBy || !String(approvedBy).trim()) {
    throw new Error('An approval needs a named approver');
  }
  return {
    ...state,
    status: 'managed',
    approvedBy: String(approvedBy).trim(),
    approvedAt: approvedAt ?? null,
  };
}

/**
 * Record that a row changed. An approved matrix returns to draft; a draft is
 * already unapproved, so editing it changes nothing and does not inflate the
 * revision number.
 */
export function markEdited(state) {
  if (state.status !== 'managed') return state;
  return {
    status: 'draft',
    approvedBy: null,
    approvedAt: null,
    revision: state.revision + 1,
  };
}

/** The provenance this state declares. */
export function provenanceForApproval(state) {
  return state?.status === 'managed'
    ? REQUIREMENTS_PROVENANCE.MANAGED
    : REQUIREMENTS_PROVENANCE.DRAFT;
}
```

- [ ] **Step 4: Add the two provenances**

In `src/lib/contract/requirementsProvenance.js`, extend the frozen object and `TEST_PROVENANCES`:

```js
export const REQUIREMENTS_PROVENANCE = Object.freeze({
  NONE: 'none',
  APPROVED: 'approved',
  MANAGED: 'managed',   // a matrix built in the interface, internally approved
  DRAFT: 'draft',       // a matrix built in the interface, before approval
  DERIVED: 'derived',
  DEMO: 'demo',
  LEGACY: 'legacy',
});

/** Provenances that do not carry approved production requirements. */
export const TEST_PROVENANCES = Object.freeze([
  REQUIREMENTS_PROVENANCE.DRAFT,
  REQUIREMENTS_PROVENANCE.DERIVED,
  REQUIREMENTS_PROVENANCE.DEMO,
  REQUIREMENTS_PROVENANCE.LEGACY,
]);
```

And add two cases to `provenanceMessageKey`, before `default`:

```js
    case REQUIREMENTS_PROVENANCE.DRAFT:
      return 'trqDraft';
    case REQUIREMENTS_PROVENANCE.MANAGED:
      return 'trqManaged';
```

`MANAGED` is not in `TEST_PROVENANCES`, so it carries no banner; the key exists because the report prints a source line for it. Task 9 adds `trqDraft` and `trqManaged` to `i18n.js`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/requirementsApproval.test.js tests/testRequirementsBanner.test.js`
Expected: PASS. If an existing provenance test asserts the exact length of `TEST_PROVENANCES`, update that number to 4 — the addition of `DRAFT` is intended.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contract/requirementsApproval.js src/lib/contract/requirementsProvenance.js tests/requirementsApproval.test.js
git commit -m "feat: add the managed and draft provenances with an approval state machine"
```

---

### Task 6: `mergeRequirements` replaces the broadcast

**Files:**
- Modify: `src/lib/dataService.js:218-276` (delete `mergeManualCourses`, add `mergeRequirements`)
- Test: `tests/dataService.test.js:304-425` (replace the `mergeManualCourses` describe) and `:504-531` (two tests in the `mergeManualEmployees` block that call it)

**Interfaces:**
- Consumes: Task 1's column names on the `managedRows` argument.
- Produces: `mergeRequirements(importedRows, managedRows, people, courses)` → `Array<{Department, Job_Title, Course_Code, Course_Name, Mandatory, Validity_Months, Description}>`. Task 8 calls it from `App.jsx`. The engine reads these exact PascalCase keys at `complianceEngine.js:148`.

**The four arguments, and why:**
- `importedRows` — already PascalCase, passed through untouched. An imported row always wins over a managed row for the same role and course.
- `managedRows` — snake_case rows from the `requirements` table, needing translation.
- `people` — the source of the job titles in a department, needed to expand `job_title: ''`. The engine compares `r.Job_Title === emp.Job_Title` by equality, so an empty string matches nobody.
- `courses` — the catalogue, needed for `Course_Name` and a fallback `Validity_Months`, neither of which the `requirements` table stores.

The difference from the deleted broadcast is the scope of the expansion: `mergeManualCourses` expanded a course to *every* role it could find anywhere; `mergeRequirements` expands only within the one department the row names.

- [ ] **Step 1: Write the failing test**

Replace the whole `describe('mergeManualCourses', ...)` block in `tests/dataService.test.js` with:

```js
  describe('mergeRequirements', () => {
    const people = [
      { Employee_ID: 'EMP001', Department: 'Operations', Job_Title: 'Operator' },
      { Employee_ID: 'EMP002', Department: 'Operations', Job_Title: 'Supervisor' },
      { Employee_ID: 'EMP003', Department: 'Maintenance', Job_Title: 'Technician' },
    ];
    const courses = [
      { code: 'H2S', name: 'H2S Awareness', mandatory: true, validityMonths: 24 },
    ];

    it('returns the imported rows untouched when there is no managed matrix', () => {
      const imported = [{ Department: 'Operations', Job_Title: 'Operator', Course_Code: 'FA' }];
      expect(mergeRequirements(imported, [], people, courses)).toEqual(imported);
    });

    it('scopes a course to the one role it was assigned to', () => {
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: 'Operator',
        course_code: 'H2S', mandatory: true, validity_months: null,
      }];
      const merged = mergeRequirements([], managed, people, courses);

      expect(merged).toHaveLength(1);
      expect(merged[0].Department).toBe('Operations');
      expect(merged[0].Job_Title).toBe('Operator');
      expect(merged[0].Course_Code).toBe('H2S');
    });

    it('expands an empty job title to that department only', () => {
      // This is the fix for the 9797 bug: a department-wide row must not reach
      // Maintenance.
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: '',
        course_code: 'H2S', mandatory: true, validity_months: null,
      }];
      const merged = mergeRequirements([], managed, people, courses);
      const titles = merged.map(r => r.Job_Title).sort();

      expect(titles).toEqual(['Operator', 'Supervisor']);
      expect(merged.every(r => r.Department === 'Operations')).toBe(true);
      expect(merged.some(r => r.Department === 'Maintenance')).toBe(false);
    });

    it('fills the course name and validity from the catalogue', () => {
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: 'Operator',
        course_code: 'H2S', mandatory: true, validity_months: null,
      }];
      const [row] = mergeRequirements([], managed, people, courses);

      expect(row.Course_Name).toBe('H2S Awareness');
      expect(row.Validity_Months).toBe(24);
    });

    it('lets the row override the catalogue validity', () => {
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: 'Operator',
        course_code: 'H2S', mandatory: true, validity_months: 6,
      }];
      const [row] = mergeRequirements([], managed, people, courses);

      expect(row.Validity_Months).toBe(6);
    });

    it('keeps the imported row when both sources name the same role and course', () => {
      const imported = [{
        Department: 'Operations', Job_Title: 'Operator',
        Course_Code: 'H2S', Course_Name: 'From the approved sheet', Mandatory: true,
      }];
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: 'Operator',
        course_code: 'H2S', mandatory: false, validity_months: 6,
      }];
      const merged = mergeRequirements(imported, managed, people, courses);

      expect(merged).toHaveLength(1);
      expect(merged[0].Course_Name).toBe('From the approved sheet');
    });

    it('matches a course code case-insensitively when deduplicating', () => {
      const imported = [{ Department: 'Operations', Job_Title: 'Operator', Course_Code: 'h2s' }];
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: 'Operator',
        course_code: 'H2S', mandatory: true, validity_months: null,
      }];
      expect(mergeRequirements(imported, managed, people, courses)).toHaveLength(1);
    });

    it('drops a department-wide row when nobody works in that department', () => {
      const managed = [{
        id: 'req_1', department: 'Inspection', job_title: '',
        course_code: 'H2S', mandatory: true, validity_months: null,
      }];
      expect(mergeRequirements([], managed, people, courses)).toEqual([]);
    });

    it('keeps a named role even when nobody holds it yet', () => {
      // A requirement for a role that has no employee is not an error: it is a
      // requirement waiting for a hire. Only the empty-job_title expansion
      // depends on the people.
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: 'Night Operator',
        course_code: 'H2S', mandatory: true, validity_months: null,
      }];
      expect(mergeRequirements([], managed, people, courses)).toHaveLength(1);
    });

    it('does not mutate the arrays it was given', () => {
      const imported = [{ Department: 'Operations', Job_Title: 'Operator', Course_Code: 'FA' }];
      const managed = [{
        id: 'req_1', department: 'Operations', job_title: 'Operator',
        course_code: 'H2S', mandatory: true, validity_months: null,
      }];
      mergeRequirements(imported, managed, people, courses);

      expect(imported).toHaveLength(1);
      expect(managed).toHaveLength(1);
    });

    it('survives null arguments', () => {
      expect(mergeRequirements(null, null, null, null)).toEqual([]);
    });
  });
```

Change the import at `tests/dataService.test.js:10` from `mergeManualCourses,` to `mergeRequirements,`.

Then fix the two tests inside the `mergeManualEmployees` block (around lines 504-531) that build their requirements with the deleted function. Replace both `mergeManualCourses([], [{ code: 'MAN001', ... }], people)` calls with a managed row for the department the manual employee is in:

```js
      const requirements = mergeRequirements(
        [],
        [{
          id: 'req_man', department: 'Inspection', job_title: '',
          course_code: 'MAN001', mandatory: true, validity_months: 12,
        }],
        people,
        [{ code: 'MAN001', name: 'Manual Course', mandatory: true, validityMonths: 12 }],
      );
```

Those two tests keep asserting exactly what they asserted before — that a manually added employee brings a new department into the universe, and that the employee is reported as missing the course — which is still true, now through the matrix instead of the broadcast.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dataService.test.js`
Expected: FAIL — `mergeRequirements is not a function`.

- [ ] **Step 3: Replace the function**

In `src/lib/dataService.js`, delete `mergeManualCourses` entirely (its JSDoc block and body, lines 218-276) and put this in its place:

```js
/**
 * Merge the requirements matrix built in the interface into the imported one.
 *
 * Two translations the compliance engine needs:
 *
 * - A stored row with an empty `job_title` means every job title in that
 *   department. The engine compares `r.Job_Title === emp.Job_Title` by
 *   equality (complianceEngine.js:148), so the row is expanded into one row
 *   per job title present in that department. `people` is where those job
 *   titles come from. The expansion is confined to the named department.
 * - Stored rows are snake_case; the engine reads PascalCase. `Course_Name` and
 *   a fallback `Validity_Months` come from the courses catalogue, because the
 *   requirements table does not store a course name.
 *
 * An imported row wins: a managed row for the same role and course is
 * skipped, so an approved HSE-DC-1.0 sheet is never overridden by hand-entry.
 *
 * Pure function. The engine itself is not touched.
 *
 * @param {array} importedRows - requirements from an import, already PascalCase
 * @param {array} managedRows - rows from the requirements table (snake_case)
 * @param {array} people - employees or records carrying Department/Job_Title
 * @param {array} courses - catalogue: [{code, name, mandatory, validityMonths, description}]
 * @returns {array} requirements rows the compliance engine can read
 */
export function mergeRequirements(importedRows, managedRows, people = [], courses = []) {
  const imported = Array.isArray(importedRows) ? importedRows : [];
  const managed = Array.isArray(managedRows) ? managedRows : [];
  if (managed.length === 0) return imported;

  const merged = [...imported];

  // Department → the job titles actually present in it.
  const titlesByDepartment = new Map();
  for (const person of people ?? []) {
    if (!person?.Department) continue;
    const titles = titlesByDepartment.get(person.Department) ?? new Set();
    if (person.Job_Title) titles.add(person.Job_Title);
    titlesByDepartment.set(person.Department, titles);
  }

  const catalogue = new Map(
    (courses ?? [])
      .filter(course => course?.code)
      .map(course => [course.code.toUpperCase(), course]),
  );

  const has = (department, jobTitle, codeUpper) => merged.some(
    row => row.Department === department
      && (row.Job_Title ?? '') === jobTitle
      && row.Course_Code
      && row.Course_Code.toUpperCase() === codeUpper,
  );

  for (const row of managed) {
    if (!row?.department || !row?.course_code) continue;
    const codeUpper = row.course_code.toUpperCase();
    const course = catalogue.get(codeUpper);

    const targets = row.job_title
      ? [row.job_title]
      : Array.from(titlesByDepartment.get(row.department) ?? []);

    for (const jobTitle of targets) {
      if (has(row.department, jobTitle, codeUpper)) continue;
      merged.push({
        Department: row.department,
        Job_Title: jobTitle,
        Course_Code: row.course_code,
        Course_Name: course?.name ?? row.course_code,
        Mandatory: Boolean(row.mandatory),
        Validity_Months: row.validity_months ?? course?.validityMonths ?? 12,
        Description: course?.description || '',
      });
    }
  }

  return merged;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/dataService.test.js`
Expected: PASS, including the two repaired `mergeManualEmployees` tests.

- [ ] **Step 5: Swap the call site, so the build is not left broken**

`src/App.jsx:12` still imports the deleted function. Change that import line from `mergeManualCourses,` to `mergeRequirements,`, add one piece of state next to the others (near `src/App.jsx:85`):

```js
  // The requirements matrix built in the interface. Loaded from the database
  // in the effect below; the imported matrix stays in `requirements`.
  const [managedRequirements, setManagedRequirements] = useState([]);
```

and replace the memo at `src/App.jsx:308-311`:

```js
  // The matrix the engine reads: the imported rows plus the rows built in the
  // interface. See mergeRequirements.
  const mergedRequirements = useMemo(
    () => mergeRequirements(requirements, managedRequirements, mergedPeople, manualCourses),
    [requirements, managedRequirements, mergedPeople, manualCourses],
  );
```

`setManagedRequirements` is unused until Task 8 loads the rows. That is deliberate: this step exists only to keep `main` buildable at every commit.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: both PASS. A manually added course now requires nobody until it is scoped — which is the intended new behaviour and the end of the `9797` symptom.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dataService.js src/App.jsx tests/dataService.test.js
git commit -m "refactor: replace the manual-course broadcast with mergeRequirements"
```

---

### Task 7: The service layer

**Files:**
- Create: `src/lib/requirementsService.js`
- Test: `tests/requirementsService.test.js` (create)

**Interfaces:**
- Consumes: `getDbService()` from `src/lib/db/dbService.js`, giving `db.requirements` and `db.trainingRecords` as wired in Tasks 3 and 4.
- Produces:
  - `loadRequirementsFromDb()` → `Promise<Array<row>>` (snake_case rows, straight from the table)
  - `saveRequirementsForCourse(courseCode, appliesTo)` → `Promise<{success, added, removed, error?}>`, where `appliesTo` is `Array<{department, jobTitle}>`
  - `addTrainingRecords({courseCode, issueDate, expiryDate, certificateNumber, completionStatus, employeeIds}, courses)` → `Promise<{success, records, error?}>`
  - `replaceRequirements(rows)` → `Promise<{success, removed, added}>`
  - `computeExpiryDate(issueDate, validityMonths)` → `'YYYY-MM-DD'` or `null`

  Task 8 calls `loadRequirementsFromDb`; Task 10 calls `saveRequirementsForCourse`; Task 12 calls `addTrainingRecords`; Task 11 calls `replaceRequirements`.

**Why `vi.mock`:** there is no `setDbService` injection seam — `getDbService()` reads a module-level `dbInstance`. So the test mocks the module. Do not add an injection seam for this; it would be a change to a shipped surface for a test's convenience.

**Why not the reconciling `useEffect`:** the existing course-persistence effect (`src/App.jsx:185`) rewrites every row it knows about on every change, tracked by a `loadedCourses` Set. A matrix can hold hundreds of rows, so repeating that pattern would write the whole matrix on every keystroke. `saveRequirementsForCourse` computes the difference and writes only what changed.

- [ ] **Step 1: Write the failing test**

Create `tests/requirementsService.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// There is no injection seam: getDbService() reads a module-level instance.
vi.mock('../src/lib/db/dbService.js', () => ({
  getDbService: () => globalThis.__testDb,
}));

const {
  loadRequirementsFromDb,
  saveRequirementsForCourse,
  addTrainingRecords,
  replaceRequirements,
  computeExpiryDate,
} = await import('../src/lib/requirementsService.js');

/** A minimal stand-in for the two stores the service touches. */
function fakeDb(requirementRows = []) {
  const requirements = new Map(requirementRows.map(r => [r.id, r]));
  const trainingRecords = new Map();
  return {
    requirements: {
      list: async () => Array.from(requirements.values()),
      listByCourse: async (code) =>
        Array.from(requirements.values()).filter(r => r.course_code === code),
      add: async (row) => { requirements.set(row.id, row); return row; },
      delete: async (id) => { requirements.delete(id); },
    },
    trainingRecords: {
      list: async () => Array.from(trainingRecords.values()),
      add: async (row) => { trainingRecords.set(row.id, row); return row; },
    },
    _requirements: requirements,
    _trainingRecords: trainingRecords,
  };
}

beforeEach(() => {
  globalThis.__testDb = fakeDb();
});

describe('saveRequirementsForCourse', () => {
  it('writes one row per selected role', async () => {
    const result = await saveRequirementsForCourse('H2S', [
      { department: 'Operations', jobTitle: 'Operator' },
      { department: 'Maintenance', jobTitle: 'Technician' },
    ]);

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);
    expect(globalThis.__testDb._requirements.size).toBe(2);
  });

  it('writes an empty job title for a whole department', async () => {
    await saveRequirementsForCourse('H2S', [{ department: 'Operations', jobTitle: '' }]);
    const [row] = Array.from(globalThis.__testDb._requirements.values());

    expect(row.department).toBe('Operations');
    expect(row.job_title).toBe('');
    expect(row.course_code).toBe('H2S');
  });

  it('writes only the difference, leaving an unchanged row alone', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_keep', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const result = await saveRequirementsForCourse('H2S', [
      { department: 'Operations', jobTitle: 'Operator' },
      { department: 'Operations', jobTitle: 'Supervisor' },
    ]);

    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
    expect(globalThis.__testDb._requirements.has('req_keep')).toBe(true);
  });

  it('deletes the row of a role that was unselected', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_gone', department: 'Maintenance', job_title: 'Technician', course_code: 'H2S' },
    ]);
    const result = await saveRequirementsForCourse('H2S', [
      { department: 'Operations', jobTitle: 'Operator' },
    ]);

    expect(result.removed).toBe(1);
    expect(globalThis.__testDb._requirements.has('req_gone')).toBe(false);
  });

  it('removes every row when nothing is selected, so a course requires nobody', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_1', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const result = await saveRequirementsForCourse('H2S', []);

    expect(result.removed).toBe(1);
    expect(globalThis.__testDb._requirements.size).toBe(0);
  });

  it('never touches another course\'s rows', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_other', department: 'Operations', job_title: 'Operator', course_code: 'FA' },
    ]);
    await saveRequirementsForCourse('H2S', []);

    expect(globalThis.__testDb._requirements.has('req_other')).toBe(true);
  });
});

describe('computeExpiryDate', () => {
  it('adds the validity in months', () => {
    expect(computeExpiryDate('2026-10-13', 24)).toBe('2028-10-13');
  });

  it('rolls a short month back to its last day', () => {
    // 31 January plus one month is not 31 February.
    expect(computeExpiryDate('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('returns null without a validity, so a course with no expiry has none', () => {
    expect(computeExpiryDate('2026-10-13', null)).toBeNull();
    expect(computeExpiryDate('', 12)).toBeNull();
  });
});

describe('addTrainingRecords', () => {
  const courses = [{ code: 'H2S', name: 'H2S Awareness', validityMonths: 24 }];

  it('writes one record per attendee', async () => {
    const result = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13',
      employeeIds: ['EMP001', 'EMP002'],
    }, courses);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(globalThis.__testDb._trainingRecords.size).toBe(2);
  });

  it('computes the expiry from the course validity', async () => {
    const { records } = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13', employeeIds: ['EMP001'],
    }, courses);

    expect(records[0].expiry_date).toBe('2028-10-13');
  });

  it('honours a manual expiry override', async () => {
    const { records } = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13', expiryDate: '2027-01-01',
      employeeIds: ['EMP001'],
    }, courses);

    expect(records[0].expiry_date).toBe('2027-01-01');
  });

  it('marks the source as manual, so an import can be told apart', async () => {
    const { records } = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13', employeeIds: ['EMP001'],
    }, courses);

    expect(records[0].source).toBe('manual');
    expect(records[0].completion_status).toBe('Completed');
  });

  it('refuses a record with no course or no attendee', async () => {
    expect((await addTrainingRecords({ courseCode: '', employeeIds: ['EMP001'] }, courses)).success)
      .toBe(false);
    expect((await addTrainingRecords({ courseCode: 'H2S', employeeIds: [] }, courses)).success)
      .toBe(false);
  });
});

describe('replaceRequirements', () => {
  it('removes every existing row before writing the new ones', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_old', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const result = await replaceRequirements([
      { department: 'Logistics', job_title: 'Driver', course_code: 'DEF' },
    ]);

    expect(result.removed).toBe(1);
    expect(result.added).toBe(1);
    expect(globalThis.__testDb._requirements.has('req_old')).toBe(false);
  });

  it('leaves the training records untouched: those are completions, not requirements', async () => {
    globalThis.__testDb = fakeDb();
    await globalThis.__testDb.trainingRecords.add({ id: 'rec_1', employee_id: 'EMP001' });
    await replaceRequirements([]);

    expect(globalThis.__testDb._trainingRecords.has('rec_1')).toBe(true);
  });
});

describe('loadRequirementsFromDb', () => {
  it('returns the stored rows unchanged, snake_case and all', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_1', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const rows = await loadRequirementsFromDb();

    expect(rows).toHaveLength(1);
    expect(rows[0].job_title).toBe('Operator');
  });

  it('returns an empty array when the database is unreachable', async () => {
    globalThis.__testDb = { requirements: { list: async () => { throw new Error('offline'); } } };
    expect(await loadRequirementsFromDb()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/requirementsService.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/requirementsService.js"`.

- [ ] **Step 3: Write the service**

Create `src/lib/requirementsService.js`:

```js
/**
 * Reads and writes for the requirements matrix and the training records.
 *
 * Writes are explicit, at save time, and only of what changed. The existing
 * course-persistence effect in App.jsx reconciles its whole collection on
 * every change, which is fine for a handful of courses and wrong for a matrix
 * of hundreds of rows.
 *
 * owner_id is never set here: the database fills it in and row-level security
 * rejects anything else. See supabase/migrations/0002_requirements.sql.
 */

import { getDbService } from './db/dbService.js';

/** "Operations|Operator" — the key the engine's equality comparison implies. */
function roleKey(department, jobTitle) {
  return `${department}|${jobTitle ?? ''}`;
}

/**
 * Every requirement row stored for this account, snake_case as stored.
 * Returns an empty array when the database cannot be read, so a cloud outage
 * degrades to the imported matrix instead of blocking the dashboard.
 */
export async function loadRequirementsFromDb() {
  try {
    const db = getDbService();
    return (await db.requirements.list()) ?? [];
  } catch (err) {
    console.warn('Failed to load the requirements matrix:', err.message);
    return [];
  }
}

/**
 * Make `appliesTo` the complete set of roles that need this course.
 *
 * @param {string} courseCode
 * @param {Array<{department: string, jobTitle: string}>} appliesTo - an empty
 *   jobTitle means the whole department
 * @returns {Promise<{success: boolean, added: number, removed: number, error?: string}>}
 */
export async function saveRequirementsForCourse(courseCode, appliesTo = []) {
  if (!courseCode) return { success: false, added: 0, removed: 0, error: 'A course code is required' };

  try {
    const db = getDbService();
    const existing = (await db.requirements.listByCourse(courseCode)) ?? [];

    const wanted = new Map(
      appliesTo
        .filter(role => role?.department)
        .map(role => [roleKey(role.department, role.jobTitle), role]),
    );
    const have = new Map(existing.map(row => [roleKey(row.department, row.job_title), row]));

    let removed = 0;
    for (const [key, row] of have) {
      if (wanted.has(key)) continue;
      await db.requirements.delete(row.id);
      removed += 1;
    }

    let added = 0;
    for (const [key, role] of wanted) {
      if (have.has(key)) continue;
      await db.requirements.add({
        id: `req_${courseCode}_${added}_${Date.now()}`,
        department: role.department,
        job_title: role.jobTitle ?? '',
        course_code: courseCode,
        mandatory: role.mandatory ?? true,
        validity_months: role.validityMonths ?? null,
      });
      added += 1;
    }

    return { success: true, added, removed };
  } catch (err) {
    return { success: false, added: 0, removed: 0, error: err.message };
  }
}

/**
 * issueDate plus validityMonths, as 'YYYY-MM-DD'.
 *
 * A month shorter than the day of the month rolls back to its last day, so
 * 31 January plus one month is 28 February, not 3 March.
 *
 * @returns {string|null} null when there is no issue date or no validity
 */
export function computeExpiryDate(issueDate, validityMonths) {
  if (!issueDate || !validityMonths) return null;

  const [year, month, day] = issueDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  const target = new Date(Date.UTC(year, month - 1 + validityMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  return target.toISOString().slice(0, 10);
}

/**
 * Record a completion for each attendee.
 *
 * @param {object} session - {courseCode, issueDate, expiryDate, certificateNumber,
 *   completionStatus, employeeIds}
 * @param {array} courses - the catalogue, for the validity when no expiry is given
 * @returns {Promise<{success: boolean, records: array, error?: string}>}
 */
export async function addTrainingRecords(session, courses = []) {
  const { courseCode, issueDate, expiryDate, certificateNumber, completionStatus, employeeIds } =
    session ?? {};

  if (!courseCode) return { success: false, records: [], error: 'A course is required' };
  if (!employeeIds || employeeIds.length === 0) {
    return { success: false, records: [], error: 'At least one attendee is required' };
  }

  const course = courses.find(c => c?.code && c.code.toUpperCase() === courseCode.toUpperCase());
  const expiry = expiryDate || computeExpiryDate(issueDate, course?.validityMonths ?? null);

  try {
    const db = getDbService();
    const records = [];
    for (const employeeId of employeeIds) {
      const row = {
        id: `rec_${employeeId}_${courseCode}_${Date.now()}_${records.length}`,
        employee_id: employeeId,
        course_code: courseCode,
        completion_status: completionStatus ?? 'Completed',
        issue_date: issueDate || null,
        expiry_date: expiry,
        certificate_number: certificateNumber || null,
        source: 'manual',
      };
      await db.trainingRecords.add(row);
      records.push(row);
    }
    return { success: true, records };
  } catch (err) {
    return { success: false, records: [], error: err.message };
  }
}

/**
 * Replace the whole matrix with an imported one. One active source at a time.
 *
 * The training records are deliberately untouched: those are actual
 * completions, not requirements, and an import of a matrix says nothing about
 * them.
 *
 * @param {array} rows - snake_case requirement rows
 */
export async function replaceRequirements(rows = []) {
  const db = getDbService();
  const existing = (await db.requirements.list()) ?? [];

  let removed = 0;
  for (const row of existing) {
    await db.requirements.delete(row.id);
    removed += 1;
  }

  let added = 0;
  for (const row of rows) {
    await db.requirements.add({
      id: row.id ?? `req_import_${added}_${Date.now()}`,
      department: row.department,
      job_title: row.job_title ?? '',
      course_code: row.course_code,
      mandatory: row.mandatory ?? true,
      validity_months: row.validity_months ?? null,
    });
    added += 1;
  }

  return { success: true, removed, added };
}
```

- [ ] **Step 4: Add the unregistered-course check**

The spec requires a requirement whose course is not in the catalogue to surface as a warning rather than be rejected — an import may legitimately carry one. Append:

```js
/**
 * Requirement rows whose course code is not in the catalogue.
 *
 * Not an error and not rejected: an imported matrix may require a course that
 * was never registered, and refusing it would break the CSV path. The user is
 * told instead, through DataQualityPanel.
 *
 * @param {array} rows - requirement rows (snake_case)
 * @param {array} courses - the catalogue
 * @returns {Array<string>} the unknown course codes, each once
 */
export function findUnregisteredCourses(rows = [], courses = []) {
  const known = new Set(courses.filter(c => c?.code).map(c => c.code.toUpperCase()));
  const unknown = new Set();
  for (const row of rows) {
    if (!row?.course_code) continue;
    if (!known.has(row.course_code.toUpperCase())) unknown.add(row.course_code);
  }
  return Array.from(unknown);
}
```

And the test for it:

```js
describe('findUnregisteredCourses', () => {
  it('names a course required but never registered', () => {
    const rows = [
      { department: 'Operations', job_title: 'Operator', course_code: 'GHOST' },
      { department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ];
    expect(findUnregisteredCourses(rows, [{ code: 'h2s', name: 'H2S' }])).toEqual(['GHOST']);
  });

  it('names each unknown code once', () => {
    const rows = [{ course_code: 'GHOST' }, { course_code: 'GHOST' }];
    expect(findUnregisteredCourses(rows, [])).toEqual(['GHOST']);
  });
});
```

Show the result in `DataQualityPanel` alongside its existing warnings, from `App.jsx`:

```js
  const unregisteredCourses = useMemo(
    () => findUnregisteredCourses(managedRequirements, manualCourses),
    [managedRequirements, manualCourses],
  );
```

Read `DataQualityPanel`'s props before adding to them and follow the shape its existing warnings use; add an i18n key for the message if it needs one, in both languages.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/requirementsService.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/requirementsService.js src/App.jsx src/components/DataQualityPanel.jsx tests/requirementsService.test.js
git commit -m "feat: add the requirements and training-record service layer"
```

---

### Task 8: Load the matrix and keep manual records out of the people derivation

**Files:**
- Modify: `src/App.jsx:84` (the state rename), `:170-182` (the load effect), `:278-281` (`mergedPeople`)
- Test: `tests/complianceEngine.test.js` and `tests/productionAppIntegration.test.js`

**Interfaces:**
- Consumes: `loadRequirementsFromDb()` from Task 7, `mergeRequirements()` from Task 6.
- Produces: `trainingRecords` as a derived array (imported plus manual) that `buildComplianceUniverse` reads, and `managedRequirements` filled from the database on mount. Tasks 10 and 12 push into these.

**The one call site that must not follow the rename.** `mergedPeople` (`src/App.jsx:279`) falls back to the training records as its employee source when no master list is loaded:

```js
mergeManualEmployees(employeeMaster ?? trainingRecords, manualEmployees)
```

A manually entered record carries only an employee id and a course code — no name, no department, no job title. Feeding it to the employee derivation would invent an employee with empty fields, who then matches no requirement row and appears as unconfigured. That fallback keeps reading `importedRecords`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/complianceEngine.test.js` — the regression for the reported bug:

```js
describe('a course scoped to one role', () => {
  // This is the 9797 — JSA case: a course added in the interface used to be
  // broadcast to every role, so everybody was MISSING it.
  const people = [
    { Employee_ID: 'EMP001', Name: 'A', Department: 'Operations', Job_Title: 'Operator' },
    { Employee_ID: 'EMP002', Name: 'B', Department: 'Maintenance', Job_Title: 'Technician' },
  ];
  const requirements = [
    { Department: 'Operations', Job_Title: 'Operator', Course_Code: 'JSA', Course_Name: 'JSA', Mandatory: true, Validity_Months: 12 },
  ];

  it('is missing for the scoped role only', () => {
    const result = buildComplianceUniverse([], requirements, '2026-10-13', people);
    const missing = result.universe.filter(item => item.isMissing);

    expect(missing).toHaveLength(1);
    expect(missing[0].Employee_ID).toBe('EMP001');
  });

  it('generates nothing at all for a role it was not scoped to', () => {
    const result = buildComplianceUniverse([], requirements, '2026-10-13', people);
    const maintenance = result.universe.filter(item => item.Department === 'Maintenance');

    expect(maintenance.map(item => item.Course_Code)).not.toContain('JSA');
  });
});
```

Add to `tests/productionAppIntegration.test.js`:

```js
describe('a manually entered training record', () => {
  it('does not become an employee when no master list is loaded', () => {
    // A manual record has an employee ID and a course code, nothing else.
    // Deriving people from it would invent an employee with empty fields.
    const imported = [
      { Employee_ID: 'EMP001', Name: 'A', Department: 'Operations', Job_Title: 'Operator', Course_Code: 'FA' },
    ];
    const manual = [{ employee_id: 'EMP999', course_code: 'JSA', source: 'manual' }];

    const people = mergeManualEmployees(imported, []);

    expect(people).toHaveLength(1);
    expect(people.some(p => p.Employee_ID === 'EMP999')).toBe(false);
    // The manual record still reaches the engine, just not the people list.
    expect([...imported, ...manual]).toHaveLength(2);
  });
});
```

Import `mergeManualEmployees` in that file if it is not already imported.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/complianceEngine.test.js tests/productionAppIntegration.test.js`
Expected: FAIL on the new blocks only. The `complianceEngine` block may already pass — the engine was never the problem, the broadcast was — in which case it stands as a regression guard and you move on.

- [ ] **Step 3: Rename the state and derive the records**

In `src/App.jsx`, replace line 84:

```js
  // The records an import brought in. The records entered by hand live in
  // manualRecords; `trainingRecords` below is the two of them together.
  const [importedRecords, setImportedRecords] = useState([]);
  const [manualRecords, setManualRecords] = useState([]);
```

Rename every other `trainingRecords` / `setTrainingRecords` reference to `importedRecords` / `setImportedRecords` — the import handlers, the demo loader, the reset. Then add the derived array next to the other memos, above `mergedPeople`:

```js
  // What the engine reports on: the imported records plus the ones entered by
  // hand. No deduplication — selectBestRecord picks the record with the latest
  // valid expiry and DataQualityPanel reports the duplicate, which is what the
  // user needs to see.
  const trainingRecords = useMemo(
    () => [...importedRecords, ...manualRecords],
    [importedRecords, manualRecords],
  );
```

- [ ] **Step 4: Keep `mergedPeople` on the imported records**

`src/App.jsx:278-281` becomes:

```js
  // The people the engine reports on: the imported ones plus anybody added
  // through the interface. Without a master list the people are derived from
  // the *imported* records only: a record entered by hand carries an employee
  // ID and a course code, so deriving a person from it would invent an
  // employee with no name, department or job title.
  const mergedPeople = useMemo(
    () => mergeManualEmployees(employeeMaster ?? importedRecords, manualEmployees),
    [employeeMaster, importedRecords, manualEmployees],
  );
```

- [ ] **Step 5: Load the matrix on mount**

In the existing mount effect (`src/App.jsx:170-182`), beside the department load:

```js
        // Load the requirements matrix built through the interface
        const dbRequirements = await loadRequirementsFromDb();
        if (dbRequirements.length > 0) {
          setManagedRequirements(dbRequirements);
        }
```

And add the import at the top of the file:

```js
import { loadRequirementsFromDb } from './lib/requirementsService.js';
```

- [ ] **Step 6: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both PASS. If a test asserts on `setTrainingRecords` by name, point it at `setImportedRecords`.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx tests/complianceEngine.test.js tests/productionAppIntegration.test.js
git commit -m "feat: load the managed matrix and separate imported from manual records"
```

---

### Task 9: Every new string, in both languages

**Files:**
- Modify: `src/lib/i18n.js` (the `en` block and the `ar` block)
- Test: `tests/i18n.test.js` if it exists; otherwise the assertion below goes in `tests/requirementsApproval.test.js`

**Interfaces:**
- Produces: the keys below, available through `createI18n(lang).t`. Tasks 10-13 use exactly these names. Add them before building the components, so no component is ever written with literal text in it.

- [ ] **Step 1: Write the failing test**

Append to `tests/i18n.test.js` (create the file with the two imports if it does not exist):

```js
import { describe, it, expect } from 'vitest';
import { createI18n } from '../src/lib/i18n.js';

describe('the requirements matrix keys', () => {
  const KEYS = [
    'appliesTo', 'appliesToHint', 'selectAll', 'employeeCount', 'requiredCount',
    'noRolesSelected', 'recordTraining', 'completionDate', 'expiryDateLabel',
    'certificateNumberLabel', 'attendees', 'showAllEmployees', 'saveRecords',
    'editRecord', 'approveMatrix', 'approvedBy', 'approvalPending',
    'importReplaceTitle', 'importReplaceBody', 'importReplaceConfirm',
    'trqDraft', 'trqManaged',
  ];

  for (const lang of ['en', 'ar']) {
    it(`has every key in ${lang}`, () => {
      const { t } = createI18n(lang);
      for (const key of KEYS) {
        expect(t(key), `${lang}.${key}`).toBeTruthy();
        // A missing key must not fall through to the key name itself.
        expect(t(key), `${lang}.${key}`).not.toBe(key);
      }
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/i18n.test.js`
Expected: FAIL — `expected 'appliesTo' not to be 'appliesTo'`.

- [ ] **Step 3: Add the English keys**

In `src/lib/i18n.js`, inside the `en` block, after the `trqDerived` key (line 356):

```js
    // Requirements matrix
    appliesTo: 'Applies to',
    appliesToHint: 'Pick the departments and job titles that must take this course. A department with no job title selected covers every job title in it, including ones added later.',
    selectAll: 'Select all',
    employeeCount: 'employees',
    requiredCount: 'employees will be required to take this course',
    noRolesSelected: 'This course is in the catalogue and required of nobody.',
    trqDraft: 'This requirements matrix was built in the interface and has not been approved yet. Approve it before using the dashboard as a compliance result.',
    trqManaged: 'This requirements matrix was built in the interface and approved internally. It is not an approved HSE-DC-1.0 sheet.',
    approveMatrix: 'Approve this matrix',
    approvedBy: 'Internally approved by {name} on {date}',
    approvalPending: 'Draft — not approved',

    // Recording a completion
    recordTraining: 'Record training',
    completionDate: 'Completion date',
    expiryDateLabel: 'Expiry date',
    certificateNumberLabel: 'Certificate number',
    attendees: 'Attendees',
    showAllEmployees: 'Show all employees',
    saveRecords: 'Save records',
    editRecord: 'Edit this record',

    // Replacing the matrix with an import
    importReplaceTitle: 'Replace the requirements matrix?',
    importReplaceBody: '{removed} rows from your matrix will be removed and {added} rows from the file will be added. Your training records are not affected.',
    importReplaceConfirm: 'Replace',
```

- [ ] **Step 4: Add the Arabic keys**

Inside the `ar` block, after its `trqDerived` key (line 739):

```js
    // مصفوفة المتطلبات
    appliesTo: 'ينطبق على',
    appliesToHint: 'اختر الأقسام والمسميات الوظيفية الملزمة بهذه الدورة. القسم الذي لا يُحدَّد له مسمى وظيفي يشمل كل المسميات فيه، بما يُضاف لاحقاً.',
    selectAll: 'تحديد الكل',
    employeeCount: 'موظف',
    requiredCount: 'موظف ملزمون بهذه الدورة',
    noRolesSelected: 'هذه الدورة في الكتالوج وغير ملزمة لأحد.',
    trqDraft: 'مصفوفة المتطلبات هذه أُنشئت من الواجهة ولم تُعتمد بعد. اعتمدها قبل استخدام اللوحة كنتيجة امتثال.',
    trqManaged: 'مصفوفة المتطلبات هذه أُنشئت من الواجهة واعتُمدت داخلياً. وهي ليست ورقة HSE-DC-1.0 معتمدة.',
    approveMatrix: 'اعتماد المصفوفة',
    approvedBy: 'اعتُمدت داخلياً بواسطة {name} في {date}',
    approvalPending: 'مسودة — غير معتمدة',

    // تسجيل إنجاز الدورة
    recordTraining: 'تسجيل تدريب',
    completionDate: 'تاريخ الإنجاز',
    expiryDateLabel: 'تاريخ الانتهاء',
    certificateNumberLabel: 'رقم الشهادة',
    attendees: 'الحاضرون',
    showAllEmployees: 'عرض جميع الموظفين',
    saveRecords: 'حفظ السجلات',
    editRecord: 'تحرير هذا السجل',

    // استبدال المصفوفة باستيراد
    importReplaceTitle: 'استبدال مصفوفة المتطلبات؟',
    importReplaceBody: 'سيُحذف {removed} صفاً من مصفوفتك ويُضاف {added} صفاً من الملف. سجلات التدريب لا تتأثر.',
    importReplaceConfirm: 'استبدال',
```

`{name}`, `{date}`, `{removed}` and `{added}` are substituted at the call site, the way the existing dictionary handles placeholders. Check how a current key with a placeholder is rendered and follow it; do not introduce a second substitution mechanism.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/i18n.test.js`
Expected: PASS for both languages.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.js tests/i18n.test.js
git commit -m "feat: add the requirements matrix strings in English and Arabic"
```

---

### Task 10: `RoleScopePicker` and the `appliesTo` field

**Files:**
- Create: `src/components/RoleScopePicker.jsx`
- Modify: `src/components/CourseManager.jsx` (the form), `src/components/ManagementDrawer.jsx:91-95` (two new props), `src/App.jsx` (pass them down)
- Test: `tests/roleScopePicker.test.js` (create)

**Interfaces:**
- Consumes: `saveRequirementsForCourse` (Task 7), the i18n keys (Task 9), `mergedPeople` (Task 8).
- Produces:
  - `<RoleScopePicker people={...} value={...} onChange={...} t={...} />` where `value` is `Array<{department, jobTitle}>`
  - `CourseManager` gains props `people` and `onRequirementsSaved`
  - `ManagementDrawer` gains props `people` and `onRequirementsSaved`, passed straight to `CourseManager`

**Why roles are derived, not typed:** a typed department or job title that does not match any employee exactly produces a requirement row that matches nobody — invisible, and indistinguishable from a working row. The picker only ever offers what exists in `mergedPeople`.

- [ ] **Step 1: Write the failing test**

Create `tests/roleScopePicker.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { RoleScopePicker } from '../src/components/RoleScopePicker.jsx';
import { createI18n } from '../src/lib/i18n.js';

const { t } = createI18n('en');

const people = [
  { Employee_ID: 'EMP001', Department: 'Operations', Job_Title: 'Operator' },
  { Employee_ID: 'EMP002', Department: 'Operations', Job_Title: 'Operator' },
  { Employee_ID: 'EMP003', Department: 'Operations', Job_Title: 'Supervisor' },
  { Employee_ID: 'EMP004', Department: 'Maintenance', Job_Title: 'Technician' },
];

afterEach(cleanup);

describe('RoleScopePicker', () => {
  it('lists every department and job title found in the people', () => {
    render(createElement(RoleScopePicker, { people, value: [], onChange: () => {}, t }));

    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText(/Operator/)).toBeInTheDocument();
    expect(screen.getByText(/Technician/)).toBeInTheDocument();
  });

  it('shows how many people hold each job title', () => {
    render(createElement(RoleScopePicker, { people, value: [], onChange: () => {}, t }));
    const operator = screen.getByTestId('role-count-Operations-Operator');

    expect(operator).toHaveTextContent('2');
  });

  it('selects one job title', () => {
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, { people, value: [], onChange, t }));
    fireEvent.click(screen.getByTestId('role-Operations-Operator'));

    expect(onChange).toHaveBeenCalledWith([{ department: 'Operations', jobTitle: 'Operator' }]);
  });

  it('selects a whole department as an empty job title', () => {
    // An empty job title covers job titles added to that department later.
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, { people, value: [], onChange, t }));
    fireEvent.click(screen.getByTestId('department-Operations'));

    expect(onChange).toHaveBeenCalledWith([{ department: 'Operations', jobTitle: '' }]);
  });

  it('drops the individual job titles when the whole department is selected', () => {
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: 'Operator' }],
      onChange,
      t,
    }));
    fireEvent.click(screen.getByTestId('department-Operations'));

    expect(onChange).toHaveBeenCalledWith([{ department: 'Operations', jobTitle: '' }]);
  });

  it('unselects a job title that was selected', () => {
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: 'Operator' }],
      onChange,
      t,
    }));
    fireEvent.click(screen.getByTestId('role-Operations-Operator'));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('counts how many people the selection requires', () => {
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: 'Operator' }],
      onChange: () => {},
      t,
    }));

    expect(screen.getByTestId('required-count')).toHaveTextContent('2');
  });

  it('counts a whole department as everyone in it', () => {
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: '' }],
      onChange: () => {},
      t,
    }));

    expect(screen.getByTestId('required-count')).toHaveTextContent('3');
  });

  it('says so plainly when nothing is selected', () => {
    render(createElement(RoleScopePicker, { people, value: [], onChange: () => {}, t }));

    expect(screen.getByText(t('noRolesSelected'))).toBeInTheDocument();
  });

  it('renders nothing to pick when no people are loaded', () => {
    render(createElement(RoleScopePicker, { people: [], value: [], onChange: () => {}, t }));

    expect(screen.queryByTestId('department-Operations')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/roleScopePicker.test.js`
Expected: FAIL — `Failed to resolve import "../src/components/RoleScopePicker.jsx"`.

- [ ] **Step 3: Write the component**

Create `src/components/RoleScopePicker.jsx`:

```jsx
import { useMemo } from 'react';

/**
 * Picks the Department + Job_Title pairs that a course is required for.
 *
 * The roles offered are derived from the loaded people, never typed: a
 * misspelled job title would produce a requirement row that matches nobody and
 * looks identical to a working one.
 *
 * A department checkbox stores `jobTitle: ''`, which means every job title in
 * that department, including ones added later. Selecting the department
 * therefore replaces any individual job titles already selected in it.
 *
 * @param {array} people - employees carrying Department and Job_Title
 * @param {Array<{department: string, jobTitle: string}>} value
 * @param {function} onChange - called with the next value
 * @param {function} t - the translator
 */
export function RoleScopePicker({ people = [], value = [], onChange, t }) {
  const departments = useMemo(() => {
    const byDepartment = new Map();
    for (const person of people) {
      if (!person?.Department) continue;
      const titles = byDepartment.get(person.Department) ?? new Map();
      const title = person.Job_Title || '';
      if (title) titles.set(title, (titles.get(title) ?? 0) + 1);
      byDepartment.set(person.Department, titles);
    }
    return Array.from(byDepartment.entries())
      .map(([department, titles]) => ({
        department,
        total: Array.from(titles.values()).reduce((sum, n) => sum + n, 0),
        titles: Array.from(titles.entries()).map(([title, count]) => ({ title, count })),
      }))
      .sort((a, b) => a.department.localeCompare(b.department));
  }, [people]);

  const isDepartmentSelected = (department) =>
    value.some(role => role.department === department && role.jobTitle === '');

  const isRoleSelected = (department, jobTitle) =>
    value.some(role => role.department === department && role.jobTitle === jobTitle);

  const toggleDepartment = (department) => {
    if (isDepartmentSelected(department)) {
      onChange(value.filter(role => role.department !== department));
      return;
    }
    // Replaces the individual job titles of this department: they are covered.
    onChange([
      ...value.filter(role => role.department !== department),
      { department, jobTitle: '' },
    ]);
  };

  const toggleRole = (department, jobTitle) => {
    if (isRoleSelected(department, jobTitle)) {
      onChange(value.filter(
        role => !(role.department === department && role.jobTitle === jobTitle),
      ));
      return;
    }
    onChange([
      ...value.filter(role => !(role.department === department && role.jobTitle === '')),
      { department, jobTitle },
    ]);
  };

  const requiredCount = useMemo(() => {
    const ids = new Set();
    for (const person of people) {
      const matched = value.some(role => role.department === person.Department
        && (role.jobTitle === '' || role.jobTitle === person.Job_Title));
      if (matched) ids.add(person.Employee_ID);
    }
    return ids.size;
  }, [people, value]);

  return (
    <div>
      <p>{t('appliesToHint')}</p>

      {departments.map(({ department, total, titles }) => (
        <div key={department}>
          <label>
            <input
              type="checkbox"
              data-testid={`department-${department}`}
              checked={isDepartmentSelected(department)}
              onChange={() => toggleDepartment(department)}
            />
            <strong>{department}</strong>
            <span>{`${total} ${t('employeeCount')}`}</span>
          </label>

          {titles.map(({ title, count }) => (
            <label key={title}>
              <input
                type="checkbox"
                data-testid={`role-${department}-${title}`}
                checked={isDepartmentSelected(department) || isRoleSelected(department, title)}
                disabled={isDepartmentSelected(department)}
                onChange={() => toggleRole(department, title)}
              />
              <span>{title}</span>
              <span data-testid={`role-count-${department}-${title}`}>{count}</span>
            </label>
          ))}
        </div>
      ))}

      {value.length === 0
        ? <p>{t('noRolesSelected')}</p>
        : <p data-testid="required-count">{`${requiredCount} ${t('requiredCount')}`}</p>}
    </div>
  );
}
```

Follow the inline `styles` object convention the other components in this directory use; the markup above is deliberately unstyled so the structure is readable.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/roleScopePicker.test.js`
Expected: PASS.

- [ ] **Step 5: Add the field to `CourseManager`**

Three changes in `src/components/CourseManager.jsx`:

Take `t`, `people` and `onRequirementsSaved` as props and stop pinning the English translator. Replace line 7's `const t = createI18n('en').t;` and the signature at line 21:

```jsx
export function CourseManager({
  courses, onCoursesChange, people = [], onRequirementsSaved, t, disabled = false,
}) {
```

Keep the `createI18n` import only if something else in the file still needs it; otherwise remove it.

Add `appliesTo: []` to all three `setFormData` resets (lines 24-29, 42-48, 95-101) and load it when editing (line 55-62):

```js
    setFormData({
      code: course.code,
      name: course.name,
      mandatory: course.mandatory,
      validityMonths: course.validityMonths,
      description: course.description,
      appliesTo: course.appliesTo ?? [],
    });
```

Render the picker inside the form, after the description field:

```jsx
        <div>
          <label>{t('appliesTo')}</label>
          <RoleScopePicker
            people={people}
            value={formData.appliesTo}
            onChange={(appliesTo) => setFormData(prev => ({ ...prev, appliesTo }))}
            t={t}
          />
        </div>
```

And persist the scope in `handleSaveCourse`, after `onCoursesChange(...)` in both branches:

```js
    const saved = await saveRequirementsForCourse(formData.code, formData.appliesTo);
    if (!saved.success) {
      setError(saved.error);
      return;
    }
    onRequirementsSaved?.();
```

`handleSaveCourse` becomes `async` as a result; the `onClick` that calls it needs no change, React handles a promise-returning handler.

- [ ] **Step 6: Pass the two new props down**

`src/components/ManagementDrawer.jsx:91-95`:

```jsx
            <CourseManager
              courses={courses}
              onCoursesChange={onCoursesChange}
              people={people}
              onRequirementsSaved={onRequirementsSaved}
              t={t}
              disabled={false}
            />
```

Add `people`, `onRequirementsSaved` and `t` to `ManagementDrawer`'s own props, and pass them from `App.jsx` where the drawer is rendered: `people={mergedPeople}` and

```jsx
              onRequirementsSaved={async () => setManagedRequirements(await loadRequirementsFromDb())}
```

That re-read is what puts `setManagedRequirements` from Task 6 to work: the engine's matrix refreshes from the database rather than from a guess about what was written.

- [ ] **Step 7: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both PASS. If an existing `CourseManager` test renders it without `t`, pass `createI18n('en').t` in that test.

- [ ] **Step 8: Commit**

```bash
git add src/components/RoleScopePicker.jsx src/components/CourseManager.jsx src/components/ManagementDrawer.jsx src/App.jsx tests/roleScopePicker.test.js
git commit -m "feat: scope a course to departments and job titles when saving it"
```

---

### Task 11: Persist the approval and declare the provenance

**Files:**
- Modify: `src/lib/requirementsService.js` (two functions), `src/App.jsx` (state, load, the approve handler, the declared provenance)
- Test: `tests/requirementsService.test.js`

**Interfaces:**
- Consumes: `createApproval`, `approve`, `markEdited`, `provenanceForApproval` (Task 5); `db.requirementsApproval` (Tasks 3 and 4).
- Produces:
  - `loadApproval()` → `Promise<{status, approvedBy, approvedAt, revision}>`, `createApproval()` when nothing is stored
  - `saveApproval(state)` → `Promise<{success, error?}>`
  - `App.jsx` holds `approval` state and passes `resolveRequirementsProvenance(mergedRequirements, declared)` where `declared` is `provenanceForApproval(approval)` whenever the matrix came from the interface.

**The rule this enforces:** a matrix built by hand is `draft` until a named person approves it, so `TestRequirementsBanner` shows. Any later edit calls `markEdited`, which returns it to `draft`. An edited matrix can never be read as approved.

- [ ] **Step 1: Write the failing test**

Append to `tests/requirementsService.test.js`:

```js
describe('the approval state', () => {
  it('starts as an unapproved draft when nothing is stored', async () => {
    globalThis.__testDb = { requirementsApproval: { list: async () => [] } };
    const state = await loadApproval();

    expect(state.status).toBe('draft');
    expect(state.revision).toBe(1);
  });

  it('reads back what was stored', async () => {
    const rows = [{
      id: 'approval', status: 'managed', approved_by: 'Hassan Ali',
      approved_at: '2026-10-13T09:00:00.000Z', revision: 2,
    }];
    globalThis.__testDb = { requirementsApproval: { list: async () => rows } };
    const state = await loadApproval();

    expect(state).toEqual({
      status: 'managed',
      approvedBy: 'Hassan Ali',
      approvedAt: '2026-10-13T09:00:00.000Z',
      revision: 2,
    });
  });

  it('stores the state in snake_case, the way the table spells it', async () => {
    const written = [];
    globalThis.__testDb = {
      requirementsApproval: { list: async () => [], add: async (row) => { written.push(row); } },
    };
    await saveApproval({
      status: 'managed', approvedBy: 'Hassan Ali',
      approvedAt: '2026-10-13T09:00:00.000Z', revision: 1,
    });

    expect(written[0].approved_by).toBe('Hassan Ali');
    expect(written[0].status).toBe('managed');
  });
});
```

Add `loadApproval` and `saveApproval` to the import at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/requirementsService.test.js -t "the approval state"`
Expected: FAIL — `loadApproval is not a function`.

- [ ] **Step 3: Add the two functions**

Append to `src/lib/requirementsService.js`:

```js
import { createApproval } from './contract/requirementsApproval.js';

/** The stored approval state, or a fresh draft when there is none. */
export async function loadApproval() {
  try {
    const db = getDbService();
    const [row] = (await db.requirementsApproval.list()) ?? [];
    if (!row) return createApproval();
    return {
      status: row.status ?? 'draft',
      approvedBy: row.approved_by ?? null,
      approvedAt: row.approved_at ?? null,
      revision: row.revision ?? 1,
    };
  } catch (err) {
    console.warn('Failed to load the approval state:', err.message);
    return createApproval();
  }
}

/**
 * Store the approval state. One row per installation, so this overwrites.
 * The local backend's `add` uses `put` for exactly this reason.
 */
export async function saveApproval(state) {
  try {
    const db = getDbService();
    await db.requirementsApproval.add({
      id: 'approval',
      status: state.status,
      approved_by: state.approvedBy,
      approved_at: state.approvedAt,
      revision: state.revision,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

Move the `createApproval` import up beside the `getDbService` import rather than leaving it mid-file.

- [ ] **Step 4: Wire it into `App.jsx`**

Add the imports:

```js
import {
  createApproval, approve, markEdited, provenanceForApproval,
} from './lib/contract/requirementsApproval.js';
import { loadApproval, saveApproval } from './lib/requirementsService.js';
```

Merge the second line into the existing `requirementsService.js` import added in Task 8 rather than importing from the same module twice.

Add the state and the load, beside `managedRequirements`:

```js
  const [approval, setApproval] = useState(() => createApproval());
```

In the mount effect, after the requirements load:

```js
        setApproval(await loadApproval());
```

Add the approve handler:

```js
  // A matrix built in the interface is a draft until a named person approves
  // it. Any later edit returns it to draft; see requirementsApproval.js.
  const handleApproveMatrix = useCallback(async (approvedBy) => {
    const next = approve(approval, { approvedBy, approvedAt: new Date().toISOString() });
    const saved = await saveApproval(next);
    if (saved.success) setApproval(next);
    return saved;
  }, [approval]);
```

In `onRequirementsSaved` (Task 10, step 6), mark the matrix edited before re-reading the rows:

```js
              onRequirementsSaved={async () => {
                const edited = markEdited(approval);
                if (edited !== approval) {
                  await saveApproval(edited);
                  setApproval(edited);
                }
                setManagedRequirements(await loadRequirementsFromDb());
              }}
```

And declare the provenance of a hand-built matrix. The memo at `src/App.jsx:269-272` currently resolves `requirementsSource`; when there is no imported matrix but there are managed rows, the declaration comes from the approval state:

```js
  const requirementsProvenance = useMemo(() => {
    const declared = requirements.length === 0 && managedRequirements.length > 0
      ? provenanceForApproval(approval)
      : requirementsSource;
    return resolveRequirementsProvenance(mergedRequirements, declared);
  }, [requirements, managedRequirements, mergedRequirements, approval, requirementsSource]);
```

Read the existing memo before editing: keep its variable name and its consumers exactly as they are, and change only the `declared` value it passes.

Add a button near the drawer trigger that calls `handleApproveMatrix` with a name the user types, labelled `t('approveMatrix')`, shown only while `approval.status === 'draft'` and `managedRequirements.length > 0`.

- [ ] **Step 5: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both PASS. `TestRequirementsBanner` now appears for a draft matrix — that is the intended behaviour, so update any banner test that assumed an un-bannered state here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/requirementsService.js src/App.jsx tests/requirementsService.test.js
git commit -m "feat: approve a hand-built matrix internally and record who approved it"
```

---

### Task 12: The import replace confirmation

**Files:**
- Modify: `src/components/ImportPanel.jsx`, `src/App.jsx` (the import handler)
- Test: `tests/importPanel.test.js` if it exists, otherwise `tests/requirementsService.test.js`

**Interfaces:**
- Consumes: `replaceRequirements` (Task 7), `approval` (Task 11), the `importReplace*` i18n keys (Task 9).
- Produces: no new exported function. A confirmation dialog shown before a requirements import overwrites a hand-built matrix.

**The rule:** one active source at a time. An import of a requirements matrix while managed rows exist shows what will be removed and what will be added, and writes nothing until the user confirms. `training_records` is never touched — those are completions, not requirements.

- [ ] **Step 1: Write the failing test**

```js
describe('importing over a hand-built matrix', () => {
  it('replaces the requirements and leaves the completions alone', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_mine', department: 'Operations', job_title: 'Operator', course_code: 'JSA' },
    ]);
    await globalThis.__testDb.trainingRecords.add({ id: 'rec_1', employee_id: 'EMP001' });

    const result = await replaceRequirements([
      { department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);

    expect(result.removed).toBe(1);
    expect(result.added).toBe(1);
    expect(globalThis.__testDb._requirements.has('req_mine')).toBe(false);
    expect(globalThis.__testDb._trainingRecords.has('rec_1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails or already passes**

Run: `npx vitest run tests/requirementsService.test.js -t "importing over"`
Expected: PASS, because Task 7 already implemented `replaceRequirements`. This test exists to pin the "completions survive" guarantee against a future change. If it fails, Task 7 is wrong — fix that first.

- [ ] **Step 3: Add the confirmation**

In `src/App.jsx`'s requirements-import handler, before applying the parsed matrix:

```js
    if (managedRequirements.length > 0) {
      const confirmed = window.confirm(
        t('importReplaceBody')
          .replace('{removed}', managedRequirements.length)
          .replace('{added}', parsedRequirements.length),
      );
      if (!confirmed) return;
      await replaceRequirements([]);
      setManagedRequirements([]);
    }
```

`window.confirm` is what `CourseManager.handleDeleteCourse` already uses for a destructive action, so this matches the codebase rather than introducing a modal component for one dialog. Use `t('importReplaceTitle')` as the heading if `ImportPanel` already renders its own dialog markup — read the file first and follow whichever pattern is there.

Emptying the managed matrix is deliberate: the imported rows become the single source, and `mergeRequirements` passes them through untouched.

- [ ] **Step 4: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/ImportPanel.jsx tests/requirementsService.test.js
git commit -m "feat: confirm before an import replaces a hand-built matrix"
```

---

### Task 13: `TrainingSessionForm` — record a completion

**Files:**
- Create: `src/components/TrainingSessionForm.jsx`
- Modify: `src/App.jsx` (a toolbar button, `manualRecords` state from Task 8)
- Test: `tests/trainingSessionForm.test.js` (create)

**Interfaces:**
- Consumes: `addTrainingRecords` and `computeExpiryDate` (Task 7), the recording i18n keys (Task 9).
- Produces: `<TrainingSessionForm courses={...} people={...} requirements={...} prefill={...} onSaved={...} onClose={...} t={...} />`, where `prefill` is `null` for a batch or `{employeeId, courseCode, issueDate, expiryDate, certificateNumber}` for the single-employee mode Task 14 opens.

**Why the attendee list is restricted:** the matrix decides who appears. Offering every employee for every course makes the matrix pointless and invites recording a completion for someone who never needed the course. A `show all employees` button covers the real exception — training someone who is not required to take it.

- [ ] **Step 1: Write the failing test**

Create `tests/trainingSessionForm.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { TrainingSessionForm } from '../src/components/TrainingSessionForm.jsx';
import { createI18n } from '../src/lib/i18n.js';

const { t } = createI18n('en');

const courses = [{ code: 'H2S', name: 'H2S Awareness', validityMonths: 24 }];
const people = [
  { Employee_ID: 'EMP001', Name: 'A', Department: 'Operations', Job_Title: 'Operator' },
  { Employee_ID: 'EMP002', Name: 'B', Department: 'Maintenance', Job_Title: 'Technician' },
];
const requirements = [
  { Department: 'Operations', Job_Title: 'Operator', Course_Code: 'H2S', Mandatory: true },
];

function renderForm(props = {}) {
  return render(createElement(TrainingSessionForm, {
    courses, people, requirements, prefill: null,
    onSaved: () => {}, onClose: () => {}, t,
    ...props,
  }));
}

afterEach(cleanup);

describe('TrainingSessionForm', () => {
  it('offers only the employees the course is required for', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });

    expect(screen.getByTestId('attendee-EMP001')).toBeInTheDocument();
    expect(screen.queryByTestId('attendee-EMP002')).not.toBeInTheDocument();
  });

  it('offers everybody once show-all is pressed', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.click(screen.getByText(t('showAllEmployees')));

    expect(screen.getByTestId('attendee-EMP002')).toBeInTheDocument();
  });

  it('fills the expiry from the course validity when a completion date is entered', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-13' } });

    expect(screen.getByTestId('expiry-date')).toHaveValue('2028-10-13');
  });

  it('keeps a manually typed expiry instead of recomputing it', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-13' } });
    fireEvent.change(screen.getByTestId('expiry-date'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-14' } });

    expect(screen.getByTestId('expiry-date')).toHaveValue('2027-01-01');
  });

  it('reports one record per selected attendee', async () => {
    const onSaved = vi.fn();
    renderForm({ onSaved });
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-13' } });
    fireEvent.click(screen.getByTestId('attendee-EMP001'));
    fireEvent.click(screen.getByText(t('saveRecords')));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toHaveLength(1);
  });

  it('refuses to save with no attendee selected', () => {
    const onSaved = vi.fn();
    renderForm({ onSaved });
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.click(screen.getByText(t('saveRecords')));

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('prefills a single employee when opened from a table row', () => {
    renderForm({ prefill: { employeeId: 'EMP001', courseCode: 'H2S', issueDate: '2025-01-01' } });

    expect(screen.getByTestId('issue-date')).toHaveValue('2025-01-01');
    expect(screen.getByTestId('course-select')).toHaveValue('H2S');
  });
});
```

Mock `addTrainingRecords` in this file the same way Task 7's test mocks the database module, so the component test does not touch storage:

```js
vi.mock('../src/lib/requirementsService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    addTrainingRecords: vi.fn(async (session) => ({
      success: true,
      records: session.employeeIds.map(id => ({ id: `rec_${id}`, employee_id: id })),
    })),
  };
});
```

Keep `computeExpiryDate` real — the expiry behaviour is what two of these tests assert.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/trainingSessionForm.test.js`
Expected: FAIL — `Failed to resolve import "../src/components/TrainingSessionForm.jsx"`.

- [ ] **Step 3: Write the component**

Create `src/components/TrainingSessionForm.jsx`:

```jsx
import { useMemo, useState } from 'react';

import { addTrainingRecords, computeExpiryDate } from '../lib/requirementsService.js';

/**
 * Records a training completion for one employee or for a whole session.
 *
 * The attendee list is restricted to the employees the selected course is
 * required for: the matrix decides who appears. `show all employees` covers
 * training someone who is not required to take it.
 *
 * The expiry is computed from the course validity until the user types one,
 * after which it is left alone — an overridden expiry is a deliberate act.
 *
 * @param {array} courses - the catalogue
 * @param {array} people - employees carrying Employee_ID, Department, Job_Title
 * @param {array} requirements - the merged matrix, PascalCase
 * @param {object|null} prefill - single-employee mode
 * @param {function} onSaved - called with the written records
 * @param {function} onClose
 * @param {function} t
 */
export function TrainingSessionForm({
  courses = [], people = [], requirements = [], prefill = null,
  onSaved, onClose, t,
}) {
  const [courseCode, setCourseCode] = useState(prefill?.courseCode ?? '');
  const [issueDate, setIssueDate] = useState(prefill?.issueDate ?? '');
  const [expiryDate, setExpiryDate] = useState(prefill?.expiryDate ?? '');
  const [expiryTouched, setExpiryTouched] = useState(Boolean(prefill?.expiryDate));
  const [certificateNumber, setCertificateNumber] = useState(prefill?.certificateNumber ?? '');
  const [selected, setSelected] = useState(
    () => new Set(prefill?.employeeId ? [prefill.employeeId] : []),
  );
  const [showAll, setShowAll] = useState(Boolean(prefill?.employeeId));
  const [error, setError] = useState('');

  const course = courses.find(c => c?.code === courseCode);

  const attendees = useMemo(() => {
    if (showAll || !courseCode) return people;
    const roles = requirements.filter(r => r.Course_Code === courseCode);
    return people.filter(person => roles.some(
      role => role.Department === person.Department && role.Job_Title === person.Job_Title,
    ));
  }, [people, requirements, courseCode, showAll]);

  const handleIssueDate = (value) => {
    setIssueDate(value);
    if (!expiryTouched) setExpiryDate(computeExpiryDate(value, course?.validityMonths) ?? '');
  };

  const handleCourse = (value) => {
    setCourseCode(value);
    const next = courses.find(c => c?.code === value);
    if (!expiryTouched) setExpiryDate(computeExpiryDate(issueDate, next?.validityMonths) ?? '');
  };

  const toggle = (employeeId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    const result = await addTrainingRecords({
      courseCode, issueDate, expiryDate, certificateNumber,
      employeeIds: Array.from(selected),
    }, courses);

    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved?.(result.records);
    onClose?.();
  };

  return (
    <div>
      <select
        data-testid="course-select"
        value={courseCode}
        onChange={(e) => handleCourse(e.target.value)}
      >
        <option value="">—</option>
        {courses.map(c => <option key={c.code} value={c.code}>{`${c.code} — ${c.name}`}</option>)}
      </select>

      <label>{t('completionDate')}</label>
      <input
        type="date" data-testid="issue-date" value={issueDate}
        onChange={(e) => handleIssueDate(e.target.value)}
      />

      <label>{t('expiryDateLabel')}</label>
      <input
        type="date" data-testid="expiry-date" value={expiryDate}
        onChange={(e) => { setExpiryTouched(true); setExpiryDate(e.target.value); }}
      />

      <label>{t('certificateNumberLabel')}</label>
      <input
        type="text" data-testid="certificate-number" value={certificateNumber}
        onChange={(e) => setCertificateNumber(e.target.value)}
      />

      <h4>{t('attendees')}</h4>
      {attendees.map(person => (
        <label key={person.Employee_ID}>
          <input
            type="checkbox"
            data-testid={`attendee-${person.Employee_ID}`}
            checked={selected.has(person.Employee_ID)}
            onChange={() => toggle(person.Employee_ID)}
          />
          <span>{`${person.Employee_ID} — ${person.Name}`}</span>
        </label>
      ))}
      {!showAll && <button type="button" onClick={() => setShowAll(true)}>{t('showAllEmployees')}</button>}

      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={handleSave}>{t('saveRecords')}</button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/trainingSessionForm.test.js`
Expected: PASS.

- [ ] **Step 5: Open it from the toolbar**

In `src/App.jsx`, add the open state and the button beside the drawer trigger:

```js
  const [sessionForm, setSessionForm] = useState(null); // null, or a prefill object
```

Render it when `sessionForm !== null`, passing `courses={manualCourses}`, `people={mergedPeople}`, `requirements={mergedRequirements}`, `prefill={sessionForm.prefill}`, `t={t}`, and:

```jsx
          onSaved={(records) => setManualRecords(prev => [...prev, ...records])}
          onClose={() => setSessionForm(null)}
```

The records written by the form go into `manualRecords`, which Task 8 made part of the derived `trainingRecords` the engine reads. The engine's own records are PascalCase; map each written row to the keys the engine expects before pushing it into state, the same translation `mergeRequirements` does for requirements — read `complianceEngine.js`'s record reader and match its key names exactly.

- [ ] **Step 6: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/TrainingSessionForm.jsx src/App.jsx tests/trainingSessionForm.test.js
git commit -m "feat: record a training completion for a session or one employee"
```

---

### Task 14: The row edit button

**Files:**
- Modify: `src/components/ComplianceTable.jsx:120` area (a trailing column), `src/App.jsx` (the handler)
- Test: `tests/complianceTable.test.js` if it exists, otherwise append to `tests/trainingSessionForm.test.js`

**Interfaces:**
- Consumes: `TrainingSessionForm`'s `prefill` shape (Task 13).
- Produces: one new optional prop on `ComplianceTable`, `onRecordEdit?.(item)`, following the existing `onCertificateClick` pattern exactly.

- [ ] **Step 1: Write the failing test**

```js
describe('the row edit button', () => {
  it('passes the row to the handler', () => {
    const onRecordEdit = vi.fn();
    const item = {
      Employee_ID: 'EMP001', Name: 'A', Department: 'Operations', Job_Title: 'Operator',
      Course_Code: 'H2S', isMissing: true,
    };
    render(createElement(ComplianceTable, {
      data: [item], onRecordEdit, t,
    }));
    fireEvent.click(screen.getByTestId('edit-record-EMP001-H2S'));

    expect(onRecordEdit).toHaveBeenCalledWith(item);
  });

  it('renders no button when no handler is given', () => {
    render(createElement(ComplianceTable, { data: [], t }));

    expect(screen.queryByTestId(/^edit-record-/)).not.toBeInTheDocument();
  });
});
```

Read `ComplianceTable`'s actual props before writing this — it may name its rows something other than `data`, and the test has to use the real prop names.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/complianceTable.test.js -t "row edit button"`
Expected: FAIL — no element with that test id.

- [ ] **Step 3: Add the column**

In `src/components/ComplianceTable.jsx`, add a trailing header cell and, in the row body, beside the existing certificate cell:

```jsx
          {onRecordEdit && (
            <td>
              <button
                type="button"
                data-testid={`edit-record-${item.Employee_ID}-${item.Course_Code}`}
                title={t('editRecord')}
                onClick={() => onRecordEdit(item)}
              >
                ✎
              </button>
            </td>
          )}
```

Add `onRecordEdit` to the component's props. Guarding on the prop keeps every existing render site unchanged.

- [ ] **Step 4: Wire it in `App.jsx`**

```jsx
          onRecordEdit={(item) => setSessionForm({
            prefill: {
              employeeId: item.Employee_ID,
              courseCode: item.Course_Code,
              issueDate: item.Issue_Date ?? '',
              expiryDate: item.Expiry_Date ?? '',
              certificateNumber: item.Certificate_Number ?? '',
            },
          })}
```

A `MISSING` row prefills with empty dates and creates a record; a row that already has one prefills with its dates. Check the exact key names on a universe item in `complianceEngine.js` before writing this — `Issue_Date` and `Expiry_Date` must match what the engine puts there.

- [ ] **Step 5: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ComplianceTable.jsx src/App.jsx tests/complianceTable.test.js
git commit -m "feat: edit a training record from the compliance table"
```

---

### Task 15: The manual browser verification

No unit test replaces this. Two things can only be seen in a real browser: the IndexedDB version 3 → 4 upgrade against an existing database, and the whole path end to end.

**Files:** none. This task changes no code.

- [ ] **Step 1: Start the dev server against an existing database**

```bash
npm run dev
```

Open the application in a browser profile that **already holds a version 3 database** — the profile used before this branch, not a fresh one. A new profile creates version 4 directly and proves nothing about the upgrade.

- [ ] **Step 2: Confirm nothing was lost**

The courses, departments and employees registered before the upgrade are all still listed in the drawer. If anything is missing, stop: `onupgradeneeded` is deleting a store. Do not continue.

- [ ] **Step 3: Reproduce the original bug's resolution**

Edit the existing `9797 — JSA` course, select `Operations/Operator` only, and save. `MISSING` disappears for the six people in Maintenance, Logistics and Admin. Three rows remain.

- [ ] **Step 4: Record a batch**

Press `Record training`, choose `JSA`, enter a completion date, select all three attendees, save. The three rows leave `MISSING` and show an expiry.

- [ ] **Step 5: Prove it persisted**

Reload the page. The scope and the three records are still there.

- [ ] **Step 6: Approve the matrix**

The test banner is showing because the matrix is a draft. Approve it with a name. The banner goes; the source line names the approver and the date.

- [ ] **Step 7: Check the other language**

Switch to Arabic. Every new label is translated and no English string is left in the new screens.

- [ ] **Step 8: Commit the result**

Record the outcome in `PRESENTATION.html` beside the other acceptance results, and commit.

```bash
git add PRESENTATION.html
git commit -m "docs: record the requirements matrix acceptance result"
```

---
