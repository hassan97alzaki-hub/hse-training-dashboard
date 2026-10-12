import { describe, it, expect } from 'vitest';
import {
  isReminderItem,
  generateReminders,
  countRemindersByChannel,
  filterRemindersByChannel,
} from '../src/lib/emailReminderService.js';

describe('emailReminderService.js', () => {
  describe('isReminderItem', () => {
    it('returns true for items in 15–30 day window', () => {
      expect(isReminderItem({ daysRemaining: 15 })).toBe(true);
      expect(isReminderItem({ daysRemaining: 20 })).toBe(true);
      expect(isReminderItem({ daysRemaining: 30 })).toBe(true);
    });

    it('returns false for items outside window', () => {
      expect(isReminderItem({ daysRemaining: 14 })).toBe(false); // too early
      expect(isReminderItem({ daysRemaining: 31 })).toBe(false); // too late
      expect(isReminderItem({ daysRemaining: 0 })).toBe(false); // expiring today
      expect(isReminderItem({ daysRemaining: -5 })).toBe(false); // expired
    });

    it('returns false for null/undefined daysRemaining', () => {
      expect(isReminderItem({ daysRemaining: null })).toBe(false);
      expect(isReminderItem({ daysRemaining: undefined })).toBe(false);
      expect(isReminderItem({})).toBe(false);
    });
  });

  describe('generateReminders', () => {
    const mockUniverse = [
      {
        Employee_ID: 'EMP001',
        Employee_Name: 'Alice',
        Department: 'Operations',
        Job_Title: 'Supervisor',
        Course_Code: 'H2S001',
        Course_Name: 'H2S Safety',
        Expiry_Date: '2026-10-22',
        daysRemaining: 20,
        Certificate_Number: 'CERT001',
      },
      {
        Employee_ID: 'EMP002',
        Employee_Name: 'Bob',
        Department: 'Maintenance',
        Job_Title: 'Technician',
        Course_Code: 'PTW001',
        Course_Name: 'PTW',
        Expiry_Date: '2026-10-25',
        daysRemaining: 18,
        Certificate_Number: 'CERT002',
      },
      {
        Employee_ID: 'EMP001',
        Employee_Name: 'Alice',
        Department: 'Operations',
        Job_Title: 'Supervisor',
        Course_Code: 'PTW001',
        Course_Name: 'PTW',
        Expiry_Date: '2026-11-10',
        daysRemaining: 45, // outside window
        Certificate_Number: 'CERT003',
      },
    ];

    it('filters items in 15–30 day window', () => {
      const reminders = generateReminders(mockUniverse);

      expect(reminders.length).toBe(2);
      expect(reminders[0].courseCode).toBe('PTW001'); // 18 days (earlier)
      expect(reminders[1].courseCode).toBe('H2S001'); // 20 days (later)
    });

    it('includes contact info if provided', () => {
      const contactMap = {
        EMP001: { email: 'alice@example.com', phone: '+1234567890' },
      };

      const reminders = generateReminders(mockUniverse, contactMap);

      const alice = reminders.find(r => r.employeeId === 'EMP001');
      expect(alice.email).toBe('alice@example.com');
      expect(alice.phone).toBe('+1234567890');
    });

    it('handles missing contact info gracefully', () => {
      const reminders = generateReminders(mockUniverse, {});

      expect(reminders[0].email).toBeNull();
      expect(reminders[0].phone).toBeNull();
    });

    it('removes duplicate employee+course combinations', () => {
      const dupeUniverse = [
        ...mockUniverse,
        {
          Employee_ID: 'EMP001',
          Employee_Name: 'Alice',
          Department: 'Operations',
          Job_Title: 'Supervisor',
          Course_Code: 'H2S001', // duplicate
          Course_Name: 'H2S Safety',
          Expiry_Date: '2026-10-20',
          daysRemaining: 22,
          Certificate_Number: 'CERT999',
        },
      ];

      const reminders = generateReminders(dupeUniverse);

      const h2sReminders = reminders.filter(r => r.courseCode === 'H2S001');
      expect(h2sReminders.length).toBe(1); // only one, despite two records
    });

    it('sorts by daysRemaining (ascending)', () => {
      const reminders = generateReminders(mockUniverse);

      expect(reminders[0].daysRemaining).toBeLessThanOrEqual(reminders[1].daysRemaining);
    });

    it('returns empty array for non-array input', () => {
      expect(generateReminders(null)).toEqual([]);
      expect(generateReminders(undefined)).toEqual([]);
      expect(generateReminders('not-an-array')).toEqual([]);
    });
  });

  describe('countRemindersByChannel', () => {
    const reminders = [
      { employeeId: 'EMP001', email: 'a@example.com', phone: '+1234567890' },
      { employeeId: 'EMP002', email: 'b@example.com', phone: null },
      { employeeId: 'EMP003', email: null, phone: '+9876543210' },
      { employeeId: 'EMP004', email: null, phone: null },
    ];

    it('counts email recipients', () => {
      const counts = countRemindersByChannel(reminders);
      expect(counts.email).toBe(2); // EMP001, EMP002
    });

    it('counts SMS recipients', () => {
      const counts = countRemindersByChannel(reminders);
      expect(counts.sms).toBe(2); // EMP001, EMP003
    });

    it('counts total reminders', () => {
      const counts = countRemindersByChannel(reminders);
      expect(counts.total).toBe(4);
    });
  });

  describe('filterRemindersByChannel', () => {
    const reminders = [
      { employeeId: 'EMP001', email: 'a@example.com', phone: null },
      { employeeId: 'EMP002', email: null, phone: '+1234567890' },
      { employeeId: 'EMP003', email: 'c@example.com', phone: '+9876543210' },
    ];

    it('filters by email channel', () => {
      const emailOnly = filterRemindersByChannel(reminders, 'email');
      expect(emailOnly.length).toBe(2); // EMP001, EMP003
      expect(emailOnly.every(r => r.email)).toBe(true);
    });

    it('filters by SMS channel', () => {
      const smsOnly = filterRemindersByChannel(reminders, 'sms');
      expect(smsOnly.length).toBe(2); // EMP002, EMP003
      expect(smsOnly.every(r => r.phone)).toBe(true);
    });

    it('returns all for unknown channel', () => {
      const all = filterRemindersByChannel(reminders, 'unknown');
      expect(all.length).toBe(3);
    });
  });
});
