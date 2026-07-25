/**
 * HSE Training Compliance - PDF Report Export
 * 
 * Generates professional PDF reports using jsPDF
 * 
 * Required library:
 * npm install jspdf
 * 
 * Or CDN:
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.0/jspdf.umd.min.js"></script>
 */

/**
 * Generate Management Summary PDF Report
 * 
 * Usage in React:
 * const report = generateManagementSummaryPDF({
 *   companyName: "Saudi Aramco",
 *   projectName: "Safaniyah Operations",
 *   reportingDate: new Date(),
 *   trainingData: records,
 *   calculationResults: kpiResults
 * });
 */
function generateManagementSummaryPDF(options) {
  const {
    companyName = "Company Name",
    projectName = "Project Name",
    reportingDate = new Date(),
    trainingData = [],
    calculationResults = {},
  } = options;

  // Check if jsPDF is available
  if (typeof jsPDF === "undefined") {
    alert(
      "jsPDF library not loaded. Add this script to your HTML:\n" +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.0/jspdf.umd.min.js"></script>'
    );
    return null;
  }

  const { jsPDF: JsPDF } = window;
  const doc = new JsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  function addTitle(text, size = 20) {
    doc.setFontSize(size);
    doc.setTextColor(255, 140, 0); // Orange
    doc.text(text, 20, yPos);
    yPos += size / 2 + 5;
  }

  function addHeading(text, size = 14) {
    doc.setFontSize(size);
    doc.setTextColor(100, 120, 170);
    doc.text(text, 20, yPos);
    yPos += size / 2 + 5;
  }

  function addNormalText(text, size = 11) {
    doc.setFontSize(size);
    doc.setTextColor(50, 50, 50);
    const wrapped = doc.splitTextToSize(text, pageWidth - 40);
    doc.text(wrapped, 20, yPos);
    yPos += wrapped.length * (size / 2) + 3;
  }

  function addKeyValue(key, value, isHighlight = false) {
    doc.setFontSize(11);
    doc.setTextColor(isHighlight ? 255, 140, 0 : 100, 100, 100);
    doc.setFont(undefined, isHighlight ? "bold" : "normal");
    const text = `${key}: ${value}`;
    doc.text(text, 25, yPos);
    yPos += 7;
  }

  function addNewPage() {
    doc.addPage();
    yPos = 20;
  }

  function checkPageBreak(spaceNeeded = 30) {
    if (yPos + spaceNeeded > pageHeight - 20) {
      addNewPage();
    }
  }

  // ============================================
  // PAGE 1: TITLE & SUMMARY
  // ============================================

  addTitle("HSE Training Compliance Report", 22);
  yPos += 10;

  addKeyValue("Company", companyName, true);
  addKeyValue("Project", projectName, true);
  addKeyValue("Report Date", reportingDate.toLocaleDateString(), true);
  addKeyValue("Total Records", trainingData.length);

  yPos += 5;

  // Key metrics
  doc.setFontSize(12);
  doc.setTextColor(255, 140, 0);
  doc.setFont(undefined, "bold");
  doc.text("Key Metrics", 20, yPos);
  yPos += 8;

  doc.setFontSize(11);
  doc.setTextColor(50, 50, 50);
  doc.setFont(undefined, "normal");

  const metricsText = [
    `Training Record Compliance: ${calculationResults.trainingRecordCompliance || 0}%`,
    `Total Training Records: ${trainingData.length}`,
    `Valid Records: ${calculationResults.validRecords || 0}`,
    `Expired Records: ${calculationResults.expiredRecords || 0}`,
    `Expiring Within 30 Days: ${calculationResults.expiringWithin30 || 0}`,
    `Expiring Within 60 Days: ${calculationResults.expiringWithin60 || 0}`,
    `Expiring Within 90 Days: ${calculationResults.expiringWithin90 || 0}`,
  ];

  metricsText.forEach((text) => {
    doc.text(text, 25, yPos);
    yPos += 7;
  });

  checkPageBreak(40);

  // ============================================
  // PAGE 2: DETAILED BREAKDOWN
  // ============================================

  addHeading("Detailed Status Breakdown", 14);
  yPos += 10;

  // Status breakdown data
  const statusGroups = {
    Valid: trainingData.filter((r) => r.Training_Required && r.Expiry_Date && new Date(r.Expiry_Date) > new Date()),
    "Expired": trainingData.filter((r) => r.Training_Required && r.Expiry_Date && new Date(r.Expiry_Date) <= new Date()),
    "Missing": trainingData.filter((r) => !r.Completion_Status || r.Completion_Status === "Not Started"),
  };

  Object.entries(statusGroups).forEach(([status, records]) => {
    checkPageBreak(15);

    doc.setFontSize(12);
    doc.setTextColor(255, 140, 0);
    doc.setFont(undefined, "bold");
    doc.text(`${status}: ${records.length} records`, 25, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, "normal");

    records.slice(0, 5).forEach((record) => {
      const line = `• ${record.Employee_Name} (${record.Employee_ID}) - ${record.Course_Name} - ${record.Expiry_Date || "No expiry"}`;
      const wrapped = doc.splitTextToSize(line, pageWidth - 50);
      doc.text(wrapped, 30, yPos);
      yPos += wrapped.length * 4 + 1;
    });

    if (records.length > 5) {
      doc.text(`... and ${records.length - 5} more`, 30, yPos);
      yPos += 5;
    }

    yPos += 3;
  });

  // ============================================
  // DEPARTMENT COMPLIANCE TABLE
  // ============================================

  checkPageBreak(50);
  addNewPage();
  addHeading("Compliance by Department", 14);
  yPos += 10;

  // Create table data
  const departments = [...new Set(trainingData.map((r) => r.Department))];
  const tableData = departments.map((dept) => {
    const deptRecords = trainingData.filter((r) => r.Department === dept);
    const validRecords = deptRecords.filter((r) => {
      if (!r.Expiry_Date) return true;
      return new Date(r.Expiry_Date) > new Date();
    });
    const percentage = deptRecords.length > 0 ? ((validRecords.length / deptRecords.length) * 100).toFixed(1) : 0;

    return [dept, deptRecords.length, validRecords.length, `${percentage}%`];
  });

  // Draw table
  doc.autoTable({
    startY: yPos,
    head: [["Department", "Total Records", "Valid", "Compliance %"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [255, 140, 0],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [50, 50, 50],
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 40, halign: "center" },
      2: { cellWidth: 30, halign: "center" },
      3: { cellWidth: 30, halign: "center" },
    },
    margin: { left: 20, right: 20 },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // ============================================
  // RECOMMENDATIONS
  // ============================================

  checkPageBreak(40);
  addHeading("Priority Actions", 14);
  yPos += 8;

  const expiredCount = trainingData.filter((r) => r.Expiry_Date && new Date(r.Expiry_Date) < new Date()).length;
  const expiringWithin30 = trainingData.filter((r) => {
    if (!r.Expiry_Date) return false;
    const daysUntilExpiry = (new Date(r.Expiry_Date) - new Date()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  }).length;

  const recommendations = [];

  if (expiredCount > 0) {
    recommendations.push(`1. URGENT: Renew ${expiredCount} expired training records immediately`);
  }

  if (expiringWithin30 > 0) {
    recommendations.push(`2. Schedule renewal for ${expiringWithin30} certificates expiring within 30 days`);
  }

  if (calculateMissingTraining(trainingData).length > 0) {
    recommendations.push(`3. Complete missing training for ${calculateMissingTraining(trainingData).length} employee-course combinations`);
  }

  recommendations.forEach((rec) => {
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    const wrapped = doc.splitTextToSize(rec, pageWidth - 40);
    doc.text(wrapped, 25, yPos);
    yPos += wrapped.length * 5 + 2;
  });

  // ============================================
  // FOOTER ON ALL PAGES
  // ============================================

  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `HSE Training Compliance Dashboard | Page ${i} of ${totalPages} | Generated ${new Date().toLocaleString()}`,
      20,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  // ============================================
  // SAVE PDF
  // ============================================

  const filename = `HSE_Training_Report_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);

  return filename;
}

/**
 * Helper: Calculate missing training count
 */
function calculateMissingTraining(trainingData) {
  // Simplified - count records marked as "Not Started"
  return trainingData.filter((r) => r.Completion_Status === "Not Started");
}

/**
 * Generate CSV Export
 * Can be imported into Excel or other tools
 */
function exportToCSV(trainingData, filename = "training_data.csv") {
  if (!trainingData || trainingData.length === 0) {
    alert("No data to export");
    return;
  }

  // Get headers
  const headers = Object.keys(trainingData[0]);

  // Build CSV content
  let csv = headers.join(",") + "\n";

  trainingData.forEach((record) => {
    const row = headers.map((header) => {
      const value = record[header] || "";
      // Escape quotes and wrap in quotes if contains comma
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csv += row.join(",") + "\n";
  });

  // Download
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// EXPORT
// ============================================

const PDFExport = {
  generateManagementSummaryPDF,
  exportToCSV,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = PDFExport;
}

if (typeof window !== "undefined") {
  window.PDFExport = PDFExport;
}
