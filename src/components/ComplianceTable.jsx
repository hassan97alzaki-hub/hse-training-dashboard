import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { PRIORITY_FROM_STATUS, filterComplianceItems } from '../lib/tableFilters.js';
import { formatDateDisplay } from '../lib/normalization.js';
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../lib/constants.js';

function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`status-badge ${status}`}>{status.replace(/_/g, ' ')}</span>;
}

export default function ComplianceTable({
  universe,
  inactiveUniverse,
  filters,
  t,
  lang,
  showInactive,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Combine active + inactive based on toggle
  const fullUniverse = useMemo(() => {
    if (showInactive && inactiveUniverse) {
      return [...universe, ...inactiveUniverse];
    }
    return universe;
  }, [universe, inactiveUniverse, showInactive]);

  // Apply filters
  const filtered = useMemo(() => filterComplianceItems(fullUniverse, filters), [fullUniverse, filters]);

  // Back to page 1 whenever the filtered set changes (new filter, new import).
  useEffect(() => { setPage(1); }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  function handlePageSizeChange(e) {
    setPageSize(Number(e.target.value));
    setPage(1);
  }

  const start = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, filtered.length);

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('employeeId')}</th>
              <th>{t('employeeName')}</th>
              <th>{t('department')}</th>
              <th>{t('jobTitle')}</th>
              <th>{t('course')}</th>
              <th>{t('status')}</th>
              <th>{t('expiryDate')}</th>
              <th>{t('daysRemaining')}</th>
              <th>{t('priority')}</th>
              <th>{t('employmentStatus')}</th>
              <th>{t('issueDate')}</th>
              <th>{t('certificate')}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <SearchX size={28} style={{ opacity: 0.5 }} />
                    <span>{t('noResults')}</span>
                  </div>
                </td>
              </tr>
            ) : paginated.map((item, i) => {
              const priority = PRIORITY_FROM_STATUS[item.Status];
              const daysDisplay = item.daysRemaining != null
                ? item.daysRemaining < 0 ? `${item.daysRemaining}d` : `${item.daysRemaining}d`
                : '—';
              return (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.Employee_ID}</td>
                  <td>{item.Employee_Name}</td>
                  <td>{item.Department}</td>
                  <td>{item.Job_Title}</td>
                  <td title={item.Course_Name}>{item.Course_Code} — {item.Course_Name}</td>
                  <td><StatusBadge status={item.Status} /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {item.Expiry_Date ? formatDateDisplay(item.Expiry_Date, lang) : '—'}
                  </td>
                  <td style={{
                    textAlign: 'center',
                    color: item.daysRemaining != null && item.daysRemaining < 0 ? 'var(--critical)' :
                           item.daysRemaining != null && item.daysRemaining <= 30 ? 'var(--warning-strong)' : 'var(--text-muted)',
                    fontWeight: item.daysRemaining != null && item.daysRemaining <= 30 ? 700 : 400,
                  }}>
                    {daysDisplay}
                  </td>
                  <td>
                    {priority ? (
                      <span className={`priority-badge ${priority}`}>{t(`priority${priority}`)}</span>
                    ) : '—'}
                  </td>
                  <td>{item.Employment_Status || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {item.Issue_Date ? formatDateDisplay(item.Issue_Date, lang) : '—'}
                  </td>
                  <td style={{ fontSize: 11 }}>{item.Certificate_Number || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <div className="flex-row">
          <span className="text-muted">{t('pageSize')}:</span>
          <select className="page-size-select" value={pageSize} onChange={handlePageSizeChange}>
            {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="page-info">
          {t('showing')} {start}–{end} {t('of')} {filtered.length} {t('records')}
        </div>
        <div className="pagination-controls">
          <button
            className="page-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            aria-label={t('ariaPrevPage')}
          >
            <ChevronLeft size={14} />
            {t('previous')}
          </button>
          <span className="page-info">{safePage} / {totalPages}</span>
          <button
            className="page-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            aria-label={t('ariaNextPage')}
          >
            {t('next')}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
