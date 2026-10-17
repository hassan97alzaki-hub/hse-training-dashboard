import { useState } from 'react';
import {
  addCourse, editCourse, deleteCourse, isValidCourseCode, validateCourse, exportCoursesAsCSV,
} from '../lib/dataService.js';
import { saveRequirementsForCourse, loadRequirementsFromDb } from '../lib/requirementsService.js';
import { RoleScopePicker } from './RoleScopePicker.jsx';

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
export function CourseManager({
  courses, onCoursesChange, people = [], onRequirementsSaved, t, disabled = false,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    mandatory: false,
    validityMonths: 12,
    description: '',
    appliesTo: [],
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
      appliesTo: [],
    });
    setShowForm(true);
  };

  const handleEditCourse = async (index) => {
    setError('');
    const course = courses[index];
    // Load the persisted scope from DB so the picker reflects what was saved.
    let appliesTo = course.appliesTo ?? [];
    try {
      const allReqs = await loadRequirementsFromDb();
      const courseReqs = allReqs.filter(
        r => r.course_code && r.course_code.toUpperCase() === course.code.toUpperCase(),
      );
      if (courseReqs.length > 0) {
        appliesTo = courseReqs.map(r => ({
          department: r.department,
          jobTitle: r.job_title ?? '',
        }));
      }
    } catch { /* fall back to in-memory */ }
    setFormData({
      code: course.code,
      name: course.name,
      mandatory: course.mandatory,
      validityMonths: course.validityMonths,
      description: course.description,
      appliesTo,
    });
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleSaveCourse = async () => {
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

    const saved = await saveRequirementsForCourse(formData.code, formData.appliesTo);
    if (!saved.success) {
      setError(saved.error);
      return;
    }
    onRequirementsSaved?.();

    setShowForm(false);
    setFormData({
      code: '',
      name: '',
      mandatory: false,
      validityMonths: 12,
      description: '',
      appliesTo: [],
    });
  };

  const handleDeleteCourse = (index) => {
    const course = courses[index];
    if (!window.confirm(t('cmDeleteConfirm').replace('{code}', course.code))) {
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
        <h3 style={styles.title}>{t('cmCourses')}</h3>
        <p style={styles.subtitle}>{t('cmCourseCount').replace('{count}', courses.length)}</p>
      </div>

      {showForm && (
        <div style={styles.form}>
          <h4 style={styles.formTitle}>
            {editingIndex !== null ? t('cmEditCourse') : t('cmAddNewCourse')}
          </h4>

          {error && (
            <div style={styles.error}>{error}</div>
          )}

          <div style={styles.formGrid}>
            <label style={styles.label}>
              {t('cmCourseCode')} *
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
                <span style={styles.fieldHint}>{t('cmCodeHint')}</span>
              )}
            </label>

            <label style={styles.label}>
              {t('cmCourseName')} *
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
              {t('cmValidity')}
              <input
                type="number"
                name="validityMonths"
                value={formData.validityMonths}
                onChange={handleInputChange}
                min="0"
                style={styles.input}
              />
              <span style={styles.fieldHint}>{t('cmValidityHint')}</span>
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="mandatory"
                checked={formData.mandatory}
                onChange={handleInputChange}
              />
              {t('cmMandatory')}
            </label>
          </div>

          <label style={styles.label}>
            {t('cmDescription')}
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder={t('cmDescriptionPlaceholder')}
              rows="3"
              style={styles.textarea}
            />
          </label>

          <div style={styles.label}>
            <label>{t('appliesTo')}</label>
            <RoleScopePicker
              people={people}
              value={formData.appliesTo}
              onChange={(appliesTo) => setFormData(prev => ({ ...prev, appliesTo }))}
              t={t}
            />
          </div>

          <div style={styles.formActions}>
            <button
              onClick={handleSaveCourse}
              style={{ ...styles.btn, ...styles.btnPrimary }}
              disabled={disabled}
            >
              {editingIndex !== null ? t('cmUpdate') : t('cmAddCourse')}
            </button>
            <button
              onClick={handleCancel}
              style={{ ...styles.btn, ...styles.btnGhost }}
              disabled={disabled}
            >
              {t('cmCancel')}
            </button>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <p style={styles.empty}>{t('cmNoCourses')}</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>{t('cmCode')}</th>
              <th style={styles.th}>{t('cmName')}</th>
              <th style={styles.th}>{t('cmType')}</th>
              <th style={styles.th}>{t('cmValidity')}</th>
              <th style={styles.th}>{t('cmActions')}</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course, idx) => (
              <tr key={`${course.code}-${idx}`} style={styles.tableRow}>
                <td style={styles.td}><code style={styles.code}>{course.code}</code></td>
                <td style={styles.td}>{course.name}</td>
                <td style={styles.td}>{course.mandatory ? t('cmMandatory') : t('cmOptional')}</td>
                <td style={styles.td}>
                  {course.validityMonths === 0 ? t('cmOneTime') : `${course.validityMonths}m`}
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleEditCourse(idx)}
                    style={{ ...styles.btnSmall, ...styles.btnGhost }}
                    disabled={disabled}
                  >
                    {t('cmEdit')}
                  </button>
                  <button
                    onClick={() => handleDeleteCourse(idx)}
                    style={{ ...styles.btnSmall, ...styles.btnDanger }}
                    disabled={disabled}
                  >
                    {t('cmDelete')}
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
            {t('cmAddCourse')}
          </button>
        )}
        {courses.length > 0 && (
          <button
            onClick={handleExport}
            style={{ ...styles.btn, ...styles.btnSecondary }}
            disabled={disabled}
          >
            {t('cmExportCSV')}
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
