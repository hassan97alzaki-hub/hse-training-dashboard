import { describe, it, expect } from 'vitest';
import {
  isValidCourseCode,
  validateCourse,
  addCourse,
  editCourse,
  deleteCourse,
  exportCoursesAsCSV,
  getRequirementsByDepartment,
  mergeManualCourses,
  mergeManualEmployees,
  departmentKey,
  validateDepartment,
  listDepartments,
} from '../src/lib/dataService.js';
import { buildComplianceUniverse } from '../src/lib/complianceEngine.js';

describe('dataService.js', () => {
  describe('isValidCourseCode', () => {
    it('accepts valid course codes', () => {
      expect(isValidCourseCode('H2S001')).toBe(true);
      expect(isValidCourseCode('PTW-001')).toBe(true);
      expect(isValidCourseCode('CS_101')).toBe(true);
      expect(isValidCourseCode('A2')).toBe(true); // min 2 chars
    });

    it('rejects invalid course codes', () => {
      expect(isValidCourseCode('A')).toBe(false); // too short
      expect(isValidCourseCode('H2S001ABC123XYZ123456')).toBe(false); // too long (>20)
      expect(isValidCourseCode('H2S 001')).toBe(false); // space not allowed
      expect(isValidCourseCode('H2S@001')).toBe(false); // special char
      expect(isValidCourseCode('')).toBe(false);
      expect(isValidCourseCode(null)).toBe(false);
    });
  });

  describe('validateCourse', () => {
    it('validates correct course object', () => {
      const course = {
        code: 'H2S001',
        name: 'H2S Safety',
        mandatory: true,
        validityMonths: 12,
        description: 'Safety training',
      };
      const result = validateCourse(course);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects invalid code', () => {
      const course = {
        code: 'A', // too short
        name: 'Course Name',
      };
      const result = validateCourse(course);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Course Code');
    });

    it('rejects missing name', () => {
      const course = {
        code: 'H2S001',
        name: '', // empty
      };
      const result = validateCourse(course);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Course Name');
    });

    it('rejects non-integer validity months', () => {
      const course = {
        code: 'H2S001',
        name: 'Course',
        validityMonths: 12.5,
      };
      const result = validateCourse(course);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Validity Months');
    });
  });

  describe('addCourse', () => {
    it('adds a new course to empty list', () => {
      const courses = [];
      const result = addCourse(courses, {
        code: 'H2S001',
        name: 'H2S Safety',
        mandatory: true,
        validityMonths: 12,
      });

      expect(result.success).toBe(true);
      expect(result.course.code).toBe('H2S001');
      expect(result.course.name).toBe('H2S Safety');
      expect(result.course.mandatory).toBe(true);
      expect(result.course.validityMonths).toBe(12);
      expect(result.course.createdAt).toBeTruthy();
    });

    it('rejects duplicate course code (case-insensitive)', () => {
      const courses = [
        { code: 'H2S001', name: 'H2S Safety', mandatory: true, validityMonths: 12 },
      ];
      const result = addCourse(courses, {
        code: 'h2s001', // lowercase
        name: 'Duplicate',
        mandatory: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('rejects invalid course', () => {
      const courses = [];
      const result = addCourse(courses, {
        code: 'A', // too short
        name: 'Course',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Course Code');
    });

    it('defaults mandatory to false and validityMonths to 12', () => {
      const courses = [];
      const result = addCourse(courses, {
        code: 'TEST001',
        name: 'Test Course',
      });

      expect(result.success).toBe(true);
      expect(result.course.mandatory).toBe(false);
      expect(result.course.validityMonths).toBe(12);
    });

    it('trims whitespace from code and name', () => {
      const courses = [];
      const result = addCourse(courses, {
        code: '  H2S001  ',
        name: '  H2S Safety  ',
        mandatory: true,
      });

      expect(result.success).toBe(true);
      expect(result.course.code).toBe('H2S001');
      expect(result.course.name).toBe('H2S Safety');
    });
  });

  describe('editCourse', () => {
    it('edits an existing course', () => {
      const courses = [
        { code: 'H2S001', name: 'H2S Safety', mandatory: true, validityMonths: 12 },
      ];
      const result = editCourse(courses, 'H2S001', {
        code: 'H2S001',
        name: 'H2S Safety (Updated)',
        mandatory: false,
        validityMonths: 24,
      });

      expect(result.success).toBe(true);
      expect(result.course.name).toBe('H2S Safety (Updated)');
      expect(result.course.validityMonths).toBe(24);
      expect(result.index).toBe(0);
    });

    it('rejects if course not found', () => {
      const courses = [];
      const result = editCourse(courses, 'H2S001', {
        code: 'H2S001',
        name: 'Course',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects if new code conflicts with another course', () => {
      const courses = [
        { code: 'H2S001', name: 'H2S Safety', mandatory: true },
        { code: 'PTW001', name: 'PTW', mandatory: true },
      ];
      const result = editCourse(courses, 'H2S001', {
        code: 'PTW001', // same as second course
        name: 'H2S Safety',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('allows renaming code to itself (case-insensitive)', () => {
      const courses = [
        { code: 'H2S001', name: 'H2S Safety', mandatory: true },
      ];
      const result = editCourse(courses, 'H2S001', {
        code: 'h2s001', // same but lowercase
        name: 'H2S Safety (Updated)',
      });

      expect(result.success).toBe(true);
      expect(result.course.code).toBe('H2S001'); // normalized to uppercase
    });
  });

  describe('deleteCourse', () => {
    it('deletes a course by code', () => {
      const courses = [
        { code: 'H2S001', name: 'H2S Safety' },
        { code: 'PTW001', name: 'PTW' },
      ];
      const result = deleteCourse(courses, 'H2S001');

      expect(result.success).toBe(true);
      expect(result.index).toBe(0);
      expect(result.deletedCode).toBe('H2S001');
    });

    it('rejects if course not found', () => {
      const courses = [];
      const result = deleteCourse(courses, 'H2S001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('is case-insensitive', () => {
      const courses = [
        { code: 'H2S001', name: 'H2S Safety' },
      ];
      const result = deleteCourse(courses, 'h2s001');

      expect(result.success).toBe(true);
      expect(result.index).toBe(0);
    });
  });

  describe('exportCoursesAsCSV', () => {
    it('exports courses as CSV', () => {
      const courses = [
        { code: 'H2S001', name: 'H2S Safety', mandatory: true, validityMonths: 12, description: 'Safety' },
        { code: 'PTW001', name: 'PTW', mandatory: false, validityMonths: 24, description: '' },
      ];
      const csv = exportCoursesAsCSV(courses);

      expect(csv).toContain('Course_Code,Course_Name,Mandatory,Validity_Months,Description');
      expect(csv).toContain('H2S001,H2S Safety,Yes,12,Safety');
      expect(csv).toContain('PTW001,PTW,No,24');
    });

    it('escapes quotes in fields', () => {
      const courses = [
        { code: 'C1', name: 'Course "Test"', mandatory: true, validityMonths: 12 },
      ];
      const csv = exportCoursesAsCSV(courses);

      expect(csv).toContain('"Course ""Test"""');
    });

    it('handles empty courses list', () => {
      const csv = exportCoursesAsCSV([]);
      expect(csv).toContain('Course_Code,Course_Name,Mandatory,Validity_Months,Description');
    });
  });

  describe('getRequirementsByDepartment', () => {
    it('returns course codes for a department', () => {
      const requirements = [
        { Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'H2S001' },
        { Department: 'Operations', Job_Title: 'Technician', Course_Code: 'PTW001' },
        { Department: 'Maintenance', Job_Title: 'Technician', Course_Code: 'H2S001' },
      ];
      const codes = getRequirementsByDepartment(requirements, 'Operations');

      expect(codes).toContain('H2S001');
      expect(codes).toContain('PTW001');
      expect(codes).not.toContain('Maintenance');
    });

    it('returns unique course codes only', () => {
      const requirements = [
        { Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'H2S001' },
        { Department: 'Operations', Job_Title: 'Technician', Course_Code: 'H2S001' },
      ];
      const codes = getRequirementsByDepartment(requirements, 'Operations');

      expect(codes.length).toBe(1);
      expect(codes[0]).toBe('H2S001');
    });

    it('returns empty array for nonexistent department', () => {
      const requirements = [
        { Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'H2S001' },
      ];
      const codes = getRequirementsByDepartment(requirements, 'HR');

      expect(codes).toEqual([]);
    });
  });

  describe('mergeManualCourses', () => {
    const manual = [{
      code: 'MAN001', name: 'Manual Course', mandatory: true,
      validityMonths: 24, description: 'Added in the app',
    }];

    it('returns the requirements unchanged when there are no manual courses', () => {
      const requirements = [{ Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'H2S001' }];

      expect(mergeManualCourses(requirements, [])).toBe(requirements);
      expect(mergeManualCourses(requirements, null)).toBe(requirements);
    });

    it('adds a manual course to every role in the matrix', () => {
      const requirements = [
        { Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'H2S001' },
        { Department: 'Operations', Job_Title: 'Technician', Course_Code: 'H2S001' },
      ];
      const merged = mergeManualCourses(requirements, manual);
      const added = merged.filter(r => r.Course_Code === 'MAN001');

      expect(added.length).toBe(2);
      expect(added.map(r => r.Job_Title).sort()).toEqual(['Supervisor', 'Technician']);
    });

    it('never gives a manual course an empty Job_Title, which would match nobody', () => {
      const requirements = [{ Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'H2S001' }];
      const merged = mergeManualCourses(requirements, manual);

      for (const row of merged.filter(r => r.Course_Code === 'MAN001')) {
        expect(row.Job_Title).toBeTruthy();
      }
    });

    it('takes roles from the loaded people when the matrix is empty', () => {
      const people = [
        { Employee_ID: 'E1', Department: 'Operations', Job_Title: 'Supervisor' },
        { Employee_ID: 'E2', Department: 'Maintenance', Job_Title: 'Technician' },
      ];
      const merged = mergeManualCourses([], manual, people);

      expect(merged.length).toBe(2);
      expect(merged.map(r => r.Department).sort()).toEqual(['Maintenance', 'Operations']);
    });

    it('produces one row per role even when several people share a role', () => {
      const people = [
        { Employee_ID: 'E1', Department: 'Operations', Job_Title: 'Supervisor' },
        { Employee_ID: 'E2', Department: 'Operations', Job_Title: 'Supervisor' },
      ];
      const merged = mergeManualCourses([], manual, people);

      expect(merged.length).toBe(1);
    });

    it('carries the course fields in the shape the compliance engine reads', () => {
      const people = [{ Employee_ID: 'E1', Department: 'Operations', Job_Title: 'Supervisor' }];
      const [row] = mergeManualCourses([], manual, people);

      expect(row).toEqual({
        Department: 'Operations',
        Job_Title: 'Supervisor',
        Course_Code: 'MAN001',
        Course_Name: 'Manual Course',
        Mandatory: true,
        Validity_Months: 24,
        Description: 'Added in the app',
      });
    });

    it('defaults validity to 12 months and mandatory to false', () => {
      const people = [{ Employee_ID: 'E1', Department: 'Operations', Job_Title: 'Supervisor' }];
      const [row] = mergeManualCourses([], [{ code: 'MAN002', name: 'Optional' }], people);

      expect(row.Validity_Months).toBe(12);
      expect(row.Mandatory).toBe(false);
    });

    it('keeps the imported row when the matrix already has that course for the role', () => {
      const requirements = [{
        Department: 'Operations', Job_Title: 'Supervisor',
        Course_Code: 'man001', Course_Name: 'From the matrix', Mandatory: false,
      }];
      const merged = mergeManualCourses(requirements, manual);

      expect(merged.length).toBe(1);
      expect(merged[0].Course_Name).toBe('From the matrix');
    });

    it('still adds the course to the roles that do not have it', () => {
      const requirements = [
        { Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'MAN001' },
        { Department: 'Operations', Job_Title: 'Technician', Course_Code: 'H2S001' },
      ];
      const merged = mergeManualCourses(requirements, manual);
      const added = merged.filter(r => r.Course_Code === 'MAN001');

      expect(added.length).toBe(2);
      expect(added.some(r => r.Job_Title === 'Technician')).toBe(true);
    });

    it('does not mutate the requirements it was given', () => {
      const requirements = [{ Department: 'Operations', Job_Title: 'Supervisor', Course_Code: 'H2S001' }];
      mergeManualCourses(requirements, manual);

      expect(requirements.length).toBe(1);
    });

    it('ignores people without a department', () => {
      const people = [
        { Employee_ID: 'E1', Department: '', Job_Title: 'Supervisor' },
        { Employee_ID: 'E2', Department: 'Operations', Job_Title: 'Supervisor' },
      ];
      const merged = mergeManualCourses([], manual, people);

      expect(merged.length).toBe(1);
      expect(merged[0].Department).toBe('Operations');
    });

    it('returns an empty matrix when there is no role to attach the course to', () => {
      expect(mergeManualCourses([], manual, [])).toEqual([]);
    });
  });

  describe('mergeManualEmployees', () => {
    const manual = [{
      employeeId: 'EMP900', name: 'Hassan Ali',
      department: 'Inspection', jobTitle: 'Inspector',
    }];

    it('returns the people unchanged when there are no manual employees', () => {
      const people = [{ Employee_ID: 'EMP001', Department: 'Operations' }];

      expect(mergeManualEmployees(people, [])).toBe(people);
      expect(mergeManualEmployees(people, null)).toBe(people);
    });

    it('translates a manual employee into the fields the engine reads', () => {
      const [, added] = mergeManualEmployees([{ Employee_ID: 'EMP001' }], manual);

      expect(added).toEqual({
        Employee_ID: 'EMP900',
        Employee_Name: 'Hassan Ali',
        Department: 'Inspection',
        Job_Title: 'Inspector',
        Employment_Status: 'Active',
      });
    });

    it('treats a manual employee as active so they are reported on', () => {
      const [added] = mergeManualEmployees([], manual);

      expect(added.Employment_Status).toBe('Active');
    });

    it('keeps an explicit employment status', () => {
      const [added] = mergeManualEmployees([], [{ ...manual[0], employmentStatus: 'Left' }]);

      expect(added.Employment_Status).toBe('Left');
    });

    it('uppercases the employee ID, which is how the engine keys people', () => {
      const [added] = mergeManualEmployees([], [{ ...manual[0], employeeId: 'emp900' }]);

      expect(added.Employee_ID).toBe('EMP900');
    });

    it('lets an imported person win over a manual entry with the same ID', () => {
      const people = [{ Employee_ID: 'EMP900', Employee_Name: 'From the import', Department: 'Operations' }];
      const merged = mergeManualEmployees(people, manual);

      expect(merged.length).toBe(1);
      expect(merged[0].Employee_Name).toBe('From the import');
    });

    it('adds a manual employee only once when listed twice', () => {
      const merged = mergeManualEmployees([], [manual[0], { ...manual[0], name: 'Second entry' }]);

      expect(merged.length).toBe(1);
      expect(merged[0].Employee_Name).toBe('Hassan Ali');
    });

    it('skips an entry without an ID or without a department', () => {
      const merged = mergeManualEmployees([], [
        { name: 'No ID', department: 'Inspection' },
        { employeeId: 'EMP901', name: 'No department' },
        manual[0],
      ]);

      expect(merged.length).toBe(1);
      expect(merged[0].Employee_ID).toBe('EMP900');
    });

    it('does not mutate the people it was given', () => {
      const people = [{ Employee_ID: 'EMP001', Department: 'Operations' }];
      mergeManualEmployees(people, manual);

      expect(people.length).toBe(1);
    });

    it('brings a new department into the compliance universe', () => {
      // A department exists only as a name on a person, so adding an employee
      // in a department nobody else is in is how that department appears.
      const people = mergeManualEmployees([], manual);
      const requirements = mergeManualCourses(
        [],
        [{ code: 'MAN001', name: 'Manual Course', mandatory: true, validityMonths: 12 }],
        people,
      );
      const result = buildComplianceUniverse([], requirements, '2026-10-12', people);
      const departments = new Set(result.universe.map(item => item.Department));

      expect(departments.has('Inspection')).toBe(true);
    });

    it('reports a manual employee as missing the course, having no record', () => {
      const people = mergeManualEmployees([], manual);
      const requirements = mergeManualCourses(
        [],
        [{ code: 'MAN001', name: 'Manual Course', mandatory: true, validityMonths: 12 }],
        people,
      );
      const result = buildComplianceUniverse([], requirements, '2026-10-12', people);
      const row = result.universe.find(item => item.Employee_ID === 'EMP900');

      expect(row.Course_Code).toBe('MAN001');
      expect(row.isMissing).toBe(true);
    });
  });

  describe('departmentKey', () => {
    it('lower-cases and trims', () => {
      expect(departmentKey('  Operations ')).toBe('operations');
    });

    it('returns an empty string for null or undefined', () => {
      expect(departmentKey(null)).toBe('');
      expect(departmentKey(undefined)).toBe('');
    });
  });

  describe('validateDepartment', () => {
    it('rejects an empty name', () => {
      const result = validateDepartment('   ');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Department name required');
    });

    it('accepts a new name', () => {
      expect(validateDepartment('Operations', ['Drilling']).valid).toBe(true);
    });

    it('rejects a duplicate regardless of case or spacing', () => {
      const result = validateDepartment(' operations ', ['Operations']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('already exists');
    });

    it('rejects a name longer than 60 characters', () => {
      const result = validateDepartment('x'.repeat(61));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('60 characters');
    });
  });

  describe('listDepartments', () => {
    it('returns an empty list with no sources', () => {
      expect(listDepartments([], [])).toEqual([]);
    });

    it('lists a registered department with no people', () => {
      expect(listDepartments(['Operations'], [])).toEqual([
        { name: 'Operations', registered: true, employeeCount: 0 },
      ]);
    });

    it('counts the people in a registered department', () => {
      const people = [
        { Employee_ID: 'E1', Department: 'Operations' },
        { Employee_ID: 'E2', Department: 'Operations' },
      ];
      expect(listDepartments(['Operations'], people)[0].employeeCount).toBe(2);
    });

    it('discovers a department that only exists in the people', () => {
      const result = listDepartments([], [{ Employee_ID: 'E1', Department: 'Drilling' }]);
      expect(result).toEqual([{ name: 'Drilling', registered: false, employeeCount: 1 }]);
    });

    it('matches a registered name to the people without case, keeping the registered spelling', () => {
      const result = listDepartments(['Operations'], [{ Employee_ID: 'E1', Department: 'operations' }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'Operations', registered: true, employeeCount: 1 });
    });

    it('skips a person with no department', () => {
      expect(listDepartments([], [{ Employee_ID: 'E1', Department: '  ' }])).toEqual([]);
    });

    it('skips an empty registered name', () => {
      expect(listDepartments(['', '  '], [])).toEqual([]);
    });

    it('sorts by name', () => {
      const result = listDepartments(['Operations', 'Drilling'], [{ Employee_ID: 'E1', Department: 'Admin' }]);
      expect(result.map(d => d.name)).toEqual(['Admin', 'Drilling', 'Operations']);
    });
  });
});
