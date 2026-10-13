-- Hybrid Database Schema (Supabase PostgreSQL + SQLite compatible)
-- Both databases use identical schema for abstraction layer portability

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  mandatory BOOLEAN DEFAULT FALSE,
  validity_months INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Certificates table
CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  certificate_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  image_data TEXT,
  image_url TEXT,
  summary TEXT,
  issuer TEXT,
  issued_at TEXT,
  expires_at TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departments registered through the interface. A department that only exists
-- in imported data is not stored here: it is discovered from the people. The
-- name_key is the lower-case name, so "Operations" and "operations" cannot
-- both be registered.
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employees added through the interface. Imported people are not stored here:
-- an import stays the source of truth for its own rows. The department is a
-- free-text name, which is also how a new department comes into existence.
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  job_title TEXT,
  employment_status TEXT DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employee Contacts table
CREATE TABLE IF NOT EXISTS employee_contacts (
  id TEXT PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  authorization_basis TEXT,
  verified_at TIMESTAMP,
  channel TEXT CHECK(channel IN ('email', 'sms', 'both')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reminders Sent table (audit log)
CREATE TABLE IF NOT EXISTS reminders_sent (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  course_code TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  channel TEXT CHECK(channel IN ('email', 'sms')),
  status TEXT CHECK(status IN ('sent', 'failed', 'bounced')) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);
CREATE INDEX IF NOT EXISTS idx_certificates_number ON certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_departments_name_key ON departments(name_key);
CREATE INDEX IF NOT EXISTS idx_employees_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employee_contacts_id ON employee_contacts(employee_id);
CREATE INDEX IF NOT EXISTS idx_reminders_employee ON reminders_sent(employee_id);
CREATE INDEX IF NOT EXISTS idx_reminders_course ON reminders_sent(course_code);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_at ON reminders_sent(sent_at);

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
