import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATUS_COLORS } from './constants.js';

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
  const headers = [
    t('employeeId'), t('employeeName'), t('department'), t('jobTitle'),
    t('course'), 'Course Code', t('status'), t('expiryDate'), t('daysRemaining'),
    t('employmentStatus'), t('issueDate'), t('certificate'), t('provider'),
  ];

  const rows = [buildCSVRow(headers)];
  for (const item of universe) {
    rows.push(buildCSVRow([
      item.Employee_ID,
      item.Employee_Name,
      item.Department,
      item.Job_Title,
      item.Course_Name,
      item.Course_Code,
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
    t('priority'), t('employeeId'), t('employeeName'), t('department'),
    t('jobTitle'), t('course'), t('status'), t('expiryDate'), t('daysRemaining'), t('action'),
  ];

  const rows = [buildCSVRow(headers)];
  for (const a of actions) {
    rows.push(buildCSVRow([
      a.priority,
      a.Employee_ID,
      a.Employee_Name,
      a.Department,
      a.Job_Title,
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

  const ORANGE = [230, 120, 20];
  const DARK = [30, 30, 30];
  const GREY = [100, 100, 100];
  const LIGHT_GREY = [220, 220, 220];

  function newPage() {
    doc.addPage();
    y = margin;
  }

  function checkSpace(need) {
    if (y + need > ph - 16) newPage();
  }

  function h1(text) {
    checkSpace(12);
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

  // ── Cover / Title ──────────────────────────────────────────
  doc.setFillColor(30, 41, 59); // dark slate
  doc.rect(0, 0, pw, 55, 'F');
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('HSE Training Compliance Report', pw / 2, 24, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(companyName + '  |  ' + projectName, pw / 2, 35, { align: 'center' });
  doc.text(`As Of: ${asOfDate}`, pw / 2, 44, { align: 'center' });
  y = 65;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...GREY);
  doc.text('Local MVP — data processed in browser only. No external upload or storage.', margin, y);
  y += 8;
  kv('Data source', sourceFileName || 'Demo data');
  kv('Generated', new Date().toLocaleString('en-GB'));
  y += 4;

  // ── Executive Summary ─────────────────────────────────────
  h1('Executive Summary');

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
  h1('Status Summary (Mandatory Requirements)');

  const sc = kpis.statusCounts;
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
  h1('Department Compliance');

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
  h1('Course Compliance');

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
  h1('Priority Actions (Non-Compliant Requirements)');

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
  h1('Data Quality');

  if (dataQuality) {
    kv('Invalid rows', dataQuality.invalidRows || 0);
    kv('Duplicate groups', dataQuality.duplicateGroups || 0);
    kv('Config warnings', dataQuality.configWarnings || 0);
  }

  // ── Assumptions ──────────────────────────────────────────
  checkSpace(30);
  h1('Assumptions & Methodology');

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
