import { describe, it, expect } from 'vitest';
import { toTrialRow } from '../src/lib/trialSignup.js';

const valid = {
  companyName: '  Gulf Contracting Co  ',
  workEmail: 'Safety@GulfContracting.com ',
  country: 'SA',
  headcountEstimate: '120',
  fileFormat: 'XLSX',
  interest: ['reminders', 'unknown', 'pricing'],
  honeypot: '',
};

describe('toTrialRow', () => {
  it('builds a row from a valid form, trimming and lowercasing', () => {
    const result = toTrialRow(valid, '/ar');
    expect(result.ok).toBe(true);
    expect(result.row).toEqual({
      company_name: 'Gulf Contracting Co',
      work_email: 'safety@gulfcontracting.com',
      country: 'SA',
      headcount_estimate: 120,
      file_format: 'XLSX',
      interest: ['reminders', 'pricing'],
      source_landing: '/ar',
      honeypot: null,
    });
  });

  it('keeps only the known interests, in their fixed order', () => {
    const result = toTrialRow({ ...valid, interest: ['pricing', 'reports', 'bogus'] }, '/en');
    expect(result.row.interest).toEqual(['reports', 'pricing']);
  });

  it('records the language the form was sent in and defaults to /en', () => {
    expect(toTrialRow(valid, '/ar').row.source_landing).toBe('/ar');
    expect(toTrialRow(valid, '/en').row.source_landing).toBe('/en');
    expect(toTrialRow(valid, undefined).row.source_landing).toBe('/en');
  });

  it('turns optional empty fields into null', () => {
    const result = toTrialRow({ companyName: 'Acme Ltd', workEmail: 'a@acme.com', headcountEstimate: '', fileFormat: '' }, '/en');
    expect(result.row).toMatchObject({ country: null, headcount_estimate: null, file_format: null, interest: [] });
  });

  it('refuses a short company name and a malformed email', () => {
    const result = toTrialRow({ ...valid, companyName: 'A', workEmail: 'not-an-email' }, '/en');
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({ companyName: true, workEmail: true });
    expect(result.row).toBeNull();
  });

  it('refuses a headcount that is not a whole number in range', () => {
    for (const headcountEstimate of ['0', '1.5', '100001', 'many']) {
      expect(toTrialRow({ ...valid, headcountEstimate }, '/en').errors).toHaveProperty('headcountEstimate');
    }
  });

  it('refuses a file format outside CSV and XLSX', () => {
    expect(toTrialRow({ ...valid, fileFormat: 'PDF' }, '/en').errors).toHaveProperty('fileFormat');
  });

  it('warns about free-mail domains without refusing them', () => {
    const result = toTrialRow({ ...valid, workEmail: 'owner@gmail.com' }, '/en');
    expect(result.ok).toBe(true);
    expect(result.freeMail).toBe(true);
  });

  it('passes a filled honeypot through so the table can refuse the row', () => {
    const result = toTrialRow({ ...valid, honeypot: 'http://spam.example' }, '/en');
    expect(result.ok).toBe(true);
    expect(result.row.honeypot).toBe('http://spam.example');
  });
});
