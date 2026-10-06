import { FlaskConical } from 'lucide-react';
import {
  isTestRequirements,
  provenanceMessageKey,
} from '../lib/contract/requirementsProvenance.js';

/**
 * Banner shown while the loaded requirements are test scaffolding rather than
 * an approved `HSE-DC-1.0` requirements set (AT-13).
 *
 * It renders nothing for approved requirements and nothing when no requirement
 * is loaded at all; the empty state already covers that case.
 */
export default function TestRequirementsBanner({ provenance, t }) {
  if (!isTestRequirements(provenance)) return null;
  const messageKey = provenanceMessageKey(provenance);

  return (
    <div
      className="dq-card"
      style={{ '--dq-accent': 'var(--warning)', marginBottom: 16 }}
      role="status"
      aria-live="polite"
      aria-label={t('trqTitle')}
      data-testid="test-requirements-banner"
      data-provenance={provenance}
    >
      <div className="dq-card-header" style={{ color: 'var(--warning)' }}>
        <FlaskConical size={16} />
        {t('trqTitle')}
      </div>
      <div className="dq-issue">{t(messageKey)}</div>
      <div className="dq-issue">{t('trqConsequence')}</div>
      <div className="dq-issue text-muted">{t('trqAction')}</div>
    </div>
  );
}
