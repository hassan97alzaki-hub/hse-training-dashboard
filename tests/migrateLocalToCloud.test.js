/**
 * Moving a browser's data into a workspace.
 *
 * The behaviour worth pinning is the refusal: nothing local is deleted until
 * every row is accounted for in the workspace. The failure that matters here
 * is not an error message, it is a user who signs in and finds their records
 * gone, and that failure is silent unless a test insists on the order.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  COLLECTIONS,
  BACKUP_KEY,
  BACKUP_RETENTION_DAYS,
  readAll,
  countRows,
  totalRows,
  hasLocalData,
  describeWorkspace,
  copyInto,
  saveBackup,
  readBackup,
  purgeExpiredBackup,
  migrateLocalToWorkspace,
} from '../src/lib/migrateLocalToCloud.js';

/** A database service holding rows in memory, with the surface both real ones share. */
function fakeDb(seed = {}, { failOn = {}, unreadable = [] } = {}) {
  const store = Object.fromEntries(COLLECTIONS.map((name) => [name, [...(seed[name] ?? [])]]));
  const db = { store };

  for (const name of COLLECTIONS) {
    db[name] = {
      list: async () => {
        if (unreadable.includes(name)) throw new Error('unreadable');
        return [...store[name]];
      },
      add: async (row) => {
        const failure = failOn[name];
        if (failure) throw new Error(failure);
        if (store[name].some((existing) => existing.id === row.id)) {
          throw new Error('duplicate key value violates unique constraint (23505)');
        }
        store[name].push(row);
        return row;
      },
      delete: async (id) => {
        store[name] = store[name].filter((row) => row.id !== id);
      },
    };
  }

  return db;
}

/** localStorage, as a plain object. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() {
      return map.size;
    },
  };
}

const seeded = () => ({
  courses: [{ id: 'c1', code: 'H2S', owner_id: 'old-user', workspace_id: 'old-ws' }],
  employees: [{ id: 'e1', employee_id: 'EMP1' }, { id: 'e2', employee_id: 'EMP2' }],
  trainingRecords: [{ id: 't1', employee_id: 'EMP1', course_code: 'H2S' }],
});

describe('reading a service', () => {
  it('returns every collection, empty ones included', async () => {
    const { rows, failed } = await readAll(fakeDb(seeded()));
    expect(Object.keys(rows).sort()).toEqual([...COLLECTIONS].sort());
    expect(failed).toEqual([]);
    expect(totalRows(countRows(rows))).toBe(4);
  });

  // Eight collections moved and the ninth reported beats nothing moved.
  it('reports a collection it could not read rather than failing the read', async () => {
    const { rows, failed } = await readAll(fakeDb(seeded(), { unreadable: ['employees'] }));
    expect(failed).toEqual(['employees']);
    expect(rows.employees).toEqual([]);
    expect(rows.courses).toHaveLength(1);
  });

  it('knows an empty browser from a full one', async () => {
    expect(await hasLocalData(fakeDb(seeded()))).toBe(true);
    expect(await hasLocalData(fakeDb())).toBe(false);
  });

  it('describes what a workspace already holds', async () => {
    const { total, counts } = await describeWorkspace(fakeDb(seeded()));
    expect(total).toBe(4);
    expect(counts.employees).toBe(2);
  });
});

describe('copying rows up', () => {
  // The database fills both in from the signed-in account. A row carrying
  // either could only be carrying the wrong one.
  it('sends neither the old owner nor the old workspace', async () => {
    const cloud = fakeDb();
    await copyInto(cloud, (await readAll(fakeDb(seeded()))).rows);
    expect(cloud.store.courses[0]).not.toHaveProperty('owner_id');
    expect(cloud.store.courses[0]).not.toHaveProperty('workspace_id');
    expect(cloud.store.courses[0].code).toBe('H2S');
  });

  it('counts a row the workspace already has as skipped, not failed', async () => {
    const existing = { courses: [{ id: 'c1', code: 'H2S' }] };
    const { written, skipped, errors } = await copyInto(
      fakeDb(existing),
      (await readAll(fakeDb(seeded()))).rows,
    );
    expect(skipped.courses).toBe(1);
    expect(written.courses).toBe(0);
    expect(errors).toEqual([]);
  });

  it('reports a real failure with the collection and the row', async () => {
    const { errors } = await copyInto(
      fakeDb({}, { failOn: { employees: 'permission denied' } }),
      (await readAll(fakeDb(seeded()))).rows,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ collection: 'employees', id: 'e1' });
    expect(errors[0].message).toMatch(/permission denied/);
  });
});

describe('the safety copy', () => {
  let storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('is written before anything is deleted', async () => {
    const local = fakeDb(seeded());
    await migrateLocalToWorkspace({ local, cloud: fakeDb(), storage });
    const backup = readBackup({ storage });
    expect(backup.rows.courses).toHaveLength(1);
    expect(local.store.courses).toHaveLength(0);
  });

  it('is kept for a week and then dropped', () => {
    const savedAt = new Date('2026-01-01T00:00:00Z');
    saveBackup({ courses: [] }, { now: () => savedAt, storage });

    const sixDays = new Date(savedAt.getTime() + 6 * 24 * 3600 * 1000);
    expect(purgeExpiredBackup({ now: () => sixDays, storage })).toBe(false);
    expect(readBackup({ storage })).not.toBeNull();

    const eightDays = new Date(savedAt.getTime() + 8 * 24 * 3600 * 1000);
    expect(purgeExpiredBackup({ now: () => eightDays, storage })).toBe(true);
    expect(readBackup({ storage })).toBeNull();
  });

  it('keeps it for the number of days the module says', () => {
    expect(BACKUP_RETENTION_DAYS).toBe(7);
  });

  // A private window, or storage that is full, must not stop a migration that
  // has already been verified: the data is in the workspace either way.
  it('does not stop a verified migration when it cannot be stored', async () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const result = await migrateLocalToWorkspace({
      local: fakeDb(seeded()),
      cloud: fakeDb(),
      storage: refusing,
    });
    expect(result.status).toBe('migrated');
    expect(result.backedUp).toBe(false);
  });

  it('survives a stored value that is not readable', () => {
    expect(readBackup({ storage: fakeStorage({ [BACKUP_KEY]: 'not json' }) })).toBeNull();
  });
});

describe('the migration', () => {
  let storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('moves everything and clears the browser once it has counted it', async () => {
    const local = fakeDb(seeded());
    const cloud = fakeDb();

    const result = await migrateLocalToWorkspace({ local, cloud, storage });

    expect(result.status).toBe('migrated');
    expect(result.moved).toBe(4);
    expect(result.accounted).toBe(result.expected);
    expect(result.cleared).toBe(true);
    expect(cloud.store.employees).toHaveLength(2);
    expect(local.store.employees).toHaveLength(0);
  });

  // The heart of it. A partial move that deletes is data loss; a partial move
  // that keeps the rows is a retry.
  it('deletes nothing when a row did not arrive', async () => {
    const local = fakeDb(seeded());
    const cloud = fakeDb({}, { failOn: { trainingRecords: 'permission denied' } });

    const result = await migrateLocalToWorkspace({ local, cloud, storage });

    expect(result.status).toBe('incomplete');
    expect(result.cleared).toBe(false);
    expect(local.store.trainingRecords).toHaveLength(1);
    expect(local.store.courses).toHaveLength(1);
    expect(readBackup({ storage })).toBeNull();
  });

  // A collection that would not read is a collection whose rows were never
  // counted, so the count cannot be trusted and nothing may be deleted.
  it('deletes nothing when a collection could not be read', async () => {
    const local = fakeDb(seeded(), { unreadable: ['employees'] });
    const result = await migrateLocalToWorkspace({ local, cloud: fakeDb(), storage });

    expect(result.status).toBe('incomplete');
    expect(result.unreadable).toEqual(['employees']);
    expect(result.cleared).toBe(false);
  });

  it('says so, and touches nothing, when there is nothing to move', async () => {
    const local = fakeDb();
    const result = await migrateLocalToWorkspace({ local, cloud: fakeDb(), storage });
    expect(result.status).toBe('nothing-to-move');
    expect(result.cleared).toBe(false);
    expect(readBackup({ storage })).toBeNull();
  });

  it('can be asked to move without clearing', async () => {
    const local = fakeDb(seeded());
    const result = await migrateLocalToWorkspace({ local, cloud: fakeDb(), clearAfter: false, storage });
    expect(result.status).toBe('migrated');
    expect(result.cleared).toBe(false);
    expect(local.store.courses).toHaveLength(1);
  });

  // Running it twice must not report a failure: the second pass finds every
  // row already there.
  it('is safe to run again', async () => {
    const cloud = fakeDb();
    await migrateLocalToWorkspace({ local: fakeDb(seeded()), cloud, storage });
    const second = await migrateLocalToWorkspace({ local: fakeDb(seeded()), cloud, storage });

    expect(second.status).toBe('migrated');
    expect(totalRows(second.skipped)).toBe(4);
    expect(totalRows(second.written)).toBe(0);
    expect(cloud.store.employees).toHaveLength(2);
  });
});
