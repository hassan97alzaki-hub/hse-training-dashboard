import { describe, it, expect } from 'vitest';
import {
  isValidCourseCode,
  validateCourse,
  addCourse,
  editCourse,
  deleteCourse,
  exportCoursesAsCSV,
  getRequirementsByDepartment,
} from '../src/lib/dataService.js';

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
});
