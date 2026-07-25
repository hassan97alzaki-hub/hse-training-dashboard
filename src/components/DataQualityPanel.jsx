export default function DataQualityPanel({ importResult, unconfiguredEmployees, duplicates, configWarnings, t }) {
  const invalidRows = importResult?.invalidRecords || [];
  const importErrors = importResult?.errors || [];
  const importWarnings = importResult?.warnings || [];

  const hasIssues =
    invalidRows.length > 0 ||
    duplicates.length > 0 ||
    configWarnings.length > 0 ||
    importErrors.length > 0;

  if (!hasIssues) {
    return <div className="text-muted text-sm">{t('noIssues')}</div>;
  }

  return (
    <div className="dq-panel">
      {invalidRows.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>
            {t('invalidRows')} <span className="badge-count" style={{ background: '#dc2626' }}>{invalidRows.length}</span>
          </div>
          {invalidRows.slice(0, 10).map((inv, i) => (
            <div key={i} className="dq-issue error">
              {t('row')} {inv.row}: {inv.errors.join(' | ')}
            </div>
          ))}
          {invalidRows.length > 10 && (
            <div className="dq-issue warning">…and {invalidRows.length - 10} more invalid rows</div>
          )}
        </div>
      )}

      {duplicates.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>
            {t('duplicateRecords')} <span className="badge-count" style={{ background: '#d97706' }}>{duplicates.length}</span>
          </div>
          {duplicates.slice(0, 8).map((dup, i) => (
            <div key={i} className="dq-issue warning">
              Duplicate group: {dup.key} ({dup.records.length} records — best selected per policy)
            </div>
          ))}
          {duplicates.length > 8 && (
            <div className="dq-issue info">…and {duplicates.length - 8} more duplicate groups</div>
          )}
        </div>
      )}

      {configWarnings.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>
            {t('configWarnings')} <span className="badge-count" style={{ background: '#7c3aed' }}>{configWarnings.length}</span>
          </div>
          {configWarnings.map((w, i) => (
            <div key={i} className="dq-issue info">{w}</div>
          ))}
        </div>
      )}

      {importWarnings.map((w, i) => (
        <div key={i} className="dq-issue warning">{w}</div>
      ))}
    </div>
  );
}
