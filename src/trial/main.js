import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from '../lib/supabaseClient.js';
import { toTrialRow } from '../lib/trialSignup.js';

const EN = {
  title: 'Request a 7-day trial',
  lede: 'Send your details and we will reply with login details. No credit card.',
  company: 'Company name',
  email: 'Work email',
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
  submit: 'Send request',
  received: 'We received your request. We will send login details within one working day.',
  wa: 'Follow up on WhatsApp',
  footer: 'The request goes to the trial database only. We do not ask for employee names or ID numbers.',
};

const MESSAGES = {
  ar: {
    invalid: 'تحقق من الحقول المعلَّمة.',
    duplicate: 'وصلنا طلب بهذا البريد من قبل. سنرد عليك قريباً.',
    failed: 'تعذّر الإرسال الآن. حاول لاحقاً.',
    notConfigured: 'النموذج غير متاح في هذه النسخة.',
    waText: 'طلب تجربة 7 أيام — HSE Training Dashboard',
  },
  en: {
    invalid: 'Check the highlighted fields.',
    duplicate: 'A request with this email was already received. We will reply soon.',
    failed: 'Sending failed for now. Try again later.',
    notConfigured: 'The form is not available in this build.',
    waText: '7-day trial request — HSE Training Dashboard',
  },
};

const DUPLICATE_CODE = '23505';

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

const config = readSupabaseConfig(import.meta.env);
const client = config.configured
  ? createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

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
  };
}

function setStatus(text, kind) {
  status.textContent = text;
  status.className = `msg ${kind}`;
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

  const result = toTrialRow(readForm(), lang === 'ar' ? '/ar' : '/en');
  if (!result.ok) {
    markInvalid(result.errors);
    setStatus(MESSAGES[lang].invalid, 'bad');
    return;
  }

  submit.disabled = true;
  const { error } = await client.from('trial_signups').insert(result.row);
  submit.disabled = false;

  if (error?.code === DUPLICATE_CODE) {
    setStatus(MESSAGES[lang].duplicate, 'bad');
    return;
  }
  if (error) {
    setStatus(MESSAGES[lang].failed, 'bad');
    return;
  }

  form.querySelectorAll('input, select, button, fieldset').forEach((el) => { el.disabled = true; });
  status.textContent = '';
  done.classList.remove('hidden');
});

toggle.addEventListener('click', () => applyLanguage(lang === 'ar' ? 'en' : 'ar'));

// The English landing page links here with ?lang=en, so its visitors land on
// the form in their own language.
if (new URLSearchParams(window.location.search).get('lang') === 'en') applyLanguage('en');

if (!client) {
  submit.disabled = true;
  setStatus(MESSAGES.ar.notConfigured, 'bad');
}
