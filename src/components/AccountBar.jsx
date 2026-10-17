import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { signOut, accountEmail } from '../lib/auth.js';

/**
 * AccountBar Component
 *
 * A thin strip above the dashboard that names the signed-in account and
 * offers a way out. It renders nothing without a session, which is the
 * local-only build: there is no account to show and nothing to sign out of.
 *
 * The address shown is also the address a reminder is sent from, which is
 * why it is stated here rather than hidden in a menu.
 *
 * Props:
 * - session: Supabase session or null
 */
export function AccountBar({ session, t }) {
  const [busy, setBusy] = useState(false);
  const email = accountEmail(session);

  if (!email) return null;

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    setBusy(false);
  }

  return (
    <div style={styles.bar}>
      <span style={styles.email}>
        {t('signedInAs')} <strong>{email}</strong>
      </span>
      <span style={styles.note}>{t('remindersSentFrom')}</span>
      <button onClick={handleSignOut} disabled={busy} style={styles.btn}>
        <LogOut size={14} />
        {busy ? t('signingOut') : t('signOut')}
      </button>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    flexWrap: 'wrap',
    padding: '8px 20px',
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    fontSize: '13px',
  },
  email: {
    marginInlineEnd: 'auto',
  },
  note: {
    color: '#9ca3af',
    fontSize: '12px',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    border: '1px solid #4b5563',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#e5e7eb',
    fontSize: '12px',
    cursor: 'pointer',
  },
};
