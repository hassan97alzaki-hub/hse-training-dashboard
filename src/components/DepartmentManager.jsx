import { useState } from 'react';
import { validateDepartment } from '../lib/dataService.js';

/**
 * DepartmentManager Component
 *
 * Registers the departments an employee can be assigned to, so the department
 * is picked from a list instead of typed. Without this, "Operations" and
 * "operations" become two departments in every report.
 *
 * A department discovered in imported data is listed too, but cannot be
 * removed here: it comes back with its import.
 *
 * Props:
 * - departments: [{name, registered, employeeCount}] from listDepartments
 * - onAdd: (name) => Promise<{success, error}>
 * - onDelete: (name) => Promise<{success, error}>
 */
export function DepartmentManager({ departments = [], onAdd, onDelete, disabled = false, t = (key) => key }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const existingNames = departments.map(d => d.name);

  async function handleAdd() {
    setError('');
    const validation = validateDepartment(name, existingNames);
    if (!validation.valid) {
      setError(validation.errors.join('; '));
      return;
    }

    setBusy(true);
    const result = await onAdd?.(name.trim());
    setBusy(false);

    if (result && !result.success) {
      setError(result.error);
      return;
    }
    setName('');
  }

  async function handleDelete(department) {
    setError('');
    if (!window.confirm(`Delete department "${department.name}"?`)) return;

    setBusy(true);
    const result = await onDelete?.(department.name);
    setBusy(false);

    if (result && !result.success) setError(result.error);
  }

  return (
    <div style={styles.container}>
      <div style={styles.addRow}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="e.g., Operations"
          style={styles.input}
          disabled={disabled || busy}
          aria-label="New department name"
        />
        <button
          onClick={handleAdd}
          disabled={disabled || busy}
          style={{ ...styles.btn, ...styles.btnPrimary }}
        >
          {t('dmAdd')}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {departments.length === 0 ? (
        <div style={styles.empty}>
          <p>{t('dmNoDepartments')}</p>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>{t('dmDepartment')}</th>
              <th style={styles.th}>{t('dmEmployees')}</th>
              <th style={styles.th}>{t('dmSource')}</th>
              <th style={styles.th}>{t('dmActions')}</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(department => (
              <tr key={department.name} style={styles.tableRow}>
                <td style={styles.td}>{department.name}</td>
                <td style={styles.td}>{department.employeeCount}</td>
                <td style={styles.td}>
                  <span style={department.registered ? styles.tagRegistered : styles.tagImported}>
                    {department.registered ? t('dmRegistered') : t('dmFromImport')}
                  </span>
                </td>
                <td style={styles.td}>
                  {department.registered ? (
                    <button
                      onClick={() => handleDelete(department)}
                      disabled={disabled || busy}
                      style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                    >
                      {t('dmDelete')}
                    </button>
                  ) : (
                    <span style={styles.textMuted}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={styles.hint}>{t('dmDeleteHint')}</p>
    </div>
  );
}

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
  },
  addRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  input: {
    flex: 1,
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  empty: {
    textAlign: 'center',
    padding: '24px',
    color: '#9ca3af',
    fontSize: '14px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  tableHeader: {
    backgroundColor: '#f3f4f6',
    borderBottom: '2px solid #d1d5db',
  },
  th: {
    padding: '10px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#374151',
  },
  tableRow: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '10px',
    color: '#1f2937',
  },
  tagRegistered: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  tagImported: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  textMuted: {
    color: '#9ca3af',
  },
  btn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  actionBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
  },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '13px',
  },
  hint: {
    marginTop: '12px',
    marginBottom: 0,
    fontSize: '12px',
    color: '#6b7280',
  },
};
