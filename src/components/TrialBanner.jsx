import { CalendarClock, ShieldCheck, Lock } from 'lucide-react';
import { TRIAL_PHASE, trialHeadlineKey } from '../lib/trial.js';

const PHASE_ACCENT = {
  [TRIAL_PHASE.BEFORE]: 'var(--info)',
  [TRIAL_PHASE.ACTIVE]: 'var(--brand)',
  [TRIAL_PHASE.EXPIRED]: 'var(--critical)',
  [TRIAL_PHASE.MISCONFIGURED]: 'var(--warning)',
};

/**
 * Trial banner: the company, the window, the days left and the privacy
 * statement. It renders nothing when the build carries no trial.
 *
 * The countdown is a presentation of build-time dates; it is not access
 * control (see src/lib/trial.js).
 */
export default function TrialBanner({ state, t }) {
  if (!state || state.phase === TRIAL_PHASE.OFF) return null;
  const accent = PHASE_ACCENT[state.phase] ?? 'var(--info)';
  const Icon = state.phase === TRIAL_PHASE.EXPIRED ? Lock : CalendarClock;

  return (
    <div
      className="dq-card"
      style={{ '--dq-accent': accent, marginBottom: 16 }}
      role="status"
      aria-live="polite"
      aria-label={t('trialRegionLabel')}
      data-testid="trial-banner"
      data-phase={state.phase}
    >
      <div className="dq-card-header" style={{ color: accent }}>
        <Icon size={16} />
        {t(trialHeadlineKey(state.phase))}
      </div>

      {state.company && (
        <div className="dq-issue">
          <strong>{t('trialCompany')}:</strong> {state.company}
        </div>
      )}

      {state.phase !== TRIAL_PHASE.MISCONFIGURED && (
        <div className="dq-issue" data-testid="trial-window">
          {t('trialWindow')}: {state.startDate} → {state.endDate} ({t('trialTimeZone')}: {state.timeZone})
        </div>
      )}

      {state.phase === TRIAL_PHASE.ACTIVE && (
        <div className="dq-issue" data-testid="trial-days-remaining">
          <strong>{t('trialDaysRemaining')}: {state.daysRemaining}</strong>
        </div>
      )}

      {state.phase === TRIAL_PHASE.BEFORE && (
        <div className="dq-issue">{t('trialNotStarted')}</div>
      )}

      {state.phase === TRIAL_PHASE.EXPIRED && (
        <>
          <div className="dq-issue" data-testid="trial-expired-note">{t('trialExpiredNote')}</div>
          <div className="dq-issue">{t('trialContactInvite')}</div>
        </>
      )}

      {state.phase === TRIAL_PHASE.MISCONFIGURED && (
        <div className="dq-issue">{t('trialMisconfiguredNote')}</div>
      )}

      <div className="dq-issue text-muted">
        <ShieldCheck size={14} style={{ verticalAlign: 'text-bottom', marginInlineEnd: 4 }} />
        {t('trialPrivacy')}
      </div>
      <div className="dq-issue text-muted">{t('trialGateNote')}</div>
    </div>
  );
}
