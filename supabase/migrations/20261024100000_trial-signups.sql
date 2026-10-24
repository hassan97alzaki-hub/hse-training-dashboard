-- Trial sign-ups — the public request form for the 7-day trial.
--
-- Anonymous visitors may insert one row and nothing else. No one reads the
-- table through the API: the owner reads it with the service role from the
-- Supabase dashboard. The honeypot column must stay empty; a bot that fills
-- the hidden field is refused by this table, not by the page.
--
-- Safe to run twice: every statement is guarded.

CREATE TABLE IF NOT EXISTS public.trial_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL CHECK (char_length(company_name) BETWEEN 2 AND 120),
  work_email TEXT NOT NULL UNIQUE CHECK (char_length(work_email) BETWEEN 6 AND 254),
  country TEXT CHECK (country IS NULL OR char_length(country) <= 60),
  headcount_estimate INTEGER CHECK (headcount_estimate IS NULL OR headcount_estimate BETWEEN 1 AND 100000),
  file_format TEXT CHECK (file_format IS NULL OR file_format IN ('CSV', 'XLSX')),
  interest JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(interest) = 'array'),
  source_landing TEXT CHECK (source_landing IS NULL OR source_landing IN ('/en', '/ar')),
  honeypot TEXT CHECK (honeypot IS NULL OR honeypot = ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_signups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trial_signups FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.trial_signups TO anon, authenticated;

DROP POLICY IF EXISTS trial_signups_anon_insert ON public.trial_signups;
CREATE POLICY trial_signups_anon_insert ON public.trial_signups
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
