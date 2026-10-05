import { CheckCircle2, XCircle, AlertTriangle, Info, FileSpreadsheet } from 'lucide-react';
import { SEVERITY } from '../lib/matrixWorkbook.js';

const SEVERITY_ICON = {
  [SEVERITY.ERROR]: { icon: XCircle, color: 'var(--critical)' },
  [SEVERITY.WARNING]: { icon: AlertTriangle, color: 'var(--warning)' },
  [SEVERITY.INFO]: { icon: Info, color: 'var(--info)' },
};

// Pre-import preview for the three-sheet Training Matrix workbook.
// Shows counts, issue codes and row numbers only — no names, badges or
// certificate numbers.
export default function MatrixImportPreview({ preview, t, onApprove, onCancel }) {
  const { conversion, comparison, asOfDate, fileName } = preview;
  const c = conversion.counts || {};
  const label = (code) => {
    const text = t(`mx_${code}`);
    return text === `mx_${code}` ? code : text;
  };

  const counts = [
    ['mxCountEmployees', c.employees],
    ['mxCountCourses', c.courses],
    ['mxCountTrainingRows', c.trainingRows],
    ['mxCountImported', c.importedRecords],
    ['mxCountSkipped', c.skippedNoEvidence],
    ['mxCountNoRecords', c.activeWithoutRecords],
    ['mxCountRequirements', c.requirementRows],
    ['mxCountDeptRoles', c.departmentRolePairs],
  ];

  return (
    <div className="section" role="region" aria-label={t('mxPreviewTitle')} data-testid="matrix-preview">
      <div className="section-header">
        <span className="section-title"><FileSpreadsheet size={18} /> {t('mxPreviewTitle')}</span>
      </div>
      <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
        {fileName} · {t('asOfDate')}: {asOfDate}
      </p>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {counts.map(([key, value]) => (
          <div className="kpi-card" key={key}>
            <div className="kpi-label">{t(key)}</div>
            <div className="kpi-value">{value ?? '—'}</div>
          </div>
        ))}
      </div>

      <div className="dq-card" style={{ '--dq-accent': 'var(--info)', marginBottom: 16 }}>
        <div className="dq-card-header"><Info size={16} />{t('mxDeptLevelTitle')}</div>
        <div className="dq-issue">{t('mxDeptLevelNote')}</div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>{t('mxSeverity')}</th>
              <th>{t('mxIssue')}</th>
              <th style={{ textAlign: 'center' }}>{t('mxCount')}</th>
              <th>{t('mxRows')}</th>
            </tr>
          </thead>
          <tbody>
            {conversion.issues.length === 0 ? (
              <tr><td colSpan={4}>{t('mxNoIssues')}</td></tr>
            ) : conversion.issues.map(issue => {
              const { icon: Icon, color } = SEVERITY_ICON[issue.severity];
              return (
                <tr key={issue.code} data-severity={issue.severity}>
                  <td style={{ color }}><Icon size={14} /> {t(`mxSeverity_${issue.severity}`)}</td>
                  <td>
                    {label(issue.code)}
                    {issue.daysDistribution && (
                      <div className="text-muted text-sm">
                        {t('mxDaysDistribution')}: {Object.entries(issue.daysDistribution)
                          .sort((a, b) => Number(a[0]) - Number(b[0]))
                          .map(([d, n]) => `${d}d × ${n}`).join(', ')}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>{issue.count}</td>
                  <td className="text-muted text-sm">{issue.rows.slice(0, 5).join(', ')}{issue.rows.length > 5 ? ' …' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {comparison && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>{t('mxStatusCompare')}</th>
                <th style={{ textAlign: 'center' }}>{t('mxCount')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(comparison.matrix).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <tr key={k}><td>{k}</td><td style={{ textAlign: 'center' }}>{n}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted text-sm" style={{ padding: '8px 4px' }}>{t('mxStatusCompareHint')}</p>
        </div>
      )}

      {!conversion.ok && (
        <div className="import-banner error" style={{ marginBottom: 12 }}>
          <div className="import-banner-title">{t('mxBlocked')}</div>
        </div>
      )}

      <div className="flex-row">
        <button className="btn btn-primary" onClick={onApprove} disabled={!conversion.ok}>
          <CheckCircle2 size={15} />{t('mxApprove')}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          <XCircle size={15} />{t('mxCancel')}
        </button>
      </div>
    </div>
  );
}
