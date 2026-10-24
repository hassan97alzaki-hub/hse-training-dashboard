import { useState, useEffect, useCallback } from 'react';
import {
  AUTH_STATE,
  authRequired,
  getSession,
  onAuthChange,
  signIn,
  signInWithMagicLink,
  requestPasswordReset,
  ensureWorkspace,
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
export function AuthGate({ children, t = (key) => key }) {
  const required = authRequired();
  const [state, setState] = useState(required ? AUTH_STATE.LOADING : AUTH_STATE.NOT_REQUIRED);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!required) return undefined;

    let cancelled = false;

    // A signed-in account needs a workspace before it can read or write
    // anything: every policy is a membership check. The call is idempotent,
    // so it runs after each sign-in without a flag to remember.
    const arrive = async (next) => {
      if (next) await ensureWorkspace();
      if (cancelled) return;
      setSession(next);
      setState(next ? AUTH_STATE.SIGNED_IN : AUTH_STATE.SIGNED_OUT);
    };

    (async () => {
      await arrive(await getSession());
    })();

    const unsubscribe = onAuthChange((next) => {
      arrive(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [required]);

  if (state === AUTH_STATE.LOADING) {
    return <div className="auth-gate"><div className="auth-gate-card" style={{ textAlign: 'center' }}>{t('loading')}</div></div>;
  }

  if (state === AUTH_STATE.SIGNED_OUT) {
    return <SignInForm t={t} />;
  }

  return typeof children === 'function' ? children(session) : children;
}

/**
 * Sign-in and password reset in one form.
 *
 * There is no registration: accounts are created by the owner for each trial
 * request, so a newcomer is sent to the request form instead.
 */
export function SignInForm({ t = (key) => key }) {
  const [mode, setMode] = useState('signin'); // signin | link | reset
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
    else if (mode === 'link') result = await signInWithMagicLink(email);
    else result = await requestPasswordReset(email);

    setBusy(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (mode === 'reset') {
      setNotice(t('resetLinkSent').replace('{email}', email));
    }
    if (mode === 'link') {
      setNotice(t('magicLinkSent').replace('{email}', email));
    }
    // On a successful sign-in the auth listener in AuthGate swaps the view.
  }, [mode, email, password]);

  const title = mode === 'signin' ? t('signIn')
    : mode === 'link' ? t('sendMagicLink')
      : t('resetPassword');

  return (
    <div className="auth-gate">
      <div className="auth-gate-brand">
        <img src="/favicon.svg" alt="" width="40" height="40" className="auth-gate-logo" />
        <h1 className="auth-gate-title">{t('authTitle')}</h1>
        <p className="auth-gate-tagline">{t('authTagline')}</p>
      </div>
      <form onSubmit={submit} className="auth-gate-card">
        <h2 className="auth-gate-mode">{title}</h2>

        {error && <div className="auth-gate-error">{error}</div>}
        {notice && <div className="auth-gate-notice">{notice}</div>}

        <label className="auth-gate-label" htmlFor="auth-email">{t('emailAddress')}</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-gate-input"
          autoComplete="username"
          required
          disabled={busy}
          placeholder={t('emailPlaceholder')}
        />

        {mode !== 'reset' && mode !== 'link' && (
          <>
            <label className="auth-gate-label" htmlFor="auth-password">{t('password')}</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-gate-input"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </>
        )}

        <button type="submit" className="auth-gate-submit" disabled={busy}>
          {busy ? t('working') : title}
        </button>

        <div className="auth-gate-links">
          {mode !== 'signin' && (
            <button type="button" className="auth-gate-link" onClick={() => setMode('signin')}>
              {t('signInInstead')}
            </button>
          )}
          {mode !== 'link' && (
            <button type="button" className="auth-gate-link" onClick={() => setMode('link')}>
              {t('useMagicLink')}
            </button>
          )}
          {mode !== 'reset' && (
            <button type="button" className="auth-gate-link" onClick={() => setMode('reset')}>
              {t('forgotPassword')}
            </button>
          )}
        </div>

        <p className="auth-gate-footnote">
          {t('noAccountYet')} <a href="/trial" className="auth-gate-link">{t('requestTrialLink')}</a>
        </p>
        <p className="auth-gate-footnote">{t('authPrivacy')}</p>
      </form>
    </div>
  );
}

