import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import * as XLSX from 'xlsx';

import App from '../src/App.jsx';
import { defaultBatchId, BATCH_ID_PATTERN } from '../src/lib/localBatch.js';
import { getRuntimeAsOfDate } from '../src/lib/clock.js';
import { generateSyntheticFullPackage, addDays } from './fixtures/contract/generateSyntheticPackage.js';

/**
 * Integration of the production import with the interface, and the rule that
 * every legacy path drops the production organization binding.
 *
 * Nothing here reads the real clock for a batch: `now` and `newBatchId` are
 * injected, so the assertions stay deterministic.
 */

const NOW = '2027-01-11T08:00:00.000Z';
const BATCH_ID = 'LOCAL-TEST-0001';

/** A production package whose dates fit the runtime As Of Date of the app. */
function productionBytes({ employeeCount = 6, packageType = 'full' } = {}) {
  const asOf = getRuntimeAsOfDate();
  const pkg = generateSyntheticFullPackage({
    employeeCount,
    asOfDate: asOf,
    extractDate: addDays(asOf, -2),
    requirementsEffectiveFrom: addDays(asOf, -30),
  });
  const sheets =
    packageType === 'full'
      ? {
          _Contract: [pkg.contract],
          Departments: pkg.departments,
          Job_Titles: pkg.jobTitles,
          Employees: pkg.employees,
          Courses: pkg.courses,
          Requirements: pkg.requirements,
          Training_Records: pkg.trainingRecords,
        }
      : {
          _Contract: [{ ...pkg.contract, package_type: 'training', requirements_effective_from: '' }],
          Training_Records: pkg.trainingRecords,
        };
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/** The legacy three-sheet Training Matrix workbook. */
function matrixBytes() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { Badge: 'LG-0001', Name: 'Legacy One', Department: 'Operations', Position: 'Operator', Status: 'Active' },
    ]),
    'Employees',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ Course_Code: 'K01', Course_Name: 'Legacy Course', Departments: 'Operations', Validity_Months: 24 }]),
    'Courses',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { Badge: 'LG-0001', Course_Code: 'K01', Issue_Date: '2025-01-01', Expiry_Date: '2027-01-01', Status: 'Valid' },
    ]),
    'Training',
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function fileFrom(bytes, name) {
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const trainingInput = () => document.querySelectorAll('input[type=file]')[0];
const requirementsInput = () => document.querySelectorAll('input[type=file]')[1];

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

async function importProduction(options) {
  selectFile(trainingInput(), fileFrom(productionBytes(options), 'production.xlsx'));
  await screen.findByTestId('production-preview', {}, { timeout: 5000 });
}

async function approveProduction() {
  fireEvent.change(screen.getByTestId('pp-approver-role'), { target: { value: 'Training Manager' } });
  fireEvent.click(screen.getByTestId('pp-approve'));
  await waitFor(() => expect(screen.queryByTestId('production-preview')).toBeNull(), { timeout: 5000 });
}

function renderApp() {
  return render(createElement(App, { now: () => NOW, newBatchId: () => BATCH_ID }));
}

/**
 * Proof that no organization is bound any more: a partial package needs a
 * binding, so it must be refused with ORG_NOT_LOADED.
 */
async function expectNoOrganizationBound() {
  selectFile(trainingInput(), fileFrom(productionBytes({ packageType: 'training' }), 'training-only.xlsx'));
  await screen.findByTestId('production-preview', {}, { timeout: 5000 });
  fireEvent.click(screen.getByTestId('pp-details-toggle'));
  const details = await screen.findByTestId('pp-details');
  expect(details.textContent).toContain('ORG_NOT_LOADED');
  expect(screen.getByTestId('pp-approve')).toBeDisabled();
  fireEvent.click(screen.getByTestId('pp-cancel'));
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('training')) {
      return new Response(
        'Employee_ID,Employee_Name,Department,Job_Title,Employment_Status,Course_Code,Course_Name,Completion_Status,Issue_Date,Expiry_Date\nDM-0001,Demo One,Operations,Operator,Active,K01,Demo Course,Completed,2025-01-01,2028-01-01\n',
        { status: 200 },
      );
    }
    return new Response(
      'Department,Job_Title,Course_Code,Course_Name,Mandatory,Validity_Months\nOperations,Operator,K01,Demo Course,Yes,24\n',
      { status: 200 },
    );
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('production import inside the app', () => {
  it('shows the preview for an HSE-DC-1.0 package and approves it', async () => {
    renderApp();
    await importProduction();
    expect(screen.getByText('TST-ORG')).toBeInTheDocument();
    await approveProduction();
    expect(await screen.findByText(/Package approved/)).toBeInTheDocument();
    expect(screen.getByText(/Organization bound: TST-ORG/)).toBeInTheDocument();
    // The display names of the approved reference lists reach the table.
    expect(await screen.findAllByText('Test Operations')).not.toHaveLength(0);
  });

  it('shows no production preview for a legacy workbook or CSV', async () => {
    renderApp();
    selectFile(trainingInput(), fileFrom(matrixBytes(), 'legacy-matrix.xlsx'));
    await screen.findByTestId('matrix-preview', {}, { timeout: 5000 });
    expect(screen.queryByTestId('production-preview')).toBeNull();
  });

  it('cancels without approving anything', async () => {
    renderApp();
    await importProduction();
    fireEvent.click(screen.getByTestId('pp-cancel'));
    await waitFor(() => expect(screen.queryByTestId('production-preview')).toBeNull());
    expect(screen.queryByText(/Package approved/)).toBeNull();
    // Nothing was bound, so a partial package is still refused.
    await expectNoOrganizationBound();
  });
});

describe('every legacy path clears the production binding', () => {
  /** Approve a production package, then run `act` and check nothing survived. */
  async function afterLegacy(runLegacyPath) {
    renderApp();
    await importProduction();
    await approveProduction();
    expect(await screen.findAllByText('Test Operations')).not.toHaveLength(0);

    await runLegacyPath();

    // 1. No production preview is left on screen.
    expect(screen.queryByTestId('production-preview')).toBeNull();
    // 2. The display lookups are gone: the table shows codes, not names.
    await waitFor(() => expect(screen.queryAllByText('Test Operations')).toHaveLength(0), { timeout: 5000 });
    // 3. The organization, the batches and the change log are gone, which a
    //    partial package proves by being refused.
    await expectNoOrganizationBound();
  }

  it('demo data', async () => {
    await afterLegacy(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Load Demo Data/i }));
      // The binding is dropped as the demo starts loading, before its rows
      // arrive, so the check below does not wait for the demo banner.
      await waitFor(() => expect(screen.queryByTestId('production-preview')).toBeNull(), { timeout: 5000 });
    });
  }, 15000);

  it('legacy training CSV', async () => {
    await afterLegacy(async () => {
      const csv = new File(
        [
          'Employee_ID,Employee_Name,Department,Job_Title,Employment_Status,Course_Code,Course_Name,Completion_Status,Issue_Date,Expiry_Date\nLG-0001,Legacy One,Operations,Operator,Active,K01,Legacy Course,Completed,2025-01-01,2028-01-01\n',
        ],
        'legacy-training.csv',
        { type: 'text/csv' },
      );
      selectFile(trainingInput(), csv);
      await waitFor(() => expect(screen.queryByTestId('production-preview')).toBeNull(), { timeout: 5000 });
    });
  });

  it('legacy requirements CSV', async () => {
    await afterLegacy(async () => {
      const csv = new File(
        ['Department,Job_Title,Course_Code,Course_Name,Mandatory,Validity_Months\nOperations,Operator,K01,Legacy Course,Yes,24\n'],
        'legacy-requirements.csv',
        { type: 'text/csv' },
      );
      selectFile(requirementsInput(), csv);
      await screen.findByText(/Requirements loaded/i, {}, { timeout: 5000 });
    });
  });

  it('legacy Training Matrix workbook', async () => {
    await afterLegacy(async () => {
      selectFile(trainingInput(), fileFrom(matrixBytes(), 'legacy-matrix.xlsx'));
      await screen.findByTestId('matrix-preview', {}, { timeout: 5000 });
    });
  });

  it('reset', async () => {
    await afterLegacy(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reset Data/i }));
      await waitFor(() => expect(screen.queryAllByText('Test Operations')).toHaveLength(0), { timeout: 5000 });
    });
  });
});

describe('local batch id', () => {
  it('is a prefixed UUID from crypto.randomUUID', () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID');
    const id = defaultBatchId();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(id).toMatch(BATCH_ID_PATTERN);
    expect(defaultBatchId()).not.toBe(id);
  });

  it('uses no weak random source', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const SYSTEM_RANDOM = ['Math', '.random'].join('');
    for (const file of ['src/lib/localBatch.js', 'src/App.jsx', 'src/lib/contract/productionPackage.js', 'src/components/ProductionPackagePreview.jsx']) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8'), file).not.toContain(SYSTEM_RANDOM);
    }
  });

  it('lets a test inject its own id and approval time', async () => {
    renderApp();
    await importProduction();
    await approveProduction();
    expect(await screen.findByText(/Package approved/)).toBeInTheDocument();
  });
});
