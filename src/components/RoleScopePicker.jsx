import { useMemo } from 'react';

/**
 * Picks the Department + Job_Title pairs that a course is required for.
 *
 * The roles offered are derived from the loaded people, never typed: a
 * misspelled job title would produce a requirement row that matches nobody and
 * looks identical to a working one.
 *
 * A department checkbox stores `jobTitle: ''`, which means every job title in
 * that department, including ones added later. Selecting the department
 * therefore replaces any individual job titles already selected in it.
 *
 * @param {array} people - employees carrying Department and Job_Title
 * @param {Array<{department: string, jobTitle: string}>} value
 * @param {function} onChange - called with the next value
 * @param {function} t - the translator
 */
export function RoleScopePicker({ people = [], value = [], onChange, t }) {
  const departments = useMemo(() => {
    const byDepartment = new Map();
    for (const person of people) {
      if (!person?.Department) continue;
      const titles = byDepartment.get(person.Department) ?? new Map();
      const title = person.Job_Title || '';
      if (title) titles.set(title, (titles.get(title) ?? 0) + 1);
      byDepartment.set(person.Department, titles);
    }
    return Array.from(byDepartment.entries())
      .map(([department, titles]) => ({
        department,
        total: Array.from(titles.values()).reduce((sum, n) => sum + n, 0),
        titles: Array.from(titles.entries()).map(([title, count]) => ({ title, count })),
      }))
      .sort((a, b) => a.department.localeCompare(b.department));
  }, [people]);

  const isDepartmentSelected = (department) =>
    value.some(role => role.department === department && role.jobTitle === '');

  const isRoleSelected = (department, jobTitle) =>
    value.some(role => role.department === department && role.jobTitle === jobTitle);

  const toggleDepartment = (department) => {
    if (isDepartmentSelected(department)) {
      onChange(value.filter(role => role.department !== department));
      return;
    }
    // Replaces the individual job titles of this department: they are covered.
    onChange([
      ...value.filter(role => role.department !== department),
      { department, jobTitle: '' },
    ]);
  };

  const toggleRole = (department, jobTitle) => {
    if (isRoleSelected(department, jobTitle)) {
      onChange(value.filter(
        role => !(role.department === department && role.jobTitle === jobTitle),
      ));
      return;
    }
    onChange([
      ...value.filter(role => !(role.department === department && role.jobTitle === '')),
      { department, jobTitle },
    ]);
  };

  const requiredCount = useMemo(() => {
    const ids = new Set();
    for (const person of people) {
      const matched = value.some(role => role.department === person.Department
        && (role.jobTitle === '' || role.jobTitle === person.Job_Title));
      if (matched) ids.add(person.Employee_ID);
    }
    return ids.size;
  }, [people, value]);

  return (
    <div style={styles.container}>
      <p style={styles.hint}>{t('appliesToHint')}</p>

      {departments.map(({ department, total, titles }) => (
        <div key={department} style={styles.departmentGroup}>
          <label style={styles.departmentLabel}>
            <input
              type="checkbox"
              data-testid={`department-${department}`}
              checked={isDepartmentSelected(department)}
              onChange={() => toggleDepartment(department)}
              style={styles.checkbox}
            />
            <strong style={styles.departmentName}>{department}</strong>
            <span style={styles.count}>{`${total} ${t('employeeCount')}`}</span>
          </label>

          <div style={styles.rolesGroup}>
            {titles.map(({ title, count }) => (
              <label key={title} style={styles.roleLabel}>
                <input
                  type="checkbox"
                  data-testid={`role-${department}-${title}`}
                  checked={isDepartmentSelected(department) || isRoleSelected(department, title)}
                  disabled={isDepartmentSelected(department)}
                  onChange={() => toggleRole(department, title)}
                  style={styles.checkbox}
                />
                <span style={styles.roleTitle}>{title}</span>
                <span
                  data-testid={`role-count-${department}-${title}`}
                  style={styles.count}
                >
                  {count}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {value.length === 0
        ? <p style={styles.noRoles}>{t('noRolesSelected')}</p>
        : (
          <p data-testid="required-count" style={styles.requiredCount}>
            {`${requiredCount} ${t('requiredCount')}`}
          </p>
        )}
    </div>
  );
}

const styles = {
  container: {
    marginTop: '8px',
  },
  hint: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '0 0 12px 0',
  },
  departmentGroup: {
    marginBottom: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '10px 12px',
    backgroundColor: '#f9fafb',
  },
  departmentLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    marginBottom: '6px',
  },
  departmentName: {
    fontSize: '14px',
    color: '#1f2937',
    flex: 1,
  },
  rolesGroup: {
    paddingLeft: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  roleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  roleTitle: {
    fontSize: '13px',
    color: '#374151',
    flex: 1,
  },
  count: {
    fontSize: '12px',
    color: '#9ca3af',
    backgroundColor: '#e5e7eb',
    borderRadius: '10px',
    padding: '1px 7px',
    fontWeight: 600,
  },
  checkbox: {
    cursor: 'pointer',
  },
  noRoles: {
    fontSize: '13px',
    color: '#9ca3af',
    fontStyle: 'italic',
    margin: '8px 0 0 0',
  },
  requiredCount: {
    fontSize: '13px',
    color: '#2563eb',
    fontWeight: 500,
    margin: '8px 0 0 0',
  },
};
