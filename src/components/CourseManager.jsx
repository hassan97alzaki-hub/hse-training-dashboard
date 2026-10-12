import { useState } from 'react';
import { createI18n } from '../lib/i18n.js';
import {
  addCourse, editCourse, deleteCourse, isValidCourseCode, validateCourse, exportCoursesAsCSV,
} from '../lib/dataService.js';

const t = createI18n('en').t;

/**
 * CourseManager Component
 *
 * Allows users to:
 * - View list of all courses (manual + imported)
 * - Add new courses with form validation
 * - Edit course details
 * - Delete courses (with confirmation)
 * - Export courses as CSV
 *
 * State: managed by parent (App.jsx)
 */
export function CourseManager({ courses, onCoursesChange, disabled = false }) {
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    mandatory: false,
    validityMonths: 12,
    description: '',
  });
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'validityMonths' ? parseInt(value, 10) || 0 : value),
    }));
  };

  const handleAddCourse = () => {
    setError('');
    setEditingIndex(null);
    setFormData({
      code: '',
      name: '',
      mandatory: false,
      validityMonths: 12,
      description: '',
    });
    setShowForm(true);
  };

  const handleEditCourse = (index) => {
    setError('');
    const course = courses[index];
    setFormData({
      code: course.code,
      name: course.name,
      mandatory: course.mandatory,
      validityMonths: course.validityMonths,
      description: course.description,
    });
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleSaveCourse = () => {
    setError('');

    if (editingIndex !== null) {
      // Edit mode
      const originalCode = courses[editingIndex].code;
      const result = editCourse(courses, originalCode, formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      const updated = [...courses];
      updated[result.index] = result.course;
      onCoursesChange(updated);
    } else {
      // Add mode
      const result = addCourse(courses, formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      onCoursesChange([...courses, result.course]);
    }

    setShowForm(false);
    setFormData({
      code: '',
      name: '',
      mandatory: false,
      validityMonths: 12,
      description: '',
    });
  };

  const handleDeleteCourse = (index) => {
    const course = courses[index];
    if (!window.confirm(`Delete course "${course.code}"? This cannot be undone.`)) {
      return;
    }

    const result = deleteCourse(courses, course.code);
    if (result.success) {
      const updated = courses.filter((_, idx) => idx !== result.index);
      onCoursesChange(updated);
    }
  };

  const handleExport = () => {
    const csv = exportCoursesAsCSV(courses);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `courses-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingIndex(null);
    setError('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Courses</h3>
        <p style={styles.subtitle}>{courses.length} course(s)</p>
      </div>

      {showForm && (
        <div style={styles.form}>
          <h4 style={styles.formTitle}>
            {editingIndex !== null ? 'Edit Course' : 'Add New Course'}
          </h4>

          {error && (
            <div style={styles.error}>{error}</div>
          )}

          <div style={styles.formGrid}>
            <label style={styles.label}>
              Course Code *
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleInputChange}
                placeholder="e.g., H2S001"
                disabled={editingIndex !== null}
                style={styles.input}
              />
              {!isValidCourseCode(formData.code) && formData.code && (
                <span style={styles.fieldHint}>2–20 alphanumeric, -, _</span>
              )}
            </label>

            <label style={styles.label}>
              Course Name *
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., H2S Safety"
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Validity (months)
              <input
                type="number"
                name="validityMonths"
                value={formData.validityMonths}
                onChange={handleInputChange}
                min="0"
                style={styles.input}
              />
              <span style={styles.fieldHint}>0 = no expiry (one-time training)</span>
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="mandatory"
                checked={formData.mandatory}
                onChange={handleInputChange}
              />
              Mandatory
            </label>
          </div>

          <label style={styles.label}>
            Description
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Optional details about the course"
              rows="3"
              style={styles.textarea}
            />
          </label>

          <div style={styles.formActions}>
            <button
              onClick={handleSaveCourse}
              style={{ ...styles.btn, ...styles.btnPrimary }}
              disabled={disabled}
            >
              {editingIndex !== null ? 'Update' : 'Add Course'}
            </button>
            <button
              onClick={handleCancel}
              style={{ ...styles.btn, ...styles.btnGhost }}
              disabled={disabled}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <p style={styles.empty}>No courses yet. Add one to get started.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Code</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Validity</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course, idx) => (
              <tr key={`${course.code}-${idx}`} style={styles.tableRow}>
                <td style={styles.td}><code style={styles.code}>{course.code}</code></td>
                <td style={styles.td}>{course.name}</td>
                <td style={styles.td}>{course.mandatory ? 'Mandatory' : 'Optional'}</td>
                <td style={styles.td}>
                  {course.validityMonths === 0 ? 'One-time' : `${course.validityMonths}m`}
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleEditCourse(idx)}
                    style={{ ...styles.btnSmall, ...styles.btnGhost }}
                    disabled={disabled}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteCourse(idx)}
                    style={{ ...styles.btnSmall, ...styles.btnDanger }}
                    disabled={disabled}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={styles.actions}>
        {!showForm && (
          <button
            onClick={handleAddCourse}
            style={{ ...styles.btn, ...styles.btnPrimary }}
            disabled={disabled}
          >
            + Add Course
          </button>
        )}
        {courses.length > 0 && (
          <button
            onClick={handleExport}
            style={{ ...styles.btn, ...styles.btnSecondary }}
            disabled={disabled}
          >
            Export as CSV
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    marginBottom: '16px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  subtitle: {
    margin: '0',
    fontSize: '14px',
    color: '#6b7280',
  },
  form: {
    backgroundColor: '#ffffff',
    padding: '16px',
    borderRadius: '6px',
    marginBottom: '16px',
    border: '1px solid #d1d5db',
  },
  formTitle: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '12px',
    fontSize: '14px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '12px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    cursor: 'pointer',
  },
  input: {
    marginTop: '4px',
    padding: '8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    marginTop: '4px',
    padding: '8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
  },
  fieldHint: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: 'normal',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-start',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '12px',
  },
  tableHeader: {
    backgroundColor: '#f3f4f6',
    borderBottom: '2px solid #d1d5db',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  tableRow: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#1f2937',
  },
  code: {
    backgroundColor: '#f3f4f6',
    padding: '2px 4px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#374151',
  },
  empty: {
    textAlign: 'center',
    padding: '24px 0',
    color: '#9ca3af',
    fontSize: '14px',
  },
  btn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  btnSecondary: {
    backgroundColor: '#6b7280',
    color: '#ffffff',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
  },
  btnDanger: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '12px',
    padding: '6px 10px',
  },
  btnSmall: {
    fontSize: '12px',
    padding: '6px 10px',
    marginRight: '4px',
  },
};
