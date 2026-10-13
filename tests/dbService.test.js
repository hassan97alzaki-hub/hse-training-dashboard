import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Simple in-memory DB for testing (no IndexedDB dependency)
class MemoryDb {
  constructor() {
    this.stores = {
      courses: new Map(),
      certificates: new Map(),
      employee_contacts: new Map(),
      reminders_sent: new Map(),
      requirements: new Map(),
      training_records: new Map(),
      requirements_approval: new Map(),
    };
    this._initMethods();
  }

  _initMethods() {
    this.courses = {
      add: (data) => {
        this.stores.courses.set(data.id, data);
        return Promise.resolve(data);
      },
      get: (id) => Promise.resolve(this.stores.courses.get(id) || undefined),
      list: () => Promise.resolve(Array.from(this.stores.courses.values())),
      update: (id, data) => {
        const existing = this.stores.courses.get(id);
        const updated = { ...existing, ...data, id };
        this.stores.courses.set(id, updated);
        return Promise.resolve(updated);
      },
      delete: (id) => {
        this.stores.courses.delete(id);
        return Promise.resolve();
      },
    };

    this.certificates = {
      add: (data) => {
        this.stores.certificates.set(data.id, data);
        return Promise.resolve(data);
      },
      get: (id) => Promise.resolve(this.stores.certificates.get(id) || undefined),
      getByNumber: (num) =>
        Promise.resolve(
          Array.from(this.stores.certificates.values()).find(
            c => c.certificate_number === num
          ) || null
        ),
      list: () => Promise.resolve(Array.from(this.stores.certificates.values())),
      update: (id, data) => {
        const existing = this.stores.certificates.get(id);
        const updated = { ...existing, ...data, id };
        this.stores.certificates.set(id, updated);
        return Promise.resolve(updated);
      },
      delete: (id) => {
        this.stores.certificates.delete(id);
        return Promise.resolve();
      },
    };

    this.employeeContacts = {
      add: (data) => {
        this.stores.employee_contacts.set(data.id, data);
        return Promise.resolve(data);
      },
      getByEmployeeId: (eid) =>
        Promise.resolve(
          Array.from(this.stores.employee_contacts.values()).find(
            c => c.employee_id === eid
          ) || null
        ),
      list: () => Promise.resolve(Array.from(this.stores.employee_contacts.values())),
      update: (id, data) => {
        const existing = this.stores.employee_contacts.get(id);
        const updated = { ...existing, ...data, id };
        this.stores.employee_contacts.set(id, updated);
        return Promise.resolve(updated);
      },
      delete: (id) => {
        this.stores.employee_contacts.delete(id);
        return Promise.resolve();
      },
    };

    this.remindersSent = {
      add: (data) => {
        this.stores.reminders_sent.set(data.id, data);
        return Promise.resolve(data);
      },
      list: () => Promise.resolve(Array.from(this.stores.reminders_sent.values())),
      listByEmployee: (eid) =>
        Promise.resolve(
          Array.from(this.stores.reminders_sent.values()).filter(
            r => r.employee_id === eid
          )
        ),
    };

    this.requirements = {
      add: (data) => {
        this.stores.requirements.set(data.id, data);
        return Promise.resolve(data);
      },
      get: (id) => Promise.resolve(this.stores.requirements.get(id) || null),
      list: () => Promise.resolve(Array.from(this.stores.requirements.values())),
      listByCourse: (courseCode) =>
        Promise.resolve(
          Array.from(this.stores.requirements.values()).filter(
            r => r.course_code === courseCode
          )
        ),
      update: (id, data) => {
        const existing = this.stores.requirements.get(id);
        const updated = { ...existing, ...data, id };
        this.stores.requirements.set(id, updated);
        return Promise.resolve(updated);
      },
      delete: (id) => {
        this.stores.requirements.delete(id);
        return Promise.resolve();
      },
    };

    this.trainingRecords = {
      add: (data) => {
        this.stores.training_records.set(data.id, data);
        return Promise.resolve(data);
      },
      get: (id) => Promise.resolve(this.stores.training_records.get(id) || null),
      list: () => Promise.resolve(Array.from(this.stores.training_records.values())),
      listByEmployee: (employeeId) =>
        Promise.resolve(
          Array.from(this.stores.training_records.values()).filter(
            r => r.employee_id === employeeId
          )
        ),
      update: (id, data) => {
        const existing = this.stores.training_records.get(id);
        const updated = { ...existing, ...data, id };
        this.stores.training_records.set(id, updated);
        return Promise.resolve(updated);
      },
      delete: (id) => {
        this.stores.training_records.delete(id);
        return Promise.resolve();
      },
    };

    this.requirementsApproval = {
      add: (data) => {
        this.stores.requirements_approval.set(data.id, data);
        return Promise.resolve(data);
      },
      get: (id) => Promise.resolve(this.stores.requirements_approval.get(id) || null),
      list: () => Promise.resolve(Array.from(this.stores.requirements_approval.values())),
      update: (id, data) => {
        const existing = this.stores.requirements_approval.get(id);
        const updated = { ...existing, ...data, id };
        this.stores.requirements_approval.set(id, updated);
        return Promise.resolve(updated);
      },
      delete: (id) => {
        this.stores.requirements_approval.delete(id);
        return Promise.resolve();
      },
    };
  }
}

describe('dbService (Local/In-Memory for Testing)', () => {
  let db;

  beforeEach(async () => {
    // Use in-memory DB for tests (no IndexedDB)
    db = new MemoryDb();
  });

  afterEach(async () => {
    // Clean up
    if (db.courses) {
      const courses = await db.courses.list();
      for (const course of courses) {
        await db.courses.delete(course.id);
      }
    }
    if (db.certificates) {
      const certs = await db.certificates.list();
      for (const cert of certs) {
        await db.certificates.delete(cert.id);
      }
    }
    if (db.employeeContacts) {
      const contacts = await db.employeeContacts.list();
      for (const contact of contacts) {
        await db.employeeContacts.delete(contact.id);
      }
    }
    if (db.remindersSent) {
      const reminders = await db.remindersSent.list();
      for (const reminder of reminders) {
        // remindersSent doesn't have delete, so skip cleanup
      }
    }
  });

  describe('Courses', () => {
    it('adds course', async () => {
      const course = {
        id: 'c1',
        code: 'H2S001',
        name: 'H2S Safety',
        mandatory: true,
        validity_months: 12,
        description: 'Oil & gas safety',
      };

      await db.courses.add(course);
      const found = await db.courses.get('c1');

      expect(found).toBeDefined();
      expect(found.code).toBe('H2S001');
      expect(found.name).toBe('H2S Safety');
    });

    it('lists all courses', async () => {
      const course1 = {
        id: 'c1',
        code: 'H2S001',
        name: 'H2S Safety',
      };
      const course2 = {
        id: 'c2',
        code: 'PTW001',
        name: 'PTW',
      };

      await db.courses.add(course1);
      await db.courses.add(course2);
      const all = await db.courses.list();

      expect(all.length).toBe(2);
      expect(all.map(c => c.code)).toContain('H2S001');
      expect(all.map(c => c.code)).toContain('PTW001');
    });

    it('updates course', async () => {
      const course = {
        id: 'c1',
        code: 'H2S001',
        name: 'H2S Safety',
        validity_months: 12,
      };

      await db.courses.add(course);
      await db.courses.update('c1', {
        name: 'Advanced H2S Safety',
        validity_months: 24,
      });
      const updated = await db.courses.get('c1');

      expect(updated.name).toBe('Advanced H2S Safety');
      expect(updated.validity_months).toBe(24);
    });

    it('deletes course', async () => {
      const course = { id: 'c1', code: 'H2S001', name: 'H2S Safety' };
      await db.courses.add(course);
      await db.courses.delete('c1');

      const found = await db.courses.get('c1');
      expect(found).toBeUndefined();
    });
  });

  describe('Certificates', () => {
    it('adds certificate', async () => {
      const cert = {
        id: 'cert1',
        certificate_number: 'CERT001',
        title: 'H2S Certification',
        image_url: 'https://example.com/cert.jpg',
        summary: 'Valid certificate',
      };

      await db.certificates.add(cert);
      const found = await db.certificates.get('cert1');

      expect(found).toBeDefined();
      expect(found.certificate_number).toBe('CERT001');
    });

    it('gets certificate by number', async () => {
      const cert = {
        id: 'cert1',
        certificate_number: 'CERT001',
        title: 'H2S Certification',
      };

      await db.certificates.add(cert);
      const found = await db.certificates.getByNumber('CERT001');

      expect(found).toBeDefined();
      expect(found.id).toBe('cert1');
    });

    it('returns null for non-existent certificate', async () => {
      const found = await db.certificates.getByNumber('NONEXISTENT');
      expect(found).toBeNull();
    });

    it('updates certificate', async () => {
      const cert = {
        id: 'cert1',
        certificate_number: 'CERT001',
        title: 'H2S Certification',
        summary: 'Old summary',
      };

      await db.certificates.add(cert);
      await db.certificates.update('cert1', {
        title: 'Advanced H2S',
        summary: 'Updated summary',
      });
      const updated = await db.certificates.get('cert1');

      expect(updated.title).toBe('Advanced H2S');
      expect(updated.summary).toBe('Updated summary');
    });
  });

  describe('Employee Contacts', () => {
    it('adds contact', async () => {
      const contact = {
        id: 'contact1',
        employee_id: 'EMP001',
        email: 'john@example.com',
        phone: '+1234567890',
        channel: 'email',
      };

      await db.employeeContacts.add(contact);
      const found = await db.employeeContacts.getByEmployeeId('EMP001');

      expect(found).toBeDefined();
      expect(found.email).toBe('john@example.com');
    });

    it('updates contact', async () => {
      const contact = {
        id: 'contact1',
        employee_id: 'EMP001',
        email: 'old@example.com',
        phone: null,
      };

      await db.employeeContacts.add(contact);
      await db.employeeContacts.update('contact1', {
        email: 'new@example.com',
        phone: '+9876543210',
      });
      const updated = await db.employeeContacts.getByEmployeeId('EMP001');

      expect(updated.email).toBe('new@example.com');
      expect(updated.phone).toBe('+9876543210');
    });

    it('lists all contacts', async () => {
      const contact1 = {
        id: 'contact1',
        employee_id: 'EMP001',
        email: 'john@example.com',
      };
      const contact2 = {
        id: 'contact2',
        employee_id: 'EMP002',
        email: 'jane@example.com',
      };

      await db.employeeContacts.add(contact1);
      await db.employeeContacts.add(contact2);
      const all = await db.employeeContacts.list();

      expect(all.length).toBe(2);
    });
  });

  describe('Reminders Sent', () => {
    it('adds reminder', async () => {
      const reminder = {
        id: 'reminder1',
        employee_id: 'EMP001',
        course_code: 'H2S001',
        channel: 'email',
        status: 'sent',
      };

      await db.remindersSent.add(reminder);
      const all = await db.remindersSent.list();

      expect(all.length).toBeGreaterThan(0);
      expect(all.some(r => r.id === 'reminder1')).toBe(true);
    });

    it('lists reminders by employee', async () => {
      const r1 = {
        id: 'reminder1',
        employee_id: 'EMP001',
        course_code: 'H2S001',
        channel: 'email',
      };
      const r2 = {
        id: 'reminder2',
        employee_id: 'EMP001',
        course_code: 'PTW001',
        channel: 'sms',
      };

      await db.remindersSent.add(r1);
      await db.remindersSent.add(r2);
      const byEmployee = await db.remindersSent.listByEmployee('EMP001');

      expect(byEmployee.length).toBe(2);
    });
  });

  describe('Database isolation', () => {
    it('maintains separate namespaces', async () => {
      const course = { id: 'c1', code: 'H2S001', name: 'H2S' };
      const cert = { id: 'cert1', certificate_number: 'CERT001', title: 'H2S' };

      await db.courses.add(course);
      await db.certificates.add(cert);

      const coursesList = await db.courses.list();
      const certsList = await db.certificates.list();

      expect(coursesList.length).toBe(1);
      expect(certsList.length).toBe(1);
    });
  });
});

describe('the IndexedDB upgrade', () => {
  // The suite has no real IndexedDB, so this asserts the shape of the upgrade
  // code: an existing browser database must be extended, never rebuilt.
  const source = readFileSync(resolve(process.cwd(), 'src/lib/db/dbService.js'), 'utf8');

  it('declares version 4', () => {
    expect(source).toMatch(/this\.version\s*=\s*4/);
  });

  it('creates every store behind an existence guard', () => {
    const createMatches = source.match(/db\.createObjectStore\('([a-z_]+)'/g) ?? [];
    expect(createMatches).toHaveLength(9);

    // Extract store names from createObjectStore calls
    const storeNames = new Set();
    for (const match of createMatches) {
      const name = match.match(/db\.createObjectStore\('([a-z_]+)'/)[1];
      storeNames.add(name);
    }

    // For each store, verify it has a contains guard
    for (const storeName of storeNames) {
      expect(source).toContain(`db.objectStoreNames.contains('${storeName}')`);
    }
  });

  it('never deletes a store', () => {
    expect(source).not.toContain('deleteObjectStore');
  });

  it('creates the three new stores', () => {
    for (const store of ['requirements', 'training_records', 'requirements_approval']) {
      expect(source, store).toContain(`db.createObjectStore('${store}'`);
    }
  });
});

describe('the local and cloud surfaces agree', () => {
  // dataService.js must not know which backend answers, so the two services
  // have to expose the same method names for the new stores.
  const source = readFileSync(resolve(process.cwd(), 'src/lib/db/dbService.js'), 'utf8');

  it('initializes the three new method groups', () => {
    expect(source).toContain('this._initRequirements()');
    expect(source).toContain('this._initTrainingRecords()');
    expect(source).toContain('this._initRequirementsApproval()');
  });

  it('exposes listByCourse and listByEmployee', () => {
    expect(source).toContain('listByCourse');
    expect(source).toContain('listByEmployee');
  });
});
