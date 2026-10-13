import { describe, it, expect, beforeEach, vi } from 'vitest';

// There is no injection seam: getDbService() reads a module-level instance.
vi.mock('../src/lib/db/dbService.js', () => ({
  getDbService: () => globalThis.__testDb,
}));

const {
  loadRequirementsFromDb,
  saveRequirementsForCourse,
  addTrainingRecords,
  replaceRequirements,
  computeExpiryDate,
  findUnregisteredCourses,
} = await import('../src/lib/requirementsService.js');

/** A minimal stand-in for the two stores the service touches. */
function fakeDb(requirementRows = []) {
  const requirements = new Map(requirementRows.map(r => [r.id, r]));
  const trainingRecords = new Map();
  return {
    requirements: {
      list: async () => Array.from(requirements.values()),
      listByCourse: async (code) =>
        Array.from(requirements.values()).filter(r => r.course_code === code),
      add: async (row) => { requirements.set(row.id, row); return row; },
      delete: async (id) => { requirements.delete(id); },
    },
    trainingRecords: {
      list: async () => Array.from(trainingRecords.values()),
      add: async (row) => { trainingRecords.set(row.id, row); return row; },
    },
    _requirements: requirements,
    _trainingRecords: trainingRecords,
  };
}

beforeEach(() => {
  globalThis.__testDb = fakeDb();
});

describe('saveRequirementsForCourse', () => {
  it('writes one row per selected role', async () => {
    const result = await saveRequirementsForCourse('H2S', [
      { department: 'Operations', jobTitle: 'Operator' },
      { department: 'Maintenance', jobTitle: 'Technician' },
    ]);

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);
    expect(globalThis.__testDb._requirements.size).toBe(2);
  });

  it('writes an empty job title for a whole department', async () => {
    await saveRequirementsForCourse('H2S', [{ department: 'Operations', jobTitle: '' }]);
    const [row] = Array.from(globalThis.__testDb._requirements.values());

    expect(row.department).toBe('Operations');
    expect(row.job_title).toBe('');
    expect(row.course_code).toBe('H2S');
  });

  it('writes only the difference, leaving an unchanged row alone', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_keep', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const result = await saveRequirementsForCourse('H2S', [
      { department: 'Operations', jobTitle: 'Operator' },
      { department: 'Operations', jobTitle: 'Supervisor' },
    ]);

    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
    expect(globalThis.__testDb._requirements.has('req_keep')).toBe(true);
  });

  it('deletes the row of a role that was unselected', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_gone', department: 'Maintenance', job_title: 'Technician', course_code: 'H2S' },
    ]);
    const result = await saveRequirementsForCourse('H2S', [
      { department: 'Operations', jobTitle: 'Operator' },
    ]);

    expect(result.removed).toBe(1);
    expect(globalThis.__testDb._requirements.has('req_gone')).toBe(false);
  });

  it('removes every row when nothing is selected, so a course requires nobody', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_1', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const result = await saveRequirementsForCourse('H2S', []);

    expect(result.removed).toBe(1);
    expect(globalThis.__testDb._requirements.size).toBe(0);
  });

  it('never touches another course\'s rows', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_other', department: 'Operations', job_title: 'Operator', course_code: 'FA' },
    ]);
    await saveRequirementsForCourse('H2S', []);

    expect(globalThis.__testDb._requirements.has('req_other')).toBe(true);
  });
});

describe('computeExpiryDate', () => {
  it('adds the validity in months', () => {
    expect(computeExpiryDate('2026-10-13', 24)).toBe('2028-10-13');
  });

  it('rolls a short month back to its last day', () => {
    // 31 January plus one month is not 31 February.
    expect(computeExpiryDate('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('returns null without a validity, so a course with no expiry has none', () => {
    expect(computeExpiryDate('2026-10-13', null)).toBeNull();
    expect(computeExpiryDate('', 12)).toBeNull();
  });
});

describe('addTrainingRecords', () => {
  const courses = [{ code: 'H2S', name: 'H2S Awareness', validityMonths: 24 }];

  it('writes one record per attendee', async () => {
    const result = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13',
      employeeIds: ['EMP001', 'EMP002'],
    }, courses);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(globalThis.__testDb._trainingRecords.size).toBe(2);
  });

  it('computes the expiry from the course validity', async () => {
    const { records } = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13', employeeIds: ['EMP001'],
    }, courses);

    expect(records[0].expiry_date).toBe('2028-10-13');
  });

  it('honours a manual expiry override', async () => {
    const { records } = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13', expiryDate: '2027-01-01',
      employeeIds: ['EMP001'],
    }, courses);

    expect(records[0].expiry_date).toBe('2027-01-01');
  });

  it('marks the source as manual, so an import can be told apart', async () => {
    const { records } = await addTrainingRecords({
      courseCode: 'H2S', issueDate: '2026-10-13', employeeIds: ['EMP001'],
    }, courses);

    expect(records[0].source).toBe('manual');
    expect(records[0].completion_status).toBe('Completed');
  });

  it('refuses a record with no course or no attendee', async () => {
    expect((await addTrainingRecords({ courseCode: '', employeeIds: ['EMP001'] }, courses)).success)
      .toBe(false);
    expect((await addTrainingRecords({ courseCode: 'H2S', employeeIds: [] }, courses)).success)
      .toBe(false);
  });
});

describe('replaceRequirements', () => {
  it('removes every existing row before writing the new ones', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_old', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const result = await replaceRequirements([
      { department: 'Logistics', job_title: 'Driver', course_code: 'DEF' },
    ]);

    expect(result.removed).toBe(1);
    expect(result.added).toBe(1);
    expect(globalThis.__testDb._requirements.has('req_old')).toBe(false);
  });

  it('leaves the training records untouched: those are completions, not requirements', async () => {
    globalThis.__testDb = fakeDb();
    await globalThis.__testDb.trainingRecords.add({ id: 'rec_1', employee_id: 'EMP001' });
    await replaceRequirements([]);

    expect(globalThis.__testDb._trainingRecords.has('rec_1')).toBe(true);
  });
});

describe('loadRequirementsFromDb', () => {
  it('returns the stored rows unchanged, snake_case and all', async () => {
    globalThis.__testDb = fakeDb([
      { id: 'req_1', department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ]);
    const rows = await loadRequirementsFromDb();

    expect(rows).toHaveLength(1);
    expect(rows[0].job_title).toBe('Operator');
  });

  it('returns an empty array when the database is unreachable', async () => {
    globalThis.__testDb = { requirements: { list: async () => { throw new Error('offline'); } } };
    expect(await loadRequirementsFromDb()).toEqual([]);
  });
});

describe('findUnregisteredCourses', () => {
  it('names a course required but never registered', () => {
    const rows = [
      { department: 'Operations', job_title: 'Operator', course_code: 'GHOST' },
      { department: 'Operations', job_title: 'Operator', course_code: 'H2S' },
    ];
    expect(findUnregisteredCourses(rows, [{ code: 'h2s', name: 'H2S' }])).toEqual(['GHOST']);
  });

  it('names each unknown code once', () => {
    const rows = [{ course_code: 'GHOST' }, { course_code: 'GHOST' }];
    expect(findUnregisteredCourses(rows, [])).toEqual(['GHOST']);
  });
});
