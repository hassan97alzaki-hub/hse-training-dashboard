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
 * Merge the requirements matrix built in the interface into the imported one.
 *
 * Two translations the compliance engine needs:
 *
 * - A stored row with an empty `job_title` means every job title in that
 *   department. The engine compares `r.Job_Title === emp.Job_Title` by
 *   equality (complianceEngine.js:148), so the row is expanded into one row
 *   per job title present in that department. `people` is where those job
 *   titles come from. The expansion is confined to the named department.
 * - Stored rows are snake_case; the engine reads PascalCase. `Course_Name` and
 *   a fallback `Validity_Months` come from the courses catalogue, because the
 *   requirements table does not store a course name.
 *
 * An imported row wins: a managed row for the same role and course is
 * skipped, so an approved HSE-DC-1.0 sheet is never overridden by hand-entry.
 *
 * Pure function. The engine itself is not touched.
 *
 * @param {array} importedRows - requirements from an import, already PascalCase
 * @param {array} managedRows - rows from the requirements table (snake_case)
 * @param {array} people - employees or records carrying Department/Job_Title
 * @param {array} courses - catalogue: [{code, name, mandatory, validityMonths, description}]
 * @returns {array} requirements rows the compliance engine can read
 */
export function mergeRequirements(importedRows, managedRows, people = [], courses = []) {
  const imported = Array.isArray(importedRows) ? importedRows : [];
  const managed = Array.isArray(managedRows) ? managedRows : [];
  if (managed.length === 0) return imported;

  const merged = [...imported];

  // Department → the job titles actually present in it.
  const titlesByDepartment = new Map();
  for (const person of people ?? []) {
    if (!person?.Department) continue;
    const titles = titlesByDepartment.get(person.Department) ?? new Set();
    if (person.Job_Title) titles.add(person.Job_Title);
    titlesByDepartment.set(person.Department, titles);
  }

  const catalogue = new Map(
    (courses ?? [])
      .filter(course => course?.code)
      .map(course => [course.code.toUpperCase(), course]),
  );

  const has = (department, jobTitle, codeUpper) => merged.some(
    row => row.Department === department
      && (row.Job_Title ?? '') === jobTitle
      && row.Course_Code
      && row.Course_Code.toUpperCase() === codeUpper,
  );

  for (const row of managed) {
    if (!row?.department || !row?.course_code) continue;
    const codeUpper = row.course_code.toUpperCase();
    const course = catalogue.get(codeUpper);

    const targets = row.job_title
      ? [row.job_title]
      : Array.from(titlesByDepartment.get(row.department) ?? []);

    for (const jobTitle of targets) {
      if (has(row.department, jobTitle, codeUpper)) continue;
      merged.push({
        Department: row.department,
        Job_Title: jobTitle,
        Course_Code: row.course_code,
        Course_Name: course?.name ?? row.course_code,
        Mandatory: Boolean(row.mandatory),
        Validity_Months: row.validity_months ?? course?.validityMonths ?? 12,
        Description: course?.description || '',
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
 * Load the training records entered through the interface, in the shape the
 * compliance engine reads. Same mapping as the save callback in App.jsx, so a
 * record looks identical before and after a reload.
 * @returns {Promise<array>} [{Employee_ID, Course_Code, Completion_Status, Issue_Date, Expiry_Date, Certificate_Number}]
 */
export async function loadTrainingRecordsFromDb() {
  try {
    const db = getDbService();
    const rows = await db.trainingRecords.list();
    return rows.map(row => ({
      Record_ID: row.id,
      Employee_ID: row.employee_id,
      Course_Code: row.course_code,
      Completion_Status: row.completion_status ?? 'Completed',
      Issue_Date: row.issue_date ?? null,
      Expiry_Date: row.expiry_date ?? null,
      Certificate_Number: row.certificate_number ?? null,
    }));
  } catch (err) {
    console.warn('Failed to load training records:', err.message);
    return [];
  }
}

// ===== Departments =====

/**
 * The comparison key of a department name. Names are compared without case
 * and without surrounding spaces, so "Operations" and " operations " are the
 * same department.
 * @param {string} name
 * @returns {string}
 */
export function departmentKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * Validate a department name against the names already in use.
 * @param {string} name - Proposed name
 * @param {string[]} existingNames - Names already registered or discovered
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateDepartment(name, existingNames = []) {
  const errors = [];
  const trimmed = String(name ?? '').trim();

  if (!trimmed) {
    errors.push('Department name required');
    return { valid: false, errors };
  }

  if (trimmed.length > 60) {
    errors.push('Department name must be 60 characters or fewer');
  }

  const key = departmentKey(trimmed);
  if (existingNames.some(existing => departmentKey(existing) === key)) {
    errors.push(`Department "${trimmed}" already exists`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Register a department and persist it.
 * @param {string} name
 * @param {string[]} existingNames - Names already registered or discovered
 * @returns {Promise<{success: boolean, department?: object, error?: string}>}
 */
export async function addDepartmentWithDb(name, existingNames = []) {
  const validation = validateDepartment(name, existingNames);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  const trimmed = name.trim();
  const key = departmentKey(trimmed);

  try {
    const db = getDbService();
    const existing = await db.departments?.getByNameKey?.(key);
    if (existing) {
      return { success: false, error: `Department "${trimmed}" already exists` };
    }

    await db.departments.add({ id: `dept_${key}`, name: trimmed, name_key: key });
    return { success: true, department: { name: trimmed } };
  } catch (err) {
    return { success: false, error: `Failed to add department: ${err.message}` };
  }
}

/**
 * Remove a registered department.
 *
 * A department that still has people in it is kept, because the people would
 * otherwise refer to a department that no longer exists. Move or remove the
 * people first.
 *
 * @param {string} name
 * @param {array} people - People in the engine's field shape
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteDepartmentWithDb(name, people = []) {
  const key = departmentKey(name);
  const inUse = (people || []).filter(person => departmentKey(person.Department) === key);

  if (inUse.length > 0) {
    return {
      success: false,
      error: `Department "${name}" still has ${inUse.length} employee(s). Move or remove them first.`,
    };
  }

  try {
    const db = getDbService();
    const stored = await db.departments?.getByNameKey?.(key);
    if (stored) {
      await db.departments.delete(stored.id);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete department: ${err.message}` };
  }
}

/**
 * Load the registered department names.
 * @returns {Promise<string[]>}
 */
export async function loadDepartmentsFromDb() {
  try {
    const db = getDbService();
    const rows = await db.departments.list();
    return rows.map(row => row.name);
  } catch (err) {
    console.warn('Failed to load departments:', err.message);
    return [];
  }
}

/**
 * The departments to offer and to show, from both sources.
 *
 * A department is either registered through the interface or discovered in
 * imported data. A discovered department cannot be removed here, because it
 * comes back with its import. Names are matched without case, so a registered
 * name is reported once even when the import spells it differently; the
 * registered spelling is the one shown.
 *
 * @param {string[]} registeredNames - Names from the database
 * @param {array} people - People in the engine's field shape
 * @returns {array} [{name, registered: boolean, employeeCount: number}] sorted by name
 */
export function listDepartments(registeredNames = [], people = []) {
  const byKey = new Map(); // key → {name, registered, employeeCount}

  for (const name of registeredNames) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) continue;
    byKey.set(departmentKey(trimmed), { name: trimmed, registered: true, employeeCount: 0 });
  }

  for (const person of people || []) {
    const name = String(person?.Department ?? '').trim();
    if (!name) continue;
    const key = departmentKey(name);
    const entry = byKey.get(key);
    if (entry) {
      entry.employeeCount += 1;
    } else {
      byKey.set(key, { name, registered: false, employeeCount: 1 });
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
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
