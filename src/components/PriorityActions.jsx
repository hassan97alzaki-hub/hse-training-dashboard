import { AlertOctagon, AlertTriangle, Clock, Info, ListChecks } from 'lucide-react';

const PRIORITY_META = {
  Critical: { icon: AlertOctagon, accent: 'var(--critical)' },
  High:     { icon: AlertTriangle, accent: 'var(--warning-strong)' },
  Medium:   { icon: Clock,         accent: 'var(--warning)' },
  Low:      { icon: Info,          accent: 'var(--neutral)' },
};

export default function PriorityActions({ actions, t, lang }) {
  if (!actions || actions.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '32px 20px' }}>
        <div className="empty-icon"><ListChecks size={26} /></div>
        <h3 style={{ fontSize: 15 }}>{t('noPriorityActions')}</h3>
      </div>
    );
  }

  const slice = actions.slice(0, 20);

  return (
    <div>
      {slice.map((a, i) => {
        const meta = PRIORITY_META[a.priority] || PRIORITY_META.Low;
        const Icon = meta.icon;
        return (
          <div className="priority-row" key={i} style={{ '--row-accent': meta.accent }}>
            <span className="priority-row-icon" style={{ color: meta.accent }}>
              <Icon size={18} />
            </span>
            <div className="priority-row-body">
              <div className="priority-row-top">
                <span className="priority-row-name">{a.Employee_Name}</span>
                <span className={`priority-badge ${a.priority}`}>{t(`priority${a.priority}`)}</span>
                <span className={`status-badge ${a.Status}`}>{t('status' + a.Status)}</span>
              </div>
              <div className="priority-row-meta">
                {a.Employee_ID} · {a.Department_Name ?? a.Department} · {a.Course_Code} — {a.Course_Name}
                {a.Expiry_Date ? ` · ${t('expiryDate')}: ${a.Expiry_Date}` : ''}
              </div>
            </div>
            <div className="priority-row-action">{t(a.actionKey)}</div>
          </div>
        );
      })}
      {actions.length > 20 && (
        <div className="text-muted text-sm" style={{ padding: '8px 4px' }}>
          {t('showing')} 20 {t('of')} {actions.length} {t('records')}
        </div>
      )}
    </div>
  );
}
