import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';

const DEPT_COLORS = ['#dc2626', '#ea580c', '#d97706', '#2563eb', '#7c3aed', '#16a34a', '#0891b2'];

export function DeptComplianceChart({ data, t, lang }) {
  if (!data || data.length === 0) return <div className="text-muted text-sm">{t('noResults')}</div>;

  const fmt = (v) => `${v}%`;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 30, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={fmt} />
        <YAxis type="category" dataKey="department" tick={{ fill: '#94a3b8', fontSize: 10 }} width={90} />
        <Tooltip
          formatter={(v) => [`${v}%`, t('compliancePct')]}
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#f1f5f9' }}
          itemStyle={{ color: '#94a3b8' }}
        />
        <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.percentage >= 80 ? '#16a34a' : entry.percentage >= 60 ? '#d97706' : '#dc2626'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS_PIE_DATA_KEYS = [
  { key: 'VALID',       color: '#16a34a' },
  { key: 'EXPIRING_90', color: '#2563eb' },
  { key: 'EXPIRING_60', color: '#d97706' },
  { key: 'EXPIRING_30', color: '#ea580c' },
  { key: 'EXPIRED',     color: '#dc2626' },
  { key: 'IN_PROGRESS', color: '#7c3aed' },
  { key: 'NOT_STARTED', color: '#6b7280' },
  { key: 'MISSING',     color: '#991b1b' },
];

const STATUS_LABELS_EN = {
  VALID: 'Valid', EXPIRING_90: 'Exp 90d', EXPIRING_60: 'Exp 60d', EXPIRING_30: 'Exp 30d',
  EXPIRED: 'Expired', IN_PROGRESS: 'In Progress', NOT_STARTED: 'Not Started', MISSING: 'Missing',
};

export function StatusBreakdownChart({ statusCounts, t, lang }) {
  if (!statusCounts) return null;

  const data = STATUS_PIE_DATA_KEYS
    .map(({ key, color }) => ({ name: STATUS_LABELS_EN[key], value: statusCounts[key] || 0, color }))
    .filter(d => d.value > 0);

  if (data.length === 0) return <div className="text-muted text-sm">{t('noResults')}</div>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          dataKey="value"
          label={({ name, value }) => `${name}: ${value}`}
          labelLine={{ stroke: '#334155' }}
        >
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
          formatter={(v, n) => [v, n]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CourseComplianceChart({ data, t, lang }) {
  if (!data || data.length === 0) return <div className="text-muted text-sm">{t('noResults')}</div>;

  return (
    <div className="table-wrap" style={{ border: 'none' }}>
      <table>
        <thead>
          <tr>
            <th>{t('course')}</th>
            <th style={{ textAlign: 'center' }}>Required</th>
            <th style={{ textAlign: 'center' }}>{t('compliant')}</th>
            <th style={{ textAlign: 'center' }}>{t('nonCompliant')}</th>
            <th style={{ textAlign: 'center' }}>{t('percentage')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={i}>
              <td title={c.course_name}>{c.course_code} — {c.course_name}</td>
              <td style={{ textAlign: 'center' }}>{c.employeesRequired}</td>
              <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{c.compliant}</td>
              <td style={{ textAlign: 'center', color: c.nonCompliant > 0 ? '#dc2626' : '#6b7280' }}>{c.nonCompliant}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{
                  fontWeight: 700,
                  color: c.percentage >= 80 ? '#16a34a' : c.percentage >= 60 ? '#d97706' : '#dc2626',
                }}>
                  {c.percentage}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
