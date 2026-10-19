#!/usr/bin/env node

/**
 * Renders `public/dashboard-screenshot.webp` (and a PNG fallback) for the
 * landing page.
 *
 * A visitor who has never used the tool cannot tell from a feature list what
 * the dashboard actually looks like, so the landing page shows it. The shot is
 * taken from the real application rather than mocked up, which means it cannot
 * drift from what a visitor gets when they click through.
 *
 * The data is the project's own demo dataset, loaded through the same button a
 * visitor would use. Nothing here is hand-made: change the demo CSV or the
 * dashboard and re-run this script.
 *
 * It is generated on demand (`npm run screenshot`) and committed, not built on
 * every deploy: the shot changes when the interface does, and a headless
 * browser driving a dev server would add a minute to each build.
 */

import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Wide enough that the KPI row and the table read as a desktop dashboard, and
// a 16:10 frame so the landing page reserves a familiar shape.
const WIDTH = 1600;
const HEIGHT = 1000;

const PORT = 5199;

const server = await createServer({
  root,
  // The screenshot is of the local-only build. Without this, a developer's
  // `.env.local` pointing at a real Supabase project would put the sign-in
  // form in front of the dashboard and the shot would be of the gate.
  envDir: false,
  logLevel: 'warn',
  server: { port: PORT, strictPort: true },
});
await server.listen();

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'networkidle0' });

  // The same control a visitor uses. Its accessible name is shared with the
  // welcome card, so the button is found by its exact text.
  await page.waitForSelector('button');
  const loaded = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === 'Load Demo Data',
    );
    if (!button) return false;
    button.click();
    return true;
  });
  if (!loaded) throw new Error('the Load Demo Data button was not found');

  // The dashboard is ready once the KPI row has rendered from the demo data.
  await page.waitForSelector('.kpi-card, .kpi-card-hero', { timeout: 30000 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 1200))));

  // Frame the shot on the dashboard itself. The top of the page is the import
  // toolbar and the banners that report what was just imported — the part of
  // the screen a visitor passes through once, rather than the part they came
  // to see. Scrolling to the summary puts the numbers and the table in frame.
  await page.evaluate(() => {
    const cards = document.querySelector('.kpi-hero-grid');
    const header = document.querySelector('header');
    if (!cards) return;
    // The header is sticky, so the scroll target has to clear its height or
    // it covers the first row of cards.
    const offset = (header ? header.getBoundingClientRect().height : 0) + 16;
    window.scrollTo({ top: cards.offsetTop - offset, behavior: 'instant' });
  });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 400))));

  const webp = await page.screenshot({ type: 'webp', quality: 82 });
  writeFileSync(resolve(root, 'public/dashboard-screenshot.webp'), webp);

  // PNG for the handful of clients that still do not decode WebP, and for
  // anything that reads the file outside a browser.
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(resolve(root, 'public/dashboard-screenshot.png'), png);

  console.log(
    `wrote public/dashboard-screenshot.webp (${WIDTH}x${HEIGHT}, ${webp.length} bytes)\n` +
      `wrote public/dashboard-screenshot.png  (${WIDTH}x${HEIGHT}, ${png.length} bytes)`,
  );
} finally {
  await browser.close();
  await server.close();
}
