import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import App from '../src/App.jsx';
import { createI18n } from '../src/lib/i18n.js';
import TestRequirementsBanner from '../src/components/TestRequirementsBanner.jsx';
import {
  REQUIREMENTS_PROVENANCE,
  TEST_PROVENANCES,
  isDerivedRequirement,
  isTestRequirements,
  provenanceMessageKey,
  resolveRequirementsProvenance,
} from '../src/lib/contract/requirementsProvenance.js';
import { getRuntimeAsOfDate } from '../src/lib/clock.js';
import { generateSyntheticFullPackage, addDays } from './fixtures/contract/generateSyntheticPackage.js';

const NOW = '2027-01-11T08:00:00.000Z';
const BATCH_ID = 'LOCAL-TEST-0001';

const approvedRow = { Department: 'OPS', Job_Title: 'OPR', Course_Code: 'H2S-01', Mandatory: true };
const derivedRow = { ...approvedRow, Derived: true };

/* ------------------------------------------------------------------ *
 * The pure resolver
 * ------------------------------------------------------------------ */

describe('requirements provenance', () => {
  it('says none when nothing is loaded', () => {
    for (const rows of [[], undefined, null, 'x']) {
      expect(resolveRequirementsProvenance(rows, REQUIREMENTS_PROVENANCE.APPROVED)).toBe(
        REQUIREMENTS_PROVENANCE.NONE,
      );
    }
  });

  it('keeps the declared source when the rows carry no marker', () => {
    for (const declared of [
      REQUIREMENTS_PROVENANCE.APPROVED,
      REQUIREMENTS_PROVENANCE.DEMO,
      REQUIREMENTS_PROVENANCE.LEGACY,
    ]) {
      expect(resolveRequirementsProvenance([approvedRow], declared), declared).toBe(declared);
    }
  });

  it('lets a derived row win over any declaration', () => {
    for (const declared of Object.values(REQUIREMENTS_PROVENANCE)) {
      expect(resolveRequirementsProvenance([approvedRow, derivedRow], declared), declared).toBe(
        REQUIREMENTS_PROVENANCE.DERIVED,
      );
    }
    expect(isDerivedRequirement(derivedRow)).toBe(true);
    expect(isDerivedRequirement(approvedRow)).toBe(false);
    expect(isDerivedRequirement(undefined)).toBe(false);
  });

  it('treats rows with an unknown or missing declaration as legacy', () => {
    expect(resolveRequirementsProvenance([approvedRow], 'something-else')).toBe(
      REQUIREMENTS_PROVENANCE.LEGACY,
    );
    expect(resolveRequirementsProvenance([approvedRow], REQUIREMENTS_PROVENANCE.NONE)).toBe(
      REQUIREMENTS_PROVENANCE.LEGACY,
    );
  });

  it('marks every non-approved provenance as test data', () => {
    expect(TEST_PROVENANCES).toEqual(['draft', 'derived', 'demo', 'legacy']);
    for (const provenance of TEST_PROVENANCES) expect(isTestRequirements(provenance)).toBe(true);
    expect(isTestRequirements(REQUIREMENTS_PROVENANCE.APPROVED)).toBe(false);
    expect(isTestRequirements(REQUIREMENTS_PROVENANCE.NONE)).toBe(false);
    expect(provenanceMessageKey(REQUIREMENTS_PROVENANCE.APPROVED)).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * The component
 * ------------------------------------------------------------------ */

describe('the banner component', () => {
  afterEach(cleanup);

  const renderBanner = (provenance, lang = 'en') => {
    const { t } = createI18n(lang);
    return render(createElement(TestRequirementsBanner, { provenance, t }));
  };

  it('renders nothing for approved requirements or for none', () => {
    for (const provenance of [REQUIREMENTS_PROVENANCE.APPROVED, REQUIREMENTS_PROVENANCE.NONE, undefined]) {
      const { container } = renderBanner(provenance);
      expect(container.innerHTML, String(provenance)).toBe('');
      cleanup();
    }
  });

  it('explains each test provenance in English', () => {
    const expected = {
      derived: /derived from the department-level mapping/i,
      demo: /demonstration dataset/i,
      legacy: /legacy CSV/i,
    };
    for (const [provenance, pattern] of Object.entries(expected)) {
      renderBanner(provenance);
      const banner = screen.getByTestId('test-requirements-banner');
      expect(banner, provenance).toHaveAttribute('data-provenance', provenance);
      expect(banner.textContent, provenance).toMatch(pattern);
      expect(banner.textContent, provenance).toMatch(/not approved production requirements/i);
      expect(banner.textContent, provenance).toMatch(/Do not present it as a compliance result/i);
      cleanup();
    }
  });

  it('explains each test provenance in Arabic', () => {
    const expected = {
      derived: /ربط على مستوى القسم/,
      demo: /البيانات التجريبية/,
      legacy: /ملف CSV قديم/,
    };
    for (const [provenance, pattern] of Object.entries(expected)) {
      renderBanner(provenance, 'ar');
      const banner = screen.getByTestId('test-requirements-banner');
      expect(banner.textContent, provenance).toMatch(pattern);
      expect(banner.textContent, provenance).toMatch(/ليست متطلبات إنتاج معتمدة/);
      cleanup();
    }
  });

  it('is announced to assistive technology', () => {
    renderBanner(REQUIREMENTS_PROVENANCE.DERIVED);
    const banner = screen.getByTestId('test-requirements-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status', { name: /Test requirements loaded/i })).toBe(banner);
  });
});

/* ------------------------------------------------------------------ *
 * Inside the app
 * ------------------------------------------------------------------ */

function productionBytes() {
  const asOf = getRuntimeAsOfDate();
  const pkg = generateSyntheticFullPackage({
    employeeCount: 6,
    asOfDate: asOf,
    extractDate: addDays(asOf, -2),
    requirementsEffectiveFrom: addDays(asOf, -30),
  });
  const workbook = XLSX.utils.book_new();
  const sheets = {
    _Contract: [pkg.contract],
    Departments: pkg.departments,
    Job_Titles: pkg.jobTitles,
    Employees: pkg.employees,
    Courses: pkg.courses,
    Requirements: pkg.requirements,
    Training_Records: pkg.trainingRecords,
  };
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function matrixBytes() {
  // A valid three-sheet Training Matrix workbook: the legacy test path.
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        Employee_ID: 'LGE-0001', Badge: 'LG-0001', Name: 'Legacy One', Department: 'Operations',
        Role: 'Operator', Join_Date: '2024-01-01', Status: 'Active',
      },
    ]),
    'Employees',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { Course_ID: 'K01', Course_Name: 'Legacy Course', Validity_Months: 24, Departments: 'Operations' },
    ]),
    'Courses',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        Employee_ID: 'LGE-0001', Badge: 'LG-0001', Name: 'Legacy One', Department: 'Operations',
        Course_ID: 'K01', Course_Name: 'Legacy Course', Completion_Date: '2025-01-01',
        Expiry_Date: '2027-01-01', Status: 'Valid', Certificate_Number: 'LG-CERT-0001',
      },
    ]),
    'Training_Records',
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const trainingInput = () => document.querySelectorAll('input[type=file]')[0];
const requirementsInput = () => document.querySelectorAll('input[type=file]')[1];

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

const renderApp = () => render(createElement(App, { now: () => NOW, newBatchId: () => BATCH_ID }));

describe('the banner inside the app', () => {
  beforeEach(() => {
    // The demo loader fetches the real sample files of `public/data`; they are
    // read from disk so the stub stays faithful to the shipped demo data.
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

  it('shows nothing before any data is loaded', () => {
    renderApp();
    expect(screen.queryByTestId('test-requirements-banner')).toBeNull();
  });

  it('warns after the demo dataset is loaded', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Load Demo Data' }));
    const banner = await screen.findByTestId('test-requirements-banner', {}, { timeout: 5000 });
    expect(banner).toHaveAttribute('data-provenance', 'demo');
  });

  it('warns after the legacy Training Matrix workbook is approved', async () => {
    renderApp();
    selectFile(trainingInput(), new File([matrixBytes()], 'legacy-matrix.xlsx'));
    await screen.findByTestId('matrix-preview', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /Approve import/i }));
    const banner = await screen.findByTestId('test-requirements-banner', {}, { timeout: 5000 });
    expect(banner).toHaveAttribute('data-provenance', 'derived');
    expect(banner.textContent).toMatch(/not job-title-specific|not approved production requirements/i);
  });

  it('warns after a legacy requirements CSV is loaded', async () => {
    renderApp();
    selectFile(
      trainingInput(),
      new File(
        [readFileSync(resolve(process.cwd(), 'public/data/sample-training-data.csv'), 'utf8')],
        'legacy-training.csv',
        { type: 'text/csv' },
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('production-preview')).toBeNull());
    selectFile(
      requirementsInput(),
      new File(
        [readFileSync(resolve(process.cwd(), 'public/data/sample-requirements.csv'), 'utf8')],
        'legacy-requirements.csv',
        { type: 'text/csv' },
      ),
    );
    const banner = await screen.findByTestId('test-requirements-banner', {}, { timeout: 5000 });
    expect(banner).toHaveAttribute('data-provenance', 'legacy');
  });

  it('shows no banner after an approved HSE-DC-1.0 package', async () => {
    renderApp();
    selectFile(trainingInput(), new File([productionBytes()], 'production.xlsx'));
    await screen.findByTestId('production-preview', {}, { timeout: 5000 });
    fireEvent.change(screen.getByTestId('pp-approver-role'), { target: { value: 'Training Manager' } });
    fireEvent.click(screen.getByTestId('pp-approve'));
    await waitFor(() => expect(screen.queryByTestId('production-preview')).toBeNull(), { timeout: 5000 });
    expect(await screen.findByText(/Package approved/)).toBeInTheDocument();
    expect(screen.queryByTestId('test-requirements-banner')).toBeNull();
  });

  it('brings the banner back when a legacy path follows an approved package', async () => {
    renderApp();
    selectFile(trainingInput(), new File([productionBytes()], 'production.xlsx'));
    await screen.findByTestId('production-preview', {}, { timeout: 5000 });
    fireEvent.change(screen.getByTestId('pp-approver-role'), { target: { value: 'Training Manager' } });
    fireEvent.click(screen.getByTestId('pp-approve'));
    await waitFor(() => expect(screen.queryByTestId('production-preview')).toBeNull(), { timeout: 5000 });
    expect(screen.queryByTestId('test-requirements-banner')).toBeNull();

    selectFile(trainingInput(), new File([matrixBytes()], 'legacy-matrix.xlsx'));
    await screen.findByTestId('matrix-preview', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /Approve import/i }));
    const banner = await screen.findByTestId('test-requirements-banner', {}, { timeout: 5000 });
    expect(banner).toHaveAttribute('data-provenance', 'derived');
  });

  it('keeps the data when the reset confirmation is declined', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Load Demo Data' }));
    await screen.findByTestId('test-requirements-banner', {}, { timeout: 5000 });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: /Reset Data/i }));
    expect(screen.getByTestId('test-requirements-banner')).toBeInTheDocument();
  });

  it('clears the banner on reset', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Load Demo Data' }));
    await screen.findByTestId('test-requirements-banner', {}, { timeout: 5000 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Reset Data/i }));
    await waitFor(() => expect(screen.queryByTestId('test-requirements-banner')).toBeNull());
  });
});
