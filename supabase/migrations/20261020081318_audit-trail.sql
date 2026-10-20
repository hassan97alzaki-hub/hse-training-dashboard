-- Audit trail — who changed which training row, when, and what it said before
--
-- Writes are made by a trigger inside the database, not by application code,
-- so no code path can skip them. The log is append-only: clients get SELECT
-- and nothing else, and no policy lets anyone edit or remove a row.
--
-- Scope: training_records, requirements, requirements_approval. Employees are
-- deliberately left out for now — every import would write one row per person.
--
-- Safe to run twice: every statement is guarded.

-- ===== The log =====

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  -- NULL when the write had no authenticated user (service role, SQL editor).
  actor_user_id UUID,
  table_name   TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  -- `id` for most tables. requirements_approval has no `id`; its key is owner_id.
  row_id       TEXT NOT NULL,
  before_data  JSONB,
  after_data   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_time
  ON public.audit_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_row
  ON public.audit_log(table_name, row_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Append-only at the privilege level as well as the policy level. Even if a
-- future policy were added by mistake, the grant would still refuse the write.
REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

DROP POLICY IF EXISTS audit_log_member_select ON public.audit_log;
CREATE POLICY audit_log_member_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- ===== The trigger =====
--
-- SECURITY DEFINER so the insert succeeds for a member who has no insert
-- right on the log. Search path pinned, as with every definer function in
-- this project.

CREATE OR REPLACE FUNCTION public.write_audit_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_json JSONB;
  new_json JSONB;
  current_row JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_json := to_jsonb(OLD);
    new_json := NULL;
    current_row := old_json;
  ELSE
    old_json := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    new_json := to_jsonb(NEW);
    current_row := new_json;
  END IF;

  INSERT INTO public.audit_log (
    workspace_id, actor_user_id, table_name, action, row_id, before_data, after_data
  ) VALUES (
    (current_row->>'workspace_id')::UUID,
    auth.uid(),
    TG_TABLE_NAME,
    lower(TG_OP),
    COALESCE(current_row->>'id', current_row->>'owner_id'),
    old_json,
    new_json
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_row() FROM PUBLIC;

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['training_records', 'requirements', 'requirements_approval']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'audit_' || target, target);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_row()',
      'audit_' || target, target);
  END LOOP;
END $$;
