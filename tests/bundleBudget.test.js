/**
 * The bundle guard, checked where it is cheap to check.
 *
 * The guard itself runs in CI against a real build. These tests cover the
 * part that decides what counts as the first load, because a parser that
 * silently matches nothing would turn the guard into a check that always
 * passes — the most expensive kind of failure, since nobody looks at a green
 * step again.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initialAssets, BUDGET_BYTES, DEFERRED_LIBRARIES } from '../scripts/check-bundle-budget.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('what counts as the first load', () => {
  const html = `<!doctype html><html><head>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script type="module" crossorigin src="/assets/app-AAA.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/runtime-BBB.js">
    <link rel="stylesheet" crossorigin href="/assets/app-CCC.css">
    </head><body></body></html>`;

  it('takes the entry, its preloads and its stylesheet', () => {
    expect(initialAssets(html)).toEqual([
      '/assets/app-AAA.js',
      '/assets/runtime-BBB.js',
      '/assets/app-CCC.css',
    ]);
  });

  // A chunk behind a dynamic import is requested by the code, not the HTML.
  // If one ever appeared here the guard would be measuring the wrong thing.
  it('leaves out anything the HTML does not ask for', () => {
    expect(initialAssets(html)).not.toContain('/assets/xlsx-DDD.js');
  });

  it('ignores a favicon and other non-asset links', () => {
    expect(initialAssets(html).some((asset) => asset.includes('favicon'))).toBe(false);
  });

  it('counts a repeated asset once', () => {
    const twice = html + '<link rel="modulepreload" href="/assets/runtime-BBB.js">';
    expect(initialAssets(twice).filter((a) => a === '/assets/runtime-BBB.js')).toHaveLength(1);
  });
});

describe('the budget', () => {
  it('is the figure Phase 1 set', () => {
    expect(BUDGET_BYTES).toBe(500 * 1024);
  });

  it('names every library that has been moved out of the first load', () => {
    expect(DEFERRED_LIBRARIES).toEqual(
      expect.arrayContaining(['xlsx', 'recharts', 'jspdf', 'html2canvas']),
    );
  });
});

describe('the deferred libraries, in the source', () => {
  const read = (file) => readFileSync(resolve(root, file), 'utf8');

  // The split only holds while nobody adds the import back at the top of a
  // module. That is a one-line change in review and an invisible one in a
  // diff of fifty files.
  it.each([
    ['src/lib/matrixWorkbook.js'],
    ['src/lib/dataImport.js'],
    ['src/lib/contract/productionPackage.js'],
  ])('%s reaches xlsx through the loader, not a static import', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/^import .*from 'xlsx'/m);
    expect(source).toMatch(/from '\.\.?\/?(lib\/)?xlsx\.js'/);
  });

  it('loads the charting library only with the charts', () => {
    const app = read('src/App.jsx');
    expect(app).not.toMatch(/^import .*from '\.\/components\/Charts\.jsx'/m);
    expect(app).toMatch(/lazy\(\(\) => chartsModule\(\)/);
  });

  it('keeps the charting library out of every other module', () => {
    const charts = read('src/components/Charts.jsx');
    expect(charts).toMatch(/from 'recharts'/);
  });
});
