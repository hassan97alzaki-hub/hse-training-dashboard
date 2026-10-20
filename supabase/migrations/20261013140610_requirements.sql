-- Requirements matrix and training records
--
-- Adds the three tables that let a course be scoped to roles and a completion
-- be recorded, both from inside the interface. Same ownership model as
-- 20261012103348_init.sql: owner_id defaults to auth.uid(), so the client never sends it.

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
