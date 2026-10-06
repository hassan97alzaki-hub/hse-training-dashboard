import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createI18n } from '../src/lib/i18n.js';
import { STATUS } from '../src/lib/constants.js';
import { REQUIREMENTS_PROVENANCE } from '../src/lib/contract/requirementsProvenance.js';
import {
  exportComplianceCSV,
  exportPriorityActionsCSV,
  testRequirementsMarker,
  TEST_REQUIREMENTS_MARKER,
} from '../src/lib/exportService.js';

const { t } = createI18n('en');

const item = (overrides = {}) => ({
  Employee_ID: 'TST-0001',
  Employee_Name: 'Test Employee 001',
  Department: 'OPS',
  Department_Code: 'OPS',
  Department_Name: 'Test Operations',
  Job_Title: 'OPR',
  Job_Title_Code: 'OPR',
  Job_Title_Name: 'Test Operator',
  Course_Code: 'H2S-01',
  Course_Name: 'Test H2S Awareness',
  Status: STATUS.VALID,
  Expiry_Date: '2028-01-15',
  daysRemaining: 200,
  Employment_Status: 'Active',
  Issue_Date: '2026-01-15',
  Certificate_Number: 'TST-CERT-000001',
  Training_Provider: 'Test Provider',
  ...overrides,
});

const action = (overrides = {}) => ({
  ...item(),
  priority: 1,
  actionKey: 'actionRenew',
  ...overrides,
});

/** Capture the CSV the export would download, without touching the disk. */
let captured;

beforeEach(() => {
  captured = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    captured.push(blob);
    return 'blob:test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const element = realCreate(tag);
    if (tag === 'a') element.click = () => {};
    return element;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const csvText = async () => {
  expect(captured).toHaveLength(1);
  return captured[0].text();
};

describe('the marker itself', () => {
  it('is empty for approved requirements and for none', () => {
    expect(testRequirementsMarker(REQUIREMENTS_PROVENANCE.APPROVED)).toBe('');
    expect(testRequirementsMarker(REQUIREMENTS_PROVENANCE.NONE)).toBe('');
    expect(testRequirementsMarker(undefined)).toBe('');
  });

  it('names the source for every test provenance', () => {
    for (const provenance of ['derived', 'demo', 'legacy']) {
      const marker = testRequirementsMarker(provenance);
      expect(marker, provenance).toBe(TEST_REQUIREMENTS_MARKER[provenance]);
      expect(marker, provenance).toMatch(/^TEST DATA —/);
      expect(marker, provenance).toMatch(/not a compliance result/i);
    }
    expect(testRequirementsMarker('derived')).toMatch(/department-level mapping/i);
    expect(testRequirementsMarker('demo')).toMatch(/demonstration dataset/i);
    expect(testRequirementsMarker('legacy')).toMatch(/legacy CSV/i);
  });
});

describe('compliance CSV', () => {
  it('carries a code column next to every name column', async () => {
    exportComplianceCSV([item()], null, { asOfDate: '2027-01-12', requirementsProvenance: 'approved' }, t);
    const text = await csvText();
    const [header, row] = text.replace(/^﻿/, '').split('\r\n');
    expect(header.split(',')).toEqual([
      'Employee ID', 'Employee Name',
      'Department Code', 'Department',
      'Job Title Code', 'Job Title',
      'Course Code', 'Course',
      'Status', 'Expiry Date', 'Days Remaining',
      'Employment Status', 'Issue Date', 'Certificate #', 'Training Provider',
    ]);
    const cells = row.split(',');
    expect(cells.slice(0, 8)).toEqual([
      'TST-0001', 'Test Employee 001',
      'OPS', 'Test Operations',
      'OPR', 'Test Operator',
      'H2S-01', 'Test H2S Awareness',
    ]);
  });

  it('falls back to the code when no display name is attached', async () => {
    exportComplianceCSV(
      [{ ...item(), Department_Name: undefined, Job_Title_Name: undefined, Department_Code: undefined, Job_Title_Code: undefined }],
      null,
      { asOfDate: '2027-01-12' },
      t,
    );
    const row = (await csvText()).replace(/^﻿/, '').split('\r\n')[1].split(',');
    expect(row.slice(2, 6)).toEqual(['OPS', 'OPS', 'OPR', 'OPR']);
  });

  it('puts the marker on the first line for test requirements', async () => {
    exportComplianceCSV([item()], null, { asOfDate: '2027-01-12', requirementsProvenance: 'derived' }, t);
    const lines = (await csvText()).replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toContain('TEST DATA');
    expect(lines[0]).toContain('department-level mapping');
    expect(lines[1]).toMatch(/^Employee ID,/);
  });

  it('writes no marker for approved requirements', async () => {
    exportComplianceCSV([item()], null, { asOfDate: '2027-01-12', requirementsProvenance: 'approved' }, t);
    const text = await csvText();
    expect(text).not.toContain('TEST DATA');
    expect(text.replace(/^﻿/, '').split('\r\n')[0]).toMatch(/^Employee ID,/);
  });
});

describe('priority actions CSV', () => {
  it('carries the codes and the names', async () => {
    exportPriorityActionsCSV([action()], { asOfDate: '2027-01-12', requirementsProvenance: 'approved' }, t);
    const [header, row] = (await csvText()).replace(/^﻿/, '').split('\r\n');
    expect(header.split(',')).toEqual([
      'Priority', 'Employee ID', 'Employee Name',
      'Department Code', 'Department',
      'Job Title Code', 'Job Title',
      'Course Code', 'Course',
      'Status', 'Expiry Date', 'Days Remaining', 'Action',
    ]);
    expect(row.split(',').slice(3, 9)).toEqual([
      'OPS', 'Test Operations', 'OPR', 'Test Operator', 'H2S-01', 'Test H2S Awareness',
    ]);
  });

  it('puts the marker on the first line for test requirements', async () => {
    exportPriorityActionsCSV([action()], { asOfDate: '2027-01-12', requirementsProvenance: 'demo' }, t);
    const lines = (await csvText()).replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toContain('TEST DATA');
    expect(lines[0]).toContain('demonstration dataset');
    expect(lines[1]).toMatch(/^Priority,/);
  });

  it('writes no marker for approved requirements', async () => {
    exportPriorityActionsCSV([action()], { asOfDate: '2027-01-12', requirementsProvenance: 'approved' }, t);
    expect(await csvText()).not.toContain('TEST DATA');
  });
});

describe('the management PDF', () => {
  const base = {
    companyName: 'Test Company',
    projectName: 'Test Project',
    asOfDate: '2027-01-12',
    sourceFileName: 'synthetic.xlsx',
    kpis: {
      totalActiveEmployees: 1, employeesWithMandatoryReqs: 1, employeesNoMandatoryReqs: 0,
      employeesNotConfigured: 0, totalMandatoryReqs: 1, compliantReqs: 1,
      requirementCompliance: 100, fullyCompliantCount: 1, fullyCompliantPct: 100,
      empWithMandatoryReqs: 1,
      statusCounts: { VALID: 1, EXPIRING_90: 0, EXPIRING_60: 0, EXPIRING_30: 0, EXPIRED: 0, IN_PROGRESS: 0, NOT_STARTED: 0, MISSING: 0, NOT_REQUIRED: 0 },
      departmentCompliance: [{ department: 'Test Operations', total: 1, compliant: 1, nonCompliant: 0, percentage: 100 }],
      courseCompliance: [{ course_code: 'H2S-01', course_name: 'Test H2S Awareness', employeesRequired: 1, compliant: 1, nonCompliant: 0, percentage: 100 }],
    },
    priorityActions: [],
    dataQuality: { invalidRows: 0, duplicateGroups: 0, configWarnings: 0 },
    universe: [item()],
    lang: 'en',
    t,
  };

  it('runs for both provenances without throwing', async () => {
    const { exportManagementPDF } = await import('../src/lib/exportService.js');
    // jsdom does not carry out the download, so the rendered page cannot be
    // read back here; the visible marker is checked by hand in the browser.
    expect(() => exportManagementPDF({ ...base, requirementsProvenance: 'derived' })).not.toThrow();
    expect(() => exportManagementPDF({ ...base, requirementsProvenance: 'approved' })).not.toThrow();
  });

  it('draws the marker text only when the requirements are test data', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(process.cwd(), 'src/lib/exportService.js'), 'utf8');
    // The marker reaches the page through the shared helper and nothing else.
    expect(source).toMatch(/const marker = testRequirementsMarker\(requirementsProvenance\);/);
    expect(source).toMatch(/if \(marker\) \{[\s\S]*doc\.text\(doc\.splitTextToSize\(marker/);
  });
});
