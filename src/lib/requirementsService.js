/**
 * Reads and writes for the requirements matrix and the training records.
 *
 * Writes are explicit, at save time, and only of what changed. The existing
 * course-persistence effect in App.jsx reconciles its whole collection on
 * every change, which is fine for a handful of courses and wrong for a matrix
 * of hundreds of rows.
 *
 * owner_id is never set here: the database fills it in and row-level security
 * rejects anything else. See supabase/migrations/0002_requirements.sql.
 */

import { getDbService } from './db/dbService.js';

/** "Operations|Operator" — the key the engine's equality comparison implies. */
function roleKey(department, jobTitle) {
  return `${department}|${jobTitle ?? ''}`;
}

/**
 * Every requirement row stored for this account, snake_case as stored.
 * Returns an empty array when the database cannot be read, so a cloud outage
 * degrades to the imported matrix instead of blocking the dashboard.
 */
export async function loadRequirementsFromDb() {
  try {
    const db = getDbService();
    return (await db.requirements.list()) ?? [];
  } catch (err) {
    console.warn('Failed to load the requirements matrix:', err.message);
    return [];
  }
}

/**
 * Make `appliesTo` the complete set of roles that need this course.
 *
 * @param {string} courseCode
 * @param {Array<{department: string, jobTitle: string}>} appliesTo - an empty
 *   jobTitle means the whole department
 * @returns {Promise<{success: boolean, added: number, removed: number, error?: string}>}
 */
export async function saveRequirementsForCourse(courseCode, appliesTo = []) {
  if (!courseCode) return { success: false, added: 0, removed: 0, error: 'A course code is required' };

  try {
    const db = getDbService();
    const existing = (await db.requirements.listByCourse(courseCode)) ?? [];

    const wanted = new Map(
      appliesTo
        .filter(role => role?.department)
        .map(role => [roleKey(role.department, role.jobTitle), role]),
    );
    const have = new Map(existing.map(row => [roleKey(row.department, row.job_title), row]));

    let removed = 0;
    for (const [key, row] of have) {
      if (wanted.has(key)) continue;
      await db.requirements.delete(row.id);
      removed += 1;
    }

    let added = 0;
    for (const [key, role] of wanted) {
      if (have.has(key)) continue;
      await db.requirements.add({
        id: `req_${courseCode}_${added}_${Date.now()}`,
        department: role.department,
        job_title: role.jobTitle ?? '',
        course_code: courseCode,
        mandatory: role.mandatory ?? true,
        validity_months: role.validityMonths ?? null,
      });
      added += 1;
    }

    return { success: true, added, removed };
  } catch (err) {
    return { success: false, added: 0, removed: 0, error: err.message };
  }
}

/**
 * issueDate plus validityMonths, as 'YYYY-MM-DD'.
 *
 * A month shorter than the day of the month rolls back to its last day, so
 * 31 January plus one month is 28 February, not 3 March.
 *
 * @returns {string|null} null when there is no issue date or no validity
 */
export function computeExpiryDate(issueDate, validityMonths) {
  if (!issueDate || !validityMonths) return null;

  const [year, month, day] = issueDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  const target = new Date(Date.UTC(year, month - 1 + validityMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  return target.toISOString().slice(0, 10);
}

/**
 * Record a completion for each attendee.
 *
 * @param {object} session - {courseCode, issueDate, expiryDate, certificateNumber,
 *   completionStatus, employeeIds}
 * @param {array} courses - the catalogue, for the validity when no expiry is given
 * @returns {Promise<{success: boolean, records: array, error?: string}>}
 */
export async function addTrainingRecords(session, courses = []) {
  const { courseCode, issueDate, expiryDate, certificateNumber, completionStatus, employeeIds } =
    session ?? {};

  if (!courseCode) return { success: false, records: [], error: 'A course is required' };
  if (!employeeIds || employeeIds.length === 0) {
    return { success: false, records: [], error: 'At least one attendee is required' };
  }

  const course = courses.find(c => c?.code && c.code.toUpperCase() === courseCode.toUpperCase());
  const expiry = expiryDate || computeExpiryDate(issueDate, course?.validityMonths ?? null);

  try {
    const db = getDbService();
    const records = [];
    for (const employeeId of employeeIds) {
      const row = {
        id: `rec_${employeeId}_${courseCode}_${Date.now()}_${records.length}`,
        employee_id: employeeId,
        course_code: courseCode,
        completion_status: completionStatus ?? 'Completed',
        issue_date: issueDate || null,
        expiry_date: expiry,
        certificate_number: certificateNumber || null,
        source: 'manual',
      };
      await db.trainingRecords.add(row);
      records.push(row);
    }
    return { success: true, records };
  } catch (err) {
    return { success: false, records: [], error: err.message };
  }
}

/**
 * Replace the whole matrix with an imported one. One active source at a time.
 *
 * The training records are deliberately untouched: those are actual
 * completions, not requirements, and an import of a matrix says nothing about
 * them.
 *
 * @param {array} rows - snake_case requirement rows
 */
export async function replaceRequirements(rows = []) {
  const db = getDbService();
  const existing = (await db.requirements.list()) ?? [];

  let removed = 0;
  for (const row of existing) {
    await db.requirements.delete(row.id);
    removed += 1;
  }

  let added = 0;
  for (const row of rows) {
    await db.requirements.add({
      id: row.id ?? `req_import_${added}_${Date.now()}`,
      department: row.department,
      job_title: row.job_title ?? '',
      course_code: row.course_code,
      mandatory: row.mandatory ?? true,
      validity_months: row.validity_months ?? null,
    });
    added += 1;
  }

  return { success: true, removed, added };
}

/**
 * Requirement rows whose course code is not in the catalogue.
 *
 * Not an error and not rejected: an imported matrix may require a course that
 * was never registered, and refusing it would break the CSV path. The user is
 * told instead, through DataQualityPanel.
 *
 * @param {array} rows - requirement rows (snake_case)
 * @param {array} courses - the catalogue
 * @returns {Array<string>} the unknown course codes, each once
 */
export function findUnregisteredCourses(rows = [], courses = []) {
  const known = new Set(courses.filter(c => c?.code).map(c => c.code.toUpperCase()));
  const unknown = new Set();
  for (const row of rows) {
    if (!row?.course_code) continue;
    if (!known.has(row.course_code.toUpperCase())) unknown.add(row.course_code);
  }
  return Array.from(unknown);
}
