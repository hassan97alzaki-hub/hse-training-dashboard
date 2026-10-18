import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createI18n } from '../src/lib/i18n.js';

/**
 * The Arabic report embeds IBM Plex Sans Arabic, which `arabicFont.js` fetches from
 * `/fonts/…` at export time. There is no dev server under vitest, so `fetch` is
 * served from `public/fonts` instead — the same bytes the browser would get.
 */
function serveFontsFromDisk() {
  return vi.fn(async (url) => {
    const name = String(url).split('/').pop();
    const file = resolve(process.cwd(), 'public/fonts', name);
    if (!existsSync(file)) return { ok: false, status: 404 };
    const bytes = readFileSync(file);
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  });
}

const ASOF = '2027-01-12';
const PDF_PATH = resolve(process.cwd(), `HSE_Management_Report_${ASOF}.pdf`);

const kpis = {
  totalActiveEmployees: 2, employeesNotConfigured: 1,
  requirementCompliance: 50, fullyCompliantCount: 1, fullyCompliantPct: 50,
  empWithMandatoryReqs: 2,
  statusCounts: { VALID: 1, EXPIRING_90: 0, EXPIRING_60: 0, EXPIRING_30: 1, EXPIRED: 1, IN_PROGRESS: 0, NOT_STARTED: 0, MISSING: 1, NOT_REQUIRED: 0 },
  departmentCompliance: [{ department: 'التشغيل', total: 2, compliant: 1, nonCompliant: 1, percentage: 50 }],
  courseCompliance: [{ course_code: 'H2S-01', course_name: 'التوعية بكبريتيد الهيدروجين', employeesRequired: 2, compliant: 1, nonCompliant: 1, percentage: 50 }],
};

const priorityActions = [{
  priority: 'Critical', Employee_ID: 'E-001', Employee_Name: 'حسن علي',
  Department: 'التشغيل', Course_Name: 'التوعية بكبريتيد الهيدروجين',
  Status: 'EXPIRED', Expiry_Date: '2026-11-01',
}];

function options(lang) {
  return {
    companyName: 'شركة الاختبار',
    projectName: 'مشروع الاختبار',
    asOfDate: ASOF,
    sourceFileName: 'synthetic.xlsx',
    kpis,
    priorityActions,
    dataQuality: { invalidRows: 1, duplicateGroups: 2, configWarnings: 3 },
    universe: [],
    requirementsProvenance: 'approved',
    lang,
    t: createI18n(lang).t,
  };
}

/**
 * Runs the export and returns the bytes jsPDF wrote, as a latin1 string.
 * `arabicFont.js` caches the fetched font for the lifetime of the module, which
 * is the right behaviour in a browser but would hide the fetch from the second
 * test onwards, so the module graph is reset for every render.
 */
async function render(lang) {
  vi.resetModules();
  const { exportManagementPDF } = await import('../src/lib/exportService.js');
  if (existsSync(PDF_PATH)) unlinkSync(PDF_PATH);
  const filename = await exportManagementPDF(options(lang));
  const content = existsSync(PDF_PATH) ? readFileSync(PDF_PATH, 'latin1') : '';
  if (existsSync(PDF_PATH)) unlinkSync(PDF_PATH);
  return { filename, content };
}

describe('the Arabic management PDF', () => {
  let originalFetch;
  let originalAlert;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalAlert = globalThis.alert;
    globalThis.fetch = serveFontsFromDisk();
    globalThis.alert = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.alert = originalAlert;
    if (existsSync(PDF_PATH)) unlinkSync(PDF_PATH);
  });

  it('embeds the Arabic font and writes the file', async () => {
    const { filename, content } = await render('ar');
    expect(filename).toBe(`HSE_Management_Report_${ASOF}.pdf`);
    expect(content.length).toBeGreaterThan(0);
    // A subset of the embedded TrueType font carries the font's PostScript name.
    expect(content).toContain('IBMPlexSansArabic');
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it('fetches both the regular and the bold font file', async () => {
    await render('ar');
    const requested = globalThis.fetch.mock.calls.map(([url]) => String(url));
    expect(requested).toContain('/fonts/IBMPlexSansArabic-Regular.ttf');
    expect(requested).toContain('/fonts/IBMPlexSansArabic-Bold.ttf');
  });

  it('falls back to the English report when the font cannot be loaded', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    const { content } = await render('ar');
    expect(globalThis.alert).toHaveBeenCalledOnce();
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain('IBMPlexSansArabic');
  });

  it('does not fetch any font for the English report', async () => {
    await render('en');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
