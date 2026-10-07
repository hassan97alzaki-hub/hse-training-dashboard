import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import App from '../src/App.jsx';
import { createI18n } from '../src/lib/i18n.js';
import TrialBanner from '../src/components/TrialBanner.jsx';
import TrialQuickStart from '../src/components/TrialQuickStart.jsx';
import {
  readTrialConfig,
  resolveTrialState,
  customerDataAllowed,
  trialHeadlineKey,
  TRIAL_PHASE,
  TRIAL_LENGTH_DAYS,
} from '../src/lib/trial.js';

/** A Riyadh instant (UTC+3): 12:00 local on the given calendar day. */
const atRiyadh = (day, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+03:00`);

const CONFIG = Object.freeze({
  enabled: true,
  company: 'Example Contracting Company',
  startDate: '2027-01-05',
  endDate: '2027-01-11',
});

describe('reading the build configuration', () => {
  it('is off when VITE_TRIAL_MODE is absent or not true', () => {
    for (const env of [undefined, {}, { VITE_TRIAL_MODE: '' }, { VITE_TRIAL_MODE: 'false' }, { VITE_TRIAL_MODE: '1' }]) {
      const config = readTrialConfig(env);
      expect(config.enabled, JSON.stringify(env)).toBe(false);
      expect(resolveTrialState(config, atRiyadh('2027-01-07')).phase).toBe(TRIAL_PHASE.OFF);
    }
  });

  it('reads the company and the window when it is on', () => {
    const config = readTrialConfig({
      VITE_TRIAL_MODE: 'TRUE',
      VITE_TRIAL_COMPANY: '  Example Contracting Company ',
      VITE_TRIAL_START_DATE: ' 2027-01-05 ',
      VITE_TRIAL_END_DATE: '2027-01-11',
    });
    expect(config).toMatchObject({
      enabled: true,
      company: 'Example Contracting Company',
      startDate: '2027-01-05',
      endDate: '2027-01-11',
      timeZone: 'Asia/Riyadh',
    });
  });

  it('documents the trial length without deriving behaviour from it', () => {
    expect(TRIAL_LENGTH_DAYS).toBe(7);
    const state = resolveTrialState(CONFIG, atRiyadh('2027-01-05'));
    expect(state.totalDays).toBe(7);
  });
});

describe('the window boundaries', () => {
  const phaseOn = (day, hour) => resolveTrialState(CONFIG, atRiyadh(day, hour));

  it('is before the trial on the day before the start', () => {
    const state = phaseOn('2027-01-04');
    expect(state.phase).toBe(TRIAL_PHASE.BEFORE);
    expect(state.active).toBe(false);
    expect(state.expired).toBe(false);
  });

  it('is active on the first day, with seven days remaining', () => {
    const state = phaseOn('2027-01-05');
    expect(state.phase).toBe(TRIAL_PHASE.ACTIVE);
    expect(state.daysRemaining).toBe(7);
  });

  it('counts down to one on the last day', () => {
    expect(phaseOn('2027-01-06').daysRemaining).toBe(6);
    expect(phaseOn('2027-01-10').daysRemaining).toBe(2);
    const last = phaseOn('2027-01-11');
    expect(last.phase).toBe(TRIAL_PHASE.ACTIVE);
    expect(last.daysRemaining).toBe(1);
  });

  it('expires on the day after the end, with zero remaining', () => {
    const state = phaseOn('2027-01-12');
    expect(state.phase).toBe(TRIAL_PHASE.EXPIRED);
    expect(state.expired).toBe(true);
    expect(state.daysRemaining).toBe(0);
  });

  it('accepts a one-day window', () => {
    const single = { ...CONFIG, startDate: '2027-01-05', endDate: '2027-01-05' };
    expect(resolveTrialState(single, atRiyadh('2027-01-05')).daysRemaining).toBe(1);
    expect(resolveTrialState(single, atRiyadh('2027-01-06')).phase).toBe(TRIAL_PHASE.EXPIRED);
  });
});

describe('the time zone rule', () => {
  it('uses the Riyadh calendar day, not the device day', () => {
    // 2027-01-11T22:00Z is 2027-01-12 01:00 in Riyadh: the trial has ended,
    // although the UTC day is still the last day of the window.
    const state = resolveTrialState(CONFIG, new Date('2027-01-11T22:00:00Z'));
    expect(state.today).toBe('2027-01-12');
    expect(state.phase).toBe(TRIAL_PHASE.EXPIRED);

    // 2027-01-11T20:59Z is 2027-01-11 23:59 in Riyadh: still the last day.
    const lastDay = resolveTrialState(CONFIG, new Date('2027-01-11T20:59:00Z'));
    expect(lastDay.today).toBe('2027-01-11');
    expect(lastDay.phase).toBe(TRIAL_PHASE.ACTIVE);
    expect(lastDay.daysRemaining).toBe(1);
  });

  it('gives the same answer under any device time zone', () => {
    const ORIGINAL_TZ = process.env.TZ;
    try {
      const answers = [];
      for (const tz of ['UTC', 'Asia/Riyadh', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        answers.push(JSON.stringify(resolveTrialState(CONFIG, new Date('2027-01-11T20:59:00Z'))));
      }
      expect(new Set(answers).size).toBe(1);
    } finally {
      if (ORIGINAL_TZ === undefined) delete process.env.TZ;
      else process.env.TZ = ORIGINAL_TZ;
    }
  });
});

describe('a misconfigured build', () => {
  it('reports itself and switches nothing off', () => {
    for (const dates of [
      { startDate: '', endDate: '' },
      { startDate: '2027-01-05', endDate: '' },
      { startDate: 'soon', endDate: '2027-01-11' },
      { startDate: '2027-01-11', endDate: '2027-01-05' },
      { startDate: '2027-02-30', endDate: '2027-03-05' },
    ]) {
      const state = resolveTrialState({ ...CONFIG, ...dates }, atRiyadh('2027-06-01'));
      expect(state.phase, JSON.stringify(dates)).toBe(TRIAL_PHASE.MISCONFIGURED);
      expect(state.daysRemaining, JSON.stringify(dates)).toBeNull();
      // A broken build must never lock a customer out.
      expect(customerDataAllowed(state), JSON.stringify(dates)).toBe(true);
    }
  });
});

describe('the customer-data gate', () => {
  it('is open in every phase except an ended trial', () => {
    expect(customerDataAllowed(resolveTrialState({ enabled: false }, atRiyadh('2027-01-07')))).toBe(true);
    expect(customerDataAllowed(resolveTrialState(CONFIG, atRiyadh('2027-01-04')))).toBe(true);
    expect(customerDataAllowed(resolveTrialState(CONFIG, atRiyadh('2027-01-11')))).toBe(true);
    expect(customerDataAllowed(resolveTrialState(CONFIG, atRiyadh('2027-01-12')))).toBe(false);
    expect(customerDataAllowed(undefined)).toBe(true);
  });

  it('maps each phase to its own message', () => {
    expect(trialHeadlineKey(TRIAL_PHASE.BEFORE)).toBe('trialHeadlineBefore');
    expect(trialHeadlineKey(TRIAL_PHASE.ACTIVE)).toBe('trialHeadlineActive');
    expect(trialHeadlineKey(TRIAL_PHASE.EXPIRED)).toBe('trialHeadlineExpired');
    expect(trialHeadlineKey(TRIAL_PHASE.MISCONFIGURED)).toBe('trialHeadlineMisconfigured');
    expect(trialHeadlineKey(TRIAL_PHASE.OFF)).toBe('');
  });

  it('returns frozen states and reads no clock of its own', () => {
    const state = resolveTrialState(CONFIG, atRiyadh('2027-01-07'));
    expect(Object.isFrozen(state)).toBe(true);
    const source = readFileSync(resolve(process.cwd(), 'src/lib/trial.js'), 'utf8');
    // The clock is never read inside a decision: `now` is a parameter whose
    // default the caller may replace, exactly as lib/clock.js does.
    expect(source).not.toContain(['Date', '.now('].join(''));
    expect(source).toMatch(/resolveTrialState\(config, now = new Date\(\)\)/);
    const body = source.slice(source.indexOf('export function resolveTrialState'));
    expect(body.replace(/\s/g, '').split(['new', 'Date()'].join('')).length - 1).toBe(1);
  });
});

describe('the banner component', () => {
  afterEach(cleanup);

  const renderBanner = (state, lang = 'en') => {
    const { t } = createI18n(lang);
    return render(createElement(TrialBanner, { state, t }));
  };

  it('renders nothing when the build carries no trial', () => {
    const { container } = renderBanner(resolveTrialState({ enabled: false }, atRiyadh('2027-01-07')));
    expect(container.innerHTML).toBe('');
  });

  it('shows the company, the window, the remaining days and the privacy line', () => {
    renderBanner(resolveTrialState(CONFIG, atRiyadh('2027-01-07')));
    const banner = screen.getByTestId('trial-banner');
    expect(banner).toHaveAttribute('data-phase', 'active');
    expect(banner.textContent).toContain('Free 7-day trial');
    expect(banner.textContent).toContain('Example Contracting Company');
    expect(screen.getByTestId('trial-window').textContent).toContain('2027-01-05');
    expect(screen.getByTestId('trial-window').textContent).toContain('2027-01-11');
    expect(screen.getByTestId('trial-window').textContent).toContain('Asia/Riyadh');
    expect(screen.getByTestId('trial-days-remaining').textContent).toContain('5');
    expect(banner.textContent).toMatch(/processed in this browser only/i);
    expect(banner.textContent).toMatch(/Nothing is uploaded/i);
    // The gate is described honestly.
    expect(banner.textContent).toMatch(/not who may open it/i);
  });

  it('shows the Arabic texts', () => {
    renderBanner(resolveTrialState(CONFIG, atRiyadh('2027-01-07')), 'ar');
    const banner = screen.getByTestId('trial-banner');
    expect(banner.textContent).toContain('تجربة مجانية 7 أيام');
    expect(banner.textContent).toContain('الأيام المتبقية');
    expect(banner.textContent).toMatch(/تُعالَج بياناتك في هذا المتصفح فقط/);
  });

  it('invites contact once the trial has ended', () => {
    renderBanner(resolveTrialState(CONFIG, atRiyadh('2027-01-12')));
    const banner = screen.getByTestId('trial-banner');
    expect(banner).toHaveAttribute('data-phase', 'expired');
    expect(screen.getByTestId('trial-expired-note').textContent).toMatch(/switched off/i);
    expect(banner.textContent).toMatch(/ask for an extension/i);
    expect(screen.queryByTestId('trial-days-remaining')).toBeNull();
  });

  it('says so when the dates are unusable', () => {
    renderBanner(resolveTrialState({ ...CONFIG, endDate: '' }, atRiyadh('2027-01-07')));
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-phase', 'misconfigured');
    expect(screen.queryByTestId('trial-window')).toBeNull();
  });

  it('is announced as a live status region', () => {
    renderBanner(resolveTrialState(CONFIG, atRiyadh('2027-01-07')));
    const banner = screen.getByTestId('trial-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  it('shows three quick-start steps and marks the import step when it is off', () => {
    const { t } = createI18n('en');
    render(createElement(TrialQuickStart, { t, customerDataAllowed: true }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('trial-quick-start').textContent).not.toMatch(/switched off/i);
    cleanup();
    render(createElement(TrialQuickStart, { t, customerDataAllowed: false }));
    expect(screen.getByTestId('trial-quick-start').textContent).toMatch(/switched off/i);
  });
});

describe('Trial Mode inside the app', () => {
  const trainingInput = () => document.querySelectorAll('input[type=file]')[0];
  const requirementsInput = () => document.querySelectorAll('input[type=file]')[1];

  const renderApp = (config, now) =>
    render(
      createElement(App, {
        now: () => '2027-01-11T08:00:00.000Z',
        newBatchId: () => 'LOCAL-TEST-0001',
        trialConfig: config,
        trialNow: () => now,
      }),
    );

  beforeEach(() => {
    const demoFile = (name) => readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8');
    globalThis.fetch = vi.fn(async (url) =>
      new Response(
        demoFile(String(url).includes('requirements') ? 'sample-requirements.csv' : 'sample-training-data.csv'),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('changes nothing when the build carries no trial', () => {
    renderApp({ enabled: false }, atRiyadh('2027-01-12'));
    expect(screen.queryByTestId('trial-banner')).toBeNull();
    expect(screen.queryByTestId('trial-quick-start')).toBeNull();
    expect(screen.getByTestId('training-file-input')).toBeEnabled();
    expect(screen.getByTestId('requirements-file-input')).toBeEnabled();
  });

  it('shows the banner and the quick start during an active trial', () => {
    renderApp(CONFIG, atRiyadh('2027-01-07'));
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-phase', 'active');
    expect(screen.getByTestId('trial-quick-start')).toBeInTheDocument();
    expect(screen.getByTestId('training-file-input')).toBeEnabled();
  });

  it('switches customer data off once the trial has ended', async () => {
    renderApp(CONFIG, atRiyadh('2027-01-12'));
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-phase', 'expired');
    expect(screen.getByTestId('training-file-input')).toBeDisabled();
    expect(screen.getByTestId('requirements-file-input')).toBeDisabled();

    // Even a programmatic change is refused, and the reason is shown.
    const input = trainingInput();
    Object.defineProperty(input, 'files', {
      value: [new File(['Employee_ID\nX'], 'customer.csv', { type: 'text/csv' })],
      configurable: true,
    });
    fireEvent.change(input);
    expect((await screen.findAllByText(/the trial has ended/i)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('matrix-preview')).toBeNull();
    expect(screen.queryByTestId('production-preview')).toBeNull();

    const reqInput = requirementsInput();
    Object.defineProperty(reqInput, 'files', {
      value: [new File(['Department\nX'], 'req.csv', { type: 'text/csv' })],
      configurable: true,
    });
    fireEvent.change(reqInput);
    expect(screen.queryByText(/Requirements loaded/i)).toBeNull();
  });

  it('keeps the demonstration data working after the trial has ended', async () => {
    renderApp(CONFIG, atRiyadh('2027-01-12'));
    fireEvent.click(screen.getByRole('button', { name: /Load Demo Data/i }));
    await screen.findByTestId('test-requirements-banner', {}, { timeout: 5000 });
    await waitFor(() => expect(document.querySelector('.kpi-card, .kpi-hero-card')).not.toBeNull());
  });
});

describe('no storage, no network, no telemetry', () => {
  const FILES = [
    'src/lib/trial.js',
    'src/components/TrialBanner.jsx',
    'src/components/TrialQuickStart.jsx',
    'src/App.jsx',
    'landing/index.html',
  ];

  it('uses no browser storage and no cookie', () => {
    for (const file of FILES) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('localStorage');
      expect(source, file).not.toContain('sessionStorage');
      expect(source, file).not.toContain('indexedDB');
      expect(source, file).not.toMatch(/document\.cookie/);
    }
  });

  it('makes no request of its own', () => {
    const REQUEST = ['fet', 'ch('].join('');
    for (const file of FILES) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8').replace(/\s/g, '');
      // App.jsx reaches the demo CSVs through demoData.js, never directly.
      expect(source, file).not.toContain(REQUEST);
      expect(source, file).not.toContain('XMLHttpRequest');
      expect(source, file).not.toContain('navigator.sendBeacon');
      expect(source, file).not.toContain('newWebSocket');
    }
  });

  it('loads no third-party script, font or pixel in the landing page', () => {
    const html = readFileSync(resolve(process.cwd(), 'landing/index.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(html).not.toMatch(/<img[^>]+src=["']https?:/i);
    expect(html).not.toMatch(/googletagmanager|google-analytics|gtag\(|plausible|matomo|hotjar|segment\.com/i);
  });

  it('carries no real contact detail and no personal path', () => {
    const HOME = ['/Us', 'ers/'].join('');
    const ACCOUNT = ['hassan', 'ali'].join('');
    for (const file of [...FILES, '.env.trial.example', 'docs/TRIAL_BUILD_AND_RUN.md', 'docs/TRIAL_OPERATIONS_RUNBOOK.md']) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain(HOME);
      expect(source.toLowerCase(), file).not.toContain(ACCOUNT);
      expect(source, file).not.toMatch(/@(gmail|hotmail|outlook|yahoo|icloud)\./i);
      expect(source, file).not.toMatch(/\+966\s?\d/);
    }
  });

  it('documents the gate as a gate in the code and in the documents', () => {
    const trial = readFileSync(resolve(process.cwd(), 'src/lib/trial.js'), 'utf8');
    expect(trial).toMatch(/not access control/i);
    expect(trial).toMatch(/Cloudflare Access/);
    const doc = readFileSync(resolve(process.cwd(), 'docs/TRIAL_BUILD_AND_RUN.md'), 'utf8');
    expect(doc).toMatch(/not access control/i);
    expect(doc).toMatch(/not a production server/i);
  });

  it('keeps the example environment file free of secrets', () => {
    const env = readFileSync(resolve(process.cwd(), '.env.trial.example'), 'utf8');
    expect(env).toMatch(/VITE_TRIAL_MODE/);
    expect(env).toMatch(/VITE_TRIAL_COMPANY/);
    expect(env).toMatch(/VITE_TRIAL_START_DATE/);
    expect(env).toMatch(/VITE_TRIAL_END_DATE/);
    expect(env).not.toMatch(/\b(secret|token|password|api[_-]?key)\s*=/i);
    expect(env).toMatch(/Example Contracting Company/);
  });
});
