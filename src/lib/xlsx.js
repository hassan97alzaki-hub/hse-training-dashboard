/**
 * The spreadsheet library, fetched when it is first needed.
 *
 * `xlsx` is the largest dependency in the project by a wide margin, and it is
 * only ever used by three paths: importing a training file, reading a
 * requirements workbook, and reading a production package. A visitor who
 * opens the dashboard to look at numbers already imported never touches any
 * of them, and used to download the whole library anyway because three
 * modules imported it at the top.
 *
 * Loading it on demand keeps the first paint small without changing how the
 * import paths read: they are already asynchronous, because they are waiting
 * on a file.
 */

let module = null;
let inFlight = null;

/**
 * Fetch the library, once. Concurrent callers share one request, and a
 * failure is not cached, so a dropped connection can be retried.
 *
 * @returns {Promise<object>} the `xlsx` module
 */
export async function loadXlsx() {
  if (module) return module;
  if (!inFlight) {
    inFlight = import('xlsx')
      .then((loaded) => {
        module = loaded;
        return loaded;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * The library, for code that already knows it is loaded.
 *
 * Reading a sheet out of a workbook is one such place: the workbook can only
 * exist because something awaited `loadXlsx()` to parse it, so threading a
 * promise through those functions would buy nothing and change their callers.
 *
 * @returns {object} the `xlsx` module
 */
export function xlsx() {
  if (!module) {
    throw new Error('The spreadsheet library is not loaded yet. Await loadXlsx() first.');
  }
  return module;
}

/** Drop the cached module. Tests use this; the application does not. */
export function resetXlsx() {
  module = null;
  inFlight = null;
}
