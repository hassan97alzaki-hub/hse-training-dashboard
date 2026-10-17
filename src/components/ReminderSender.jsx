import { useState } from 'react';
import { Mail, AlertCircle } from 'lucide-react';
import { generateReminders, countRemindersByChannel } from '../lib/emailReminderService.js';
import { formatRemindersForDisplay, composeReminderEmail } from '../lib/emailTemplates.js';

/**
 * ReminderSender Component
 *
 * Manual email reminder sending (Phase 2B.3).
 *
 * Features:
 * - Preview table of reminders (15–30 day window)
 * - Count by channel (email/SMS)
 * - Send confirmation
 * - Simulated send (logs to console, no SMTP yet)
 *
 * Props:
 * - universe: compliance items
 * - companyName: for email subject/body
 * - contactMap: {employeeId: {email, phone}} (optional)
 * - lang: 'en' or 'ar'
 * - t: translation function
 */
export function ReminderSender({
  universe = [],
  companyName = 'Your Company',
  contactMap = {},
  lang = 'en',
  t = (key) => key,
}) {
  const [reminders, setReminders] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState('');

  const handleGenerateReminders = () => {
    setError('');
    setSent(null);
    const generated = generateReminders(universe, contactMap);

    if (generated.length === 0) {
      setError(t('rsNoExpiring'));
      setReminders(null);
      return;
    }

    setReminders(generated);
  };

  const handleSendReminders = async () => {
    if (!reminders || reminders.length === 0) {
      setError('No reminders to send.');
      return;
    }

    setError('');
    setIsSending(true);

    try {
      // Simulate send (Phase 2B.3: no actual SMTP)
      const log = reminders.map(r => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        email: r.email || 'no-email',
        course: r.courseName,
        daysRemaining: r.daysRemaining,
        subject: composeReminderEmail(r, companyName, new Date().toISOString().split('T')[0], lang).subject,
        status: r.email ? 'ready' : 'no-email',
      }));

      console.log('📧 Reminder Send Log:', log);

      // Simulate delay (like API call)
      await new Promise(resolve => setTimeout(resolve, 500));

      setSent({
        total: reminders.length,
        sent: reminders.filter(r => r.email).length,
        skipped: reminders.filter(r => !r.email).length,
        timestamp: new Date().toLocaleString(),
      });

      setReminders(null);
    } catch (err) {
      setError(`Failed to send: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setReminders(null);
    setSent(null);
    setError('');
  };

  if (sent) {
    return (
      <div style={styles.container}>
        <div style={styles.successBanner}>
          <Mail size={20} />
          <div>
            <div style={styles.successTitle}>{t('rsRemindersSent')}</div>
            <div style={styles.successText}>
              {t('rsEmailsQueued').replace('{count}', sent.sent)}
              {sent.skipped > 0 && ` (${t('rsWithoutEmail').replace('{count}', sent.skipped)})`}
            </div>
            <div style={styles.successTime}>{sent.timestamp}</div>
          </div>
        </div>
        <button
          onClick={handleReset}
          style={{ ...styles.btn, ...styles.btnPrimary }}
        >
          {t('rsSendMore')}
        </button>
      </div>
    );
  }

  if (!reminders) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          <Mail size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
          <p>{t('rsSendDescription')}</p>
          <button
            onClick={handleGenerateReminders}
            style={{ ...styles.btn, ...styles.btnPrimary }}
          >
            {t('rsGenerateList')}
          </button>
        </div>

        {error && (
          <div style={styles.info}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  const counts = countRemindersByChannel(reminders);

  return (
    <div style={styles.container}>
      <div style={styles.preview}>
        <h4 style={styles.previewTitle}>
          {t('rsRemindersToSend').replace('{count}', reminders.length)}
        </h4>

        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <strong>{counts.email}</strong>
            <span>{t('rsEmailRecipients')}</span>
          </div>
          <div style={styles.summaryItem}>
            <strong>{counts.sms}</strong>
            <span>{t('rsPhoneNumbers')}</span>
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>{t('rsEmployee')}</th>
                <th style={styles.th}>{t('rsCourse')}</th>
                <th style={styles.th}>{t('rsExpires')}</th>
                <th style={styles.th}>{t('rsDays')}</th>
                <th style={styles.th}>{t('rsEmail')}</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((r, idx) => (
                <tr key={idx} style={styles.tableRow}>
                  <td style={styles.td}>{r.employeeName}</td>
                  <td style={styles.td}><code style={styles.code}>{r.courseCode}</code> {r.courseName}</td>
                  <td style={styles.td} style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.expiryDate}</td>
                  <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: r.daysRemaining < 20 ? '#dc2626' : '#6b7280' }}>
                    {r.daysRemaining}d
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: r.email ? '#059669' : '#dc2626' }}>
                    {r.email ? '✓' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {reminders.filter(r => !r.email).length > 0 && (
          <div style={styles.warning}>
            <AlertCircle size={16} />
            <span>{t('rsNoEmail').replace('{count}', reminders.filter(r => !r.email).length)}</span>
          </div>
        )}
      </div>

      <div style={styles.actions}>
        <button
          onClick={handleSendReminders}
          disabled={isSending}
          style={{ ...styles.btn, ...styles.btnPrimary }}
        >
          {isSending ? t('rsSending') : t('rsSendReminders').replace('{count}', counts.email)}
        </button>
        <button
          onClick={handleReset}
          style={{ ...styles.btn, ...styles.btnGhost }}
        >
          {t('rsCancel')}
        </button>
      </div>

      {error && (
        <div style={styles.error}>{error}</div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    marginBottom: '16px',
  },
  empty: {
    textAlign: 'center',
    padding: '48px 24px',
    color: '#9ca3af',
  },
  preview: {
    backgroundColor: '#ffffff',
    padding: '16px',
    borderRadius: '6px',
    marginBottom: '16px',
    border: '1px solid #d1d5db',
  },
  previewTitle: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  summary: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  tableWrap: {
    overflowX: 'auto',
    marginBottom: '12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  tableHeader: {
    backgroundColor: '#f3f4f6',
    borderBottom: '2px solid #d1d5db',
  },
  th: {
    padding: '10px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#374151',
  },
  tableRow: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '10px',
    color: '#1f2937',
  },
  code: {
    backgroundColor: '#f3f4f6',
    padding: '2px 4px',
    borderRadius: '2px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#374151',
  },
  warning: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '12px',
    borderRadius: '4px',
    fontSize: '13px',
    marginTop: '12px',
  },
  info: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '12px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '4px',
    marginTop: '12px',
    fontSize: '13px',
  },
  successBanner: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    padding: '16px',
    borderRadius: '6px',
    marginBottom: '16px',
    border: '1px solid #a7f3d0',
  },
  successTitle: {
    fontWeight: 'bold',
    fontSize: '16px',
    marginBottom: '4px',
  },
  successText: {
    fontSize: '14px',
    marginBottom: '4px',
  },
  successTime: {
    fontSize: '12px',
    color: '#10b981',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  btn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
  },
};
