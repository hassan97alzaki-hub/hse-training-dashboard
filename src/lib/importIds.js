// Identity of imported training rows.
//
// An edit of an imported row is written to `training_records` under the row's
// Record_ID. That table's `id` is one key for the whole table, across every
// workspace (migration 20261013140610_requirements.sql), so the id must be
// unique everywhere: a row number such as `imp_row_2` is not — every file has
// a row 2 (BL-007).

export function newImportRecordId() {
  return `imp_${globalThis.crypto.randomUUID()}`;
}

// Give every record without a Record_ID a fresh import id. Records that
// already carry one keep it.
export function withImportIds(records) {
  return records.map(r => (r.Record_ID ? r : { ...r, Record_ID: newImportRecordId() }));
}
