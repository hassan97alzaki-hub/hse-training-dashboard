import { useState, useEffect, useCallback } from 'react';
import {
  AUTH_STATE,
  authRequired,
  getSession,
  onAuthChange,
  signIn,
  signUp,
  requestPasswordReset,
} from '../lib/auth.js';

/**
 * AuthGate Component
 *
 * Decides whether the dashboard is shown or a sign-in form is.
 *
 * In a local-only build there is no account backend, so the gate is open
 * immediately and renders its children: the application behaves exactly as it
 * did before Phase 2C. In a cloud build the children only render once a
 * session exists.
 *
 * The session is handed to the children, because the signed-in address is
 * also the address a reminder is sent from.
 *
 * Props:
 * - children: (session) => node, or a node
 */
export function AuthGate({ children }) {
  const required = authRequired();
  const [state, setState] = useState(required ? AUTH_STATE.LOADING : AUTH_STATE.NOT_REQUIRED);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!required) return undefined;

    let cancelled = false;
    (async () => {
      const current = await getSession();
      if (cancelled) return;
      setSession(current);
      setState(current ? AUTH_STATE.SIGNED_IN : AUTH_STATE.SIGNED_OUT);
    })();

    const unsubscribe = onAuthChange((next) => {
      setSession(next);
      setState(next ? AUTH_STATE.SIGNED_IN : AUTH_STATE.SIGNED_OUT);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [required]);

  if (state === AUTH_STATE.LOADING) {
    return <div style={styles.center}>Loading…</div>;
  }

  if (state === AUTH_STATE.SIGNED_OUT) {
    return <SignInForm />;
  }

  return typeof children === 'function' ? children(session) : children;
}

/**
 * Sign-in, registration and password reset in one form.
 */
export function SignInForm() {
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (e) => {
    e?.preventDefault?.();
    setError('');
    setNotice('');
    setBusy(true);

    let result;
    if (mode === 'signin') result = await signIn(email, password);
    else if (mode === 'signup') result = await signUp(email, password);
    else result = await requestPasswordReset(email);

    setBusy(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (mode === 'signup' && result.needsConfirmation) {
      setNotice(`Confirm your address. A message is on its way to ${email}.`);
      return;
    }
    if (mode === 'reset') {
      setNotice(`A reset link is on its way to ${email}.`);
    }
    // On a successful sign-in the auth listener in AuthGate swaps the view.
  }, [mode, email, password]);

  const title = mode === 'signin' ? 'Sign in'
    : mode === 'signup' ? 'Create an account'
      : 'Reset your password';

  return (
    <div style={styles.center}>
      <form onSubmit={submit} style={styles.card}>
        <h1 style={styles.title}>HSE Training Dashboard</h1>
        <h2 style={styles.subtitle}>{title}</h2>

        {error && <div style={styles.error}>{error}</div>}
        {notice && <div style={styles.notice}>{notice}</div>}

        <label style={styles.label} htmlFor="auth-email">Email address</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          autoComplete="username"
          required
          disabled={busy}
        />

        {mode !== 'reset' && (
          <>
            <label style={styles.label} htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              disabled={busy}
            />
            {mode === 'signup' && (
              <p style={styles.hint}>At least 8 characters.</p>
            )}
          </>
        )}

        <button type="submit" style={styles.primaryBtn} disabled={busy}>
          {busy ? 'Working…' : title}
        </button>

        <div style={styles.links}>
          {mode !== 'signin' && (
            <button type="button" style={styles.linkBtn} onClick={() => setMode('signin')}>
              Sign in instead
            </button>
          )}
          {mode !== 'signup' && (
            <button type="button" style={styles.linkBtn} onClick={() => setMode('signup')}>
              Create an account
            </button>
          )}
          {mode !== 'reset' && (
            <button type="button" style={styles.linkBtn} onClick={() => setMode('reset')}>
              Forgot your password?
            </button>
          )}
        </div>

        <p style={styles.footnote}>
          Your training data belongs to this account. Only this account can read it.
        </p>
      </form>
    </div>
  );
}

const styles = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: '#f9fafb',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '28px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  title: {
    margin: '0 0 4px',
    fontSize: '18px',
    fontWeight: 700,
    color: '#1f2937',
  },
  subtitle: {
    margin: '0 0 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#6b7280',
  },
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '10px',
    marginBottom: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  hint: {
    margin: '-8px 0 14px',
    fontSize: '12px',
    color: '#6b7280',
  },
  primaryBtn: {
    width: '100%',
    padding: '11px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '14px',
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: '#2563eb',
    fontSize: '13px',
    cursor: 'pointer',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '14px',
    fontSize: '13px',
  },
  notice: {
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '14px',
    fontSize: '13px',
  },
  footnote: {
    marginTop: '18px',
    marginBottom: 0,
    fontSize: '12px',
    color: '#9ca3af',
  },
};
