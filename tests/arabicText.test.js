import { describe, it, expect } from 'vitest';
import { shapeArabicLine, containsArabic } from '../src/lib/pdf/arabicText.js';

describe('containsArabic', () => {
  it('detects Arabic letters', () => {
    expect(containsArabic('تقرير')).toBe(true);
  });

  it('is false for Latin text and digits', () => {
    expect(containsArabic('H2S-01')).toBe(false);
    expect(containsArabic('')).toBe(false);
  });
});

describe('shapeArabicLine', () => {
  it('leaves Latin text untouched', () => {
    expect(shapeArabicLine('Compliance 75%')).toBe('Compliance 75%');
  });

  it('joins a dual-joining word and puts it in visual order', () => {
    // بـ + ـيـ + ـت : initial beh, medial yeh, final teh, reversed for display.
    const out = shapeArabicLine('بيت');
    expect(out).toBe('ﺑﻴﺖ'.split('').reverse().join(''));
  });

  it('uses the final form after a right-joining letter', () => {
    // د does not join to the left, so the ا that follows stays isolated.
    const out = shapeArabicLine('دا');
    expect(out).toBe('ﺍﺩ'); // visual order: alef right of dal
  });

  it('builds the lam-alef ligature', () => {
    expect(shapeArabicLine('لا')).toBe('ﻻ');
  });

  it('uses the final lam-alef ligature after a joining letter', () => {
    // سلا : initial seen, then lam-alef in its final form.
    expect(shapeArabicLine('سلا')).toBe('ﻼﺳ');
  });

  it('keeps a Latin run readable inside an Arabic sentence', () => {
    const out = shapeArabicLine('دورة H2S-01 منتهية');
    expect(out).toContain('H2S-01');
  });

  it('keeps digits in logical order', () => {
    const out = shapeArabicLine('نسبة 75%');
    expect(out).toContain('75');
  });

  it('ignores diacritics when deciding joining forms', () => {
    // The fatha between the two letters must not break the join.
    const out = shapeArabicLine('بَت');
    expect(out).toContain('ﺑ'); // initial beh
  });

  it('returns an empty string unchanged', () => {
    expect(shapeArabicLine('')).toBe('');
  });

  it('accepts non-string input without throwing', () => {
    expect(shapeArabicLine(null)).toBe('');
    expect(shapeArabicLine(42)).toBe('42');
  });
});
