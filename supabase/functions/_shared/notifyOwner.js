/**
 * An email to the owner for every trial sign-up and every waiting-list entry.
 *
 * Sent through Resend from its shared test sender, onboarding@resend.dev,
 * which delivers only to the address the Resend account was opened with.
 * That is exactly the owner, so no domain has to be verified for this. Mail
 * to customers is a different matter and still waits for the domain.
 *
 * Both values come from Edge Function secrets, never from the repository:
 *   RESEND_API_KEY  — the Resend key
 *   NOTIFY_EMAIL    — where the alert goes (the Resend account's address)
 * Without them nothing is sent and the sign-up is unaffected.
 *
 * Plain JavaScript with no imports, so Deno and the tests both load it.
 */

const INTEREST_AR = { reminders: 'التذكيرات', reports: 'التقارير', arabic: 'دعم العربية', pricing: 'السعر' };

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Riyadh is UTC+3 all year, so a fixed offset is exact. */
function riyadhTime(now) {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * @param {{status: 'created'|'waitlist', row: object, slotsLeft?: number, now?: Date}} event
 * @returns {{subject: string, text: string, html: string}}
 */
export function buildSignupEmail({ status, row, slotsLeft, now = new Date() }) {
  const waitlist = status === 'waitlist';
  const interests = (row.interest ?? []).map((key) => INTEREST_AR[key] ?? key);
  // A question about price or reminders is the gate's buying signal: say so first.
  const buyingSignal = (row.interest ?? []).some((key) => key === 'pricing' || key === 'reminders');

  const subject = `${waitlist ? 'قائمة انتظار' : 'تسجيل تجربة جديد'}: ${row.company_name}${buyingSignal ? ' — إشارة شراء' : ''}`;

  const lines = [
    ['الحالة', waitlist ? 'قائمة انتظار — لم يُنشأ حساب (المقاعد العشرون مكتملة)' : 'حساب تجربة 7 أيام أُنشئ ودخل اللوحة'],
    ['الشركة', row.company_name],
    ['البريد', row.work_email],
    ['الدولة', row.country || '—'],
    ['حجم العمالة', row.headcount_estimate ?? '—'],
    ['صيغة الملف', row.file_format || '—'],
    ['ما يهمه', interests.length ? interests.join('، ') : '—'],
    ['اللغة', row.source_landing === '/ar' ? 'العربية' : 'الإنجليزية'],
    ['الوقت (الرياض)', riyadhTime(now)],
  ];
  if (typeof slotsLeft === 'number' && !waitlist) lines.push(['مقاعد متبقية', String(Math.max(0, slotsLeft - 1))]);

  const next = waitlist
    ? 'الخطوة التالية: رد عليه بأنك ستتواصل فور توفر مقعد.'
    : 'الخطوة التالية: أرسل له رسالة ترحيب بواتساب اليوم، واسأله إن كان يريد عرضاً سريعاً.';

  const text = [...lines.map(([k, v]) => `${k}: ${v}`), '', next].join('\n');
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
<h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
<table cellpadding="6" style="border-collapse:collapse">${lines
    .map(([k, v]) => `<tr><td style="color:#64748b">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`)
    .join('')}</table>
<p style="margin-top:16px">${escapeHtml(next)}</p>
</div>`;

  return { subject, text, html };
}

/**
 * Send the alert. Never throws and never waits more than `timeoutMs`: a slow
 * or failing mail service must not slow or fail a customer's sign-up.
 *
 * @returns {Promise<boolean>} whether Resend accepted the message
 */
export async function notifyOwner({ apiKey, to, event, fetchImpl = fetch, timeoutMs = 4000 }) {
  if (!apiKey || !to) return false;
  const { subject, text, html } = buildSignupEmail(event);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'HSE Trial <onboarding@resend.dev>', to: [to], subject, text, html }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
