/**
 * Supabase database service (Phase 2C)
 *
 * Same surface as the local service in dbService.js, so dataService.js does
 * not know which backend it talks to:
 *
 *   courses:            add, get, list, update, delete
 *   certificates:       add, get, getByNumber, list, update, delete
 *   departments:        add, getByNameKey, list, delete
 *   employees:          add, get, getByEmployeeId, list, update, delete
 *   employeeContacts:   add, getByEmployeeId, list, update, delete
 *   remindersSent:      add, list, listByEmployee
 *   requirements:       add, get, list, update, delete, listByCourse
 *   trainingRecords:    add, get, list, update, delete, listByEmployee
 *   requirementsApproval: add, get, list, update, delete
 *
 * owner_id is never sent from here. The column defaults to auth.uid() and
 * row-level security rejects anything else, so a row always belongs to the
 * signed-in user. See supabase/migrations/20261012103348_init.sql.
 */

/** Throw the Supabase error, or return the data. */
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** A single row, or null when nothing matched. */
function unwrapMaybe({ data, error }) {
  // PGRST116 is "no rows returned" from .single(), which is not a failure here.
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ?? null;
}

export class SupabaseDbService {
  /**
   * @param {object} client - a Supabase client
   */
  constructor(client) {
    if (!client) throw new Error('SupabaseDbService requires a Supabase client');
    this.client = client;
    this.courses = {};
    this.certificates = {};
    this.departments = {};
    this.employees = {};
    this.employeeContacts = {};
    this.remindersSent = {};
    this.requirements = {};
    this.trainingRecords = {};
    this.requirementsApproval = {};
  }

  async init() {
    this.courses = this._table('courses', { uniqueColumn: 'code' });
    this.certificates = this._table('certificates', { uniqueColumn: 'certificate_number' });
    this.departments = this._table('departments', { uniqueColumn: 'name_key' });
    this.employees = this._table('employees', { uniqueColumn: 'employee_id' });
    this.employeeContacts = this._table('employee_contacts', { uniqueColumn: 'employee_id' });
    this.remindersSent = this._table('reminders_sent', { uniqueColumn: null });
    this.requirements = this._table('requirements', { uniqueColumn: 'course_code' });
    this.trainingRecords = this._table('training_records', { uniqueColumn: 'id' });
    this.requirementsApproval = this._table('requirements_approval', { uniqueColumn: 'owner_id' });

    // The named lookups each service exposes, kept for call-site readability.
    this.certificates.getByNumber = (value) =>
      this._getByColumn('certificates', 'certificate_number', value);
    this.departments.getByNameKey = (value) =>
      this._getByColumn('departments', 'name_key', value);
    this.employees.getByEmployeeId = (value) =>
      this._getByColumn('employees', 'employee_id', value);
    this.employeeContacts.getByEmployeeId = (value) =>
      this._getByColumn('employee_contacts', 'employee_id', value);
    this.remindersSent.listByEmployee = async (employeeId) =>
      unwrap(await this.client.from('reminders_sent').select('*').eq('employee_id', employeeId)) ?? [];
    this.requirements.listByCourse = async (courseCode) =>
      unwrap(await this.client.from('requirements').select('*').eq('course_code', courseCode)) ?? [];
    this.trainingRecords.listByEmployee = async (employeeId) =>
      unwrap(await this.client.from('training_records').select('*').eq('employee_id', employeeId)) ?? [];

    return this;
  }

  _table(name, { uniqueColumn }) {
    const api = {
      add: async (data) => {
        const row = { ...data };
        // Both are filled in by the database from the signed-in account: see
        // 0001_init.sql for owner_id and 0003_workspaces.sql for the
        // workspace. A row arriving with either could only carry the wrong
        // one — rows copied up from a browser carry neither.
        delete row.owner_id;
        delete row.workspace_id;
        unwrap(await this.client.from(name).insert(row).select().single());
        return data;
      },
      get: async (id) => this._getByColumn(name, 'id', id),
      list: async () => unwrap(await this.client.from(name).select('*')) ?? [],
      update: async (id, data) => {
        const row = { ...data, id, updated_at: new Date().toISOString() };
        delete row.owner_id;
        delete row.workspace_id;
        unwrap(await this.client.from(name).update(row).eq('id', id).select().single());
        return data;
      },
      delete: async (id) => {
        unwrap(await this.client.from(name).delete().eq('id', id));
      },
    };

    // reminders_sent is an append-only log: no update, no delete, no unique key.
    if (!uniqueColumn) {
      delete api.update;
      delete api.delete;
    }

    return api;
  }

  async _getByColumn(table, column, value) {
    return unwrapMaybe(
      await this.client.from(table).select('*').eq(column, value).limit(1).maybeSingle(),
    );
  }
}
