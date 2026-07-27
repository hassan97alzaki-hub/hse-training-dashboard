import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';

// Enterprise 5-colour semantic system (success / info / warning / critical / neutral).
// Tonal variants keep adjacent segments distinguishable without adding new hues.
const SUCCESS = '#22c55e';
const INFO = '#3b82f6';
const INFO_ALT = '#60a5fa';
const WARNING = '#f59e0b';
const WARNING_STRONG = '#ea6a1f';
const CRITICAL = '#ef4444';
const CRITICAL_DEEP = '#b91c1c';
const NEUTRAL = '#7c869c';

export function DeptComplianceChart({ data, t, lang }) {
  if (!data || data.length === 0) return <div className="text-muted text-sm">{t('noResults')}</div>;

  const fmt = (v) => `${v}%`;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 36, top: 8, bottom: 8 }} barCategoryGap={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9aa5ba', fontSize: 12 }} tickFormatter={fmt} />
        <YAxis type="category" dataKey="department" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} width={110} />
        <Tooltip
          formatter={(v) => [`${v}%`, t('compliancePct')]}
          contentStyle={{ background: '#121826', border: '1px solid #2e3850', borderRadius: 10, fontSize: 13 }}
          labelStyle={{ color: '#f3f5f9', fontWeight: 700, marginBottom: 4 }}
          itemStyle={{ color: '#9aa5ba' }}
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
        />
        <Bar dataKey="percentage" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.percentage >= 80 ? SUCCESS : entry.percentage >= 60 ? WARNING : CRITICAL}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS_PIE_DATA_KEYS = [
  { key: 'VALID',       color: SUCCESS },
  { key: 'EXPIRING_90', color: INFO },
  { key: 'EXPIRING_60', color: WARNING },
  { key: 'EXPIRING_30', color: WARNING_STRONG },
  { key: 'EXPIRED',     color: CRITICAL },
  { key: 'IN_PROGRESS', color: INFO_ALT },
  { key: 'NOT_STARTED', color: NEUTRAL },
  { key: 'MISSING',     color: CRITICAL_DEEP },
];

const STATUS_LABEL_KEYS = {
  VALID: 'statusValid', EXPIRING_90: 'statusExpiring90', EXPIRING_60: 'statusExpiring60',
  EXPIRING_30: 'statusExpiring30', EXPIRED: 'statusExpired', IN_PROGRESS: 'statusInProgress',
  NOT_STARTED: 'statusNotStarted', MISSING: 'statusMissing',
};

export function StatusBreakdownChart({ statusCounts, t, lang }) {
  if (!statusCounts) return null;

  const total = STATUS_PIE_DATA_KEYS.reduce((sum, { key }) => sum + (statusCounts[key] || 0), 0);

  const data = STATUS_PIE_DATA_KEYS
    .map(({ key, color }) => ({
      key,
      name: t(STATUS_LABEL_KEYS[key]),
      value: statusCounts[key] || 0,
      color,
      pct: total > 0 ? Math.round(((statusCounts[key] || 0) / total) * 1000) / 10 : 0,
    }))
    .filter(d => d.value > 0);

  if (data.length === 0) return <div className="text-muted text-sm">{t('noResults')}</div>;

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={96}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#121826', border: '1px solid #2e3850', borderRadius: 10, fontSize: 13 }}
            labelStyle={{ color: '#f3f5f9' }}
            formatter={(v, n, entry) => [`${v} (${entry.payload.pct}%)`, n]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-legend">
        {data.map((d, i) => (
          <div className="donut-legend-item" key={i}>
            <span className="donut-legend-dot" style={{ background: d.color }} />
            <span className="donut-legend-name">{d.name}</span>
            <span className="donut-legend-count">{d.value}</span>
            <span className="donut-legend-pct">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CourseComplianceChart({ data, t, lang }) {
  if (!data || data.length === 0) return <div className="text-muted text-sm">{t('noResults')}</div>;

  return (
    <div className="table-wrap" style={{ maxHeight: 'none' }}>
      <table>
        <thead>
          <tr>
            <th>{t('course')}</th>
            <th style={{ textAlign: 'center' }}>{t('total')}</th>
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
              <td style={{ textAlign: 'center', color: SUCCESS, fontWeight: 700 }}>{c.compliant}</td>
              <td style={{ textAlign: 'center', color: c.nonCompliant > 0 ? CRITICAL : 'var(--text-muted)' }}>{c.nonCompliant}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{
                  fontWeight: 800,
                  color: c.percentage >= 80 ? SUCCESS : c.percentage >= 60 ? WARNING : CRITICAL,
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
