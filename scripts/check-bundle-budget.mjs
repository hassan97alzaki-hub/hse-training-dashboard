#!/usr/bin/env node

/**
 * Fails the build when the first load grows past its budget.
 *
 * The dashboard is opened on site connections that are not always good, and a
 * bundle grows by one import at a time with nobody noticing until it is slow.
 * This measures what a visitor downloads before anything renders, in the
 * encoding a CDN actually serves, and refuses a build that crosses the line.
 *
 * "First load" is the entry script, its stylesheet, and every chunk the entry
 * statically imports — which is precisely what the built HTML asks for in its
 * script, stylesheet and modulepreload tags. A chunk reached through a
 * dynamic import is not in there, which is the whole point of splitting one
 * out.
 *
 * Brotli, because that is what Vercel serves and because comparing a raw byte
 * count against a compressed budget is how a target gets declared met while
 * the download gets worse.
 *
 * Run after `npm run build`:  npm run check:bundle
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

// 500KB is the figure Phase 1 set. The build measured 287.7KB when the budget
// was introduced, so there is room to grow — the line is here to catch a jump,
// not to make every change a negotiation.
export const BUDGET_BYTES = 500 * 1024;

// Libraries that must stay behind a dynamic import. Each is large, each is
// used by one path, and each has been moved out deliberately; a static import
// added later would quietly undo that.
export const DEFERRED_LIBRARIES = ['xlsx', 'recharts', 'jspdf', 'html2canvas'];

/**
 * The assets the built HTML asks the browser for before it renders: the entry
 * module, the stylesheet, and the chunks preloaded alongside them.
 *
 * @param {string} html
 * @returns {string[]} asset paths, as written in the HTML
 */
export function initialAssets(html) {
  const assets = [];
  const add = (path) => {
    if (path && path.startsWith('/assets/') && !assets.includes(path)) assets.push(path);
  };

  for (const [, src] of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) add(src);
  for (const [, href] of html.matchAll(/<link[^>]*\srel="modulepreload"[^>]*\shref="([^"]+)"/g)) add(href);
  for (const [, href] of html.matchAll(/<link[^>]*\srel="stylesheet"[^>]*\shref="([^"]+)"/g)) add(href);

  return assets;
}

const brotli = (buffer) =>
  brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

function main() {
  const entry = resolve(dist, 'app.html');
  if (!existsSync(entry)) {
    console.error('No dist/app.html. Run `npm run build` first.');
    process.exit(2);
  }

  const assets = initialAssets(readFileSync(entry, 'utf8'));
  if (assets.length === 0) {
    console.error('Found no entry assets in dist/app.html. The check cannot be trusted; not passing it.');
    process.exit(2);
  }

  let total = 0;
  const rows = [];
  for (const asset of assets) {
    const file = resolve(dist, asset.replace(/^\//, ''));
    const raw = readFileSync(file);
    const size = brotli(raw);
    total += size;
    rows.push([asset, statSync(file).size, size]);
  }

  for (const [asset, raw, size] of rows) {
    console.log(`${asset.padEnd(44)} ${String(raw).padStart(9)} raw  ${String(size).padStart(8)} brotli`);
  }
  console.log(
    `\nfirst load: ${(total / 1024).toFixed(1)}KB brotli of a ${(BUDGET_BYTES / 1024).toFixed(0)}KB budget`,
  );

  const failures = [];
  if (total > BUDGET_BYTES) {
    failures.push(
      `the first load is ${(total / 1024).toFixed(1)}KB, over the ${(BUDGET_BYTES / 1024).toFixed(0)}KB budget by ` +
        `${((total - BUDGET_BYTES) / 1024).toFixed(1)}KB`,
    );
  }

  // A library is "in the first load" when its code sits in one of the chunks
  // the HTML preloads. Its own split chunk is named after it, so a name match
  // on the initial assets is enough to spot the regression.
  for (const library of DEFERRED_LIBRARIES) {
    const inInitial = assets.some((asset) => asset.includes(`/${library}-`) || asset.includes(`/${library}.`));
    if (inInitial) {
      failures.push(`${library} is in the first load; it is meant to be behind a dynamic import`);
    }
  }

  if (failures.length) {
    console.error('\nBundle budget failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('Within budget.');
}

if (process.argv[1] && process.argv[1].endsWith('check-bundle-budget.mjs')) main();
