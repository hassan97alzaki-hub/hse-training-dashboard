export default function PriorityActions({ actions, t, lang }) {
  if (!actions || actions.length === 0) {
    return (
      <div className="text-muted" style={{ padding: '16px 0', fontSize: 13 }}>
        {t('noPriorityActions')}
      </div>
    );
  }

  const slice = actions.slice(0, 20);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('priority')}</th>
            <th>{t('employeeId')}</th>
            <th>{t('employeeName')}</th>
            <th>{t('department')}</th>
            <th>{t('course')}</th>
            <th>{t('status')}</th>
            <th>{t('expiryDate')}</th>
            <th>{t('action')}</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((a, i) => (
            <tr key={i}>
              <td><span className={`priority-badge ${a.priority}`}>{t(`priority${a.priority}`)}</span></td>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.Employee_ID}</td>
              <td>{a.Employee_Name}</td>
              <td>{a.Department}</td>
              <td>{a.Course_Code} — {a.Course_Name}</td>
              <td><span className={`status-badge ${a.Status}`}>{a.Status.replace(/_/g, ' ')}</span></td>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.Expiry_Date || '—'}</td>
              <td style={{ fontSize: 11 }}>{t(a.actionKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {actions.length > 20 && (
        <div className="text-muted text-sm" style={{ padding: '8px 12px' }}>
          Showing 20 of {actions.length} priority actions. Export CSV to see all.
        </div>
      )}
    </div>
  );
}
