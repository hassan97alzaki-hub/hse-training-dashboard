/**
 * Local Database Service (IndexedDB)
 * Abstraction for self-hosted MVP. Supabase support deferred to Phase 2C.
 *
 * Usage:
 * const db = getDbService();
 * await db.courses.add(courseData);
 * const all = await db.courses.list();
 */

let dbInstance = null;

/**
 * Initialize database service (local IndexedDB)
 */
export async function initDb() {
  if (!dbInstance) {
    dbInstance = new LocalDbService();
    await dbInstance.init();
  }
  return dbInstance;
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
    this.version = 1;
    this.courses = {};
    this.certificates = {};
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

        if (!db.objectStoreNames.contains('employee_contacts')) {
          const contactStore = db.createObjectStore('employee_contacts', { keyPath: 'id' });
          contactStore.createIndex('employee_id', 'employee_id', { unique: true });
        }

        if (!db.objectStoreNames.contains('reminders_sent')) {
          const reminderStore = db.createObjectStore('reminders_sent', { keyPath: 'id' });
          reminderStore.createIndex('employee_id', 'employee_id');
          reminderStore.createIndex('sent_at', 'sent_at');
        }
      };
    });

    // Initialize service methods
    this._initCourses();
    this._initCertificates();
    this._initEmployeeContacts();
    this._initRemindersSent();
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
}
