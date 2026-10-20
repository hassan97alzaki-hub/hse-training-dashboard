import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/db/dbService.js', () => ({
  getDbService: () => globalThis.__testDb,
}));

const { updateTrainingRecord } = await import('../src/lib/requirementsService.js');

const courses = [{ code: '3973', validityMonths: 12 }];

describe('updateTrainingRecord', () => {
  beforeEach(() => {
    globalThis.__testDb = {
      trainingRecords: {
        get: async () => ({
          id: 'rec_1997_3973_1',
          owner_id: 'u1',
          employee_id: '1997',
          course_code: '3973',
          completion_status: 'In Progress',
          issue_date: '2026-01-01',
          expiry_date: '2026-12-31',
          certificate_number: null,
          source: 'manual',
        }),
        update: vi.fn(async () => {}),
        add: vi.fn(async () => {}),
      },
    };
  });

  it('rewrites the stored row under the same id', async () => {
    const result = await updateTrainingRecord('rec_1997_3973_1', {
      employeeId: '1997', courseCode: '3973', issueDate: '2026-10-20', certificateNumber: 'C-9',
    }, courses);

    expect(result.success).toBe(true);
    expect(globalThis.__testDb.trainingRecords.add).not.toHaveBeenCalled();
    const [id, row] = globalThis.__testDb.trainingRecords.update.mock.calls[0];
    expect(id).toBe('rec_1997_3973_1');
    expect(row).toMatchObject({
      id: 'rec_1997_3973_1',
      employee_id: '1997',
      course_code: '3973',
      completion_status: 'In Progress',
      issue_date: '2026-10-20',
      expiry_date: '2027-10-20',
      certificate_number: 'C-9',
    });
  });

  it('writes an imported record under its own id when no stored row exists', async () => {
    globalThis.__testDb.trainingRecords.get = async () => null;
    const result = await updateTrainingRecord('imp_row_5', {
      employeeId: '1997', courseCode: '3973', issueDate: '2026-10-20', completionStatus: 'In Progress',
    }, courses);

    expect(result.success).toBe(true);
    expect(globalThis.__testDb.trainingRecords.update).not.toHaveBeenCalled();
    const [row] = globalThis.__testDb.trainingRecords.add.mock.calls[0];
    expect(row).toMatchObject({
      id: 'imp_row_5',
      employee_id: '1997',
      course_code: '3973',
      completion_status: 'In Progress',
      source: 'import',
    });
  });
});
