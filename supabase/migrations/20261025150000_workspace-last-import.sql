-- Import event — the fact of an import, not its data
--
-- SPECS-TRIAL v1.4, R-1. Imported training files stay in the browser until
-- R-3 (after the measurement gate), so the database never sees an import and
-- the gate item "uploaded training data" could not be measured. These two
-- columns record only that a workspace imported a file, when, and how many
-- training rows it held. No employee, course or certificate value is stored.
--
-- The client cannot write the columns directly: 20261024120000_trial-expiry
-- revoked UPDATE on `workspaces` and granted only `name`, so a member cannot
-- move `trial_ends_at` or `plan_tier`. The same holds here. The only way in is
-- `record_import()`, which takes the time from the database clock and writes
-- the caller's own workspace.
--
-- Safe to run twice: every statement is guarded.

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS last_import_at TIMESTAMPTZ;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS last_import_rows INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_last_import_rows_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_last_import_rows_check
      CHECK (last_import_rows IS NULL OR last_import_rows >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.workspaces.last_import_at IS
  'Time of the latest successful training-file import (database clock). Fact only; no imported data is stored.';
COMMENT ON COLUMN public.workspaces.last_import_rows IS
  'Number of training rows in that import.';

-- ===== Recording an import =====
--
-- SECURITY DEFINER because the caller has no UPDATE privilege on these
-- columns. It writes only the workspace the caller belongs to
-- (`default_workspace_id()`), only if the caller may write training data
-- there, and never on a frozen trial — an ended trial cannot import anyway.
-- A caller with no workspace or no write right is ignored rather than refused:
-- the import itself already succeeded in the browser, and the event must
-- never turn that into an error.

CREATE OR REPLACE FUNCTION public.record_import(row_count INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws UUID := public.default_workspace_id();
BEGIN
  IF row_count IS NULL OR row_count < 1 OR row_count > 1000000 THEN
    RAISE EXCEPTION 'record_import: row_count out of range';
  END IF;
  IF ws IS NULL OR NOT public.can_write_workspace(ws) OR public.is_workspace_frozen(ws) THEN
    RETURN;
  END IF;
  UPDATE public.workspaces
     SET last_import_at = now(),
         last_import_rows = row_count
   WHERE id = ws;
END;
$$;

REVOKE ALL ON FUNCTION public.record_import(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_import(integer) TO authenticated;
