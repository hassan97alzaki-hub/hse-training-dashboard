import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression: training records saved to the database were never loaded back,
// so after a reload the compliance engine saw no record and showed MISSING.
vi.mock('../src/lib/db/dbService.js', () => ({
  getDbService: () => globalThis.__testDb,
}));

const { loadTrainingRecordsFromDb } = await import('../src/lib/dataService.js');

describe('loadTrainingRecordsFromDb', () => {
  beforeEach(() => {
    globalThis.__testDb = {
      trainingRecords: {
        list: async () => [
          {
            id: 'rec_1997_3973_1',
            employee_id: '1997',
            course_code: '3973',
            completion_status: 'Completed',
            issue_date: '2026-10-20',
            expiry_date: '2027-10-20',
            certificate_number: null,
            source: 'manual',
          },
        ],
      },
    };
  });

  it('maps stored rows to the engine shape', async () => {
    const rows = await loadTrainingRecordsFromDb();
    expect(rows).toEqual([
      {
        Employee_ID: '1997',
        Course_Code: '3973',
        Completion_Status: 'Completed',
        Issue_Date: '2026-10-20',
        Expiry_Date: '2027-10-20',
        Certificate_Number: null,
      },
    ]);
  });

  it('defaults a missing completion status to Completed', async () => {
    globalThis.__testDb.trainingRecords.list = async () => [
      { employee_id: '1997', course_code: '3973' },
    ];
    const [row] = await loadTrainingRecordsFromDb();
    expect(row.Completion_Status).toBe('Completed');
    expect(row.Issue_Date).toBeNull();
  });

  it('returns an empty list when the database cannot be read', async () => {
    globalThis.__testDb.trainingRecords.list = async () => { throw new Error('offline'); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadTrainingRecordsFromDb()).toEqual([]);
  });
});
