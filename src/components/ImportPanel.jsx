import { useRef } from 'react';

export default function ImportPanel({
  t,
  onLoadDemo,
  onTrainingImport,
  onRequirementsImport,
  onExportPDF,
  onExportCSV,
  onExportPriorityCSV,
  onReset,
  hasData,
  hasRequirements,
  isLoading,
  importBanner,
}) {
  const trainingRef = useRef(null);
  const reqRef = useRef(null);

  function handleTrainingFile(e) {
    const file = e.target.files?.[0];
    if (file) onTrainingImport(file);
    e.target.value = '';
  }

  function handleReqFile(e) {
    const file = e.target.files?.[0];
    if (file) onRequirementsImport(file);
    e.target.value = '';
  }

  return (
    <div>
      <div className="action-bar">
        <button className="btn btn-primary" onClick={onLoadDemo} disabled={isLoading}>
          {t('loadDemoData')}
        </button>

        <label className="file-input-label">
          {t('importTrainingData')}
          <span className="text-muted text-sm">({t('importTrainingHint')})</span>
          <input ref={trainingRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleTrainingFile} />
        </label>

        <label className="file-input-label">
          {t('importRequirements')}
          <span className="text-muted text-sm">({t('importRequirementsHint')})</span>
          <input ref={reqRef} type="file" accept=".csv" onChange={handleReqFile} />
        </label>

        <div className="ml-auto flex-row">
          <button className="btn btn-secondary" onClick={onExportPDF} disabled={!hasData}>
            {t('exportPDF')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onExportCSV} disabled={!hasData}>
            {t('exportCSV')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onExportPriorityCSV} disabled={!hasData}>
            {t('exportPriorityCSV')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onReset} disabled={!hasData && !hasRequirements}>
            {t('resetData')}
          </button>
        </div>
      </div>

      {importBanner && (
        <div className={`import-banner ${importBanner.type}`}>
          <div className="import-banner-title">{importBanner.title}</div>
          {importBanner.lines && importBanner.lines.length > 0 && (
            <ul>
              {importBanner.lines.slice(0, 8).map((l, i) => <li key={i}>{l}</li>)}
              {importBanner.lines.length > 8 && <li>…and {importBanner.lines.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
