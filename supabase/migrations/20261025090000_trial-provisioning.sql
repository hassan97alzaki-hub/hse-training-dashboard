-- Trial provisioning — a trial request becomes a working account at once
--
-- The owner's decision of 2026-10-25: no hand-made trial accounts. The
-- trial-signup Edge Function creates the auth user with the service role,
-- then calls provision_trial() here, which writes everything else the account
-- needs in one transaction: the workspace with its seven-day end, the owner
-- membership and the request row the measurement counts. Either all of it
-- exists afterwards or none of it does.
--
-- Both functions are for the service role only. Nothing here is callable
-- with the publishable key, so the closed self-sign-up stays closed: the
-- only way to an account is the function, and the function enforces the cap.
--
-- Safe to run twice: every statement is guarded.

-- The cap from SPECS-TRIAL: twenty trial accounts, then a waiting list.
-- Every workspace with a trial end counts, ended trials included, so the cap
-- is on accounts handed out, not on accounts currently running.
CREATE OR REPLACE FUNCTION public.trial_slots_left()
RETURNS INTEGER LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(0, 20 - (SELECT count(*)::INTEGER FROM public.workspaces WHERE trial_ends_at IS NOT NULL));
$$;

CREATE OR REPLACE FUNCTION public.provision_trial(
  p_user UUID,
  p_company TEXT,
  p_email TEXT,
  p_country TEXT,
  p_headcount INTEGER,
  p_file_format TEXT,
  p_interest JSONB,
  p_source TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws UUID;
BEGIN
  -- An account that already has a workspace keeps it: a retried request must
  -- not hand out a second trial.
  SELECT workspace_id INTO ws FROM public.workspace_members
  WHERE user_id = p_user ORDER BY joined_at LIMIT 1;
  IF ws IS NOT NULL THEN
    RETURN ws;
  END IF;

  -- Midnight in Asia/Riyadh at the start of the eighth calendar day: the day
  -- of the request is day one and the trial runs through day seven.
  INSERT INTO public.workspaces (name, trial_ends_at)
  VALUES (p_company, (((now() AT TIME ZONE 'Asia/Riyadh')::date + 7)::timestamp AT TIME ZONE 'Asia/Riyadh'))
  RETURNING id INTO ws;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws, p_user, 'owner');

  -- Someone who sent the earlier request form already has a row; it stays.
  INSERT INTO public.trial_signups
    (company_name, work_email, country, headcount_estimate, file_format, interest, source_landing)
  VALUES
    (p_company, p_email, p_country, p_headcount, p_file_format, COALESCE(p_interest, '[]'::jsonb), p_source)
  ON CONFLICT (work_email) DO NOTHING;

  RETURN ws;
END;
$$;

REVOKE ALL ON FUNCTION public.trial_slots_left() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_trial(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_slots_left() TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_trial(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT) TO service_role;
