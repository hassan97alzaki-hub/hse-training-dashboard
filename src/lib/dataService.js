/**
 * Data Service for managing courses, departments, and certificates.
 *
 * Provides functions to add, edit, delete courses and track certificate metadata.
 * Supports both in-memory state and persistent database (Supabase/IndexedDB).
 */

import { getDbService } from './db/dbService.js';
import { EMPLOYMENT_STATUS } from './constants.js';

// Course validation: Code must be 2-20 chars, alphanumeric + hyphen/underscore
const COURSE_CODE_PATTERN = /^[A-Z0-9_-]{2,20}$/i;

/**
 * Validate course code format.
 * @param {string} code - Course code to validate
 * @returns {boolean} True if valid
 */
export function isValidCourseCode(code) {
  if (!code || typeof code !== 'string') return false;
  return COURSE_CODE_PATTERN.test(code.trim());
}

/**
 * Validate course data object.
 * @param {object} course - Course object with code, name, mandatory, validityMonths, description
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCourse(course) {
  const errors = [];

  if (!course) {
    errors.push('Course data is required');
    return { valid: false, errors };
  }

  const { code, name, mandatory, validityMonths, description } = course;

  if (!code || !isValidCourseCode(code)) {
    errors.push('Course Code must be 2–20 alphanumeric characters (-, _ allowed)');
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('Course Name is required and must be non-empty');
  }

  if (mandatory !== undefined && mandatory !== null && typeof mandatory !== 'boolean') {
    errors.push('Mandatory must be true or false');
  }

  if (validityMonths !== undefined && validityMonths !== null) {
    const vm = Number(validityMonths);
    if (!Number.isInteger(vm) || vm < 0) {
      errors.push('Validity Months must be a non-negative integer (0 = no expiry)');
    }
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('Description must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Add a new course.
 * @param {array} existingCourses - Current list of courses
 * @param {{code, name, mandatory, validityMonths, description}} course - New course
 * @returns {{success: boolean, course?: object, error?: string}}
 */
export function addCourse(existingCourses, course) {
  const validation = validateCourse(course);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  // Check for duplicate code (case-insensitive)
  const codeUpper = course.code.trim().toUpperCase();
  const duplicate = existingCourses.some(
    c => c.code && c.code.toUpperCase() === codeUpper
  );

  if (duplicate) {
    return { success: false, error: `Course code "${codeUpper}" already exists` };
  }

  const newCourse = {
    code: course.code.trim().toUpperCase(),
    name: course.name.trim(),
    mandatory: course.mandatory ?? false,
    validityMonths: course.validityMonths ?? 12,
    description: course.description?.trim() || '',
    createdAt: new Date().toISOString(),
  };

  return {
    success: true,
    course: newCourse,
  };
}

/**
 * Edit an existing course.
 * @param {array} existingCourses - Current list of courses
 * @param {string} originalCode - Original course code to find
 * @param {{code, name, mandatory, validityMonths, description}} updates - Updated fields
 * @returns {{success: boolean, course?: object, error?: string}}
 */
export function editCourse(existingCourses, originalCode, updates) {
  const validation = validateCourse(updates);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  const index = existingCourses.findIndex(
    c => c.code && c.code.toUpperCase() === originalCode.toUpperCase()
  );

  if (index === -1) {
    return { success: false, error: `Course "${originalCode}" not found` };
  }

  // Check if new code conflicts with another course (unless it's the same course)
  const newCodeUpper = updates.code.trim().toUpperCase();
  const codeConflict = existingCourses.some(
    (c, idx) => c.code && c.code.toUpperCase() === newCodeUpper && idx !== index
  );

  if (codeConflict) {
    return { success: false, error: `Course code "${newCodeUpper}" already exists` };
  }

  const updated = {
    ...existingCourses[index],
    code: updates.code.trim().toUpperCase(),
    name: updates.name.trim(),
    mandatory: updates.mandatory ?? existingCourses[index].mandatory,
    validityMonths: updates.validityMonths ?? existingCourses[index].validityMonths,
    description: updates.description?.trim() || '',
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    course: updated,
    index,
  };
}

/**
 * Delete a course by code.
 * @param {array} existingCourses - Current list of courses
 * @param {string} code - Course code to delete
 * @returns {{success: boolean, index?: number, error?: string}}
 */
export function deleteCourse(existingCourses, code) {
  const index = existingCourses.findIndex(
    c => c.code && c.code.toUpperCase() === code.toUpperCase()
  );

  if (index === -1) {
    return { success: false, error: `Course "${code}" not found` };
  }

  return {
    success: true,
    index,
    deletedCode: code.toUpperCase(),
  };
}

/**
 * Export courses as CSV string.
 * @param {array} courses - List of courses
 * @returns {string} CSV format
 */
export function exportCoursesAsCSV(courses) {
  if (!courses || courses.length === 0) {
    return 'Course_Code,Course_Name,Mandatory,Validity_Months,Description\n';
  }

  const headers = ['Course_Code', 'Course_Name', 'Mandatory', 'Validity_Months', 'Description'];
  const rows = courses.map(course => [
    course.code || '',
    course.name || '',
    course.mandatory ? 'Yes' : 'No',
    course.validityMonths ?? '',
    course.description || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      // Escape quotes and wrap if contains comma
      const escaped = String(cell).replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('"') ? `"${escaped}"` : escaped;
    }).join(',')),
  ].join('\n');

  return csv;
}

/**
 * Get courses by department (from requirements matrix).
 * Dependencies: requires requirements array with Department field.
 * @param {array} requirements - Requirements matrix
 * @param {string} department - Department name
 * @returns {array} List of course codes for that department
 */
export function getRequirementsByDepartment(requirements, department) {
  if (!requirements || !department) return [];

  return requirements
    .filter(req => req.Department && req.Department === department)
    .map(req => req.Course_Code)
    .filter((code, idx, arr) => arr.indexOf(code) === idx); // unique
}

/**
 * Merge manually added courses into a requirements matrix.
 *
 * A manual course applies to everyone, so it is added once per
 * Department + Job_Title pair. The compliance engine matches a requirement on
 * both fields, so a row with an empty Job_Title would never apply to any
 * employee. Roles are collected from the matrix itself and from the loaded
 * people, which is what makes a manual course take effect even before a
 * requirements matrix is imported.
 *
 * Existing rows are never changed: a manual course whose code already exists
 * for a role is skipped, so the imported matrix always wins.
 *
 * @param {array} requirements - Requirements matrix rows
 * @param {array} manualCourses - [{code, name, mandatory, validityMonths, description}]
 * @param {array} people - Employees or training records with Department/Job_Title
 * @returns {array} Requirements matrix with the manual courses added
 */
export function mergeManualCourses(requirements, manualCourses, people = []) {
  const base = requirements || [];
  if (!manualCourses || manualCourses.length === 0) return base;

  const merged = [...base];

  const roles = new Map(); // "Department|Job_Title" → {Department, Job_Title}
  const addRole = (department, jobTitle) => {
    if (!department) return;
    const key = `${department}|${jobTitle ?? ''}`;
    if (!roles.has(key)) roles.set(key, { Department: department, Job_Title: jobTitle ?? '' });
  };

  for (const req of base) addRole(req.Department, req.Job_Title);
  for (const person of people || []) addRole(person.Department, person.Job_Title);

  for (const course of manualCourses) {
    if (!course?.code) continue;
    const codeUpper = course.code.toUpperCase();
    for (const role of roles.values()) {
      const exists = merged.some(
        req => req.Department === role.Department
          && (req.Job_Title ?? '') === role.Job_Title
          && req.Course_Code
          && req.Course_Code.toUpperCase() === codeUpper,
      );
      if (exists) continue;
      merged.push({
        Department: role.Department,
        Job_Title: role.Job_Title,
        Course_Code: course.code,
        Course_Name: course.name,
        Mandatory: Boolean(course.mandatory),
        Validity_Months: course.validityMonths ?? 12,
        Description: course.description || '',
      });
    }
  }

  return merged;
}

// ===== Database-aware async functions =====

/**
 * Add course and persist to database.
 * @param {object} courseData - {code, name, mandatory, validityMonths, description}
 * @returns {Promise<{success: boolean, course?: object, error?: string}>}
 */
export async function addCourseWithDb(courseData) {
  const db = getDbService();

  // Validate
  const validation = validateCourse(courseData);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  // Check for duplicate code
  const existing = await db.courses.list();
  const codeUpper = courseData.code.trim().toUpperCase();
  const duplicate = existing.some(c => c.code && c.code.toUpperCase() === codeUpper);

  if (duplicate) {
    return { success: false, error: `Course code "${codeUpper}" already exists` };
  }

  // Create and save
  const newCourse = {
    id: `course_${codeUpper}_${Date.now()}`,
    code: codeUpper,
    name: courseData.name.trim(),
    mandatory: courseData.mandatory ?? false,
    validity_months: courseData.validityMonths ?? 12,
    description: courseData.description?.trim() || '',
  };

  try {
    await db.courses.add(newCourse);
    return { success: true, course: newCourse };
  } catch (err) {
    return { success: false, error: `Failed to save course: ${err.message}` };
  }
}

/**
 * Edit course and update database.
 * @param {string} originalCode - Original course code
 * @param {object} updates - {code, name, mandatory, validityMonths, description}
 * @returns {Promise<{success: boolean, course?: object, error?: string}>}
 */
export async function editCourseWithDb(originalCode, updates) {
  const db = getDbService();

  // Validate
  const validation = validateCourse(updates);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  // Find existing course
  const existing = await db.courses.list();
  const course = existing.find(c => c.code && c.code.toUpperCase() === originalCode.toUpperCase());

  if (!course) {
    return { success: false, error: `Course "${originalCode}" not found` };
  }

  // Check for code conflict
  const newCodeUpper = updates.code.trim().toUpperCase();
  const conflict = existing.some(
    c => c.code && c.code.toUpperCase() === newCodeUpper && c.id !== course.id
  );

  if (conflict) {
    return { success: false, error: `Course code "${newCodeUpper}" already exists` };
  }

  // Update in DB
  const updated = {
    code: newCodeUpper,
    name: updates.name.trim(),
    mandatory: updates.mandatory ?? course.mandatory,
    validity_months: updates.validityMonths ?? course.validity_months,
    description: updates.description?.trim() || '',
  };

  try {
    await db.courses.update(course.id, updated);
    return { success: true, course: { ...course, ...updated } };
  } catch (err) {
    return { success: false, error: `Failed to update course: ${err.message}` };
  }
}

/**
 * Delete course from database.
 * @param {string} code - Course code
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteCourseWithDb(code) {
  const db = getDbService();

  const existing = await db.courses.list();
  const course = existing.find(c => c.code && c.code.toUpperCase() === code.toUpperCase());

  if (!course) {
    return { success: false, error: `Course "${code}" not found` };
  }

  try {
    await db.courses.delete(course.id);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete course: ${err.message}` };
  }
}

/**
 * Load all courses from database.
 * @returns {Promise<array>}
 */
export async function loadCoursesFromDb() {
  const db = getDbService();
  try {
    return await db.courses.list();
  } catch (err) {
    console.error('Failed to load courses from DB:', err);
    return [];
  }
}

// ===== Employee Management =====

/**
 * Validate employee data
 * @param {object} employee
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateEmployee(employee) {
  const errors = [];

  if (!employee) {
    errors.push('Employee data required');
    return { valid: false, errors };
  }

  const { employeeId, name, department } = employee;

  if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
    errors.push('Employee ID required (e.g., EMP001)');
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('Employee name required');
  }

  if (!department || typeof department !== 'string' || !department.trim()) {
    errors.push('Department required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Add employee with database persistence
 * @param {object} employeeData
 * @returns {Promise<{success: boolean, employee?: object, error?: string}>}
 */
export async function addEmployeeWithDb(employeeData) {
  const validation = validateEmployee(employeeData);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  const empId = employeeData.employeeId.trim().toUpperCase();
  const db = getDbService();

  try {
    // Check for duplicate
    const existing = await db.employees?.getByEmployeeId?.(empId);
    if (existing) {
      return { success: false, error: `Employee ID "${empId}" already exists` };
    }

    await db.employees.add({
      id: `emp_${empId}`,
      employee_id: empId,
      name: employeeData.name.trim(),
      department: employeeData.department.trim(),
      job_title: employeeData.jobTitle?.trim() || '',
      employment_status: employeeData.employmentStatus || 'Active',
    });

    // Store employee contact info if provided
    if (employeeData.email || employeeData.phone) {
      const contactId = `contact_${empId}_${Date.now()}`;
      await db.employeeContacts.add({
        id: contactId,
        employee_id: empId,
        email: employeeData.email || null,
        phone: employeeData.phone || null,
        channel: employeeData.email ? 'email' : 'sms',
      });
    }

    const employee = {
      employeeId: empId,
      name: employeeData.name.trim(),
      department: employeeData.department.trim(),
      jobTitle: employeeData.jobTitle?.trim() || '',
      email: employeeData.email?.trim() || null,
      phone: employeeData.phone?.trim() || null,
    };

    return { success: true, employee };
  } catch (err) {
    return { success: false, error: `Failed to add employee: ${err.message}` };
  }
}

/**
 * Edit employee
 * @param {string} originalId
 * @param {object} updates
 * @returns {Promise<{success: boolean, employee?: object, error?: string}>}
 */
export async function editEmployeeWithDb(originalId, updates) {
  const validation = validateEmployee(updates);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  const newId = updates.employeeId.trim().toUpperCase();
  const db = getDbService();

  try {
    const stored = await db.employees?.getByEmployeeId?.(originalId.trim().toUpperCase());
    if (stored) {
      await db.employees.update(stored.id, {
        ...stored,
        employee_id: newId,
        name: updates.name.trim(),
        department: updates.department.trim(),
        job_title: updates.jobTitle?.trim() || '',
        employment_status: updates.employmentStatus || stored.employment_status || 'Active',
      });
    }

    // Update contact info if email/phone provided
    if (updates.email || updates.phone) {
      const contact = await db.employeeContacts?.getByEmployeeId?.(originalId.toUpperCase());
      if (contact) {
        await db.employeeContacts.update(contact.id, {
          email: updates.email || null,
          phone: updates.phone || null,
        });
      }
    }

    const employee = {
      employeeId: newId,
      name: updates.name.trim(),
      department: updates.department.trim(),
      jobTitle: updates.jobTitle?.trim() || '',
      email: updates.email?.trim() || null,
      phone: updates.phone?.trim() || null,
    };

    return { success: true, employee };
  } catch (err) {
    return { success: false, error: `Failed to update employee: ${err.message}` };
  }
}

/**
 * Delete employee
 * @param {string} employeeId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteEmployeeWithDb(employeeId) {
  const db = getDbService();
  const empId = employeeId.trim().toUpperCase();

  try {
    const stored = await db.employees?.getByEmployeeId?.(empId);
    if (stored) {
      await db.employees.delete(stored.id);
    }
    const contact = await db.employeeContacts?.getByEmployeeId?.(empId);
    if (contact) {
      await db.employeeContacts.delete(contact.id);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete employee: ${err.message}` };
  }
}

/**
 * Load the employees that were added through the interface.
 * @returns {Promise<array>} [{employeeId, name, department, jobTitle, employmentStatus}]
 */
export async function loadEmployeesFromDb() {
  try {
    const db = getDbService();
    const rows = await db.employees.list();
    return rows.map(row => ({
      employeeId: row.employee_id,
      name: row.name,
      department: row.department,
      jobTitle: row.job_title || '',
      employmentStatus: row.employment_status || 'Active',
    }));
  } catch (err) {
    console.warn('Failed to load employees:', err.message);
    return [];
  }
}

/**
 * Merge manually added employees into the list of people the compliance
 * engine reads.
 *
 * The engine keys people by Employee_ID and keeps the first entry it sees, so
 * imported people are placed first and always win over a manual entry with the
 * same ID. A manual employee carries no training record, so every requirement
 * for that person is reported as missing, which is the correct state for
 * somebody who was only just registered.
 *
 * Adding a manual employee is also how a new department appears: the
 * department is a free-text name, and the filters and reports derive their
 * department list from the people.
 *
 * @param {array} people - Imported employees or training records
 * @param {array} manualEmployees - [{employeeId, name, department, jobTitle, employmentStatus}]
 * @returns {array} People in the engine's field shape
 */
export function mergeManualEmployees(people, manualEmployees) {
  const imported = people || [];
  if (!manualEmployees || manualEmployees.length === 0) return imported;

  const importedIds = new Set(imported.map(p => p.Employee_ID).filter(Boolean));
  const merged = [...imported];

  for (const employee of manualEmployees) {
    if (!employee?.employeeId || !employee.department) continue;
    const id = employee.employeeId.trim().toUpperCase();
    if (importedIds.has(id)) continue;
    importedIds.add(id);
    merged.push({
      Employee_ID: id,
      Employee_Name: employee.name,
      Department: employee.department,
      Job_Title: employee.jobTitle || '',
      Employment_Status: employee.employmentStatus || EMPLOYMENT_STATUS.ACTIVE,
    });
  }

  return merged;
}
