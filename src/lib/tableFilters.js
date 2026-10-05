import { STATUS } from './constants.js';

// Priority shown in the compliance table for each status.
export const PRIORITY_FROM_STATUS = {
  [STATUS.EXPIRED]: 'Critical',
  [STATUS.MISSING]: 'Critical',
  [STATUS.NOT_STARTED]: 'High',
  [STATUS.IN_PROGRESS]: 'Medium',
  [STATUS.EXPIRING_30]: 'Medium',
  [STATUS.EXPIRING_60]: 'Low',
  [STATUS.EXPIRING_90]: 'Low',
  [STATUS.VALID]: null,
  [STATUS.NOT_REQUIRED]: null,
};

// Apply the compliance-table filters. Employee ID and name are
// case-insensitive substring matches; the other filters are exact.
export function filterComplianceItems(items, filters) {
  const empId = filters.employeeId ? filters.employeeId.toLowerCase() : '';
  const empName = filters.employeeName ? filters.employeeName.toLowerCase() : '';
  return items.filter(item => {
    if (empId && !item.Employee_ID.toLowerCase().includes(empId)) return false;
    if (empName && !item.Employee_Name.toLowerCase().includes(empName)) return false;
    if (filters.department && item.Department !== filters.department) return false;
    if (filters.jobTitle && item.Job_Title !== filters.jobTitle) return false;
    if (filters.course && item.Course_Code !== filters.course) return false;
    if (filters.status && item.Status !== filters.status) return false;
    if (filters.employmentStatus && item.Employment_Status !== filters.employmentStatus) return false;
    if (filters.priority && PRIORITY_FROM_STATUS[item.Status] !== filters.priority) return false;
    return true;
  });
}
