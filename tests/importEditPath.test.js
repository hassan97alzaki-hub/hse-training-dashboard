import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { newImportRecordId, withImportIds } from '../src/lib/importIds.js';
import { applySavedRecords, toEngineRecord } from '../src/lib/savedRecords.js';
import { TrainingSessionForm } from '../src/components/TrainingSessionForm.jsx';
import { createI18n } from '../src/lib/i18n.js';

const { t } = createI18n('en');

describe('import record ids (BL-007)', () => {
  it('are unique and carry no row number', () => {
    const ids = Array.from({ length: 200 }, newImportRecordId);
    expect(new Set(ids).size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^imp_[0-9a-f-]{36}$/);
  });

  it('are added only to records that have none', () => {
    const records = [{ Employee_ID: 'E1' }, { Employee_ID: 'E2', Record_ID: 'keep-me' }];
    const out = withImportIds(records);
    expect(out[0].Record_ID).toMatch(/^imp_/);
    expect(out[1].Record_ID).toBe('keep-me');
    expect(records[0].Record_ID).toBeUndefined(); // input not mutated
  });

  it('differ between two loads of the same records', () => {
    const records = [{ Employee_ID: 'E1' }];
    expect(withImportIds(records)[0].Record_ID).not.toBe(withImportIds(records)[0].Record_ID);
  });
});

describe('dashboard lists after a save (BL-004)', () => {
  const imported = [
    { Record_ID: 'imp_a', Employee_ID: 'E1', Employee_Name: 'Test One', Department: 'OPS', Job_Title: 'OPR',
      Course_Code: 'H2S', Completion_Status: 'Completed', Issue_Date: '2025-10-25', Expiry_Date: '2026-10-25', Certificate_Number: 'C1' },
    { Record_ID: 'imp_b', Employee_ID: 'E2', Course_Code: 'H2S', Expiry_Date: '2026-12-01' },
  ];
  const manual = [{ Record_ID: 'rec_1', Employee_ID: 'E3', Course_Code: 'PTW', Expiry_Date: '2027-01-01' }];
  const savedRow = {
    id: 'imp_a', employee_id: 'E1', course_code: 'H2S', completion_status: 'Completed',
    issue_date: '2026-10-25', expiry_date: '2027-10-25', certificate_number: 'C1',
  };

  it('replaces an edited imported row in place, keeping its other fields', () => {
    const next = applySavedRecords({ imported, manual }, [savedRow], 'imp_a');
    expect(next.imported).toHaveLength(2);
    expect(next.manual).toEqual(manual);
    expect(next.imported[0]).toMatchObject({
      Record_ID: 'imp_a', Expiry_Date: '2027-10-25', Issue_Date: '2026-10-25',
      Employee_Name: 'Test One', Department: 'OPS', Job_Title: 'OPR',
    });
    expect(next.imported[1]).toBe(imported[1]);
  });

  it('does not count the edited record twice', () => {
    const next = applySavedRecords({ imported, manual }, [savedRow], 'imp_a');
    const all = [...next.imported, ...next.manual].filter(r => r.Record_ID === 'imp_a');
    expect(all).toHaveLength(1);
  });

  it('replaces an edited manual row in place', () => {
    const row = { id: 'rec_1', employee_id: 'E3', course_code: 'PTW', expiry_date: '2028-01-01' };
    const next = applySavedRecords({ imported, manual }, [row], 'rec_1');
    expect(next.imported).toEqual(imported);
    expect(next.manual).toEqual([{ ...manual[0], ...toEngineRecord(row) }]);
  });

  it('adds new records to the manual list only', () => {
    const rows = [{ id: 'rec_9', employee_id: 'E4', course_code: 'H2S' }];
    const next = applySavedRecords({ imported, manual }, rows, null);
    expect(next.imported).toBe(imported);
    expect(next.manual.map(r => r.Record_ID)).toEqual(['rec_1', 'rec_9']);
  });
});

describe('edit form course field (BL-006)', () => {
  afterEach(cleanup);

  it('shows the course of an imported record that is not in the catalogue', () => {
    render(createElement(TrainingSessionForm, {
      courses: [], people: [{ Employee_ID: 'E1', Department: 'OPS', Job_Title: 'OPR' }], requirements: [],
      prefill: { recordId: 'imp_a', employeeId: 'E1', courseCode: 'H2S001', courseName: 'H2S Safety', expiryDate: '2026-10-25' },
      onSaved: () => {}, onClose: () => {}, t,
    }));
    const select = screen.getByTestId('course-select');
    expect(select.value).toBe('H2S001');
    expect(select.selectedOptions[0].textContent).toBe('H2S001 — H2S Safety');
  });

  it('does not add a catalogue course twice', () => {
    render(createElement(TrainingSessionForm, {
      courses: [{ code: 'H2S001', name: 'H2S Safety', validityMonths: 12 }], people: [], requirements: [],
      prefill: { recordId: 'imp_a', employeeId: 'E1', courseCode: 'H2S001', courseName: 'Other name' },
      onSaved: () => {}, onClose: () => {}, t,
    }));
    const options = [...screen.getByTestId('course-select').options].map(o => o.value);
    expect(options).toEqual(['', 'H2S001']);
  });
});
