/**
 * Contact Data Service
 * Manages employee email/phone storage and retrieval
 * Uses database abstraction (Supabase or IndexedDB)
 */

import { getDbService } from './db/dbService.js';
import { validateEmail, validatePhone } from './contactValidation.js';

/**
 * Save or update employee contact info
 * @param {string} employeeId - Employee ID
 * @param {object} contact - {email, phone, channel, authorizationBasis}
 * @returns {Promise<object>} saved contact
 */
export async function saveEmployeeContact(employeeId, contact) {
  const db = getDbService();

  // Validate input
  if (!employeeId || !contact) {
    throw new Error('employeeId and contact required');
  }

  if (contact.email && !validateEmail(contact.email)) {
    throw new Error(`Invalid email: ${contact.email}`);
  }

  if (contact.phone && !validatePhone(contact.phone)) {
    throw new Error(`Invalid phone: ${contact.phone}`);
  }

  // Check if contact exists
  const existing = await db.employeeContacts.getByEmployeeId(employeeId);

  if (existing) {
    // Update existing
    return db.employeeContacts.update(existing.id, {
      email: contact.email || null,
      phone: contact.phone || null,
      channel: contact.channel || 'email',
      authorization_basis: contact.authorizationBasis || null,
      verified_at: contact.verifiedAt || new Date().toISOString(),
    });
  }

  // Create new
  const id = `contact_${employeeId}_${Date.now()}`;
  return db.employeeContacts.add({
    id,
    employee_id: employeeId,
    email: contact.email || null,
    phone: contact.phone || null,
    channel: contact.channel || 'email',
    authorization_basis: contact.authorizationBasis || null,
    verified_at: contact.verifiedAt || new Date().toISOString(),
  });
}

/**
 * Get employee contact info
 * @param {string} employeeId
 * @returns {Promise<object|null>}
 */
export async function getEmployeeContact(employeeId) {
  const db = getDbService();
  return db.employeeContacts.getByEmployeeId(employeeId);
}

/**
 * Get all employee contacts
 * @returns {Promise<object[]>}
 */
export async function getAllEmployeeContacts() {
  const db = getDbService();
  return db.employeeContacts.list();
}

/**
 * Build contact map from database
 * Returns {employeeId: {email, phone, channel}}
 * @returns {Promise<object>}
 */
export async function buildContactMap() {
  const contacts = await getAllEmployeeContacts();
  const map = {};

  for (const contact of contacts) {
    map[contact.employee_id] = {
      email: contact.email,
      phone: contact.phone,
      channel: contact.channel,
    };
  }

  return map;
}

/**
 * Delete employee contact
 * @param {string} employeeId
 * @returns {Promise<void>}
 */
export async function deleteEmployeeContact(employeeId) {
  const db = getDbService();
  const contact = await db.employeeContacts.getByEmployeeId(employeeId);
  if (contact) {
    await db.employeeContacts.delete(contact.id);
  }
}

/**
 * Bulk import contacts from CSV
 * Format: Employee_ID,Email,Phone
 * @param {string} csvContent
 * @returns {Promise<{success: number, failed: number, errors: string[]}>}
 */
export async function bulkImportContacts(csvContent) {
  const lines = csvContent.split('\n').slice(1); // Skip header
  let success = 0;
  let failed = 0;
  const errors = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const [employeeId, email, phone] = line.split(',').map((s) => s.trim());

    if (!employeeId) {
      failed++;
      errors.push('Missing Employee_ID');
      continue;
    }

    try {
      await saveEmployeeContact(employeeId, {
        email: email || null,
        phone: phone || null,
        channel: email ? 'email' : phone ? 'sms' : 'email',
      });
      success++;
    } catch (err) {
      failed++;
      errors.push(`${employeeId}: ${err.message}`);
    }
  }

  return { success, failed, errors };
}

/**
 * Export contacts to CSV
 * @returns {Promise<string>} CSV content
 */
export async function exportContactsAsCSV() {
  const contacts = await getAllEmployeeContacts();

  let csv = 'Employee_ID,Email,Phone,Channel\n';

  for (const contact of contacts) {
    const row = [
      contact.employee_id,
      contact.email || '',
      contact.phone || '',
      contact.channel || 'email',
    ]
      .map((v) => (v.includes(',') ? `"${v}"` : v))
      .join(',');
    csv += row + '\n';
  }

  return csv;
}
