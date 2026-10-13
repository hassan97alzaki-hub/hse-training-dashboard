import { AlertCircle, Copy, ClipboardX, ShieldCheck } from 'lucide-react';

export default function DataQualityPanel({ importResult, unconfiguredEmployees, duplicates, configWarnings, unregisteredCourses, t }) {
  const invalidRows = importResult?.invalidRecords || [];
  const importErrors = importResult?.errors || [];
  const importWarnings = importResult?.warnings || [];

  const hasIssues =
    invalidRows.length > 0 ||
    duplicates.length > 0 ||
    configWarnings.length > 0 ||
    (unregisteredCourses ?? []).length > 0 ||
    importErrors.length > 0;

  if (!hasIssues) {
    return (
      <div className="dq-clear">
        <ShieldCheck size={20} />
        <div>
          <div className="dq-clear-title">{t('dqAllClearTitle')}</div>
          <div className="dq-clear-body">{t('dqAllClearBody')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dq-panel">
      {invalidRows.length > 0 && (
        <div className="dq-card" style={{ '--dq-accent': 'var(--critical)' }}>
          <div className="dq-card-header">
            <AlertCircle size={16} />
            {t('dqInvalidTitle')}
            <span className="badge-count" style={{ background: 'var(--critical)' }}>{invalidRows.length}</span>
          </div>
          {invalidRows.slice(0, 10).map((inv, i) => (
            <div key={i} className="dq-issue">
              {t('row')} {inv.row}: {inv.errors.join(' | ')}
            </div>
          ))}
          {invalidRows.length > 10 && (
            <div className="dq-issue">…and {invalidRows.length - 10} more invalid rows</div>
          )}
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="dq-card" style={{ '--dq-accent': 'var(--warning)' }}>
          <div className="dq-card-header">
            <Copy size={16} />
            {t('dqDuplicateTitle')}
            <span className="badge-count" style={{ background: 'var(--warning)' }}>{duplicates.length}</span>
          </div>
          {duplicates.slice(0, 8).map((dup, i) => (
            <div key={i} className="dq-issue">
              Duplicate group: {dup.key} ({dup.records.length} records — best selected per policy)
            </div>
          ))}
          {duplicates.length > 8 && (
            <div className="dq-issue">…and {duplicates.length - 8} more duplicate groups</div>
          )}
        </div>
      )}

      {configWarnings.length > 0 && (
        <div className="dq-card" style={{ '--dq-accent': 'var(--info)' }}>
          <div className="dq-card-header">
            <ClipboardX size={16} />
            {t('dqConfigTitle')}
            <span className="badge-count" style={{ background: 'var(--info)' }}>{configWarnings.length}</span>
          </div>
          {configWarnings.map((w, i) => (
            <div key={i} className="dq-issue">{w}</div>
          ))}
        </div>
      )}

      {(unregisteredCourses ?? []).length > 0 && (
        <div className="dq-card" style={{ '--dq-accent': 'var(--warning)' }}>
          <div className="dq-card-header">
            <ClipboardX size={16} />
            {t('dqUnregisteredTitle')}
            <span className="badge-count" style={{ background: 'var(--warning)' }}>{unregisteredCourses.length}</span>
          </div>
          {unregisteredCourses.map((code, i) => (
            <div key={i} className="dq-issue">{t('dqUnregisteredRow')} {code}</div>
          ))}
        </div>
      )}

      {importWarnings.length > 0 && (
        <div className="dq-card" style={{ '--dq-accent': 'var(--neutral)' }}>
          {importWarnings.map((w, i) => (
            <div key={i} className="dq-issue">{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
