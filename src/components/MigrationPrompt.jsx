import { useState } from 'react';
import { CloudUpload, AlertTriangle, Check } from 'lucide-react';

/**
 * Offers to move this browser's data into the signed-in workspace.
 *
 * Shown once, when a signed-in account finds data in the browser. The choice
 * is the user's: the alternative — moving it silently — is the same action
 * with the decision taken away, and it is not reversible from their side.
 *
 * Where the workspace already holds rows, the choice is named rather than
 * decided: merging and keeping the workspace as it is are both reasonable,
 * and only the person who imported both knows which.
 */
export function MigrationPrompt({ t, localCount, workspaceCount, onMigrate, onDismiss }) {
  const [state, setState] = useState('offered'); // offered | working | done | failed
  const [result, setResult] = useState(null);

  const run = async () => {
    setState('working');
    const outcome = await onMigrate();
    setResult(outcome);
    setState(outcome?.status === 'migrated' ? 'done' : 'failed');
  };

  if (state === 'done') {
    return (
      <div className="migration-prompt migration-prompt--done" role="status">
        <Check size={18} />
        <div>
          <strong>{t('migrationDoneTitle')}</strong>
          <p>{t('migrationDoneBody').replace('{count}', String(result?.moved ?? 0))}</p>
        </div>
        <button type="button" className="migration-dismiss" onClick={onDismiss}>
          {t('dismiss')}
        </button>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div className="migration-prompt migration-prompt--failed" role="alert">
        <AlertTriangle size={18} />
        <div>
          <strong>{t('migrationFailedTitle')}</strong>
          {/* Said plainly, because the reassurance is the point: the rows are
              still here and the attempt can be repeated. */}
          <p>{t('migrationFailedBody')}</p>
        </div>
        <button type="button" className="migration-retry" onClick={run}>
          {t('tryAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="migration-prompt" role="region" aria-label={t('migrationTitle')}>
      <CloudUpload size={18} />
      <div>
        <strong>{t('migrationTitle')}</strong>
        <p>{t('migrationBody').replace('{count}', String(localCount))}</p>
        {workspaceCount > 0 && (
          <p className="migration-warning">
            {t('migrationWorkspaceNotEmpty').replace('{count}', String(workspaceCount))}
          </p>
        )}
      </div>
      <div className="migration-actions">
        <button type="button" className="migration-go" onClick={run} disabled={state === 'working'}>
          {state === 'working' ? t('working') : t('migrationAction')}
        </button>
        <button type="button" className="migration-dismiss" onClick={onDismiss} disabled={state === 'working'}>
          {t('migrationLater')}
        </button>
      </div>
    </div>
  );
}

export default MigrationPrompt;
