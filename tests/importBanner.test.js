import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import App from '../src/App.jsx';
import { createI18n } from '../src/lib/i18n.js';
import { BANNER_KIND, banner, renderImportBanner } from '../src/lib/importBanner.js';

const en = createI18n('en').t;
const ar = createI18n('ar').t;

describe('rendering a banner descriptor', () => {
  it('renders nothing for nothing', () => {
    expect(renderImportBanner(null, en)).toBeNull();
    expect(renderImportBanner(undefined, en)).toBeNull();
  });

  it('renders the demo banner in both languages', () => {
    const descriptor = banner(BANNER_KIND.DEMO_LOADED, 'success', {
      validRecords: 27, invalidRecords: 0, duplicateGroups: 1, requirementRows: 26,
    });
    const english = renderImportBanner(descriptor, en);
    expect(english.title).toBe('Demo data loaded');
    expect(english.lines[0]).toContain('27 valid records');
    expect(english.lines[1]).toContain('26 rows loaded');

    const arabic = renderImportBanner(descriptor, ar);
    expect(arabic.title).toBe('تم تحميل البيانات التجريبية');
    expect(arabic.lines[0]).toContain('27');
    expect(arabic.lines[0]).not.toMatch(/valid records/);
    expect(arabic.lines[1]).toContain('صفًا محمَّلًا');
  });

  it('renders the legacy import result, keeping the importer warnings', () => {
    const rendered = renderImportBanner(
      banner(BANNER_KIND.IMPORT_SUCCESS, 'warning', {
        validRecords: 10, invalidRecords: 2, duplicateGroups: 0, warnings: ['row 4: date out of range'],
      }),
      en,
    );
    expect(rendered.title).toBe('Import successful');
    expect(rendered.lines).toHaveLength(2);
    expect(rendered.lines[1]).toBe('row 4: date out of range');
  });

  it('renders the requirements banner with a translated title', () => {
    expect(renderImportBanner(banner(BANNER_KIND.REQUIREMENTS_LOADED, 'success', { rows: 26 }), en).title)
      .toBe('Requirements loaded — 26 rows loaded');
    expect(renderImportBanner(banner(BANNER_KIND.REQUIREMENTS_LOADED, 'success', { rows: 26 }), ar).title)
      .toContain('تم تحميل المتطلبات');
  });

  it('renders the matrix and production banners', () => {
    const matrix = renderImportBanner(
      banner(BANNER_KIND.MATRIX_APPROVED, 'success', { importedRecords: 5, skippedNoEvidence: 1, requirementRows: 3 }),
      en,
    );
    expect(matrix.lines[0]).toContain('5 training records imported');

    const approved = renderImportBanner(
      banner(BANNER_KIND.PRODUCTION_APPROVED, 'success', {
        rowsNew: 1570, changed: 0, unchanged: 0, organizationCode: 'TST-ORG',
      }),
      ar,
    );
    expect(approved.title).toBe('تم اعتماد الحزمة');
    expect(approved.lines[1]).toContain('TST-ORG');

    const blocked = renderImportBanner(banner(BANNER_KIND.PRODUCTION_BLOCKED, 'error', { blocking: 3 }), en);
    expect(blocked.lines[0]).toContain('3');
  });

  it('renders the short banners and passes an error through untranslated', () => {
    expect(renderImportBanner(banner(BANNER_KIND.TRIAL_BLOCKED, 'warning'), en).title)
      .toMatch(/the trial has ended/i);
    expect(renderImportBanner(banner(BANNER_KIND.DATA_RESET, 'success'), ar).title).toBe('تم مسح البيانات');
    const failed = renderImportBanner(banner(BANNER_KIND.IMPORT_ERROR, 'error', { errors: ['boom'] }), en);
    expect(failed.title).toBe('Import failed');
    expect(failed.lines).toEqual(['boom']);
  });

  it('passes a one-off banner through unchanged', () => {
    const oneOff = { type: 'info', title: 'Anything', lines: ['x'] };
    expect(renderImportBanner(oneOff, en)).toBe(oneOff);
    expect(renderImportBanner({ kind: 'nope' }, en)).toBeNull();
  });

  it('carries numbers and codes only — never a name or a file path', () => {
    const descriptor = banner(BANNER_KIND.PRODUCTION_APPROVED, 'success', {
      rowsNew: 1, changed: 0, unchanged: 0, organizationCode: 'TST-ORG',
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    for (const [key, value] of Object.entries(descriptor)) {
      if (['kind', 'type', 'organizationCode'].includes(key)) continue;
      expect(typeof value, key).toBe('number');
    }
  });
});

describe('a banner follows the language inside the app', () => {
  beforeEach(() => {
    const demoFile = (name) => readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8');
    globalThis.fetch = vi.fn(async (url) =>
      new Response(
        demoFile(String(url).includes('requirements') ? 'sample-requirements.csv' : 'sample-training-data.csv'),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // The demo button is queried by its exact accessible name. The welcome
  // screen offers the same action as a card whose name also carries its
  // description, so a substring match finds both controls.
  const renderApp = () =>
    render(createElement(App, { now: () => '2027-01-11T08:00:00.000Z', newBatchId: () => 'LOCAL-TEST-0001' }));

  it('rewrites the demo banner when the language changes', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Load Demo Data' }));
    expect(await screen.findByText('Demo data loaded', {}, { timeout: 5000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Arabic' }));
    expect(screen.getByText('تم تحميل البيانات التجريبية')).toBeInTheDocument();
    expect(screen.queryByText('Demo data loaded')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Switch to English|التبديل/i }));
    expect(screen.getByText('Demo data loaded')).toBeInTheDocument();
  });

  it('rewrites the requirements banner, which used to be English only', async () => {
    renderApp();
    const requirementsInput = document.querySelectorAll('input[type=file]')[1];
    const csv = new File(
      [readFileSync(resolve(process.cwd(), 'public/data/sample-requirements.csv'), 'utf8')],
      'requirements.csv',
      { type: 'text/csv' },
    );
    Object.defineProperty(requirementsInput, 'files', { value: [csv], configurable: true });
    fireEvent.change(requirementsInput);

    expect(await screen.findByText(/Requirements loaded —/, {}, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Arabic' }));
    await waitFor(() => expect(screen.getByText(/تم تحميل المتطلبات/)).toBeInTheDocument());
    expect(screen.queryByText(/Requirements loaded —/)).toBeNull();
  });

  it('rewrites the reset banner', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Load Demo Data' }));
    await screen.findByText('Demo data loaded', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /Reset Data/i }));
    expect(await screen.findByText('Data cleared')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Arabic' }));
    expect(screen.getByText('تم مسح البيانات')).toBeInTheDocument();
  });

  it('leaves no hard-coded English sentence in the banner path', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    // Every banner goes through a descriptor; no finished sentence is built here.
    expect(source).not.toMatch(/Requirements loaded —/);
    expect(source).not.toMatch(/`Training: \$\{/);
    expect(source).not.toContain('showBanner(');
  });
});
