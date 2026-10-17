import { useState } from 'react';
import { validateEmployee } from '../lib/dataService.js';

/**
 * EmployeeManager Component
 *
 * Allows users to:
 * - View list of manually-added employees
 * - Add new employees (one by one)
 * - Edit employee details
 * - Delete employees
 * - Export employees as CSV
 *
 * The department is picked from the registered departments rather than typed,
 * so the same department cannot enter the reports under two spellings.
 *
 * Props:
 * - employees: array of employee objects
 * - onEmployeesChange: callback to update parent state
 * - departments: department names to choose from
 */
export function EmployeeManager({
  employees = [],
  onEmployeesChange,
  disabled = false,
  departments = [],
  t = (key) => key,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    department: '',
    jobTitle: '',
    email: '',
    phone: '',
  });
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddEmployee = () => {
    setError('');
    setEditingIndex(null);
    setFormData({
      employeeId: '',
      name: '',
      department: '',
      jobTitle: '',
      email: '',
      phone: '',
    });
    setShowForm(true);
  };

  const handleEditEmployee = (index) => {
    setError('');
    const emp = employees[index];
    setFormData({
      employeeId: emp.employeeId,
      name: emp.name,
      department: emp.department,
      jobTitle: emp.jobTitle || '',
      email: emp.email || '',
      phone: emp.phone || '',
    });
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleSaveEmployee = () => {
    setError('');

    const validation = validateEmployee(formData);
    if (!validation.valid) {
      setError(validation.errors.join('; '));
      return;
    }

    if (editingIndex !== null) {
      // Edit mode
      const updated = [...employees];
      updated[editingIndex] = {
        employeeId: formData.employeeId.toUpperCase(),
        name: formData.name.trim(),
        department: formData.department.trim(),
        jobTitle: formData.jobTitle.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
      };
      onEmployeesChange(updated);
    } else {
      // Add mode
      const newEmployee = {
        employeeId: formData.employeeId.toUpperCase(),
        name: formData.name.trim(),
        department: formData.department.trim(),
        jobTitle: formData.jobTitle.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
      };
      onEmployeesChange([...employees, newEmployee]);
    }

    setShowForm(false);
  };

  const handleDeleteEmployee = (index) => {
    if (window.confirm(`Delete ${employees[index].name}?`)) {
      const updated = employees.filter((_, i) => i !== index);
      onEmployeesChange(updated);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setError('');
  };

  const handleExportCSV = () => {
    if (employees.length === 0) {
      alert('No employees to export');
      return;
    }

    let csv = 'Employee_ID,Name,Department,Job_Title,Email,Phone\n';
    for (const emp of employees) {
      const row = [
        emp.employeeId,
        emp.name,
        emp.department,
        emp.jobTitle || '',
        emp.email || '',
        emp.phone || '',
      ]
        .map(v => (v.includes(',') ? `"${v}"` : v))
        .join(',');
      csv += row + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (showForm) {
    return (
      <div style={styles.modal}>
        <div style={styles.modalContent}>
          <h3 style={styles.modalTitle}>
            {editingIndex !== null ? t('emEditEmployee') : t('emAddEmployee')}
          </h3>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t('emEmployeeIdRequired')}</label>
            <input
              type="text"
              name="employeeId"
              value={formData.employeeId}
              onChange={handleInputChange}
              placeholder="e.g., EMP001"
              style={styles.input}
              disabled={editingIndex !== null}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t('emNameRequired')}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Full name"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t('emDepartmentRequired')}</label>
            {departments.length === 0 ? (
              <p style={styles.inlineNote}>
                {t('emNoDepartments')}
              </p>
            ) : (
              <select
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                style={styles.input}
              >
                <option value="">{t('emSelectDepartment')}</option>
                {/* An employee may already sit in a department that is no
                    longer offered. Keep that value selectable so editing the
                    employee does not silently move them. */}
                {(departments.includes(formData.department) || !formData.department
                  ? departments
                  : [formData.department, ...departments]
                ).map(department => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t('emJobTitle')}</label>
            <input
              type="text"
              name="jobTitle"
              value={formData.jobTitle}
              onChange={handleInputChange}
              placeholder="e.g., Supervisor"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t('emEmail')}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="email@example.com"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t('emPhone')}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="+1234567890"
              style={styles.input}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.buttonGroup}>
            <button onClick={handleSaveEmployee} style={{ ...styles.btn, ...styles.btnPrimary }}>
              {editingIndex !== null ? t('emUpdate') : t('emAdd')}
            </button>
            <button onClick={handleCancel} style={{ ...styles.btn, ...styles.btnGhost }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>
          {t('emEmployees')}
          <span style={styles.count}>{employees.length}</span>
        </h4>
      </div>

      {employees.length === 0 ? (
        <div style={styles.empty}>
          <p>{t('emNoEmployees')}</p>
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>{t('emId')}</th>
                <th style={styles.th}>{t('emName')}</th>
                <th style={styles.th}>{t('emDept')}</th>
                <th style={styles.th}>{t('emJobTitle')}</th>
                <th style={styles.th}>{t('emEmail')}</th>
                <th style={styles.th}>{t('emActions')}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, idx) => (
                <tr key={idx} style={styles.tableRow}>
                  <td style={styles.td}>
                    <code style={styles.code}>{emp.employeeId}</code>
                  </td>
                  <td style={styles.td}>{emp.name}</td>
                  <td style={styles.td}>{emp.department}</td>
                  <td style={styles.td}>{emp.jobTitle || '-'}</td>
                  <td style={styles.td}>{emp.email ? '✓' : '-'}</td>
                  <td style={styles.td}>
                    <button
                      onClick={() => handleEditEmployee(idx)}
                      style={{ ...styles.actionBtn, ...styles.editBtn }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(idx)}
                      style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.actions}>
        <button
          onClick={handleAddEmployee}
          disabled={disabled || departments.length === 0}
          title={departments.length === 0 ? t('emAddDeptFirst') : undefined}
          style={{ ...styles.btn, ...styles.btnPrimary }}
        >
          {t('emAddEmployeeBtn')}
        </button>
        {employees.length > 0 && (
          <button onClick={handleExportCSV} style={{ ...styles.btn, ...styles.btnGhost }}>
            {t('emExportCSV')}
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    marginBottom: '16px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '600',
    color: '#1f2937',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  count: {
    backgroundColor: '#2563eb',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    padding: '24px',
    color: '#9ca3af',
    fontSize: '14px',
  },
  tableWrap: {
    overflowX: 'auto',
    marginBottom: '16px',
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
  code: {
    backgroundColor: '#f3f4f6',
    padding: '2px 4px',
    borderRadius: '2px',
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  btn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
  },
  actionBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    marginRight: '4px',
  },
  editBtn: {
    backgroundColor: '#e5e7eb',
    color: '#1f2937',
  },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  modalTitle: {
    margin: '0 0 20px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  inlineNote: {
    margin: 0,
    padding: '10px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fcd34d',
    borderRadius: '4px',
    fontSize: '13px',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '13px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
};
