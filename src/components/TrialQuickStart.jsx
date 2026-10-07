import { PlayCircle, Upload, ClipboardCheck } from 'lucide-react';

const STEPS = [
  { key: 'trialStep1', icon: PlayCircle },
  { key: 'trialStep2', icon: Upload },
  { key: 'trialStep3', icon: ClipboardCheck },
];

/**
 * Three-step quick start for a trial build: load the demonstration data,
 * import a file, review and export. Text only — it starts nothing by itself,
 * so a reader is never surprised by an action.
 */
export default function TrialQuickStart({ t, customerDataAllowed = true }) {
  return (
    <div className="section" data-testid="trial-quick-start" aria-label={t('trialQuickStartTitle')}>
      <div className="section-header">
        <span className="section-title">{t('trialQuickStartTitle')}</span>
      </div>
      <ol style={{ margin: 0, paddingInlineStart: 20, display: 'grid', gap: 8 }}>
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const disabled = index === 1 && !customerDataAllowed;
          return (
            <li key={step.key} style={{ opacity: disabled ? 0.55 : 1 }}>
              <Icon size={14} style={{ verticalAlign: 'text-bottom', marginInlineEnd: 6 }} />
              {t(step.key)}
              {disabled && <span className="text-muted"> — {t('trialStepDisabled')}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
