/**
 * Email Reminder Service: Generate list of employees to remind about expiring certs.
 *
 * Filters compliance universe for items in 15–30 day window before expiry.
 * Returns employee info + course details for reminder composition.
 *
 * Privacy:
 * - No personal data is exported or persisted
 * - Only counts and course details returned
 * - Names appear in recipient list (TO field), not in body
 */

/**
 * Determine if an item should trigger a reminder.
 * Criteria: daysRemaining is 15–30 (inclusive both ends).
 * @param {object} item - Compliance item
 * @returns {boolean}
 */
export function isReminderItem(item) {
  if (item.daysRemaining === null || item.daysRemaining === undefined) return false;
  return item.daysRemaining >= 15 && item.daysRemaining <= 30;
}

/**
 * Generate reminder list from compliance universe.
 *
 * Returns array of:
 * {
 *   employeeId: string,
 *   employeeName: string,
 *   email: string (if available),
 *   courseCode: string,
 *   courseName: string,
 *   expiryDate: string (YYYY-MM-DD),
 *   daysRemaining: number,
 *   certificateNumber: string,
 * }
 *
 * @param {array} universe - Compliance items
 * @param {object} contactMap - Optional: {employeeId: {email, phone}} lookup
 * @returns {array}
 */
export function generateReminders(universe, contactMap = {}) {
  if (!Array.isArray(universe)) return [];

  const reminders = [];
  const seen = new Set(); // employee + course combo

  for (const item of universe) {
    // Only items in 15–30 day window
    if (!isReminderItem(item)) continue;

    // Skip duplicates (same employee + course)
    const key = `${item.Employee_ID}:${item.Course_Code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const contact = contactMap[item.Employee_ID] || {};

    reminders.push({
      employeeId: item.Employee_ID,
      employeeName: item.Employee_Name,
      email: contact.email || null,
      phone: contact.phone || null,
      department: item.Department,
      jobTitle: item.Job_Title,
      courseCode: item.Course_Code,
      courseName: item.Course_Name,
      expiryDate: item.Expiry_Date,
      daysRemaining: item.daysRemaining,
      certificateNumber: item.Certificate_Number || null,
    });
  }

  // Sort by daysRemaining (ascending — most urgent first)
  reminders.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return reminders;
}

/**
 * Count reminders by channel (email, SMS).
 * @param {array} reminders - From generateReminders()
 * @returns {{email: number, sms: number, total: number}}
 */
export function countRemindersByChannel(reminders) {
  let email = 0;
  let sms = 0;

  for (const reminder of reminders) {
    if (reminder.email) email += 1;
    if (reminder.phone) sms += 1;
  }

  return { email, sms, total: reminders.length };
}

/**
 * Filter reminders by channel.
 * @param {array} reminders
 * @param {string} channel - 'email' or 'sms'
 * @returns {array}
 */
export function filterRemindersByChannel(reminders, channel) {
  if (channel === 'email') {
    return reminders.filter(r => r.email);
  }
  if (channel === 'sms') {
    return reminders.filter(r => r.phone);
  }
  return reminders;
}
