#!/usr/bin/env node

/**
 * Renders the social share image, `public/og-image.png`.
 *
 * LinkedIn, WhatsApp and X all read `og:image` when a link is pasted, and a
 * link with no image gets a plain grey card. The image is drawn here from
 * HTML rather than designed in a graphics tool so that it can be re-rendered
 * from a text diff when the wording or the palette changes.
 *
 * It is generated on demand (`npm run og`) and committed, not built on every
 * deploy: the content changes about once a year and a headless browser would
 * add tens of seconds to each build.
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Open Graph crops anything else; 1200x630 is the size every network accepts.
const WIDTH = 1200;
const HEIGHT = 630;

const logo = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');

// The palette is the dashboard's own, so a shared link looks like the product.
const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    background: #0a0e17;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #f3f5f9;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 88px;
    position: relative; overflow: hidden;
  }
  /* A soft brand glow, so the card is not a flat rectangle. */
  body::after {
    content: ''; position: absolute; top: -220px; right: -180px;
    width: 640px; height: 640px; border-radius: 50%;
    background: radial-gradient(circle, rgba(91,124,250,0.28), transparent 68%);
  }
  .mark { width: 96px; height: 96px; margin-bottom: 36px; }
  h1 { font-size: 68px; line-height: 1.12; font-weight: 800; letter-spacing: -1.5px; }
  .accent { color: #5b7cfa; }
  /* The direction property orders the Arabic correctly; the line is still
     aligned with the English headline rather than flung to the far edge. */
  .ar { margin-top: 22px; font-size: 38px; color: #9aa5ba; direction: rtl; text-align: left; font-weight: 600; }
  .rule { width: 96px; height: 6px; background: #5b7cfa; border-radius: 3px; margin: 40px 0 28px; }
  .tags { display: flex; gap: 14px; font-size: 24px; color: #66708a; }
  .tags span { border: 1px solid #232b3d; border-radius: 999px; padding: 8px 20px; }
</style>
</head>
<body>
  <div class="mark">${logo}</div>
  <h1>HSE Training Dashboard<br><span class="accent">Compliance Made Simple</span></h1>
  <div class="ar">لوحة متابعة تدريبات السلامة — امتثال بلا عناء</div>
  <div class="rule"></div>
  <div class="tags"><span>Free 7-day trial</span><span>English + عربي</span><span>Private workspace</span></div>
</body>
</html>`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(resolve(root, 'public/og-image.png'), png);
  console.log(`wrote public/og-image.png (${WIDTH}x${HEIGHT})`);
} finally {
  await browser.close();
}
