/**
 * `initDb()` is called from more than one place and, under React's StrictMode,
 * twice from the same effect. These tests pin the property that made that
 * safe: whoever calls it gets a service that is finished being built.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, getDbService, getDbBackend, resetDb } from '../src/lib/db/dbService.js';

/**
 * A minimal IndexedDB stand-in. jsdom has no IndexedDB, and the point of
 * these tests is the timing of the open, not the storage: the request
 * resolves on a later tick, which is the window a second caller used to
 * arrive in.
 */
function fakeIndexedDB() {
  return {
    open() {
      const request = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => ({ createIndex: () => {} }),
        },
      };
      setTimeout(() => request.onsuccess?.({ target: request }), 0);
      return request;
    },
  };
}

const COLLECTIONS = [
  'courses',
  'certificates',
  'departments',
  'employees',
  'employeeContacts',
  'remindersSent',
];

describe('initDb', () => {
  beforeEach(() => {
    resetDb();
    globalThis.indexedDB = fakeIndexedDB();
  });

  afterEach(() => {
    resetDb();
    delete globalThis.indexedDB;
    vi.restoreAllMocks();
  });

  it('builds every collection of the local service', async () => {
    const db = await initDb();
    for (const name of COLLECTIONS) {
      expect(typeof db[name].list, name).toBe('function');
    }
    expect(getDbBackend()).toBe('local');
  });

  // The regression, and the reason it was invisible in a test that waited for
  // both callers: the object both of them hold is the same one, and it does
  // become usable a tick later. What broke the application is that the second
  // caller's `await` returned while the first was still inside `init()`, so
  // the code after that `await` ran against empty collections. The second
  // caller is therefore resumed on its own here, with the first still pending.
  it('resumes a second caller only once the service is built', async () => {
    const first = initDb();
    const second = await initDb();

    for (const name of COLLECTIONS) {
      expect(typeof second[name].list, name).toBe('function');
    }
    expect(await first).toBe(second);
  });

  it('does the work once however many callers ask', async () => {
    const opened = vi.spyOn(globalThis.indexedDB, 'open');
    await Promise.all([initDb(), initDb(), initDb()]);
    // One open for the single initialization; nothing re-initialises.
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('exposes the service only once it is built', async () => {
    const pending = initDb();
    // Before the initialization resolves there is no service to hand out, and
    // saying so is better than handing out a half-built one.
    expect(() => getDbService()).toThrow(/not initialized/i);
    await pending;
    expect(typeof getDbService().courses.list).toBe('function');
  });

  // A cached rejection would make the failure permanent for the life of the
  // page, so a later call has to be able to try again.
  it('retries after a failed initialization', async () => {
    globalThis.indexedDB = {
      open() {
        const request = { onsuccess: null, onerror: null, error: new Error('denied') };
        setTimeout(() => request.onerror?.(), 0);
        return request;
      },
    };

    await expect(initDb()).rejects.toThrow();

    globalThis.indexedDB = fakeIndexedDB();
    const db = await initDb();
    expect(typeof db.courses.list).toBe('function');
  });
});
