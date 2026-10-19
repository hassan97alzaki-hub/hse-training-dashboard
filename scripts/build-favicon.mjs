#!/usr/bin/env node

/**
 * Renders `public/favicon.ico` from `public/favicon.svg`.
 *
 * The SVG icon is what every current browser uses, but a bare request for
 * `/favicon.ico` is still made by crawlers, feed readers, link unfurlers and
 * older browsers, and an unanswered one is a 404 in the server log and in
 * site audits. This script produces that file from the same source art, so
 * the two cannot drift.
 *
 * ImageMagick and rsvg-convert are not available here, and `sips` cannot read
 * SVG, so the rasterising is done by the headless browser that the project
 * already depends on for the social share image.
 *
 * It is generated on demand (`npm run favicon`) and committed, not built on
 * every deploy: the icon changes about never and a headless browser would add
 * tens of seconds to each build.
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 16px is the browser tab, 32px the bookmark bar and most crawler previews.
const SIZES = [16, 32];

const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');

/**
 * Wraps the icon in a page sized exactly to one icon, so the screenshot needs
 * no cropping. The transparent background keeps the icon's own shape.
 */
const pageFor = (size) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { width: ${size}px; height: ${size}px; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style></head>
<body>${svg}</body></html>`;

/**
 * Packs PNG buffers into an ICO container.
 *
 * ICO is a 6-byte header, then one 16-byte directory entry per image, then the
 * image payloads. Storing PNG rather than BMP inside the container is allowed
 * and is read by everything from IE11 onwards, which avoids hand-rolling a
 * BMP encoder for an icon nothing modern actually reads.
 */
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const ENTRY = 16;
  let offset = header.length + images.length * ENTRY;

  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(ENTRY);
    // A 256px side is written as 0; these sizes are small enough not to care.
    entry.writeUInt8(size, 0); // width
    entry.writeUInt8(size, 1); // height
    entry.writeUInt8(0, 2); // palette colours: 0 = truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  const images = [];

  for (const size of SIZES) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    // `load` rather than `networkidle0`: the markup is inlined and requests
    // nothing, and the idle heuristic does not settle on a page this small.
    await page.setContent(pageFor(size), { waitUntil: 'load' });
    const png = await page.screenshot({ type: 'png', omitBackground: true });
    images.push({ size, png: Buffer.from(png) });
  }

  const ico = toIco(images);
  writeFileSync(resolve(root, 'public/favicon.ico'), ico);
  console.log(`wrote public/favicon.ico (${SIZES.join('px, ')}px, ${ico.length} bytes)`);
} finally {
  await browser.close();
}
