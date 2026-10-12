/**
 * Email Templates for training certificate reminders.
 *
 * Bilingual (EN/AR) templates with:
 * - Subject line
 * - HTML body
 * - Plain text body
 *
 * No employee lists in body (privacy). Only course/date details.
 */

/**
 * Compose reminder email.
 * @param {object} reminder - From generateReminders()
 * @param {string} companyName - Company/organization name
 * @param {string} asOfDate - Current date (YYYY-MM-DD) for context
 * @param {string} lang - 'en' or 'ar'
 * @returns {{subject: string, html: string, text: string}}
 */
export function composeReminderEmail(reminder, companyName, asOfDate, lang = 'en') {
  if (lang === 'ar') {
    return composeReminderEmailAr(reminder, companyName, asOfDate);
  }
  return composeReminderEmailEn(reminder, companyName, asOfDate);
}

function composeReminderEmailEn(reminder, companyName, asOfDate) {
  const {
    employeeName, courseCode, courseName, expiryDate, daysRemaining, certificateNumber,
  } = reminder;

  const subject = `[${companyName}] Training Reminder: ${courseName} expires in ${daysRemaining} days`;

  const html = `
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2563eb; color: white; padding: 20px; border-radius: 4px 4px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .body { background-color: #f9fafb; padding: 20px; border: 1px solid #d1d5db; border-top: none; }
    .field { margin: 12px 0; }
    .label { font-weight: bold; color: #1f2937; }
    .value { color: #374151; margin-top: 4px; }
    .warning { background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0; }
    .footer { background-color: #e5e7eb; padding: 12px; border-radius: 0 0 4px 4px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Training Certificate Reminder</h1>
    </div>
    <div class="body">
      <p>Hello ${employeeName},</p>

      <p>This is a reminder that your training certificate is expiring soon.</p>

      <div class="field">
        <div class="label">Course:</div>
        <div class="value">${courseName} (${courseCode})</div>
      </div>

      <div class="field">
        <div class="label">Expiry Date:</div>
        <div class="value">${expiryDate}</div>
      </div>

      <div class="field">
        <div class="label">Days Remaining:</div>
        <div class="value"><strong>${daysRemaining} days</strong></div>
      </div>

      ${certificateNumber ? `
      <div class="field">
        <div class="label">Certificate Number:</div>
        <div class="value">${certificateNumber}</div>
      </div>
      ` : ''}

      <div class="warning">
        <strong>Action Required:</strong> Please schedule your training renewal to maintain compliance.
      </div>

      <p>If you have already completed this training, please disregard this reminder.</p>

      <p>
        Contact your training administrator for more information.<br>
        Company: ${companyName}
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0;">This message was generated on ${new Date().toISOString().split('T')[0]} by HSE Training Compliance Dashboard.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Training Certificate Reminder
=============================

Hello ${employeeName},

This is a reminder that your training certificate is expiring soon.

Course: ${courseName} (${courseCode})
Expiry Date: ${expiryDate}
Days Remaining: ${daysRemaining} days
${certificateNumber ? `Certificate Number: ${certificateNumber}` : ''}

ACTION REQUIRED: Please schedule your training renewal to maintain compliance.

If you have already completed this training, please disregard this reminder.

Contact your training administrator for more information.
Company: ${companyName}

---
Generated on ${new Date().toISOString().split('T')[0]} by HSE Training Compliance Dashboard
  `.trim();

  return { subject, html, text };
}

function composeReminderEmailAr(reminder, companyName, asOfDate) {
  const {
    employeeName, courseCode, courseName, expiryDate, daysRemaining, certificateNumber,
  } = reminder;

  const subject = `[${companyName}] تذكير التدريب: ${courseName} ينتهي خلال ${daysRemaining} أيام`;

  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2563eb; color: white; padding: 20px; border-radius: 4px 4px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .body { background-color: #f9fafb; padding: 20px; border: 1px solid #d1d5db; border-top: none; }
    .field { margin: 12px 0; }
    .label { font-weight: bold; color: #1f2937; }
    .value { color: #374151; margin-top: 4px; }
    .warning { background-color: #fee2e2; border-right: 4px solid #dc2626; padding: 12px; margin: 20px 0; }
    .footer { background-color: #e5e7eb; padding: 12px; border-radius: 0 0 4px 4px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>تذكير شهادة التدريب</h1>
    </div>
    <div class="body">
      <p>مرحباً ${employeeName}،</p>

      <p>هذا تذكير بأن شهادة التدريب الخاصة بك ستنتهي قريباً.</p>

      <div class="field">
        <div class="label">الدورة:</div>
        <div class="value">${courseName} (${courseCode})</div>
      </div>

      <div class="field">
        <div class="label">تاريخ الانتهاء:</div>
        <div class="value">${expiryDate}</div>
      </div>

      <div class="field">
        <div class="label">الأيام المتبقية:</div>
        <div class="value"><strong>${daysRemaining} أيام</strong></div>
      </div>

      ${certificateNumber ? `
      <div class="field">
        <div class="label">رقم الشهادة:</div>
        <div class="value">${certificateNumber}</div>
      </div>
      ` : ''}

      <div class="warning">
        <strong>إجراء مطلوب:</strong> يرجى جدولة تجديد التدريب الخاص بك للامتثال.
      </div>

      <p>إذا كنت قد أكملت هذا التدريب بالفعل، يرجى تجاهل هذا التذكير.</p>

      <p>
        تواصل مع مسؤول التدريب للحصول على مزيد من المعلومات.<br>
        الشركة: ${companyName}
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0;">تم إنشاء هذه الرسالة في ${new Date().toISOString().split('T')[0]} بواسطة لوحة معلومات الامتثال لتدريب الصحة والسلامة.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
تذكير شهادة التدريب
===================

مرحباً ${employeeName}،

هذا تذكير بأن شهادة التدريب الخاصة بك ستنتهي قريباً.

الدورة: ${courseName} (${courseCode})
تاريخ الانتهاء: ${expiryDate}
الأيام المتبقية: ${daysRemaining} أيام
${certificateNumber ? `رقم الشهادة: ${certificateNumber}` : ''}

إجراء مطلوب: يرجى جدولة تجديد التدريب الخاص بك للامتثال.

إذا كنت قد أكملت هذا التدريب بالفعل، يرجى تجاهل هذا التذكير.

تواصل مع مسؤول التدريب للحصول على مزيد من المعلومات.
الشركة: ${companyName}

---
تم الإنشاء في ${new Date().toISOString().split('T')[0]} بواسطة لوحة معلومات الامتثال لتدريب الصحة والسلامة
  `.trim();

  return { subject, html, text };
}

/**
 * Format reminders for display (preview table).
 * @param {array} reminders
 * @param {string} lang - 'en' or 'ar'
 * @returns {array} with subject line for each
 */
export function formatRemindersForDisplay(reminders, companyName, lang = 'en') {
  return reminders.map(reminder => {
    const { subject } = composeReminderEmail(reminder, companyName, new Date().toISOString().split('T')[0], lang);
    return {
      ...reminder,
      subject,
    };
  });
}
