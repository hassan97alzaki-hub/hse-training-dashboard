import { useRef } from 'react';
import { PlayCircle, UploadCloud, FileSpreadsheet, RotateCcw } from 'lucide-react';

export default function ImportPanel({
  t,
  onLoadDemo,
  onTrainingImport,
  onRequirementsImport,
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
          <PlayCircle size={15} />
          {t('loadDemoData')}
        </button>

        <label className="file-input-label">
          <UploadCloud size={15} />
          {t('importTrainingData')}
          <span className="text-muted text-sm">({t('importTrainingHint')})</span>
          <input ref={trainingRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleTrainingFile} />
        </label>

        <label className="file-input-label">
          <FileSpreadsheet size={15} />
          {t('importRequirements')}
          <span className="text-muted text-sm">({t('importRequirementsHint')})</span>
          <input ref={reqRef} type="file" accept=".csv" onChange={handleReqFile} />
        </label>

        <div className="ml-auto flex-row">
          <button className="btn btn-ghost btn-sm" onClick={onReset} disabled={!hasData && !hasRequirements}>
            <RotateCcw size={13} />
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
