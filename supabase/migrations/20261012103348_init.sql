-- Phase 2C — initial Supabase schema
--
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
--
-- Every table carries an owner_id and is closed by row-level security, so one
-- account never reads another account's data. owner_id defaults to auth.uid(),
-- which means the client never sends it and cannot forge it.
--
-- The column names match src/lib/db/schema.sql, so the same service layer
-- works against either backend. The difference is owner_id and the policies.

-- ===== Courses =====
CREATE TABLE IF NOT EXISTS public.courses (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  mandatory BOOLEAN DEFAULT FALSE,
  validity_months INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- A code is unique per account, not globally: two companies may both run H2S.
  UNIQUE (owner_id, code)
);

-- ===== Certificates =====
CREATE TABLE IF NOT EXISTS public.certificates (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL,
  title TEXT NOT NULL,
  image_data TEXT,
  image_url TEXT,
  summary TEXT,
  issuer TEXT,
  issued_at TEXT,
  expires_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, certificate_number)
);

-- ===== Departments =====
-- name_key is the lower-case name, so "Operations" and "operations" cannot
-- both be registered by the same account.
CREATE TABLE IF NOT EXISTS public.departments (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, name_key)
);

-- ===== Employees =====
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  job_title TEXT,
  employment_status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, employee_id)
);

-- ===== Employee contacts =====
-- Personal contact data. Never exported in a report; see docs/PRIVACY.md.
CREATE TABLE IF NOT EXISTS public.employee_contacts (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  authorization_basis TEXT,
  verified_at TIMESTAMPTZ,
  channel TEXT CHECK (channel IN ('email', 'sms', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, employee_id)
);

-- ===== Reminders sent (audit log) =====
CREATE TABLE IF NOT EXISTS public.reminders_sent (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  course_code TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  channel TEXT CHECK (channel IN ('email', 'sms')),
  status TEXT CHECK (status IN ('sent', 'failed', 'bounced')) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_courses_owner ON public.courses(owner_id);
CREATE INDEX IF NOT EXISTS idx_certificates_owner ON public.certificates(owner_id);
CREATE INDEX IF NOT EXISTS idx_departments_owner ON public.departments(owner_id);
CREATE INDEX IF NOT EXISTS idx_employees_owner ON public.employees(owner_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees(owner_id, department);
CREATE INDEX IF NOT EXISTS idx_employee_contacts_owner ON public.employee_contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_reminders_owner ON public.reminders_sent(owner_id);
CREATE INDEX IF NOT EXISTS idx_reminders_employee ON public.reminders_sent(owner_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_at ON public.reminders_sent(sent_at);

-- ===== Row-level security =====
-- Without these policies the anon key would read every row. With them a
-- request only ever sees the rows whose owner_id is the signed-in user.
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders_sent ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'courses', 'certificates', 'departments',
    'employees', 'employee_contacts', 'reminders_sent'
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
