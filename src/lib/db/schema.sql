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
CREATE INDEX IF NOT EXISTS idx_employee_contacts_id ON employee_contacts(employee_id);
CREATE INDEX IF NOT EXISTS idx_reminders_employee ON reminders_sent(employee_id);
CREATE INDEX IF NOT EXISTS idx_reminders_course ON reminders_sent(course_code);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_at ON reminders_sent(sent_at);
