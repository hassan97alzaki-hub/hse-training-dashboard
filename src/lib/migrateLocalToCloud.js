/**
 * Moving a browser's data into a workspace.
 *
 * Everything the application stores locally lives in IndexedDB, under the
 * same nine collections the cloud service exposes. Signing in for the first
 * time therefore presents a choice the user did not ask for: their data is in
 * this browser, and their account is empty.
 *
 * This moves it, and will not delete anything until it has counted what
 * arrived. The order is deliberate — read, write, count, back up, and only
 * then clear — because the failure that matters here is not an error message,
 * it is a user who signs in and finds their records gone.
 *
 * (The specification describes this as a localStorage migration. The
 * application has never used localStorage for its data; it uses IndexedDB,
 * which is what this reads. localStorage is used here only to hold the
 * safety copy, which is small and must outlive the database it came from.)
 */

/** The collections both services expose, under the same names. */
export const COLLECTIONS = [
  'courses',
  'certificates',
  'departments',
  'employees',
  'employeeContacts',
  'remindersSent',
  'requirements',
  'trainingRecords',
  'requirementsApproval',
];

export const BACKUP_KEY = 'hse-migration-backup';

/** How long the safety copy is kept once the local database has been cleared. */
export const BACKUP_RETENTION_DAYS = 7;

/**
 * Read every collection of a service.
 *
 * A collection that the service does not expose, or that refuses to be read,
 * contributes an empty list rather than failing the whole read: a migration
 * that moves eight collections and reports the ninth is more useful than one
 * that moves none.
 *
 * @param {object} db - a database service
 * @returns {Promise<{rows: object, failed: string[]}>}
 */
export async function readAll(db) {
  const rows = {};
  const failed = [];

  for (const name of COLLECTIONS) {
    try {
      rows[name] = (await db?.[name]?.list?.()) ?? [];
    } catch {
      rows[name] = [];
      failed.push(name);
    }
  }

  return { rows, failed };
}

/** How many rows each collection holds. */
export function countRows(rows) {
  return Object.fromEntries(COLLECTIONS.map((name) => [name, (rows[name] ?? []).length]));
}

/** The total across every collection. */
export function totalRows(counts) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

/**
 * Whether this browser holds anything worth moving.
 * @param {object} db
 * @returns {Promise<boolean>}
 */
export async function hasLocalData(db) {
  const { rows } = await readAll(db);
  return totalRows(countRows(rows)) > 0;
}

/**
 * What the workspace already holds.
 *
 * A workspace with rows of its own is not an error — the user may have
 * imported from another device — but it is not a decision to make for them,
 * so the caller is told and asks.
 *
 * @param {object} cloud
 * @returns {Promise<{counts: object, total: number}>}
 */
export async function describeWorkspace(cloud) {
  const { rows } = await readAll(cloud);
  const counts = countRows(rows);
  return { counts, total: totalRows(counts) };
}

/**
 * Write one browser's rows into a workspace.
 *
 * `owner_id` and `workspace_id` are stripped from every row: the database
 * fills both in from the signed-in account, and a row carrying either could
 * only be carrying the wrong one.
 *
 * A row that the workspace already has is counted as skipped rather than
 * retried — the unique keys are what decide that, and a duplicate is not a
 * failure of the migration.
 *
 * @returns {Promise<{written: object, skipped: object, errors: Array<{collection: string, id: string, message: string}>}>}
 */
export async function copyInto(cloud, rows) {
  const written = {};
  const skipped = {};
  const errors = [];

  for (const name of COLLECTIONS) {
    written[name] = 0;
    skipped[name] = 0;

    for (const row of rows[name] ?? []) {
      const payload = { ...row };
      delete payload.owner_id;
      delete payload.workspace_id;

      try {
        await cloud[name].add(payload);
        written[name] += 1;
      } catch (error) {
        const message = String(error?.message ?? error);
        // Postgres reports a unique violation as 23505; PostgREST passes the
        // wording through. Either spelling means the row is already there.
        if (/23505|duplicate key|already exists/i.test(message)) {
          skipped[name] += 1;
        } else {
          errors.push({ collection: name, id: row?.id ?? '(no id)', message });
        }
      }
    }
  }

  return { written, skipped, errors };
}

/**
 * Keep a copy of what was moved, so a mistake is recoverable.
 *
 * Written before the local database is cleared and kept for a week. It lives
 * in localStorage rather than IndexedDB because the database it describes is
 * about to be emptied.
 *
 * @returns {boolean} whether the copy was stored
 */
export function saveBackup(rows, { now = () => new Date(), storage = globalThis.localStorage } = {}) {
  if (!storage) return false;
  try {
    storage.setItem(
      BACKUP_KEY,
      JSON.stringify({ savedAt: now().toISOString(), rows }),
    );
    return true;
  } catch {
    // A full or disabled storage must not stop a migration that has already
    // been verified; the data is in the workspace either way.
    return false;
  }
}

/** The stored copy, or null when there is none or it cannot be read. */
export function readBackup({ storage = globalThis.localStorage } = {}) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Drop the copy once it is older than the retention period.
 * @returns {boolean} whether anything was removed
 */
export function purgeExpiredBackup({ now = () => new Date(), storage = globalThis.localStorage } = {}) {
  const backup = readBackup({ storage });
  if (!backup?.savedAt) return false;

  const age = now().getTime() - new Date(backup.savedAt).getTime();
  if (age < BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000) return false;

  try {
    storage.removeItem(BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Delete every row of every collection of a service. */
export async function clearLocal(db, rows) {
  for (const name of COLLECTIONS) {
    const remove = db?.[name]?.delete;
    if (typeof remove !== 'function') continue;
    for (const row of rows[name] ?? []) {
      try {
        await remove(row.id);
      } catch {
        // Already gone, or the collection is append-only. Either way there is
        // nothing to recover from here: the verified copy is in the workspace.
      }
    }
  }
}

/**
 * Move this browser's data into the signed-in workspace.
 *
 * Nothing local is deleted unless every row is accounted for in the
 * workspace afterwards — written now, or already there. A partial move leaves
 * the browser's copy exactly as it was, so the user can try again.
 *
 * @param {object} options
 * @param {object} options.local - the browser's database service
 * @param {object} options.cloud - the workspace's database service
 * @param {boolean} [options.clearAfter] - delete the local rows once verified
 * @returns {Promise<object>} what happened, in counts
 */
export async function migrateLocalToWorkspace({ local, cloud, clearAfter = true, now, storage } = {}) {
  const { rows, failed } = await readAll(local);
  const before = countRows(rows);
  const total = totalRows(before);

  if (total === 0) {
    return { status: 'nothing-to-move', before, moved: 0, cleared: false, errors: [] };
  }

  const { written, skipped, errors } = await copyInto(cloud, rows);
  const accounted = totalRows(written) + totalRows(skipped);
  const complete = errors.length === 0 && failed.length === 0 && accounted === total;

  if (!complete) {
    // The local rows stay. Reporting a partial move and keeping the data is
    // the only safe answer: the alternative deletes rows that never arrived.
    return {
      status: 'incomplete',
      before,
      written,
      skipped,
      moved: totalRows(written),
      expected: total,
      accounted,
      unreadable: failed,
      cleared: false,
      errors,
    };
  }

  const backedUp = saveBackup(rows, { now, storage });
  if (clearAfter) await clearLocal(local, rows);

  return {
    status: 'migrated',
    before,
    written,
    skipped,
    moved: totalRows(written),
    expected: total,
    accounted,
    backedUp,
    cleared: clearAfter,
    errors: [],
  };
}
