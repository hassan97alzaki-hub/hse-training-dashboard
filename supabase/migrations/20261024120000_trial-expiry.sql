-- Trial expiry — the seven-day trial ends in the database, not in the page
--
-- SPECS-TRIAL v1.2, task 2. A trial workspace carries the instant its trial
-- ends. From that instant its training data is frozen: members may still read
-- and export it, and nothing can be inserted, changed or deleted — whatever
-- client sends the request, because the refusal is a policy, not a button.
--
-- `trial_ends_at` is NULL for every workspace that is not a trial, and a NULL
-- workspace is never frozen. That is what keeps the owner's own workspace, and
-- every workspace that existed before this migration, exactly as it was.
--
-- The owner sets the value by hand when a trial account is created (see
-- docs/TRIAL_CLOUD_RUNBOOK.md): midnight in Asia/Riyadh at the start of the
-- eighth calendar day, so a trial started on any day runs through the seventh.
-- The comparison is against the database clock, `now()`, never a device's.
--
-- Safe to run twice: every statement is guarded.

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workspaces.trial_ends_at IS
  'Instant the trial ends; writes to training data stop from then on. NULL means not a trial, never frozen.';

-- ===== Only the name is the client's to change =====
--
-- `workspaces_admin_update` lets an owner or admin update their workspace, and
-- a policy chooses rows, not columns. Without this, a trial owner could clear
-- their own `trial_ends_at` over the REST API and never be frozen — and the
-- same was already true of `plan_tier`, which 0003 says nobody may write from
-- the client. A column privilege is what makes both statements true.

REVOKE UPDATE ON public.workspaces FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name) ON public.workspaces TO authenticated;

-- ===== Is this workspace's trial over? =====
--
-- SECURITY DEFINER for the same reason as the membership lookups in 0003: it
-- reads `workspaces`, whose own policies would otherwise apply to the read.
-- A workspace that does not exist is not frozen; the membership policies
-- already refuse every write to it.

CREATE OR REPLACE FUNCTION public.is_workspace_frozen(ws UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT trial_ends_at <= now() FROM public.workspaces WHERE id = ws),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_frozen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_frozen(uuid) TO authenticated;

-- ===== The freeze =====
--
-- RESTRICTIVE policies are AND-ed with the permissive membership policies of
-- 0003 instead of OR-ed, so they can only take access away. The membership
-- rules stay untouched and still decide who may write; these decide when.
-- SELECT has no restrictive policy: a frozen workspace stays readable, which
-- is what lets its members export everything after the trial.

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['training_records', 'requirements']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_trial_insert', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_trial_update', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_trial_delete', target);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_workspace_frozen(workspace_id))',
      target || '_trial_insert', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_workspace_frozen(workspace_id)) WITH CHECK (NOT public.is_workspace_frozen(workspace_id))',
      target || '_trial_update', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_workspace_frozen(workspace_id))',
      target || '_trial_delete', target);
  END LOOP;
END $$;
