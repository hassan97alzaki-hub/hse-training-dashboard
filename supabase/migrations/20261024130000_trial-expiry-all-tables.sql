-- Trial expiry — the freeze covers every table of the training data
--
-- 20261024120000_trial-expiry.sql froze `training_records` and `requirements`,
-- the two tables SPECS-TRIAL v1.2 named. The reference then extended it to the
-- other seven (approval of 2026-10-24): an ended trial was still able to add
-- employees, courses, departments, certificates and contacts, log reminders
-- and approve its requirements, which is the product in use, not frozen.
--
-- Same mechanism, nothing else changes: RESTRICTIVE policies, AND-ed with the
-- membership policies of 0003, so they only ever take access away. Reading is
-- left alone everywhere, so a frozen workspace still exports in full. A NULL
-- `trial_ends_at` is still never frozen.
--
-- Safe to run twice: every statement is guarded.

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'courses', 'certificates', 'departments', 'employees',
    'employee_contacts', 'reminders_sent', 'requirements_approval'
  ]
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
