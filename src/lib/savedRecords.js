// What the dashboard shows after the training form has saved.
//
// The dashboard holds two lists: rows from an imported file (`imported`) and
// rows typed in the app (`manual`). A new record joins `manual`. An edit
// replaces the record wherever it lives — an edited imported row stays in
// `imported`, so the table shows the new values at once and the row is not
// counted twice (BL-004).

// A stored training_records row in the shape the compliance engine reads.
// Same mapping as loadTrainingRecordsFromDb in dataService.js.
export function toEngineRecord(row) {
  return {
    Record_ID: row.id,
    Employee_ID: row.employee_id,
    Course_Code: row.course_code,
    Completion_Status: row.completion_status ?? 'Completed',
    Issue_Date: row.issue_date ?? null,
    Expiry_Date: row.expiry_date ?? null,
    Certificate_Number: row.certificate_number ?? null,
  };
}

/**
 * @param {{imported: array, manual: array}} lists - current dashboard records
 * @param {array} rows - stored rows returned by the save
 * @param {string|null} editedId - Record_ID of the edited record, or null for new records
 * @returns {{imported: array, manual: array}}
 */
export function applySavedRecords({ imported, manual }, rows, editedId) {
  const saved = rows.map(toEngineRecord);
  if (!editedId) return { imported, manual: [...manual, ...saved] };

  // Merge rather than replace: an imported row also carries the employee's
  // name, department and job title, which the engine reads.
  const edited = saved[0];
  const apply = r => (r.Record_ID === editedId ? { ...r, ...edited } : r);
  return { imported: imported.map(apply), manual: manual.map(apply) };
}
