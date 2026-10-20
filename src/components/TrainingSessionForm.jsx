import { useMemo, useState } from 'react';

import {
  addTrainingRecords, computeExpiryDate, updateTrainingRecord,
} from '../lib/requirementsService.js';

/**
 * Records a training completion for one employee or for a whole session.
 *
 * The attendee list is restricted to the employees the selected course is
 * required for: the matrix decides who appears. `show all employees` covers
 * training someone who is not required to take it.
 *
 * The expiry is computed from the course validity until the user types one,
 * after which it is left alone — an overridden expiry is a deliberate act.
 *
 * @param {array} courses - the catalogue
 * @param {array} people - employees carrying Employee_ID, Department, Job_Title
 * @param {array} requirements - the merged matrix, PascalCase
 * @param {object|null} prefill - single-employee mode
 * @param {function} onSaved - called with the written records
 * @param {function} onClose
 * @param {function} t
 */
export function TrainingSessionForm({
  courses = [], people = [], requirements = [], prefill = null,
  onSaved, onClose, t,
}) {
  const [courseCode, setCourseCode] = useState(prefill?.courseCode ?? '');
  const [issueDate, setIssueDate] = useState(prefill?.issueDate ?? '');
  const [expiryDate, setExpiryDate] = useState(prefill?.expiryDate ?? '');
  const [expiryTouched, setExpiryTouched] = useState(Boolean(prefill?.expiryDate));
  const [certificateNumber, setCertificateNumber] = useState(prefill?.certificateNumber ?? '');
  const [selected, setSelected] = useState(
    () => new Set(prefill?.employeeId ? [prefill.employeeId] : []),
  );
  const [showAll, setShowAll] = useState(Boolean(prefill?.employeeId));
  const [error, setError] = useState('');

  const course = courses.find(c => c?.code === courseCode);

  const attendees = useMemo(() => {
    const base = showAll || !courseCode
      ? people
      : (() => {
          const roles = requirements.filter(r => r.Course_Code === courseCode);
          return people.filter(person => roles.some(
            role => role.Department === person.Department && role.Job_Title === person.Job_Title,
          ));
        })();
    const seen = new Set();
    return base.filter(person => {
      if (!person.Employee_ID || seen.has(person.Employee_ID)) return false;
      seen.add(person.Employee_ID);
      return true;
    });
  }, [people, requirements, courseCode, showAll]);

  const handleIssueDate = (value) => {
    setIssueDate(value);
    if (!expiryTouched) setExpiryDate(computeExpiryDate(value, course?.validityMonths) ?? '');
  };

  const handleCourse = (value) => {
    setCourseCode(value);
    const next = courses.find(c => c?.code === value);
    if (!expiryTouched) setExpiryDate(computeExpiryDate(issueDate, next?.validityMonths) ?? '');
  };

  const toggle = (employeeId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const toggleDepartment = (members) => {
    setSelected(prev => {
      const next = new Set(prev);
      const allSelected = members.every(p => next.has(p.Employee_ID));
      for (const p of members) {
        if (allSelected) next.delete(p.Employee_ID);
        else next.add(p.Employee_ID);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    if (selected.size === 0) return;
    const result = prefill?.recordId
      ? await updateTrainingRecord(prefill.recordId, {
          employeeId: prefill.employeeId,
          courseCode, issueDate, expiryDate, certificateNumber,
        }, courses)
      : await addTrainingRecords({
          courseCode, issueDate, expiryDate, certificateNumber,
          employeeIds: Array.from(selected),
        }, courses);

    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved?.(result.records);
    onClose?.();
  };

  const grouped = useMemo(() => {
    const groups = {};
    for (const person of attendees) {
      const dept = person.Department || '—';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(person);
    }
    return Object.entries(groups);
  }, [attendees]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>{t('recordTraining')}</h4>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close"
          >✕</button>
        )}
      </div>

      {error && <div style={styles.error} role="alert">{error}</div>}

      <div style={styles.formGrid}>
        <label style={styles.label}>
          {t('recordTraining')}
          <select
            data-testid="course-select"
            value={courseCode}
            onChange={(e) => handleCourse(e.target.value)}
            style={styles.input}
          >
            <option value="">—</option>
            {courses.map(c => (
              <option key={c.code} value={c.code}>{`${c.code} — ${c.name}`}</option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          {t('completionDate')}
          <input
            type="date" data-testid="issue-date" value={issueDate}
            onChange={(e) => handleIssueDate(e.target.value)}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          {t('expiryDateLabel')}
          <input
            type="date" data-testid="expiry-date" value={expiryDate}
            onChange={(e) => { setExpiryTouched(true); setExpiryDate(e.target.value); }}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          {t('certificateNumberLabel')}
          <input
            type="text" data-testid="certificate-number" value={certificateNumber}
            onChange={(e) => setCertificateNumber(e.target.value)}
            style={styles.input}
            placeholder="CERT-XXXX"
          />
        </label>
      </div>

      <div style={styles.attendeesSection}>
        <div style={styles.attendeesHeader}>
          <h4 style={styles.attendeesTitle}>
            {t('attendees')}
            {selected.size > 0 && (
              <span style={styles.selectedBadge}>{selected.size}</span>
            )}
          </h4>
          {!showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              style={{ ...styles.btn, ...styles.btnGhost, ...styles.btnSmall }}
            >{t('showAllEmployees')}</button>
          )}
        </div>

        <div style={styles.attendeesList}>
          {grouped.map(([dept, members]) => {
            const allChecked = members.every(p => selected.has(p.Employee_ID));
            const someChecked = !allChecked && members.some(p => selected.has(p.Employee_ID));
            return (
              <div key={dept} style={styles.departmentGroup}>
                <label style={styles.departmentLabel}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked; }}
                    onChange={() => toggleDepartment(members)}
                    style={styles.checkbox}
                  />
                  <strong style={styles.departmentName}>{dept}</strong>
                  <span style={styles.count}>{members.length}</span>
                </label>
                <div style={styles.rolesGroup}>
                  {members.map(person => (
                    <label key={person.Employee_ID} style={styles.roleLabel}>
                      <input
                        type="checkbox"
                        data-testid={`attendee-${person.Employee_ID}`}
                        checked={selected.has(person.Employee_ID)}
                        onChange={() => toggle(person.Employee_ID)}
                        style={styles.checkbox}
                      />
                      <span style={styles.employeeId}>{person.Employee_ID}</span>
                      <span style={styles.employeeName}>{person.Employee_Name}</span>
                      <span style={styles.jobTitle}>{person.Job_Title || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={styles.formActions}>
        <button
          type="button"
          onClick={handleSave}
          style={{ ...styles.btn, ...styles.btnPrimary }}
          disabled={selected.size === 0}
        >
          {t('saveRecords')} {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{ ...styles.btn, ...styles.btnGhost }}
          >{t('cmCancel')}</button>
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '4px 8px',
    borderRadius: '4px',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
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
  attendeesSection: {
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
  },
  attendeesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  attendeesTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  selectedBadge: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  attendeesList: {
    maxHeight: '300px',
    overflowY: 'auto',
  },
  departmentGroup: {
    marginBottom: '8px',
    borderBottom: '1px solid #f3f4f6',
    paddingBottom: '8px',
  },
  departmentLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '4px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
  },
  departmentName: {
    flex: 1,
  },
  count: {
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: 'normal',
  },
  rolesGroup: {
    paddingLeft: '24px',
  },
  roleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '3px 0',
    fontSize: '13px',
    color: '#374151',
  },
  checkbox: {
    cursor: 'pointer',
    accentColor: '#2563eb',
  },
  employeeId: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#6b7280',
    minWidth: '70px',
  },
  employeeName: {
    flex: 1,
  },
  jobTitle: {
    fontSize: '12px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
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
  btnGhost: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
  },
  btnSmall: {
    padding: '4px 10px',
    fontSize: '12px',
  },
};
