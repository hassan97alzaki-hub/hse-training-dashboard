import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATUS_COLORS } from './constants.js';
import { isSupabaseConfigured } from './supabaseClient.js';
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
// MANAGEMENT PDF EXPORT (English only — see ASSUMPTIONS.md for Arabic PDF limitation)
// ============================================================

export function exportManagementPDF(opts) {
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

  if (lang === 'ar') {
    // Arabic PDF: jsPDF cannot shape Arabic glyphs without custom font embedding.
    // Export English PDF with a note instead (see docs/ASSUMPTIONS.md).
    alert(t('pdfNotAvailableArabic'));
    return exportManagementPDF({ ...opts, lang: 'en', t: (k) => k });
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ORANGE);
    doc.text(text, margin, y);
    y += 8;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pw - margin, y);
    y += 4;
  }

  function h2(text) {
    checkSpace(10);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(text, margin, y);
    y += 7;
  }

  function kv(key, value, highlight = false) {
    checkSpace(7);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREY);
    doc.text(key + ':', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(highlight ? ORANGE[0] : DARK[0], highlight ? ORANGE[1] : DARK[1], highlight ? ORANGE[2] : DARK[2]);
    doc.text(String(value), margin + 55, y);
    y += 6;
  }

  function para(text, indented = false) {
    checkSpace(8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(text, pw - margin * 2 - (indented ? 10 : 0));
    doc.text(lines, margin + (indented ? 10 : 0), y);
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
      // Accent bar on the leading edge carries the card's status colour.
      doc.setFillColor(...card.color);
      doc.rect(x, y, 1.6, cardH, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREY);
      doc.text(doc.splitTextToSize(card.label.toUpperCase(), cardW - 8), x + 5, y + 6);
      doc.setFontSize(17);
      doc.setTextColor(...card.color);
      doc.text(String(card.value), x + 5, y + 18);
      if (card.note) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GREY);
        doc.text(card.note, x + 5, y + 22);
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
    series.forEach((s) => {
      const barY = y + 1.5;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK);
      doc.text(s.label, margin, y + 4.5);
      doc.setFillColor(240, 241, 245);
      doc.rect(margin + labelW, barY, trackW, 3.5, 'F');
      const w = (s.value / max) * trackW;
      if (w > 0) {
        doc.setFillColor(...s.color);
        doc.rect(margin + labelW, barY, w, 3.5, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...s.color);
      doc.text(String(s.value), margin + labelW + trackW + 3, y + 4.5);
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
    doc.rect(margin, y, 1.6, boxH, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RED);
    doc.text(title, margin + 5, y + 7);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    items.forEach((item, i) => {
      doc.text(
        doc.splitTextToSize(`${i + 1}. ${item}`, pw - margin * 2 - 10)[0],
        margin + 5,
        y + 12.5 + i * lineH,
      );
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
      items.push(
        `Lowest department compliance: ${worstDept.department} at ${worstDept.percentage}% `
        + `(${worstDept.nonCompliant} of ${worstDept.total} requirements non-compliant).`,
      );
    }
    const worstCourse = (kpis.courseCompliance || [])
      .filter((c) => c.employeesRequired > 0)
      .sort((a, b) => a.percentage - b.percentage)[0];
    if (worstCourse && worstCourse.percentage < 100) {
      items.push(
        `Lowest course compliance: ${worstCourse.course_name} at ${worstCourse.percentage}% `
        + `(${worstCourse.nonCompliant} of ${worstCourse.employeesRequired} employees non-compliant).`,
      );
    }
    const expired = kpis.statusCounts.EXPIRED || 0;
    const missing = kpis.statusCounts.MISSING || 0;
    if (expired + missing > 0) {
      items.push(
        `${expired} expired and ${missing} missing requirement(s) need scheduling now.`,
      );
    }
    const expiring30 = kpis.statusCounts.EXPIRING_30 || 0;
    if (items.length < 3 && expiring30 > 0) {
      items.push(`${expiring30} requirement(s) expire within 30 days.`);
    }
    if (items.length === 0) return;
    riskBox('Top Risks Requiring Action', items.slice(0, 3));
  }

  // ── Cover / Title ──────────────────────────────────────────
  doc.setFillColor(...SLATE);
  doc.rect(0, 0, pw, 58, 'F');
  // Brand rule along the bottom edge of the header band.
  doc.setFillColor(...BRAND);
  doc.rect(0, 58, pw, 1.6, 'F');
  shieldMark(margin, 14, 13, BRAND);
  doc.setFontSize(21);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('HSE Training Compliance Report', margin + 19, 23);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(companyName + '  |  ' + projectName, margin + 19, 32);
  doc.text(`As Of: ${asOfDate}`, margin + 19, 40);
  y = 68;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...GREY);
  // The local-only claim is only true in a local-only build. A cloud build
  // stores the data in the account's own database, so it says so instead.
  doc.text(
    isSupabaseConfigured()
      ? 'Data stored in the account that generated this report. No personal contact data is exported.'
      : 'Local MVP — data processed in browser only. No external upload or storage.',
    margin,
    y,
  );
  y += 8;
  kv('Data source', sourceFileName || 'Demo data');
  kv('Generated', new Date().toLocaleString('en-GB'));
  const marker = testRequirementsMarker(requirementsProvenance);
  if (marker) {
    y += 2;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 60, 20);
    doc.text(doc.splitTextToSize(marker, pw - margin * 2), margin, y);
    y += 10;
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'normal');
  }
  y += 4;

  // ── Executive Summary ─────────────────────────────────────
  h1('Executive Summary', 40);

  const compliance = kpis.requirementCompliance;
  kpiCards([
    {
      label: 'Requirement Compliance',
      value: `${compliance}%`,
      note: compliance >= 80 ? 'On track' : compliance >= 60 ? 'Needs attention' : 'Critical',
      color: compliance >= 80 ? GREEN : compliance >= 60 ? AMBER : RED,
    },
    {
      label: 'Fully Compliant',
      value: `${kpis.fullyCompliantPct}%`,
      note: `${kpis.fullyCompliantCount} of ${kpis.empWithMandatoryReqs} employees`,
      color: BRAND,
    },
    {
      label: 'Expired',
      value: kpis.statusCounts.EXPIRED || 0,
      note: 'requirements',
      color: (kpis.statusCounts.EXPIRED || 0) > 0 ? RED : GREEN,
    },
    {
      label: 'Missing',
      value: kpis.statusCounts.MISSING || 0,
      note: 'requirements',
      color: (kpis.statusCounts.MISSING || 0) > 0 ? RED : GREEN,
    },
  ]);

  topRisks();

  const summaryData = [
    ['Requirement Compliance', `${kpis.requirementCompliance}%`, kpis.requirementCompliance >= 80 ? 'On Track' : kpis.requirementCompliance >= 60 ? 'Needs Attention' : 'Critical'],
    ['Fully Compliant Employees', `${kpis.fullyCompliantCount} / ${kpis.empWithMandatoryReqs} (${kpis.fullyCompliantPct}%)`, ''],
    ['Total Active Employees', String(kpis.totalActiveEmployees), ''],
    ['Requirements Not Configured', String(kpis.employeesNotConfigured) + ' employee(s)', kpis.employeesNotConfigured > 0 ? 'Review Required' : 'OK'],
    ['Expired Requirements', String(kpis.statusCounts.EXPIRED || 0), kpis.statusCounts.EXPIRED > 0 ? 'Action Required' : 'OK'],
    ['Missing Requirements', String(kpis.statusCounts.MISSING || 0), kpis.statusCounts.MISSING > 0 ? 'Action Required' : 'OK'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value', 'Indicator']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { textColor: ORANGE } },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Status Summary ────────────────────────────────────────
  h1('Status Summary (Mandatory Requirements)', 60);

  const sc = kpis.statusCounts;

  barChart([
    { label: 'Valid', value: sc.VALID || 0, color: GREEN },
    { label: 'Expiring (90d)', value: sc.EXPIRING_90 || 0, color: [132, 204, 22] },
    { label: 'Expiring (60d)', value: sc.EXPIRING_60 || 0, color: [250, 204, 21] },
    { label: 'Expiring (30d)', value: sc.EXPIRING_30 || 0, color: AMBER },
    { label: 'Expired', value: sc.EXPIRED || 0, color: RED },
    { label: 'In Progress', value: sc.IN_PROGRESS || 0, color: BRAND },
    { label: 'Not Started', value: sc.NOT_STARTED || 0, color: GREY },
    { label: 'Missing', value: sc.MISSING || 0, color: [148, 23, 23] },
  ]);

  const statusData = [
    ['Valid', sc.VALID || 0, 'Compliant'],
    ['Expiring (90d)', sc.EXPIRING_90 || 0, 'Compliant'],
    ['Expiring (60d)', sc.EXPIRING_60 || 0, 'Compliant'],
    ['Expiring (30d)', sc.EXPIRING_30 || 0, 'Compliant'],
    ['Expired', sc.EXPIRED || 0, 'Non-Compliant'],
    ['In Progress', sc.IN_PROGRESS || 0, 'Non-Compliant'],
    ['Not Started', sc.NOT_STARTED || 0, 'Non-Compliant'],
    ['Missing', sc.MISSING || 0, 'Non-Compliant'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Status', 'Count', 'Compliance']],
    body: statusData,
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'center' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        data.cell.styles.textColor = data.cell.raw === 'Compliant' ? [22, 163, 74] : [220, 38, 38];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Department Compliance ─────────────────────────────────
  checkSpace(30);
  h1('Department Compliance', 30);

  const deptData = (kpis.departmentCompliance || []).map(d => [
    d.department, d.total, d.compliant, d.nonCompliant, `${d.percentage}%`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Department', 'Total Reqs', 'Compliant', 'Non-Compliant', 'Compliance %']],
    body: deptData,
    theme: 'striped',
    headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      1: { halign: 'center' }, 2: { halign: 'center', textColor: [22, 163, 74], fontStyle: 'bold' },
      3: { halign: 'center', textColor: [220, 38, 38] }, 4: { halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Course Compliance ─────────────────────────────────────
  checkSpace(30);
  h1('Course Compliance', 30);

  const courseData = (kpis.courseCompliance || []).map(c => [
    c.course_code, c.course_name, c.employeesRequired, c.compliant, c.nonCompliant, `${c.percentage}%`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Code', 'Course Name', 'Required', 'Compliant', 'Non-Compliant', '%']],
    body: courseData,
    theme: 'striped',
    headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      2: { halign: 'center' }, 3: { halign: 'center', textColor: [22, 163, 74] },
      4: { halign: 'center', textColor: [220, 38, 38] }, 5: { halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Priority Actions ─────────────────────────────────────
  checkSpace(30);
  h1('Priority Actions (Non-Compliant Requirements)', 30);

  const prioSlice = priorityActions.slice(0, 30);
  if (prioSlice.length === 0) {
    para('No priority actions — all configured requirements are compliant.');
  } else {
    const prioData = prioSlice.map(a => [
      a.priority, a.Employee_ID, a.Employee_Name, a.Department, a.Course_Name, a.Status, a.Expiry_Date || 'N/A',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Priority', 'ID', 'Employee', 'Department', 'Course', 'Status', 'Expiry']],
      body: prioData,
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const p = data.cell.raw;
          data.cell.styles.textColor = p === 'Critical' ? [220, 38, 38] : p === 'High' ? [234, 88, 12] : [100, 100, 100];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 6;
    if (priorityActions.length > 30) {
      para(`... and ${priorityActions.length - 30} more priority actions. See full CSV export.`);
    }
  }

  // ── Data Quality ─────────────────────────────────────────
  checkSpace(20);
  h1('Data Quality', 20);

  if (dataQuality) {
    kv('Invalid rows', dataQuality.invalidRows || 0);
    kv('Duplicate groups', dataQuality.duplicateGroups || 0);
    kv('Config warnings', dataQuality.configWarnings || 0);
  }

  // ── Assumptions ──────────────────────────────────────────
  checkSpace(30);
  h1('Assumptions & Methodology', 40);

  para('Compliance = VALID + EXPIRING within 30/60/90 days. Boundaries:');
  para('• VALID: >90 calendar days until expiry (or completed with no expiry date)', true);
  para('• EXPIRING_30: 0–30 days remaining (includes expiry on As Of Date)', true);
  para('• EXPIRING_60: 31–60 days remaining', true);
  para('• EXPIRING_90: 61–90 days remaining', true);
  para('• EXPIRED: expiry strictly before As Of Date', true);
  para('• MISSING: mandatory course with no training record', true);
  para('Non-compliant: EXPIRED, IN_PROGRESS, NOT_STARTED, MISSING. NOT_REQUIRED excluded from KPI denominators.');
  para('Inactive/Left employees are excluded from KPI denominators but remain visible in raw data.');
  para('Duplicate records: all rows kept; most relevant (latest valid expiry) selected for compliance.');

  // ── Page numbers ─────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY);
    doc.text(
      `HSE Training Compliance Dashboard  |  Page ${i} of ${totalPages}  |  ${asOfDate}`,
      pw / 2, ph - 8, { align: 'center' }
    );
  }

  const filename = `HSE_Management_Report_${asOfDate}.pdf`;
  doc.save(filename);
  return filename;
}
