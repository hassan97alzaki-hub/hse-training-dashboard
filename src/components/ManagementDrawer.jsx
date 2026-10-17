import { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import { CourseManager } from './CourseManager.jsx';
import { EmployeeManager } from './EmployeeManager.jsx';
import { DepartmentManager } from './DepartmentManager.jsx';

/**
 * ManagementDrawer Component
 *
 * Slide-in side panel that holds data-management tools.
 * Keeps the main dashboard clean: one trigger button instead of
 * two large always-visible sections.
 *
 * Tabs: Courses | Departments | Employees
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - courses, onCoursesChange
 * - employees, onEmployeesChange
 * - departments: [{name, registered, employeeCount}] from listDepartments
 * - onDepartmentAdd: (name) => Promise<{success, error}>
 * - onDepartmentDelete: (name) => Promise<{success, error}>
 */
export function ManagementDrawer({
  open = false,
  onClose,
  courses = [],
  onCoursesChange,
  people = [],
  onRequirementsSaved,
  t,
  employees = [],
  onEmployeesChange,
  departments = [],
  onDepartmentAdd,
  onDepartmentDelete,
}) {
  const [tab, setTab] = useState('courses');

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <aside
        style={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Data management"
      >
        <header style={styles.header}>
          <h3 style={styles.title}>{t('mdManageData')}</h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label={t('mdClose')}>
            <X size={18} />
          </button>
        </header>

        <nav style={styles.tabs}>
          <button
            onClick={() => setTab('courses')}
            style={{ ...styles.tab, ...(tab === 'courses' ? styles.tabActive : {}) }}
          >
            {t('mdCourses')}
            <span style={styles.tabCount}>{courses.length}</span>
          </button>
          <button
            onClick={() => setTab('departments')}
            style={{ ...styles.tab, ...(tab === 'departments' ? styles.tabActive : {}) }}
          >
            {t('mdDepartments')}
            <span style={styles.tabCount}>{departments.length}</span>
          </button>
          <button
            onClick={() => setTab('employees')}
            style={{ ...styles.tab, ...(tab === 'employees' ? styles.tabActive : {}) }}
          >
            {t('mdEmployees')}
            <span style={styles.tabCount}>{employees.length}</span>
          </button>
        </nav>

        <div style={styles.body}>
          {tab === 'courses' && (
            <CourseManager
              courses={courses}
              onCoursesChange={onCoursesChange}
              people={people}
              onRequirementsSaved={onRequirementsSaved}
              t={t}
              disabled={false}
            />
          )}
          {tab === 'departments' && (
            <DepartmentManager
              departments={departments}
              onAdd={onDepartmentAdd}
              onDelete={onDepartmentDelete}
              disabled={false}
              t={t}
            />
          )}
          {tab === 'employees' && (
            <EmployeeManager
              employees={employees}
              onEmployeesChange={onEmployeesChange}
              departments={departments.map(d => d.name)}
              disabled={false}
              t={t}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * Trigger button for the drawer. Place in the toolbar.
 */
export function ManagementDrawerButton({ onClick, count = 0, t }) {
  return (
    <button onClick={onClick} style={styles.trigger}>
      <Settings size={16} />
      <span>{t('mdManageData')}</span>
      {count > 0 && <span style={styles.triggerBadge}>{count}</span>}
    </button>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 900,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  drawer: {
    width: 'min(560px, 95vw)',
    height: '100%',
    backgroundColor: '#ffffff',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    margin: 0,
    fontSize: '17px',
    fontWeight: 600,
    color: '#1f2937',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '6px',
    borderRadius: '4px',
    display: 'inline-flex',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    padding: '12px 20px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '10px 14px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#6b7280',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  tabActive: {
    color: '#2563eb',
    borderBottom: '2px solid #2563eb',
  },
  tabCount: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
    borderRadius: '10px',
    padding: '1px 7px',
    fontSize: '11px',
    fontWeight: 600,
  },
  body: {
    padding: '16px 20px',
    overflowY: 'auto',
    flex: 1,
  },
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  triggerBadge: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    borderRadius: '10px',
    padding: '1px 7px',
    fontSize: '11px',
    fontWeight: 600,
  },
};
