import { getSupabaseClient } from '../lib/supabaseClient.js';
import { toTrialRow, isAcceptablePassword } from '../lib/trialSignup.js';

const EN = {
  title: 'Start your 7-day trial',
  lede: 'Choose a password and your dashboard opens straight away. No credit card.',
  company: 'Company name',
  email: 'Work email',
  password: 'Choose a password',
  passwordHint: 'At least 8 characters. You sign in with this email and password.',
  freeMail: 'Free-mail address (Gmail or similar). You can continue, but a company address is verified faster.',
  country: 'Country (optional)',
  headcount: 'Employees in scope (approximate, optional)',
  format: 'Training file format (optional)',
  formatNone: '—',
  interest: 'What matters most to you (optional)',
  i_reminders: 'Reminders',
  i_reports: 'Reports for audits',
  i_arabic: 'Arabic support',
  i_pricing: 'Pricing',
  submit: 'Start my trial',
  received: 'Your trial is ready. Opening your dashboard…',
  wa: 'Follow up on WhatsApp',
  footer: 'Your account and data stay in your own workspace. We never ask for national ID or iqama numbers.',
};

const MESSAGES = {
  ar: {
    invalid: 'تحقق من الحقول المعلَّمة.',
    exists: 'يوجد حساب بهذا البريد. سجّل دخولك من صفحة اللوحة.',
    waitlist: 'اكتملت مقاعد التجربة الحالية، وأضفناك إلى قائمة الانتظار. سنتواصل معك فور توفر مقعد.',
    signInFailed: 'أُنشئ حسابك، لكن تعذّر الدخول تلقائياً. ادخل من صفحة اللوحة بالبريد وكلمة المرور.',
    failed: 'تعذّر الإرسال الآن. حاول لاحقاً أو تواصل معنا بواتساب.',
    notConfigured: 'النموذج غير متاح في هذه النسخة.',
    waText: 'طلب تجربة 7 أيام — HSE Training Dashboard',
  },
  en: {
    invalid: 'Check the highlighted fields.',
    exists: 'An account with this email already exists. Sign in from the dashboard page.',
    waitlist: 'The current trial places are taken, and you are on the waiting list. We will contact you as soon as one opens.',
    signInFailed: 'Your account is ready, but signing in automatically failed. Sign in from the dashboard page with your email and password.',
    failed: 'Sending failed for now. Try again later or reach us on WhatsApp.',
    notConfigured: 'The form is not available in this build.',
    waText: '7-day trial request — HSE Training Dashboard',
  },
};

const form = document.getElementById('trial-form');
const submit = document.getElementById('submit');
const status = document.getElementById('status');
const done = document.getElementById('done');
const waLink = document.getElementById('wa');
const mailWarning = document.getElementById('mail-warning');
const toggle = document.getElementById('lang-toggle');

const AR = new Map();
for (const el of document.querySelectorAll('[data-t]')) AR.set(el, el.innerHTML);

const waNumber = String(import.meta.env.VITE_TRIAL_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
waLink.classList.toggle('hidden', !waNumber);

// The shared client keeps the session, so the dashboard at /app opens
// signed in once the trial account exists.
const client = getSupabaseClient();

let lang = 'ar';

function applyLanguage(next) {
  lang = next;
  const arabic = lang === 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = arabic ? 'rtl' : 'ltr';
  toggle.textContent = arabic ? 'English' : 'عربي';
  for (const el of document.querySelectorAll('[data-t]')) {
    const key = el.dataset.t;
    el.innerHTML = arabic ? AR.get(el) : (EN[key] ?? AR.get(el));
  }
  waLink.href = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(MESSAGES[lang].waText)}`
    : '#';
}

function readForm() {
  const data = new FormData(form);
  return {
    companyName: data.get('companyName'),
    workEmail: data.get('workEmail'),
    country: data.get('country'),
    headcountEstimate: data.get('headcountEstimate'),
    fileFormat: data.get('fileFormat'),
    interest: data.getAll('interest'),
    honeypot: data.get('website'),
    password: data.get('password'),
  };
}

function setStatus(text, kind) {
  status.textContent = text;
  status.className = `msg ${kind}`;
}

function showLink(text, href, label) {
  status.className = 'msg bad';
  status.textContent = `${text} `;
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  status.append(link);
}

function markInvalid(errors) {
  for (const name of Object.keys(errors)) {
    form.elements[name]?.setAttribute('aria-invalid', 'true');
  }
}

form.addEventListener('input', () => {
  for (const el of form.elements) el.removeAttribute('aria-invalid');
  const email = String(form.elements.workEmail.value).trim().toLowerCase();
  const domain = email.split('@')[1];
  mailWarning.classList.toggle('hidden', !['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'].includes(domain));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('', '');

  if (!client) {
    setStatus(MESSAGES[lang].notConfigured, 'bad');
    return;
  }

  const input = { ...readForm(), sourceLanding: lang === 'ar' ? '/ar' : '/en' };
  const result = toTrialRow(input, input.sourceLanding);
  const errors = { ...result.errors };
  if (!isAcceptablePassword(input.password)) errors.password = true;
  if (Object.keys(errors).length > 0) {
    markInvalid(errors);
    setStatus(MESSAGES[lang].invalid, 'bad');
    return;
  }

  // The account is made on the server, by the trial-signup Edge Function:
  // the service-role key it needs never comes near this page.
  submit.disabled = true;
  const { data, error } = await client.functions.invoke('trial-signup', { body: input });
  const outcome = error ? 'failed' : data?.status;

  if (outcome === 'invalid') {
    submit.disabled = false;
    markInvalid(data.errors ?? {});
    setStatus(MESSAGES[lang].invalid, 'bad');
    return;
  }
  if (outcome === 'exists') {
    submit.disabled = false;
    showLink(MESSAGES[lang].exists, '/app', lang === 'ar' ? 'افتح اللوحة' : 'Open the dashboard');
    return;
  }
  if (outcome === 'waitlist') {
    form.querySelectorAll('input, select, button, fieldset').forEach((el) => { el.disabled = true; });
    setStatus(MESSAGES[lang].waitlist, 'ok');
    return;
  }
  if (outcome !== 'created') {
    submit.disabled = false;
    setStatus(MESSAGES[lang].failed, 'bad');
    return;
  }

  form.querySelectorAll('input, select, button, fieldset').forEach((el) => { el.disabled = true; });
  status.textContent = '';
  done.classList.remove('hidden');

  const { error: signInError } = await client.auth.signInWithPassword({
    email: String(input.workEmail).trim().toLowerCase(),
    password: String(input.password),
  });
  if (signInError) {
    done.classList.add('hidden');
    showLink(MESSAGES[lang].signInFailed, '/app', lang === 'ar' ? 'افتح اللوحة' : 'Open the dashboard');
    return;
  }
  window.location.assign('/app');
});

toggle.addEventListener('click', () => applyLanguage(lang === 'ar' ? 'en' : 'ar'));

// The English landing page links here with ?lang=en, so its visitors land on
// the form in their own language.
if (new URLSearchParams(window.location.search).get('lang') === 'en') applyLanguage('en');

if (!client) {
  submit.disabled = true;
  setStatus(MESSAGES.ar.notConfigured, 'bad');
}
