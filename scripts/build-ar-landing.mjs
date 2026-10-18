#!/usr/bin/env node

/**
 * Builds the Arabic landing page from the English one.
 *
 * The landing page carries its Arabic translation inline, as a `data-ar`
 * attribute on every translatable element. That used to drive a language
 * toggle in the browser, which meant a crawler only ever saw the English
 * text and the Arabic search terms the page targets were unreachable.
 *
 * This script turns those attributes into a second real page, served from
 * `/ar/`. The English file stays the single source: translate a string by
 * editing its `data-ar` attribute, and the Arabic page follows on the next
 * build. The two pages cannot drift because only one of them is written.
 *
 * Run after `vite build`; writes `dist/ar/index.html`.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SITE = 'https://hse-training-dashboard.vercel.app';

/** The head of the Arabic page. Written for Arabic search, not translated. */
const AR_META = {
  title: 'لوحة متابعة تدريبات السلامة — امتثال بلا عناء',
  description:
    'لوحة مجانية لمتابعة امتثال تدريبات السلامة: تتبّع الشهادات وتواريخ انتهائها واستورد ملف Excel في دقائق. عربي وإنجليزي.',
  ogTitle: 'لوحة متابعة تدريبات السلامة',
  ogDescription: 'تابع امتثال تدريبات السلامة لكل القوى العاملة. مجاني، ثنائي اللغة، يعمل بدون إنترنت.',
};

/**
 * Rewrites the English landing page into Arabic.
 *
 * Exported so the tests can run it on a small fixture instead of the real
 * page, and assert on the result without touching the filesystem.
 */
export function toArabic(html) {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';

  // Each translatable element becomes its Arabic text, and sheds both
  // attributes: the Arabic page has no use for either.
  for (const element of document.querySelectorAll('[data-ar]')) {
    element.textContent = element.dataset.ar;
    element.removeAttribute('data-ar');
    element.removeAttribute('data-en');
  }
  // An element may carry only the English attribute; drop it too, so the
  // shipped page holds no leftover translation data.
  for (const element of document.querySelectorAll('[data-en]')) {
    element.removeAttribute('data-en');
  }

  const set = (selector, attribute, value) => {
    const node = document.querySelector(selector);
    if (node) node.setAttribute(attribute, value);
  };

  document.title = AR_META.title;
  set('meta[name="description"]', 'content', AR_META.description);
  set('meta[property="og:title"]', 'content', AR_META.ogTitle);
  set('meta[property="og:description"]', 'content', AR_META.ogDescription);
  set('meta[property="og:url"]', 'content', `${SITE}/ar/`);
  set('meta[property="og:locale"]', 'content', 'ar_SA');
  set('meta[property="og:locale:alternate"]', 'content', 'en_US');
  // Each page is canonical for itself; the hreflang cluster, which is
  // identical and reciprocal on both pages, carries the relationship.
  set('link[rel="canonical"]', 'href', `${SITE}/ar/`);

  // The toggle points back at the English page.
  const toggle = document.getElementById('langBtn');
  if (toggle) {
    toggle.textContent = 'English';
    toggle.setAttribute('href', '/');
    toggle.setAttribute('hreflang', 'en');
    toggle.setAttribute('lang', 'en');
  }

  return `<!DOCTYPE html>\n${document.documentElement.outerHTML}\n`;
}

function main() {
  const source = readFileSync(resolve(root, 'public/landing.html'), 'utf8');
  const outDir = resolve(root, 'dist/ar');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'index.html'), toArabic(source));
  console.log('wrote dist/ar/index.html');
}

if (process.argv[1] && process.argv[1].endsWith('build-ar-landing.mjs')) main();

export { AR_META, SITE };
