import { useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { STATUS } from '../lib/constants.js';

export default function Filters({ filters, options, t, onChange, onClear }) {
  const [expanded, setExpanded] = useState(true);
  const activeCount = Object.values(filters).filter(v => v && v !== '').length;

  return (
    <div className="filters-panel">
      <div className="filters-panel-header">
        <button
          className={`filters-toggle ${expanded ? '' : 'collapsed'}`}
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          title={expanded ? t('collapseFilters') : t('expandFilters')}
        >
          <ChevronDown size={16} />
          <SlidersHorizontal size={15} />
          {t('filterTitle')}
        </button>
        {activeCount > 0 && <span className="badge-count">{activeCount}</span>}
        <button className="btn btn-ghost btn-sm ml-auto" onClick={onClear}>
          <X size={13} />
          {t('clearFilters')}
        </button>
      </div>

      {expanded && (
        <div className="filters-body">
          <div className="filter-cluster">
            <div className="filter-cluster-label">{t('filterGroupEmployee')}</div>
            <div className="filters-grid">
              <div className="filter-group">
                <label className="filter-label">{t('filterEmployeeId')}</label>
                <input
                  className="filter-input"
                  type="text"
                  value={filters.employeeId}
                  onChange={e => onChange('employeeId', e.target.value)}
                  placeholder="EMP…"
                />
              </div>
              <div className="filter-group">
                <label className="filter-label">{t('filterEmployeeName')}</label>
                <input
                  className="filter-input"
                  type="text"
                  value={filters.employeeName}
                  onChange={e => onChange('employeeName', e.target.value)}
                  placeholder="Name…"
                />
              </div>
            </div>
          </div>

          <div className="filter-cluster">
            <div className="filter-cluster-label">{t('filterGroupClassification')}</div>
            <div className="filters-grid">
              <div className="filter-group">
                <label className="filter-label">{t('filterDepartment')}</label>
                <select className="filter-select" value={filters.department} onChange={e => onChange('department', e.target.value)}>
                  <option value="">{t('allDepartments')}</option>
                  {(options.departments || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">{t('filterJobTitle')}</label>
                <select className="filter-select" value={filters.jobTitle} onChange={e => onChange('jobTitle', e.target.value)}>
                  <option value="">{t('allJobTitles')}</option>
                  {(options.jobTitles || []).map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">{t('filterCourse')}</label>
                <select className="filter-select" value={filters.course} onChange={e => onChange('course', e.target.value)}>
                  <option value="">{t('allCourses')}</option>
                  {(options.courses || []).map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="filter-cluster">
            <div className="filter-cluster-label">{t('filterGroupStatus')}</div>
            <div className="filters-grid">
              <div className="filter-group">
                <label className="filter-label">{t('filterStatus')}</label>
                <select className="filter-select" value={filters.status} onChange={e => onChange('status', e.target.value)}>
                  <option value="">{t('allStatuses')}</option>
                  {Object.values(STATUS).map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">{t('filterPriority')}</label>
                <select className="filter-select" value={filters.priority} onChange={e => onChange('priority', e.target.value)}>
                  <option value="">{t('allPriorities')}</option>
                  <option value="Critical">{t('priorityCritical')}</option>
                  <option value="High">{t('priorityHigh')}</option>
                  <option value="Medium">{t('priorityMedium')}</option>
                  <option value="Low">{t('priorityLow')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="filter-cluster">
            <div className="filter-cluster-label">{t('filterGroupEmployment')}</div>
            <div className="filters-grid">
              <div className="filter-group">
                <label className="filter-label">{t('filterEmploymentStatus')}</label>
                <select className="filter-select" value={filters.employmentStatus} onChange={e => onChange('employmentStatus', e.target.value)}>
                  <option value="">{t('allEmploymentStatuses')}</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Left">Left</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
