/**
 * Data Service for managing courses, departments, and certificates.
 *
 * Provides functions to add, edit, delete courses and track certificate metadata.
 * Initial storage: in-memory state + optional localStorage.
 * Future: Supabase or self-hosted database.
 */

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
