import { Gauge, UserX, FileWarning, Copy, TrendingDown } from 'lucide-react';

/**
 * Executive Summary — a presentation-only rollup of numbers already
 * computed by lib/complianceEngine.js (kpis, priorityActions, duplicates).
 * No new business logic: every value here is a direct read or a simple
 * client-side aggregation (count/min) over data the engine already produced.
 */
export default function ExecutiveSummary({ kpis, priorityActions, duplicateCount, t }) {
  if (!kpis) return null;

  const overallCompliance = kpis.requirementCompliance;

  const immediateActionCount = new Set(
    (priorityActions || [])
      .filter(a => a.priority === 'Critical')
      .map(a => a.Employee_ID)
  ).size;

  const missingCount = kpis.statusCounts?.MISSING ?? 0;

  const deptList = kpis.departmentCompliance || [];
  let topRisk = null;
  for (const d of deptList) {
    if (d.percentage == null) continue;
    if (!topRisk || d.percentage < topRisk.percentage) topRisk = d;
  }

  function pctTone(pct) {
    if (pct == null) return 'neutral';
    if (pct >= 80) return 'success';
    if (pct >= 60) return 'warning';
    return 'critical';
  }

  return (
    <div className="exec-summary">
      <div className="exec-summary-title">
        <Gauge size={20} />
        {t('execSummaryTitle')}
      </div>
      <div className="exec-grid">
        <div className="exec-item">
          <span className="exec-item-label"><Gauge size={13} /> {t('execOverallCompliance')}</span>
          <span className={`exec-item-value ${pctTone(overallCompliance)}`}>
            {overallCompliance != null ? `${overallCompliance}%` : '—'}
          </span>
        </div>
        <div className="exec-divider" />
        <div className="exec-item">
          <span className="exec-item-label"><UserX size={13} /> {t('execImmediateAction')}</span>
          <span className={`exec-item-value ${immediateActionCount > 0 ? 'critical' : 'success'}`}>
            {immediateActionCount}
          </span>
        </div>
        <div className="exec-divider" />
        <div className="exec-item">
          <span className="exec-item-label"><FileWarning size={13} /> {t('execMissingTraining')}</span>
          <span className={`exec-item-value ${missingCount > 0 ? 'warning' : 'success'}`}>
            {missingCount}
          </span>
        </div>
        <div className="exec-divider" />
        <div className="exec-item">
          <span className="exec-item-label"><Copy size={13} /> {t('execDuplicateRecords')}</span>
          <span className={`exec-item-value ${duplicateCount > 0 ? 'warning' : 'success'}`}>
            {duplicateCount}
          </span>
        </div>
        <div className="exec-divider" />
        <div className="exec-item">
          <span className="exec-item-label"><TrendingDown size={13} /> {t('execTopRiskDept')}</span>
          <span className="exec-item-value neutral text-lg">
            {topRisk ? `${topRisk.department} — ${topRisk.percentage}%` : t('execNoRisk')}
          </span>
        </div>
      </div>
    </div>
  );
}
