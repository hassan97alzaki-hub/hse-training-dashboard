/**
 * Database Service
 *
 * Two backends behind one surface:
 * - Supabase, when the build has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 *   The data follows the account, so the same company sees the same data from
 *   any device.
 * - The browser's own database otherwise. Nothing leaves the device. This is
 *   what the self-hosted and trial builds ship as.
 *
 * Usage:
 * const db = getDbService();
 * await db.courses.add(courseData);
 * const all = await db.courses.list();
 */

import { getSupabaseClient } from '../supabaseClient.js';
import { SupabaseDbService } from './supabaseDbService.js';

let dbInstance = null;
let backend = 'local';

/**
 * Initialize the database service. Picks the backend from the build
 * environment; falls back to the local one when the cloud is unreachable, so
 * a configuration mistake degrades instead of blocking the application.
 */
export async function initDb() {
  if (!dbInstance) {
    const client = getSupabaseClient();
    if (client) {
      try {
        dbInstance = await new SupabaseDbService(client).init();
        backend = 'supabase';
        return dbInstance;
      } catch (err) {
        console.warn('Supabase unavailable, using the local database:', err.message);
        dbInstance = null;
      }
    }
    dbInstance = new LocalDbService();
    await dbInstance.init();
    backend = 'local';
  }
  return dbInstance;
}

/**
 * Which backend initDb() selected: 'supabase' or 'local'.
 * @returns {string}
 */
export function getDbBackend() {
  return backend;
}

/**
 * Drop the instance so the next initDb() picks a backend again. Used when the
 * signed-in user changes, and by tests.
 */
export function resetDb() {
  dbInstance = null;
  backend = 'local';
}

/**
 * Get current database service instance
 * Must call initDb() first
 */
export function getDbService() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

/**
 * Local database implementation (IndexedDB)
 * For self-hosted MVP, uses browser storage
 */
class LocalDbService {
  constructor() {
    this.dbName = 'hse-training-db';
    // Version 2 added the employees store, version 3 the departments store,
    // version 4 the requirements matrix and the training records. Raising this
    // number is what runs onupgradeneeded for a browser that already holds an
    // older database. onupgradeneeded only ever creates, so nothing is lost.
    this.version = 4;
    this.courses = {};
    this.certificates = {};
    this.departments = {};
    this.employees = {};
    this.employeeContacts = {};
    this.remindersSent = {};
  }

  async init() {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('courses')) {
          const courseStore = db.createObjectStore('courses', { keyPath: 'id' });
          courseStore.createIndex('code', 'code', { unique: true });
        }

        if (!db.objectStoreNames.contains('certificates')) {
          const certStore = db.createObjectStore('certificates', { keyPath: 'id' });
          certStore.createIndex('certificate_number', 'certificate_number', { unique: true });
        }

        if (!db.objectStoreNames.contains('departments')) {
          const departmentStore = db.createObjectStore('departments', { keyPath: 'id' });
          // The key is the lower-case name, so "Operations" and "operations"
          // cannot both be registered.
          departmentStore.createIndex('name_key', 'name_key', { unique: true });
        }

        if (!db.objectStoreNames.contains('employees')) {
          const employeeStore = db.createObjectStore('employees', { keyPath: 'id' });
          employeeStore.createIndex('employee_id', 'employee_id', { unique: true });
          employeeStore.createIndex('department', 'department');
        }

        if (!db.objectStoreNames.contains('employee_contacts')) {
          const contactStore = db.createObjectStore('employee_contacts', { keyPath: 'id' });
          contactStore.createIndex('employee_id', 'employee_id', { unique: true });
        }

        if (!db.objectStoreNames.contains('reminders_sent')) {
          const reminderStore = db.createObjectStore('reminders_sent', { keyPath: 'id' });
          reminderStore.createIndex('employee_id', 'employee_id');
          reminderStore.createIndex('sent_at', 'sent_at');
        }

        if (!db.objectStoreNames.contains('requirements')) {
          const requirementStore = db.createObjectStore('requirements', { keyPath: 'id' });
          requirementStore.createIndex('course_code', 'course_code');
          requirementStore.createIndex('department', 'department');
        }

        if (!db.objectStoreNames.contains('training_records')) {
          const recordStore = db.createObjectStore('training_records', { keyPath: 'id' });
          recordStore.createIndex('employee_id', 'employee_id');
          recordStore.createIndex('course_code', 'course_code');
        }

        if (!db.objectStoreNames.contains('requirements_approval')) {
          db.createObjectStore('requirements_approval', { keyPath: 'id' });
        }
      };
    });

    // Initialize service methods
    this._initCourses();
    this._initCertificates();
    this._initDepartments();
    this._initEmployees();
    this._initEmployeeContacts();
    this._initRemindersSent();
    this._initRequirements();
    this._initTrainingRecords();
    this._initRequirementsApproval();
  }

  _getDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  _initCourses() {
    this.courses = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('courses', 'readwrite');
          const store = tx.objectStore('courses');
          const request = store.add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('courses', 'readonly');
          const store = tx.objectStore('courses');
          const request = store.get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('courses', 'readonly');
          const store = tx.objectStore('courses');
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('courses', 'readwrite');
          const store = tx.objectStore('courses');
          const request = store.put({
            ...data,
            id,
            updated_at: new Date().toISOString(),
          });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('courses', 'readwrite');
          const store = tx.objectStore('courses');
          const request = store.delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initCertificates() {
    this.certificates = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('certificates', 'readwrite');
          const store = tx.objectStore('certificates');
          const request = store.add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('certificates', 'readonly');
          const store = tx.objectStore('certificates');
          const request = store.get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      getByNumber: async (certificateNumber) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('certificates', 'readonly');
          const store = tx.objectStore('certificates');
          const index = store.index('certificate_number');
          const request = index.get(certificateNumber);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('certificates', 'readonly');
          const store = tx.objectStore('certificates');
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('certificates', 'readwrite');
          const store = tx.objectStore('certificates');
          const request = store.put({
            ...data,
            id,
            updated_at: new Date().toISOString(),
          });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('certificates', 'readwrite');
          const store = tx.objectStore('certificates');
          const request = store.delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initDepartments() {
    this.departments = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('departments', 'readwrite');
          const store = tx.objectStore('departments');
          const request = store.add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      getByNameKey: async (nameKey) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('departments', 'readonly');
          const store = tx.objectStore('departments');
          const index = store.index('name_key');
          const request = index.get(nameKey);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('departments', 'readonly');
          const store = tx.objectStore('departments');
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('departments', 'readwrite');
          const store = tx.objectStore('departments');
          const request = store.delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initEmployees() {
    this.employees = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employees', 'readwrite');
          const store = tx.objectStore('employees');
          const request = store.add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employees', 'readonly');
          const store = tx.objectStore('employees');
          const request = store.get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      getByEmployeeId: async (employeeId) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employees', 'readonly');
          const store = tx.objectStore('employees');
          const index = store.index('employee_id');
          const request = index.get(employeeId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employees', 'readonly');
          const store = tx.objectStore('employees');
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employees', 'readwrite');
          const store = tx.objectStore('employees');
          const request = store.put({
            ...data,
            id,
            updated_at: new Date().toISOString(),
          });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employees', 'readwrite');
          const store = tx.objectStore('employees');
          const request = store.delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initEmployeeContacts() {
    this.employeeContacts = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employee_contacts', 'readwrite');
          const store = tx.objectStore('employee_contacts');
          const request = store.add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      getByEmployeeId: async (employeeId) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employee_contacts', 'readonly');
          const store = tx.objectStore('employee_contacts');
          const index = store.index('employee_id');
          const request = index.get(employeeId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employee_contacts', 'readonly');
          const store = tx.objectStore('employee_contacts');
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employee_contacts', 'readwrite');
          const store = tx.objectStore('employee_contacts');
          const request = store.put({
            ...data,
            id,
            updated_at: new Date().toISOString(),
          });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('employee_contacts', 'readwrite');
          const store = tx.objectStore('employee_contacts');
          const request = store.delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initRemindersSent() {
    this.remindersSent = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('reminders_sent', 'readwrite');
          const store = tx.objectStore('reminders_sent');
          const request = store.add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('reminders_sent', 'readonly');
          const store = tx.objectStore('reminders_sent');
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      listByEmployee: async (employeeId) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('reminders_sent', 'readonly');
          const store = tx.objectStore('reminders_sent');
          const index = store.index('employee_id');
          const request = index.getAll(employeeId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
    };
  }

  _initRequirements() {
    this.requirements = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readwrite');
          const request = tx.objectStore('requirements')
            .add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readonly');
          const request = tx.objectStore('requirements').get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readonly');
          const request = tx.objectStore('requirements').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      listByCourse: async (courseCode) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readonly');
          const request = tx.objectStore('requirements').index('course_code').getAll(courseCode);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readwrite');
          const request = tx.objectStore('requirements')
            .put({ ...data, id, updated_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements', 'readwrite');
          const request = tx.objectStore('requirements').delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initTrainingRecords() {
    this.trainingRecords = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readwrite');
          const request = tx.objectStore('training_records')
            .add({ ...data, created_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readonly');
          const request = tx.objectStore('training_records').get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readonly');
          const request = tx.objectStore('training_records').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      listByEmployee: async (employeeId) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readonly');
          const request = tx.objectStore('training_records').index('employee_id').getAll(employeeId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readwrite');
          const request = tx.objectStore('training_records')
            .put({ ...data, id, updated_at: new Date().toISOString() });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('training_records', 'readwrite');
          const request = tx.objectStore('training_records').delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }

  _initRequirementsApproval() {
    this.requirementsApproval = {
      add: async (data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readwrite');
          const request = tx.objectStore('requirements_approval').put({ ...data });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      get: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readonly');
          const request = tx.objectStore('requirements_approval').get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || null);
        });
      },
      list: async () => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readonly');
          const request = tx.objectStore('requirements_approval').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || []);
        });
      },
      update: async (id, data) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readwrite');
          const request = tx.objectStore('requirements_approval').put({ ...data, id });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(data);
        });
      },
      delete: async (id) => {
        const db = await this._getDb();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('requirements_approval', 'readwrite');
          const request = tx.objectStore('requirements_approval').delete(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      },
    };
  }
}
