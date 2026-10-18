import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATUS_COLORS } from './constants.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import { createI18n } from './i18n.js';
import { shapeArabicLine } from './pdf/arabicText.js';
import { registerArabicFont, ARABIC_FONT_NAME } from './pdf/arabicFont.js';
import {
  REQUIREMENTS_PROVENANCE,
  isTestRequirements,
} from './contract/requirementsProvenance.js';

// ============================================================
// TEST-REQUIREMENTS MARKER (AT-13)
// ============================================================

/**
 * One line that says an export was produced from test requirements rather than
 * from an approved HSE-DC-1.0 requirements set. An export that leaves the
 * browser must carry that statement with it.
 */
export const TEST_REQUIREMENTS_MARKER = {
  [REQUIREMENTS_PROVENANCE.DERIVED]:
    'TEST DATA — requirements derived from a department-level mapping of the three-sheet test workbook. Not approved production requirements; not a compliance result.',
  [REQUIREMENTS_PROVENANCE.DEMO]:
    'TEST DATA — demonstration dataset. Not approved production requirements; not a compliance result.',
  [REQUIREMENTS_PROVENANCE.LEGACY]:
    'TEST DATA — requirements loaded from a legacy CSV with no approval reference and no version date. Not approved production requirements; not a compliance result.',
};

/** The marker line for a provenance, or `''` for approved requirements. */
export function testRequirementsMarker(provenance) {
  return isTestRequirements(provenance) ? TEST_REQUIREMENTS_MARKER[provenance] : '';
}

// ============================================================
// CSV UTILITIES
// ============================================================

function escapeCSVVal(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCSVRow(values) {
  return values.map(escapeCSVVal).join(',');
}

function downloadCSV(rows, filename) {
  const BOM = '﻿'; // UTF-8 BOM for Arabic/Excel compatibility
  const content = BOM + rows.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================
// COMPLIANCE DETAIL CSV
// ============================================================

export function exportComplianceCSV(universe, kpis, meta, t) {
  // Codes are the matching keys and names are display only, so the export
  // carries both: a code column next to every name column.
  const headers = [
    t('employeeId'), t('employeeName'),
    'Department Code', t('department'),
    'Job Title Code', t('jobTitle'),
    'Course Code', t('course'),
    t('status'), t('expiryDate'), t('daysRemaining'),
    t('employmentStatus'), t('issueDate'), t('certificate'), t('provider'),
  ];

  const rows = [];
  const marker = testRequirementsMarker(meta.requirementsProvenance);
  if (marker) rows.push(buildCSVRow([marker]));
  rows.push(buildCSVRow(headers));
  for (const item of universe) {
    rows.push(buildCSVRow([
      item.Employee_ID,
      item.Employee_Name,
      item.Department_Code ?? item.Department,
      item.Department_Name ?? item.Department,
      item.Job_Title_Code ?? item.Job_Title,
      item.Job_Title_Name ?? item.Job_Title,
      item.Course_Code,
      item.Course_Name,
      item.Status,
      item.Expiry_Date || '',
      item.daysRemaining ?? '',
      item.Employment_Status || '',
      item.Issue_Date || '',
      item.Certificate_Number || '',
      item.Training_Provider || '',
    ]));
  }

  const date = meta.asOfDate || new Date().toISOString().split('T')[0];
  downloadCSV(rows, `HSE_Compliance_${date}.csv`);
}

// ============================================================
// PRIORITY ACTIONS CSV
// ============================================================

export function exportPriorityActionsCSV(actions, meta, t) {
  const headers = [
    t('priority'), t('employeeId'), t('employeeName'),
    'Department Code', t('department'),
    'Job Title Code', t('jobTitle'),
    'Course Code', t('course'),
    t('status'), t('expiryDate'), t('daysRemaining'), t('action'),
  ];

  const rows = [];
  const marker = testRequirementsMarker(meta.requirementsProvenance);
  if (marker) rows.push(buildCSVRow([marker]));
  rows.push(buildCSVRow(headers));
  for (const a of actions) {
    rows.push(buildCSVRow([
      a.priority,
      a.Employee_ID,
      a.Employee_Name,
      a.Department_Code ?? a.Department,
      a.Department_Name ?? a.Department,
      a.Job_Title_Code ?? a.Job_Title,
      a.Job_Title_Name ?? a.Job_Title,
      a.Course_Code ?? '',
      a.Course_Name,
      a.Status,
      a.Expiry_Date || '',
      a.daysRemaining ?? '',
      t(a.actionKey),
    ]));
  }

  const date = meta.asOfDate || new Date().toISOString().split('T')[0];
  downloadCSV(rows, `HSE_Priority_Actions_${date}.csv`);
}

// ============================================================
// MANAGEMENT PDF EXPORT (English and Arabic)
// ============================================================

/** Fills `{name}` placeholders in a translated string. */
function fmt(template, vars = {}) {
  return Object.keys(vars).reduce(
    (out, key) => out.split(`{${key}}`).join(String(vars[key])),
    String(template),
  );
}

/**
 * Builds the management report and starts the download. Returns the filename.
 *
 * Arabic reports embed a font and therefore fetch it, which is why this is
 * async. If the font cannot be loaded the report falls back to English rather
 * than producing a PDF full of blank glyphs.
 */
export async function exportManagementPDF(opts) {
  const {
    companyName,
    projectName,
    asOfDate,
    sourceFileName,
    kpis,
    priorityActions,
    dataQuality,
    universe,
    lang,
    t,
    requirementsProvenance,
  } = opts;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const isArabic = lang === 'ar';
  if (isArabic) {
    try {
      await registerArabicFont(doc);
    } catch {
      alert(t('pdfFontLoadFailed'));
      return exportManagementPDF({ ...opts, lang: 'en', t: createI18n('en').t });
    }
  }

  // Every string drawn into the document goes through `S`. In Arabic it shapes
  // the letters and reorders the line; in English it is a no-op.
  const FONT = isArabic ? ARABIC_FONT_NAME : 'helvetica';
  const S = (value) => (isArabic ? shapeArabicLine(value) : (value ?? ''));
  const L = (key, vars) => S(fmt(t(key), vars));
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // Report palette, aligned with the dashboard theme (--brand #5b7cfa and friends).
  const BRAND = [91, 124, 250];
  const ORANGE = BRAND; // Historical name, kept so existing table styles stay readable.
  const DARK = [30, 30, 30];
  const GREY = [100, 100, 100];
  const LIGHT_GREY = [220, 220, 220];
  const GREEN = [22, 163, 74];
  const RED = [220, 38, 38];
  const AMBER = [234, 88, 12];
  const SLATE = [30, 41, 59];

  // An Arabic report reads right to left, so every text anchor is mirrored
  // across the page and drawn right-aligned. `ALIGN` is spread into the jsPDF
  // text options; `mx` mirrors an x coordinate that was measured from the left.
  const ALIGN = isArabic ? { align: 'right' } : {};
  const mx = (x) => (isArabic ? pw - x : x);

  // jsPDF-AutoTable has no shaping or bidi support either, so table cells are
  // prepared exactly like the hand-drawn text. An Arabic table also reads right
  // to left, so the columns are reversed: `cells` flips every row and header,
  // `colIndex` maps a logical column onto the index it ends up at, and `cols`
  // moves the per-column styles with it.
  const tableStyles = { font: FONT, halign: isArabic ? 'right' : 'left' };
  const cells = (rows) => (isArabic ? rows.map((row) => row.map(S).reverse()) : rows);
  const colIndex = (count, i) => (isArabic ? count - 1 - i : i);
  const cols = (count, styles) => Object.fromEntries(
    Object.entries(styles).map(([i, style]) => [colIndex(count, Number(i)), style]),
  );

  /**
   * Wraps text to `maxW`, measuring the shaped form of each candidate line.
   * jsPDF's own splitTextToSize measures the unshaped code points, which is the
   * wrong width for Arabic, and it would break the line in visual order.
   */
  function wrap(text, maxW) {
    const source = String(text ?? '');
    if (!isArabic) return doc.splitTextToSize(source, maxW);
    const lines = [];
    let line = '';
    for (const word of source.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && doc.getTextWidth(S(candidate)) > maxW) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function newPage() {
    doc.addPage();
    y = margin;
  }

  function checkSpace(need) {
    if (y + need > ph - 16) newPage();
  }

  /**
   * Section heading. `reserve` is the height of the block that follows, so the
   * heading moves to the next page with its content instead of being orphaned
   * at the bottom of the current one.
   */
  function h1(text, reserve = 0) {
    checkSpace(12 + reserve);
    doc.setFontSize(16);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...ORANGE);
    doc.text(S(text), mx(margin), y, ALIGN);
    y += 8;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pw - margin, y);
    y += 4;
  }

  function h2(text) {
    checkSpace(10);
    doc.setFontSize(12);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...DARK);
    doc.text(S(text), mx(margin), y, ALIGN);
    y += 7;
  }

  function kv(key, value, highlight = false) {
    checkSpace(7);
    doc.setFontSize(10);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...GREY);
    doc.text(S(key + ':'), mx(margin), y, ALIGN);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(highlight ? ORANGE[0] : DARK[0], highlight ? ORANGE[1] : DARK[1], highlight ? ORANGE[2] : DARK[2]);
    doc.text(S(String(value)), mx(margin + 55), y, ALIGN);
    y += 6;
  }

  function para(text, indented = false) {
    checkSpace(8);
    doc.setFontSize(9);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...DARK);
    // The line break has to be measured on the logical text, because shaping
    // and reordering would scramble the word order inside each wrapped line.
    const lines = wrap(text, pw - margin * 2 - (indented ? 10 : 0));
    doc.text(lines.map(S), mx(margin + (indented ? 10 : 0)), y, ALIGN);
    y += lines.length * 5 + 2;
  }

  /**
   * Draws the shield logomark as vector paths, at (x, y) with the given width.
   * The favicon is an SVG, which jsPDF cannot place as an image, so the mark is
   * redrawn here with primitives to keep the cover on-brand.
   */
  function shieldMark(x, y, w, color) {
    const h = w * 1.18;
    doc.setFillColor(...color);
    // Upper body: a rounded rectangle for the shoulders of the shield.
    doc.roundedRect(x, y, w, h * 0.62, w * 0.16, w * 0.16, 'F');
    // Lower body: a triangle for the point.
    doc.triangle(x, y + h * 0.5, x + w, y + h * 0.5, x + w / 2, y + h, 'F');
    // Check mark inside the shield.
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(w * 0.1);
    doc.setLineCap('round');
    doc.lines(
      [[w * 0.17, w * 0.17], [w * 0.3, -w * 0.36]],
      x + w * 0.25,
      y + h * 0.42,
    );
    doc.setLineCap('butt');
  }

  /**
   * Draws a row of headline KPI cards. Management reads this strip first, so the
   * same numbers also appear in the Executive Summary table underneath it.
   */
  function kpiCards(cards) {
    const gap = 4;
    const cardW = (pw - margin * 2 - gap * (cards.length - 1)) / cards.length;
    const cardH = 24;
    checkSpace(cardH + 4);
    cards.forEach((card, i) => {
      const x = margin + i * (cardW + gap);
      doc.setFillColor(248, 249, 252);
      doc.setDrawColor(...LIGHT_GREY);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');
      // Accent bar on the leading edge carries the card's status colour, which
      // is the right edge when the report reads right to left.
      doc.setFillColor(...card.color);
      doc.rect(isArabic ? x + cardW - 1.6 : x, y, 1.6, cardH, 'F');
      // Text is inset from the leading edge of the card, mirrored for Arabic.
      const tx = isArabic ? x + cardW - 5 : x + 5;
      doc.setFontSize(7);
      doc.setFont(FONT, 'bold');
      doc.setTextColor(...GREY);
      // Arabic has no case, so uppercasing is only applied to the Latin label.
      const label = isArabic ? String(card.label) : String(card.label).toUpperCase();
      doc.text(wrap(label, cardW - 8).map(S), tx, y + 6, ALIGN);
      doc.setFontSize(17);
      doc.setTextColor(...card.color);
      doc.text(S(String(card.value)), tx, y + 18, ALIGN);
      if (card.note) {
        doc.setFontSize(7);
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...GREY);
        doc.text(S(String(card.note)), tx, y + 22, ALIGN);
      }
    });
    y += cardH + 8;
  }

  /**
   * Horizontal bar chart drawn with rectangles. jsPDF has no chart support and
   * the report must not pull in a charting dependency, so the bars are plotted
   * directly against the largest value in the series.
   */
  function barChart(series) {
    const rowH = 7;
    const labelW = 38;
    const valueW = 14;
    const trackW = pw - margin * 2 - labelW - valueW;
    const max = Math.max(1, ...series.map((s) => s.value));
    checkSpace(series.length * rowH + 4);
    // Mirrored for Arabic: labels on the right, bars growing leftwards.
    const trackX = isArabic ? margin + valueW : margin + labelW;
    series.forEach((s) => {
      const barY = y + 1.5;
      doc.setFontSize(8);
      doc.setFont(FONT, 'normal');
      doc.setTextColor(...DARK);
      doc.text(S(s.label), mx(margin), y + 4.5, ALIGN);
      doc.setFillColor(240, 241, 245);
      doc.rect(trackX, barY, trackW, 3.5, 'F');
      const w = (s.value / max) * trackW;
      if (w > 0) {
        doc.setFillColor(...s.color);
        doc.rect(isArabic ? trackX + trackW - w : trackX, barY, w, 3.5, 'F');
      }
      doc.setFont(FONT, 'bold');
      doc.setTextColor(...s.color);
      doc.text(String(s.value), mx(margin + labelW + trackW + 3), y + 4.5, ALIGN);
      y += rowH;
    });
    y += 4;
  }

  /** Callout box listing the risks that need a decision from management. */
  function riskBox(title, items) {
    const lineH = 5.5;
    const boxH = 11 + items.length * lineH;
    checkSpace(boxH + 4);
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, pw - margin * 2, boxH, 2, 2, 'FD');
    doc.setFillColor(...RED);
    doc.rect(isArabic ? pw - margin - 1.6 : margin, y, 1.6, boxH, 'F');
    doc.setFontSize(9);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...RED);
    doc.text(S(title), mx(margin + 5), y + 7, ALIGN);
    doc.setFontSize(8.5);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...DARK);
    items.forEach((item, i) => {
      // Measured on the logical text, then shaped, so the words stay in order.
      // `1.` at the head of an Arabic line is a neutral-terminated Latin run,
      // so the bidi pass moves it to the visual left — the far end of the line
      // from where the reader starts. A bullet has no direction of its own.
      const prefix = isArabic ? '•' : `${i + 1}.`;
      const line = wrap(`${prefix} ${item}`, pw - margin * 2 - 10)[0];
      doc.text(S(line), mx(margin + 5), y + 12.5 + i * lineH, ALIGN);
    });
    y += boxH + 8;
  }

  /**
   * The three findings management should act on first: the worst department, the
   * worst course, and the volume of expired records.
   */
  function topRisks() {
    const items = [];
    const worstDept = (kpis.departmentCompliance || [])
      .filter((d) => d.total > 0)
      .sort((a, b) => a.percentage - b.percentage)[0];
    if (worstDept && worstDept.percentage < 100) {
      items.push(fmt(t('pdfRiskLowestDept'), {
        dept: worstDept.department,
        pct: worstDept.percentage,
        bad: worstDept.nonCompliant,
        total: worstDept.total,
      }));
    }
    const worstCourse = (kpis.courseCompliance || [])
      .filter((c) => c.employeesRequired > 0)
      .sort((a, b) => a.percentage - b.percentage)[0];
    if (worstCourse && worstCourse.percentage < 100) {
      items.push(fmt(t('pdfRiskLowestCourse'), {
        course: worstCourse.course_name,
        pct: worstCourse.percentage,
        bad: worstCourse.nonCompliant,
        total: worstCourse.employeesRequired,
      }));
    }
    const expired = kpis.statusCounts.EXPIRED || 0;
    const missing = kpis.statusCounts.MISSING || 0;
    if (expired + missing > 0) {
      items.push(fmt(t('pdfRiskExpiredMissing'), { expired, missing }));
    }
    const expiring30 = kpis.statusCounts.EXPIRING_30 || 0;
    if (items.length < 3 && expiring30 > 0) {
      items.push(fmt(t('pdfRiskExpiring30'), { count: expiring30 }));
    }
    if (items.length === 0) return;
    riskBox(t('pdfTopRisks'), items.slice(0, 3));
  }

  // ── Cover / Title ──────────────────────────────────────────
  doc.setFillColor(...SLATE);
  doc.rect(0, 0, pw, 58, 'F');
  // Brand rule along the bottom edge of the header band.
  doc.setFillColor(...BRAND);
  doc.rect(0, 58, pw, 1.6, 'F');
  shieldMark(isArabic ? pw - margin - 13 : margin, 14, 13, BRAND);
  // Arabic reads right to left, so the logomark leads from the right edge and
  // the title block is right-aligned beside it.
  const titleX = isArabic ? pw - margin - 19 : margin + 19;
  doc.setFontSize(isArabic ? 18 : 21);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(L('pdfReportTitle'), titleX, 23, ALIGN);
  doc.setFontSize(10.5);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(S(companyName + '  |  ' + projectName), titleX, 32, ALIGN);
  doc.text(S(`${t('pdfAsOfDate')}: ${asOfDate}`), titleX, 40, ALIGN);
  y = 68;

  doc.setFontSize(9);
  // The embedded Arabic font has no italic style, so Arabic uses the regular one.
  doc.setFont(FONT, isArabic ? 'normal' : 'italic');
  doc.setTextColor(...GREY);
  // The local-only claim is only true in a local-only build. A cloud build
  // stores the data in the account's own database, so it says so instead.
  doc.text(
    L(isSupabaseConfigured() ? 'privacyNoteCloud' : 'privacyNote'),
    mx(margin),
    y,
    ALIGN,
  );
  y += 8;
  kv(t('pdfDataSource'), sourceFileName || t('pdfDemoDataSource'));
  // Both languages get the same Gregorian day/month/year timestamp. An Arabic
  // locale string carries a Hijri date that would not line up with the
  // Gregorian As Of Date above it, and its `ص`/`م` meridiem turns the whole
  // value into a mixed-direction run that the bidi reorder renders unreadable.
  kv(t('pdfGeneratedOn'), new Date().toLocaleString('en-GB'));
  const marker = testRequirementsMarker(requirementsProvenance);
  if (marker) {
    y += 2;
    doc.setFontSize(9);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(200, 60, 20);
    doc.text(wrap(marker, pw - margin * 2).map(S), mx(margin), y, ALIGN);
    y += 10;
    doc.setTextColor(...DARK);
    doc.setFont(FONT, 'normal');
  }
  y += 4;

  // ── Executive Summary ─────────────────────────────────────
  h1(t('pdfSummary'), 40);

  const compliance = kpis.requirementCompliance;
  // One label per compliance band, reused by the card note and the table row.
  const band = (pct) => t(pct >= 80 ? 'pdfOnTrack' : pct >= 60 ? 'pdfNeedsAttention' : 'pdfCriticalIndicator');
  kpiCards([
    {
      label: t('kpiRequirementCompliance'),
      value: `${compliance}%`,
      note: band(compliance),
      color: compliance >= 80 ? GREEN : compliance >= 60 ? AMBER : RED,
    },
    {
      label: t('pdfFullyCompliantShort'),
      value: `${kpis.fullyCompliantPct}%`,
      note: fmt(t('pdfOfEmployees'), { done: kpis.fullyCompliantCount, total: kpis.empWithMandatoryReqs }),
      color: BRAND,
    },
    {
      label: t('statusExpired'),
      value: kpis.statusCounts.EXPIRED || 0,
      note: t('pdfRequirementsNote'),
      color: (kpis.statusCounts.EXPIRED || 0) > 0 ? RED : GREEN,
    },
    {
      label: t('statusMissing'),
      value: kpis.statusCounts.MISSING || 0,
      note: t('pdfRequirementsNote'),
      color: (kpis.statusCounts.MISSING || 0) > 0 ? RED : GREEN,
    },
  ]);

  topRisks();

  const summaryData = [
    [t('kpiRequirementCompliance'), `${kpis.requirementCompliance}%`, band(kpis.requirementCompliance)],
    [t('kpiFullyCompliant'), `${kpis.fullyCompliantCount} / ${kpis.empWithMandatoryReqs} (${kpis.fullyCompliantPct}%)`, ''],
    [t('pdfTotalActiveEmployees'), String(kpis.totalActiveEmployees), ''],
    [t('pdfNotConfiguredRow'), `${kpis.employeesNotConfigured} ${t('pdfEmployeesSuffix')}`, t(kpis.employeesNotConfigured > 0 ? 'pdfReviewRequired' : 'pdfOk')],
    [t('pdfExpiredRow'), String(kpis.statusCounts.EXPIRED || 0), t(kpis.statusCounts.EXPIRED > 0 ? 'pdfActionRequired' : 'pdfOk')],
    [t('pdfMissingRow'), String(kpis.statusCounts.MISSING || 0), t(kpis.statusCounts.MISSING > 0 ? 'pdfActionRequired' : 'pdfOk')],
  ];

  autoTable(doc, {
    startY: y,
    head: cells([[t('pdfMetric'), t('pdfValue'), t('pdfIndicator')]]),
    body: cells(summaryData),
    theme: 'striped',
    styles: tableStyles,
    headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: cols(3, { 0: { fontStyle: 'bold' }, 2: { textColor: ORANGE } }),
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Status Summary ────────────────────────────────────────
  h1(t('pdfStatusSummaryFull'), 60);

  const sc = kpis.statusCounts;

  // Each status, in severity order, with the bar colour and whether it counts
  // as compliant. Driving the chart and the table from one list keeps them
  // from drifting apart.
  const statuses = [
    { key: 'statusValid', value: sc.VALID || 0, color: GREEN, ok: true },
    { key: 'statusExpiring90', value: sc.EXPIRING_90 || 0, color: [132, 204, 22], ok: true },
    { key: 'statusExpiring60', value: sc.EXPIRING_60 || 0, color: [250, 204, 21], ok: true },
    { key: 'statusExpiring30', value: sc.EXPIRING_30 || 0, color: AMBER, ok: true },
    { key: 'statusExpired', value: sc.EXPIRED || 0, color: RED, ok: false },
    { key: 'statusInProgress', value: sc.IN_PROGRESS || 0, color: BRAND, ok: false },
    { key: 'statusNotStarted', value: sc.NOT_STARTED || 0, color: GREY, ok: false },
    { key: 'statusMissing', value: sc.MISSING || 0, color: [148, 23, 23], ok: false },
  ];

  barChart(statuses.map((s) => ({ label: t(s.key), value: s.value, color: s.color })));

  // The compliance column is colour-coded in didParseCell, which only sees the
  // rendered cell text, so the two possible values are captured here as drawn.
  const COMPLIANT_CELL = isArabic ? S(t('compliant')) : t('compliant');
  const statusData = statuses.map((s) => [t(s.key), s.value, t(s.ok ? 'compliant' : 'nonCompliant')]);

  autoTable(doc, {
    startY: y,
    head: cells([[t('status'), t('pdfCountCol'), t('pdfComplianceLabel')]]),
    body: cells(statusData),
    theme: 'grid',
    styles: tableStyles,
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: cols(3, { 1: { halign: 'center' } }),
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === colIndex(3, 2)) {
        data.cell.styles.textColor = data.cell.raw === COMPLIANT_CELL ? [22, 163, 74] : [220, 38, 38];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Department Compliance ─────────────────────────────────
  checkSpace(30);
  h1(t('pdfDeptCompliance'), 30);

  const deptData = (kpis.departmentCompliance || []).map(d => [
    d.department, d.total, d.compliant, d.nonCompliant, `${d.percentage}%`,
  ]);

  autoTable(doc, {
    startY: y,
    head: cells([[t('department'), t('pdfTotalReqs'), t('compliant'), t('nonCompliant'), t('percentage')]]),
    body: cells(deptData),
    theme: 'striped',
    styles: tableStyles,
    headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: cols(5, {
      1: { halign: 'center' }, 2: { halign: 'center', textColor: [22, 163, 74], fontStyle: 'bold' },
      3: { halign: 'center', textColor: [220, 38, 38] }, 4: { halign: 'center', fontStyle: 'bold' },
    }),
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Course Compliance ─────────────────────────────────────
  checkSpace(30);
  h1(t('pdfCourseCompliance'), 30);

  const courseData = (kpis.courseCompliance || []).map(c => [
    c.course_code, c.course_name, c.employeesRequired, c.compliant, c.nonCompliant, `${c.percentage}%`,
  ]);

  autoTable(doc, {
    startY: y,
    head: cells([[t('pdfCodeCol'), t('pdfCourseNameCol'), t('pdfRequiredCol'), t('compliant'), t('nonCompliant'), '%']]),
    body: cells(courseData),
    theme: 'striped',
    styles: tableStyles,
    headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: cols(6, {
      2: { halign: 'center' }, 3: { halign: 'center', textColor: [22, 163, 74] },
      4: { halign: 'center', textColor: [220, 38, 38] }, 5: { halign: 'center', fontStyle: 'bold' },
    }),
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Priority Actions ─────────────────────────────────────
  checkSpace(30);
  h1(t('pdfPriorityActionsFull'), 30);

  const prioSlice = priorityActions.slice(0, 30);
  if (prioSlice.length === 0) {
    para(t('pdfNoPriorityActions'));
  } else {
    // Priority and status arrive from the analysis as English identifiers, so
    // they are looked up in the dictionary before being drawn.
    const PRIORITY_KEYS = { Critical: 'priorityCritical', High: 'priorityHigh', Medium: 'priorityMedium', Low: 'priorityLow' };
    const STATUS_KEYS = {
      VALID: 'statusValid', EXPIRING_90: 'statusExpiring90', EXPIRING_60: 'statusExpiring60',
      EXPIRING_30: 'statusExpiring30', EXPIRED: 'statusExpired', IN_PROGRESS: 'statusInProgress',
      NOT_STARTED: 'statusNotStarted', MISSING: 'statusMissing', NOT_REQUIRED: 'statusNotRequired',
    };
    const label = (map, value) => (map[value] ? t(map[value]) : String(value ?? ''));
    // didParseCell only sees rendered text, so the two highlighted priority
    // labels are captured here exactly as they are drawn.
    const CRITICAL_CELL = isArabic ? S(t('priorityCritical')) : t('priorityCritical');
    const HIGH_CELL = isArabic ? S(t('priorityHigh')) : t('priorityHigh');
    const prioData = prioSlice.map(a => [
      label(PRIORITY_KEYS, a.priority), a.Employee_ID, a.Employee_Name, a.Department,
      a.Course_Name, label(STATUS_KEYS, a.Status), a.Expiry_Date || t('pdfNotApplicable'),
    ]);
    autoTable(doc, {
      startY: y,
      head: cells([[t('priority'), t('pdfIdCol'), t('pdfEmployeeCol'), t('department'), t('course'), t('status'), t('pdfExpiryCol')]]),
      body: cells(prioData),
      theme: 'striped',
      styles: tableStyles,
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === colIndex(7, 0)) {
          const p = data.cell.raw;
          data.cell.styles.textColor = p === CRITICAL_CELL ? [220, 38, 38] : p === HIGH_CELL ? [234, 88, 12] : [100, 100, 100];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 6;
    if (priorityActions.length > 30) {
      para(fmt(t('pdfMoreActions'), { count: priorityActions.length - 30 }));
    }
  }

  // ── Data Quality ─────────────────────────────────────────
  checkSpace(20);
  h1(t('pdfDataQuality'), 20);

  if (dataQuality) {
    kv(t('invalidRows'), dataQuality.invalidRows || 0);
    kv(t('duplicateGroups'), dataQuality.duplicateGroups || 0);
    kv(t('configWarnings'), dataQuality.configWarnings || 0);
  }

  // ── Assumptions ──────────────────────────────────────────
  checkSpace(30);
  h1(t('pdfAssumptionsTitle'), 40);

  para(t('pdfAssumptionsIntro'));
  [
    'pdfAssumptionValid', 'pdfAssumptionExp30', 'pdfAssumptionExp60',
    'pdfAssumptionExp90', 'pdfAssumptionExpired', 'pdfAssumptionMissing',
  ].forEach((key) => para(`• ${t(key)}`, true));
  para(t('pdfAssumptionNonCompliant'));
  para(t('pdfAssumptionInactive'));
  para(t('pdfAssumptionDuplicates'));

  // ── Page numbers ─────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...GREY);
    doc.text(
      L('pdfFooter', { page: t('pdfPage'), i, n: totalPages, date: asOfDate }),
      pw / 2, ph - 8, { align: 'center' }
    );
  }

  const filename = `HSE_Management_Report_${asOfDate}.pdf`;
  doc.save(filename);
  return filename;
}
