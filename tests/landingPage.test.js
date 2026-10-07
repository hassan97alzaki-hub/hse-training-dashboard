import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import { scanRelease, FORBIDDEN_CONTENT, ALLOWED_DATA_FILES } from '../scripts/build-trial-release.mjs';

const HTML = readFileSync(resolve(process.cwd(), 'landing/index.html'), 'utf8');

/** Load the landing page into the jsdom document and run its script. */
function mountLanding() {
  document.documentElement.innerHTML = HTML.replace(/^[\s\S]*?<html[^>]*>/i, '').replace(/<\/html>\s*$/i, '');
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
  const source = HTML.slice(HTML.lastIndexOf('<script>') + 8, HTML.lastIndexOf('</script>'));
  // eslint-disable-next-line no-new-func
  new Function(source)();
}

describe('the landing page as a file', () => {
  it('is Arabic first and right to left', () => {
    expect(HTML).toMatch(/<html lang="ar" dir="rtl">/);
    expect(HTML).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1"/);
    expect(HTML).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  });

  it('is self-contained: no script, style, font or image from anywhere else', () => {
    expect(HTML).not.toMatch(/<script[^>]+src=/i);
    expect(HTML).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(HTML).not.toMatch(/@import\s+url\(/i);
    expect(HTML).not.toMatch(/<img[^>]+src=["']https?:/i);
    expect(HTML).not.toMatch(/<iframe/i);
  });

  it('collects nothing and sends nothing', () => {
    const packed = HTML.replace(/\s/g, '');
    expect(packed).not.toContain(['fet', 'ch('].join(''));
    expect(packed).not.toContain('XMLHttpRequest');
    expect(packed).not.toContain('navigator.sendBeacon');
    expect(HTML).not.toMatch(/<form[\s>]/i);
    expect(HTML).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(HTML).not.toMatch(/googletagmanager|google-analytics|gtag\(|plausible|matomo|hotjar/i);
  });

  it('carries no real contact detail and no personal path', () => {
    expect(HTML).not.toMatch(/mailto:[^"'\s]+@[^"'\s]+/);
    expect(HTML).not.toMatch(/@(gmail|hotmail|outlook|yahoo|icloud)\./i);
    expect(HTML).not.toMatch(/\+966\s?\d/);
    expect(HTML).not.toContain(['/Us', 'ers/'].join(''));
    expect(HTML.toLowerCase()).not.toContain(['hassan', 'ali'].join(''));
  });

  it('claims nothing that is not built', () => {
    // Each of these may appear only where the page denies having it, or where
    // it names the reader it does not serve yet ("من يحتاج …").
    const DENIAL = /لا |غير منفَّذ|لا تناسب|من يحتاج|not built|no /i;
    for (const claim of [/حسابات/g, /تنبيهات/g, /واتساب/g, /سحاب/g]) {
      for (const match of HTML.matchAll(claim)) {
        const around = HTML.slice(Math.max(0, match.index - 200), match.index + 200);
        expect(around, match[0]).toMatch(DENIAL);
      }
    }
    // No customer counts, no return-on-investment promise.
    expect(HTML).not.toMatch(/\d+\s*(عميل|عملاء|شركة تثق|customers trust)/i);
    expect(HTML).not.toMatch(/\bROI\b|وفّر \d+%|يوفر \d+%|save \d+%/i);
  });

  it('states the privacy position and the hosting-side gate', () => {
    expect(HTML).toMatch(/يُقرأ الملف داخل متصفحك/);
    expect(HTML).toMatch(/الإغلاق الفعلي للوصول يتم من جهة الاستضافة/);
    expect(HTML).toMatch(/read inside your browser/i);
  });

  it('has every required section', () => {
    for (const id of ['problem', 'how', 'features', 'privacy', 'trial', 'fit', 'faq', 'request']) {
      expect(HTML, id).toMatch(new RegExp(`id="${id}"`));
    }
  });
});

describe('the landing page in a browser', () => {
  beforeEach(mountLanding);
  afterEach(() => {
    document.documentElement.innerHTML = '';
  });

  it('starts in Arabic and switches the whole page to English', () => {
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    const headline = document.querySelector('[data-i18n="heroTitle"]');
    expect(headline.textContent).toMatch(/اعرف من انتهت شهادته/);

    document.getElementById('lang-toggle').click();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(headline.textContent).toMatch(/Know whose certificate has expired/);
    expect(document.getElementById('lang-toggle').textContent).toBe('عربي');
  });

  it('switches back to Arabic with the original text', () => {
    const headline = document.querySelector('[data-i18n="heroTitle"]');
    const arabic = headline.textContent;
    document.getElementById('lang-toggle').click();
    document.getElementById('lang-toggle').click();
    expect(document.documentElement.dir).toBe('rtl');
    expect(headline.textContent).toBe(arabic);
  });

  it('translates every marked node in both directions', () => {
    const nodes = [...document.querySelectorAll('[data-i18n]')];
    expect(nodes.length).toBeGreaterThan(40);
    const arabic = nodes.map((el) => el.textContent);
    document.getElementById('lang-toggle').click();
    const english = nodes.map((el) => el.textContent);
    // Nothing is left empty, and the page really changes.
    expect(english.every((text) => text.trim().length > 0)).toBe(true);
    expect(english.filter((text, i) => text !== arabic[i]).length).toBeGreaterThan(35);
  });

  it('offers a request body in both languages, with the redaction warning', () => {
    const pre = document.getElementById('request-text');
    expect(pre.textContent).toMatch(/طلب تجربة 7 أيام/);
    expect(pre.textContent).toMatch(/لا ترسل أسماء موظفين/);
    document.getElementById('lang-toggle').click();
    expect(pre.textContent).toMatch(/7-day trial request/);
    expect(pre.textContent).toMatch(/Do not send employee names/);
    // The owner is asked for by role, never by name.
    expect(pre.textContent).toMatch(/job role, not a personal name/i);
  });

  it('keeps every control reachable and labelled', () => {
    const toggle = document.getElementById('lang-toggle');
    expect(toggle.getAttribute('aria-label')).toBeTruthy();
    expect(toggle.tagName).toBe('BUTTON');
    for (const id of ['copy-request', 'print-request']) {
      const button = document.getElementById(id);
      expect(button.tagName, id).toBe('BUTTON');
      expect(button.textContent.trim().length, id).toBeGreaterThan(0);
    }
    // A status region reports the result of copying.
    expect(document.getElementById('copy-state').getAttribute('aria-live')).toBe('polite');
    // Every FAQ entry is a native disclosure, so the keyboard reaches it.
    expect(document.querySelectorAll('details > summary').length).toBeGreaterThan(5);
  });

  it('honours reduced motion and prints without the controls', () => {
    expect(HTML).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(HTML).toMatch(/@media print[\s\S]*?\.cta, \.no-print \{ display: none/);
  });
});

describe('the release guard', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hse-release-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const put = (name, content) => {
    const file = join(dir, name);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
  };

  it('accepts a clean release', () => {
    put('app/index.html', '<!doctype html><title>ok</title>');
    put('app/data/sample-training-data.csv', 'Employee_ID\nTST-0001\n');
    put('landing/index.html', '<!doctype html><title>ok</title>');
    expect(scanRelease(dir)).toEqual([]);
  });

  it('refuses a home path, an account name and a real email domain', () => {
    put('app/a.js', `const p = '${['/Us', 'ers/'].join('')}someone/file';`);
    put('app/b.js', `// ${['hassan', 'ali'].join('')}`);
    put('app/c.js', "const mail = 'someone@gmail.com';");
    const problems = scanRelease(dir);
    expect(problems.join(' | ')).toMatch(/home path/);
    expect(problems.join(' | ')).toMatch(/account name/);
    expect(problems.join(' | ')).toMatch(/real email domain/);
  });

  it('refuses secrets', () => {
    put('app/a.js', 'const key = "AKIAIOSFODNN7EXAMPLE";');
    put('app/b.js', 'const apiKey = "abcdefghijklmnopqrstuvwxyz";');
    put('app/c.txt', '-----BEGIN RSA PRIVATE KEY-----');
    const problems = scanRelease(dir).join(' | ');
    expect(problems).toMatch(/aws key id/);
    expect(problems).toMatch(/generic secret assignment/);
    expect(problems).toMatch(/private key/);
  });

  it('refuses an environment file, node_modules and git metadata', () => {
    put('.env.trial', 'VITE_TRIAL_MODE=true');
    put('node_modules/x/index.js', 'module.exports = 1;');
    put('.git/config', '[core]');
    const problems = scanRelease(dir).join(' | ');
    expect(problems).toMatch(/environment file/);
    expect(problems).toMatch(/node_modules/);
    expect(problems).toMatch(/git metadata/);
  });

  it('refuses a data file that is not part of the demonstration set', () => {
    put('app/data/customer-employees.csv', 'Employee_ID\nREAL-1\n');
    expect(scanRelease(dir).join(' | ')).toMatch(/not part of the shipped demonstration set/);
    expect([...ALLOWED_DATA_FILES]).toContain('sample-training-data.csv');
  });

  it('names every rule it enforces', () => {
    const names = FORBIDDEN_CONTENT.map((rule) => rule.name);
    expect(names).toContain('home path');
    expect(names).toContain('account name');
    expect(names).toContain('private key');
    expect(names).toContain('real email domain');
  });
});
