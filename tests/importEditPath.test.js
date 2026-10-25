import { describe, it, expect } from 'vitest';

import { newImportRecordId, withImportIds } from '../src/lib/importIds.js';

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
