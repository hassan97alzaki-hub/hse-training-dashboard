import { useMemo, useState } from 'react';

import { addTrainingRecords, computeExpiryDate } from '../lib/requirementsService.js';

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
    if (showAll || !courseCode) return people;
    const roles = requirements.filter(r => r.Course_Code === courseCode);
    return people.filter(person => roles.some(
      role => role.Department === person.Department && role.Job_Title === person.Job_Title,
    ));
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

  const handleSave = async () => {
    setError('');
    if (selected.size === 0) return;
    const result = await addTrainingRecords({
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

  return (
    <div>
      <select
        data-testid="course-select"
        value={courseCode}
        onChange={(e) => handleCourse(e.target.value)}
      >
        <option value="">—</option>
        {courses.map(c => <option key={c.code} value={c.code}>{`${c.code} — ${c.name}`}</option>)}
      </select>

      <label>{t('completionDate')}</label>
      <input
        type="date" data-testid="issue-date" value={issueDate}
        onChange={(e) => handleIssueDate(e.target.value)}
      />

      <label>{t('expiryDateLabel')}</label>
      <input
        type="date" data-testid="expiry-date" value={expiryDate}
        onChange={(e) => { setExpiryTouched(true); setExpiryDate(e.target.value); }}
      />

      <label>{t('certificateNumberLabel')}</label>
      <input
        type="text" data-testid="certificate-number" value={certificateNumber}
        onChange={(e) => setCertificateNumber(e.target.value)}
      />

      <h4>{t('attendees')}</h4>
      {attendees.map(person => (
        <label key={person.Employee_ID}>
          <input
            type="checkbox"
            data-testid={`attendee-${person.Employee_ID}`}
            checked={selected.has(person.Employee_ID)}
            onChange={() => toggle(person.Employee_ID)}
          />
          <span>{`${person.Employee_ID} — ${person.Name}`}</span>
        </label>
      ))}
      {!showAll && <button type="button" onClick={() => setShowAll(true)}>{t('showAllEmployees')}</button>}

      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={handleSave}>{t('saveRecords')}</button>
    </div>
  );
}
