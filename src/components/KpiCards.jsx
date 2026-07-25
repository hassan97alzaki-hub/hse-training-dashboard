export default function KpiCards({ kpis, t }) {
  if (!kpis) return null;
  const sc = kpis.statusCounts || {};

  const cards = [
    {
      label: t('kpiActiveEmployees'),
      value: kpis.totalActiveEmployees ?? '—',
      className: '',
    },
    {
      label: t('kpiRequirementsConfigured'),
      value: kpis.employeesWithMandatoryReqs ?? '—',
      sub: kpis.employeesNoMandatoryReqs > 0 ? `+${kpis.employeesNoMandatoryReqs} no mandatory reqs` : '',
      className: '',
    },
    {
      label: t('kpiRequirementsNotConfigured'),
      value: kpis.employeesNotConfigured ?? '—',
      valueClass: kpis.employeesNotConfigured > 0 ? 'danger' : '',
      className: '',
    },
    {
      label: t('kpiRequirementCompliance'),
      value: kpis.requirementCompliance != null ? `${kpis.requirementCompliance}%` : '—',
      sub: kpis.totalMandatoryReqs ? `${kpis.compliantReqs}/${kpis.totalMandatoryReqs} req.` : '',
      valueClass: pctClass(kpis.requirementCompliance),
      className: 'featured',
    },
    {
      label: t('kpiFullyCompliant'),
      value: kpis.fullyCompliantPct != null ? `${kpis.fullyCompliantPct}%` : '—',
      sub: kpis.empWithMandatoryReqs ? `${kpis.fullyCompliantCount}/${kpis.empWithMandatoryReqs} emp.` : '',
      valueClass: pctClass(kpis.fullyCompliantPct),
      className: 'featured',
    },
    { label: t('kpiValid'),      value: sc.VALID ?? 0,       className: 'status-valid',      valueClass: 'success' },
    { label: t('kpiExpiring90'), value: sc.EXPIRING_90 ?? 0, className: 'status-exp90',      valueClass: '' },
    { label: t('kpiExpiring60'), value: sc.EXPIRING_60 ?? 0, className: 'status-exp60',      valueClass: '' },
    { label: t('kpiExpiring30'), value: sc.EXPIRING_30 ?? 0, className: 'status-exp30',      valueClass: '' },
    { label: t('kpiExpired'),    value: sc.EXPIRED ?? 0,     className: 'status-expired',    valueClass: (sc.EXPIRED ?? 0) > 0 ? 'danger' : '' },
    { label: t('kpiInProgress'), value: sc.IN_PROGRESS ?? 0, className: 'status-inprogress', valueClass: '' },
    { label: t('kpiNotStarted'), value: sc.NOT_STARTED ?? 0, className: 'status-notstarted', valueClass: '' },
    { label: t('kpiMissing'),    value: sc.MISSING ?? 0,     className: 'status-missing',    valueClass: (sc.MISSING ?? 0) > 0 ? 'danger' : '' },
  ];

  return (
    <div className="kpi-grid">
      {cards.map((c, i) => (
        <div key={i} className={`kpi-card ${c.className || ''}`}>
          <div className="kpi-label">{c.label}</div>
          <div className={`kpi-value ${c.valueClass || ''}`}>{c.value}</div>
          {c.sub && <div className="kpi-sub">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function pctClass(pct) {
  if (pct == null) return '';
  if (pct >= 80) return 'success';
  if (pct >= 60) return 'accent';
  return 'danger';
}
