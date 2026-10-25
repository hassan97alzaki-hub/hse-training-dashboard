/**
 * Trial sign-up: the checks on what the form sends.
 *
 * One module for both sides. The page runs it to mark fields before sending,
 * and the trial-signup Edge Function runs it again on what actually arrived,
 * because a request can skip the page. It lives here, beside the function,
 * so the function can import it; src/lib/trialSignup.js re-exports it for the
 * page. The database repeats the length, format and honeypot checks as well.
 * Free-mail domains only warn: small companies use them and the form must not
 * turn them away.
 *
 * Plain JavaScript with no imports, so Deno and Vite can both load it.
 */

export const INTERESTS = ['reminders', 'reports', 'arabic', 'pricing'];
export const FILE_FORMATS = ['CSV', 'XLSX'];

const FREE_MAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {object} input - raw form values
 * @param {string} sourceLanding - '/en' or '/ar', the language the form was sent in
 * @returns {{ok: boolean, errors: object, freeMail: boolean, row: object|null}}
 */
export function toTrialRow(input = {}, sourceLanding) {
  const errors = {};

  const companyName = String(input.companyName ?? '').trim();
  if (companyName.length < 2 || companyName.length > 120) errors.companyName = true;

  const workEmail = String(input.workEmail ?? '').trim().toLowerCase();
  if (!EMAIL.test(workEmail) || workEmail.length > 254) errors.workEmail = true;

  const country = String(input.country ?? '').trim();
  if (country.length > 60) errors.country = true;

  const rawHeadcount = String(input.headcountEstimate ?? '').trim();
  const headcount = rawHeadcount === '' ? null : Number(rawHeadcount);
  if (headcount !== null && (!Number.isInteger(headcount) || headcount < 1 || headcount > 100000)) {
    errors.headcountEstimate = true;
  }

  const fileFormat = input.fileFormat ? String(input.fileFormat) : null;
  if (fileFormat && !FILE_FORMATS.includes(fileFormat)) errors.fileFormat = true;

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, freeMail: false, row: null };
  }

  const interest = INTERESTS.filter((item) => (input.interest ?? []).includes(item));
  const freeMail = FREE_MAIL_DOMAINS.includes(workEmail.split('@')[1]);

  return {
    ok: true,
    errors,
    freeMail,
    row: {
      company_name: companyName,
      work_email: workEmail,
      country: country || null,
      headcount_estimate: headcount,
      file_format: fileFormat,
      interest,
      source_landing: sourceLanding === '/ar' ? '/ar' : '/en',
      honeypot: input.honeypot ? String(input.honeypot) : null,
    },
  };
}

/** Supabase Auth refuses passwords longer than 72 bytes (bcrypt). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/**
 * Whether a chosen password is acceptable for a new trial account.
 * @param {string} password
 * @returns {boolean}
 */
export function isAcceptablePassword(password) {
  const value = String(password ?? '');
  return value.length >= PASSWORD_MIN && new TextEncoder().encode(value).length <= PASSWORD_MAX;
}
