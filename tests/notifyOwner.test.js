import { describe, it, expect } from 'vitest';
import { buildSignupEmail, notifyOwner } from '../supabase/functions/_shared/notifyOwner.js';

const row = {
  company_name: 'Gulf <Contracting>',
  work_email: 'safety@gulf.example',
  country: 'SA',
  headcount_estimate: 120,
  file_format: 'XLSX',
  interest: ['reports', 'pricing'],
  source_landing: '/ar',
};

describe('buildSignupEmail', () => {
  it('names the company and flags a buying signal in the subject', () => {
    const { subject } = buildSignupEmail({ status: 'created', row });
    expect(subject).toBe('تسجيل تجربة جديد: Gulf <Contracting> — إشارة شراء');
  });

  it('lists the details and the next step', () => {
    const { text } = buildSignupEmail({ status: 'created', row, slotsLeft: 20, now: new Date('2026-10-25T07:00:00Z') });
    expect(text).toContain('البريد: safety@gulf.example');
    expect(text).toContain('ما يهمه: التقارير، السعر');
    expect(text).toContain('الوقت (الرياض): 2026-10-25 10:00');
    expect(text).toContain('مقاعد متبقية: 19');
    expect(text).toContain('واتساب');
  });

  it('escapes what the visitor typed before putting it in HTML', () => {
    const { html } = buildSignupEmail({ status: 'created', row });
    expect(html).toContain('Gulf &lt;Contracting&gt;');
    expect(html).not.toContain('<Contracting>');
  });

  it('says a waiting-list entry has no account', () => {
    const { subject, text } = buildSignupEmail({ status: 'waitlist', row: { ...row, interest: [] } });
    expect(subject).toBe('قائمة انتظار: Gulf <Contracting>');
    expect(text).toContain('لم يُنشأ حساب');
  });
});

describe('notifyOwner', () => {
  it('posts to Resend from the shared test sender to the owner only', async () => {
    const calls = [];
    const ok = await notifyOwner({
      apiKey: 're_test', to: 'owner@example.com', event: { status: 'created', row },
      fetchImpl: async (url, init) => { calls.push([url, init]); return { ok: true }; },
    });
    expect(ok).toBe(true);
    const [url, init] = calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('HSE Trial <onboarding@resend.dev>');
    expect(body.to).toEqual(['owner@example.com']);
  });

  it('sends nothing without its secrets', async () => {
    let called = false;
    const ok = await notifyOwner({ apiKey: '', to: '', event: { status: 'created', row }, fetchImpl: async () => { called = true; } });
    expect(ok).toBe(false);
    expect(called).toBe(false);
  });

  it('gives up quietly when the mail service hangs', async () => {
    const ok = await notifyOwner({
      apiKey: 're_test', to: 'owner@example.com', event: { status: 'created', row }, timeoutMs: 20,
      fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    });
    expect(ok).toBe(false);
  });
});
