import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { fetchCloudTrial, trialDaysRemaining } from '../lib/cloudTrial.js';
import { toReportingDateStr } from '../lib/clock.js';

/**
 * Cloud trial banner: the days left in the workspace's seven-day trial.
 *
 * Shown to the workspace owner only, while the trial runs. It renders nothing
 * in a local-only build, for a workspace that is not a trial, for any other
 * role, and once the trial has ended (SPECS-TRIAL v1.2, task 2). The freeze
 * itself is enforced by the database, not by this component.
 *
 * Props:
 * - t: translate function
 * - load: optional loader, injectable for tests
 */
export default function CloudTrialBanner({ t, load = () => fetchCloudTrial(getSupabaseClient()) }) {
  const [trial, setTrial] = useState(null);

  useEffect(() => {
    let cancelled = false;
    load().then((result) => { if (!cancelled) setTrial(result); }).catch(() => {});
    return () => { cancelled = true; };
    // Read once per page load: the end date does not move while the page is open.
  }, []);

  if (!trial || trial.role !== 'owner') return null;
  const days = trialDaysRemaining(trial.trialEndsAt);
  if (days === null) return null;

  // The last day is the day before the end instant, in Riyadh.
  const lastDay = toReportingDateStr(new Date(new Date(trial.trialEndsAt).getTime() - 1));

  return (
    <div
      className="dq-card"
      style={{ '--dq-accent': 'var(--brand)', marginBottom: 16 }}
      role="status"
      aria-live="polite"
      data-testid="cloud-trial-banner"
    >
      <div className="dq-card-header" style={{ color: 'var(--brand)' }}>
        <CalendarClock size={16} />
        {t('cloudTrialHeadline')}
      </div>
      <div className="dq-issue" data-testid="cloud-trial-days">
        <strong>{t('cloudTrialDaysRemaining').replace('{count}', String(days))}</strong>
        {' — '}
        {t('cloudTrialLastDay').replace('{date}', lastDay)}
      </div>
      <div className="dq-issue text-muted">{t('cloudTrialAfterNote')}</div>
    </div>
  );
}
