import {
  ShieldCheck, UserCheck, AlertTriangle, FileQuestion,
  Users, ClipboardList, ClipboardX, CheckCircle2,
  Clock3, Clock, Clock9, PlayCircle, CircleDashed,
} from 'lucide-react';

const TONE_VARS = {
  success:  { '--accent-line': 'var(--success)',  '--accent-soft': 'var(--success-soft)' },
  warning:  { '--accent-line': 'var(--warning)',  '--accent-soft': 'var(--warning-soft)' },
  critical: { '--accent-line': 'var(--critical)', '--accent-soft': 'var(--critical-soft)' },
  neutral:  { '--accent-line': 'var(--neutral)',  '--accent-soft': 'var(--neutral-soft)' },
  brand:    { '--accent-line': 'var(--brand)',    '--accent-soft': 'var(--brand-soft)' },
};

function pctTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'success';
  if (pct >= 60) return 'warning';
  return 'critical';
}

export default function KpiCards({ kpis, t }) {
  if (!kpis) return null;
  const sc = kpis.statusCounts || {};

  const heroCards = [
    {
      label: t('kpiRequirementCompliance'),
      value: kpis.requirementCompliance != null ? `${kpis.requirementCompliance}%` : '—',
      desc: kpis.totalMandatoryReqs ? `${kpis.compliantReqs} ${t('of')} ${kpis.totalMandatoryReqs} ${t('kpiDescReqCompliantSuffix')}` : '',
      tone: pctTone(kpis.requirementCompliance),
      icon: ShieldCheck,
    },
    {
      label: t('kpiFullyCompliant'),
      value: kpis.fullyCompliantPct != null ? `${kpis.fullyCompliantPct}%` : '—',
      desc: kpis.empWithMandatoryReqs ? `${kpis.fullyCompliantCount} ${t('of')} ${kpis.empWithMandatoryReqs} ${t('kpiDescEmployeesSuffix')}` : '',
      tone: pctTone(kpis.fullyCompliantPct),
      icon: UserCheck,
    },
    {
      label: t('kpiExpired'),
      value: sc.EXPIRED ?? 0,
      desc: t('kpiDescImmediateAction'),
      tone: (sc.EXPIRED ?? 0) > 0 ? 'critical' : 'success',
      icon: AlertTriangle,
    },
    {
      label: t('kpiMissing'),
      value: sc.MISSING ?? 0,
      desc: t('kpiDescNoRecord'),
      tone: (sc.MISSING ?? 0) > 0 ? 'critical' : 'success',
      icon: FileQuestion,
    },
  ];

  const secondaryCards = [
    { label: t('kpiActiveEmployees'), value: kpis.totalActiveEmployees ?? '—', icon: Users, className: '' },
    {
      label: t('kpiRequirementsConfigured'),
      value: kpis.employeesWithMandatoryReqs ?? '—',
      sub: kpis.employeesNoMandatoryReqs > 0 ? `+${kpis.employeesNoMandatoryReqs} ${t('kpiSubNoMandatoryReqs')}` : '',
      icon: ClipboardList,
      className: '',
    },
    {
      label: t('kpiRequirementsNotConfigured'),
      value: kpis.employeesNotConfigured ?? '—',
      valueClass: kpis.employeesNotConfigured > 0 ? 'danger' : '',
      icon: ClipboardX,
      className: '',
    },
    { label: t('kpiValid'), value: sc.VALID ?? 0, className: 'status-valid', valueClass: 'success', icon: CheckCircle2 },
    { label: t('kpiExpiring90'), value: sc.EXPIRING_90 ?? 0, className: 'status-exp90', icon: Clock9 },
    { label: t('kpiExpiring60'), value: sc.EXPIRING_60 ?? 0, className: 'status-exp60', icon: Clock },
    { label: t('kpiExpiring30'), value: sc.EXPIRING_30 ?? 0, className: 'status-exp30', icon: Clock3 },
    { label: t('kpiInProgress'), value: sc.IN_PROGRESS ?? 0, className: 'status-inprogress', icon: PlayCircle },
    { label: t('kpiNotStarted'), value: sc.NOT_STARTED ?? 0, className: 'status-notstarted', icon: CircleDashed },
  ];

  return (
    <>
      <div className="kpi-hero-grid">
        {heroCards.map((c, i) => (
          <div key={i} className="kpi-card-hero" style={TONE_VARS[c.tone]}>
            <div className="kpi-hero-top">
              <span className="kpi-hero-label">{c.label}</span>
              <span className="kpi-hero-icon"><c.icon size={18} /></span>
            </div>
            <div className="kpi-hero-value">{c.value}</div>
            {c.desc && <div className="kpi-hero-desc">{c.desc}</div>}
          </div>
        ))}
      </div>

      <div className="kpi-grid">
        {secondaryCards.map((c, i) => (
          <div key={i} className={`kpi-card ${c.className || ''}`}>
            <div className="kpi-label"><c.icon size={12} />{c.label}</div>
            <div className={`kpi-value ${c.valueClass || ''}`}>{c.value}</div>
            {c.sub && <div className="kpi-sub">{c.sub}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
