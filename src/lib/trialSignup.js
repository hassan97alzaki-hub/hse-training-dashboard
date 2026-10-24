/**
 * Trial sign-up form: the checks the page runs before it sends a row.
 *
 * The database repeats the length, format and honeypot checks, so a request
 * that skips this module is still refused. Free-mail domains only warn: small
 * companies use them and the form must not turn them away.
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
