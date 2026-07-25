// Bilingual i18n dictionary — Arabic + English
// Simple lookup module — no external library

const translations = {
  en: {
    // App shell
    appTitle: 'HSE Training Compliance Dashboard',
    appSubtitle: 'Health, Safety & Environment',
    privacyNote: 'Local MVP — all data is processed in this browser only. No data is uploaded or stored externally.',
    asOfDate: 'As Of Date',
    companyLabel: 'Company',
    projectLabel: 'Project',
    lastUpdated: 'Last Updated',

    // Language toggle
    langToggle: 'عربي',
    langToggleTitle: 'Switch to Arabic',

    // Import actions
    loadDemoData: 'Load Demo Data',
    importTrainingData: 'Import Training Data',
    importRequirements: 'Import Requirements Matrix',
    resetData: 'Reset Data',
    importTrainingHint: 'CSV or XLSX',
    importRequirementsHint: 'CSV',

    // Export actions
    exportPDF: 'Export PDF',
    exportCSV: 'Export CSV',
    exportPriorityCSV: 'Export Priority Actions CSV',

    // KPI labels
    kpiActiveEmployees: 'Active Employees',
    kpiRequirementsConfigured: 'Requirements Configured',
    kpiRequirementsNotConfigured: 'Not Configured',
    kpiRequirementCompliance: 'Requirement Compliance',
    kpiFullyCompliant: 'Fully Compliant Employees',
    kpiValid: 'Valid',
    kpiExpiring30: 'Expiring 30d',
    kpiExpiring60: 'Expiring 60d',
    kpiExpiring90: 'Expiring 90d',
    kpiExpired: 'Expired',
    kpiInProgress: 'In Progress',
    kpiNotStarted: 'Not Started',
    kpiMissing: 'Missing',

    // Status labels
    statusValid: 'Valid',
    statusExpiring90: 'Expiring (90d)',
    statusExpiring60: 'Expiring (60d)',
    statusExpiring30: 'Expiring (30d)',
    statusExpired: 'Expired',
    statusInProgress: 'In Progress',
    statusNotStarted: 'Not Started',
    statusMissing: 'Missing',
    statusNotRequired: 'Not Required',

    // Charts
    deptComplianceTitle: 'Department Compliance',
    statusBreakdownTitle: 'Status Breakdown',
    courseComplianceTitle: 'Course Compliance',
    compliancePct: 'Compliance %',
    count: 'Count',

    // Table headers
    employeeId: 'Employee ID',
    employeeName: 'Employee Name',
    department: 'Department',
    jobTitle: 'Job Title',
    course: 'Course',
    status: 'Status',
    expiryDate: 'Expiry Date',
    daysRemaining: 'Days Remaining',
    priority: 'Priority',
    action: 'Action',
    employmentStatus: 'Employment Status',
    issueDate: 'Issue Date',
    certificate: 'Certificate #',
    provider: 'Training Provider',

    // Priority levels
    priorityCritical: 'Critical',
    priorityHigh: 'High',
    priorityMedium: 'Medium',
    priorityLow: 'Low',

    // Filters
    filterTitle: 'Filters',
    clearFilters: 'Clear All',
    filterEmployeeId: 'Employee ID',
    filterEmployeeName: 'Employee Name',
    filterDepartment: 'Department',
    filterJobTitle: 'Job Title',
    filterCourse: 'Course',
    filterStatus: 'Compliance Status',
    filterEmploymentStatus: 'Employment Status',
    filterPriority: 'Priority',
    allDepartments: 'All Departments',
    allStatuses: 'All Statuses',
    allPriorities: 'All Priorities',
    allEmploymentStatuses: 'All Employment Statuses',
    allJobTitles: 'All Job Titles',
    allCourses: 'All Courses',

    // Pagination
    showing: 'Showing',
    to: 'to',
    of: 'of',
    records: 'records',
    previous: 'Previous',
    next: 'Next',
    pageSize: 'Per page',

    // States
    noData: 'No data loaded',
    noDataHint: 'Load demo data or import a CSV/XLSX file to begin.',
    noResults: 'No records match your filters.',
    loading: 'Loading…',
    requirementsNotLoaded: 'Requirements matrix not loaded',
    requirementsNotLoadedHint: 'Import the requirements matrix to enable missing-training detection.',

    // Import messages
    importSuccess: 'Import successful',
    importWarning: 'Import completed with warnings',
    importError: 'Import failed',
    validRecords: 'valid records',
    invalidRecords: 'invalid records skipped',
    duplicateGroups: 'duplicate groups',
    demoLoaded: 'Demo data loaded',
    dataReset: 'Data cleared',

    // Data quality panel
    dataQualityTitle: 'Data Quality Issues',
    invalidRows: 'Invalid Rows',
    duplicateRecords: 'Duplicate Records',
    configWarnings: 'Configuration Warnings',
    noIssues: 'No data quality issues found.',
    unconfiguredEmployee: 'Employee has no configured requirements',
    row: 'Row',

    // Priority actions
    priorityActionsTitle: 'Priority Actions',
    noPriorityActions: 'No priority actions — all configured requirements are compliant.',
    renewImmediately: 'Renew immediately',
    scheduleRenewal: 'Schedule renewal',
    startTraining: 'Start training',
    completePending: 'Complete pending training',

    // PDF
    pdfReportTitle: 'HSE Training Compliance Report',
    pdfGeneratedOn: 'Generated on',
    pdfDataSource: 'Data source',
    pdfAsOfDate: 'As of date',
    pdfSummary: 'Executive Summary',
    pdfStatusSummary: 'Status Summary',
    pdfDeptCompliance: 'Department Compliance',
    pdfCourseCompliance: 'Course Compliance',
    pdfPriorityActions: 'Priority Actions',
    pdfDataQuality: 'Data Quality',
    pdfAssumptions: 'Assumptions',
    pdfAssumptionsText: 'Compliance = VALID + EXPIRING within 30/60/90 days. EXPIRED, IN_PROGRESS, NOT_STARTED, MISSING = non-compliant. NOT_REQUIRED excluded from calculations. Inactive/Left employees excluded from KPI denominators.',
    pdfPage: 'Page',
    pdfNotAvailableArabic: 'Arabic PDF not supported — English PDF exported.',

    // Columns
    total: 'Total',
    compliant: 'Compliant',
    nonCompliant: 'Non-Compliant',
    percentage: 'Compliance %',
  },

  ar: {
    // App shell
    appTitle: 'لوحة امتثال تدريب السلامة والصحة والبيئة',
    appSubtitle: 'الصحة والسلامة والبيئة',
    privacyNote: 'نموذج محلي — تتم معالجة جميع البيانات في هذا المتصفح فقط. لا يتم رفع البيانات أو تخزينها خارجيًا.',
    asOfDate: 'تاريخ المرجع',
    companyLabel: 'الشركة',
    projectLabel: 'المشروع',
    lastUpdated: 'آخر تحديث',

    // Language toggle
    langToggle: 'English',
    langToggleTitle: 'Switch to English',

    // Import actions
    loadDemoData: 'تحميل البيانات التجريبية',
    importTrainingData: 'استيراد بيانات التدريب',
    importRequirements: 'استيراد مصفوفة المتطلبات',
    resetData: 'إعادة تعيين البيانات',
    importTrainingHint: 'CSV أو XLSX',
    importRequirementsHint: 'CSV',

    // Export actions
    exportPDF: 'تصدير PDF',
    exportCSV: 'تصدير CSV',
    exportPriorityCSV: 'تصدير الأولويات CSV',

    // KPI labels
    kpiActiveEmployees: 'الموظفون النشطون',
    kpiRequirementsConfigured: 'المتطلبات المُهيأة',
    kpiRequirementsNotConfigured: 'غير مُهيأة',
    kpiRequirementCompliance: 'امتثال المتطلبات',
    kpiFullyCompliant: 'الموظفون المتوافقون تمامًا',
    kpiValid: 'صالح',
    kpiExpiring30: 'ينتهي خلال 30 يوم',
    kpiExpiring60: 'ينتهي خلال 60 يوم',
    kpiExpiring90: 'ينتهي خلال 90 يوم',
    kpiExpired: 'منتهي الصلاحية',
    kpiInProgress: 'قيد التنفيذ',
    kpiNotStarted: 'لم يبدأ',
    kpiMissing: 'مفقود',

    // Status labels
    statusValid: 'صالح',
    statusExpiring90: 'ينتهي (90 يوم)',
    statusExpiring60: 'ينتهي (60 يوم)',
    statusExpiring30: 'ينتهي (30 يوم)',
    statusExpired: 'منتهي الصلاحية',
    statusInProgress: 'قيد التنفيذ',
    statusNotStarted: 'لم يبدأ',
    statusMissing: 'مفقود',
    statusNotRequired: 'غير مطلوب',

    // Charts
    deptComplianceTitle: 'امتثال الأقسام',
    statusBreakdownTitle: 'توزيع الحالات',
    courseComplianceTitle: 'امتثال الدورات',
    compliancePct: 'نسبة الامتثال %',
    count: 'العدد',

    // Table headers
    employeeId: 'رقم الموظف',
    employeeName: 'اسم الموظف',
    department: 'القسم',
    jobTitle: 'المسمى الوظيفي',
    course: 'الدورة',
    status: 'الحالة',
    expiryDate: 'تاريخ الانتهاء',
    daysRemaining: 'الأيام المتبقية',
    priority: 'الأولوية',
    action: 'الإجراء',
    employmentStatus: 'حالة التوظيف',
    issueDate: 'تاريخ الإصدار',
    certificate: 'رقم الشهادة',
    provider: 'مزود التدريب',

    // Priority levels
    priorityCritical: 'حرج',
    priorityHigh: 'عالٍ',
    priorityMedium: 'متوسط',
    priorityLow: 'منخفض',

    // Filters
    filterTitle: 'الفلاتر',
    clearFilters: 'مسح الكل',
    filterEmployeeId: 'رقم الموظف',
    filterEmployeeName: 'اسم الموظف',
    filterDepartment: 'القسم',
    filterJobTitle: 'المسمى الوظيفي',
    filterCourse: 'الدورة',
    filterStatus: 'حالة الامتثال',
    filterEmploymentStatus: 'حالة التوظيف',
    filterPriority: 'الأولوية',
    allDepartments: 'جميع الأقسام',
    allStatuses: 'جميع الحالات',
    allPriorities: 'جميع الأولويات',
    allEmploymentStatuses: 'جميع حالات التوظيف',
    allJobTitles: 'جميع المسميات',
    allCourses: 'جميع الدورات',

    // Pagination
    showing: 'عرض',
    to: 'إلى',
    of: 'من',
    records: 'سجلات',
    previous: 'السابق',
    next: 'التالي',
    pageSize: 'لكل صفحة',

    // States
    noData: 'لا توجد بيانات',
    noDataHint: 'قم بتحميل البيانات التجريبية أو استيراد ملف CSV/XLSX للبدء.',
    noResults: 'لا توجد سجلات تطابق الفلاتر المحددة.',
    loading: 'جارٍ التحميل…',
    requirementsNotLoaded: 'لم يتم تحميل مصفوفة المتطلبات',
    requirementsNotLoadedHint: 'استورد مصفوفة المتطلبات لتمكين اكتشاف التدريب المفقود.',

    // Import messages
    importSuccess: 'تم الاستيراد بنجاح',
    importWarning: 'اكتمل الاستيراد مع تحذيرات',
    importError: 'فشل الاستيراد',
    validRecords: 'سجلات صالحة',
    invalidRecords: 'سجلات غير صالحة تم تخطيها',
    duplicateGroups: 'مجموعات مكررة',
    demoLoaded: 'تم تحميل البيانات التجريبية',
    dataReset: 'تم مسح البيانات',

    // Data quality panel
    dataQualityTitle: 'مشكلات جودة البيانات',
    invalidRows: 'صفوف غير صالحة',
    duplicateRecords: 'سجلات مكررة',
    configWarnings: 'تحذيرات التهيئة',
    noIssues: 'لم يتم العثور على مشكلات في جودة البيانات.',
    unconfiguredEmployee: 'لا توجد متطلبات مُهيأة للموظف',
    row: 'صف',

    // Priority actions
    priorityActionsTitle: 'الإجراءات ذات الأولوية',
    noPriorityActions: 'لا توجد إجراءات ذات أولوية — جميع المتطلبات المُهيأة متوافقة.',
    renewImmediately: 'التجديد الفوري',
    scheduleRenewal: 'جدولة التجديد',
    startTraining: 'بدء التدريب',
    completePending: 'إتمام التدريب المعلق',

    // PDF
    pdfReportTitle: 'تقرير امتثال تدريب السلامة والصحة والبيئة',
    pdfGeneratedOn: 'تم الإنشاء في',
    pdfDataSource: 'مصدر البيانات',
    pdfAsOfDate: 'تاريخ المرجع',
    pdfSummary: 'الملخص التنفيذي',
    pdfStatusSummary: 'ملخص الحالات',
    pdfDeptCompliance: 'امتثال الأقسام',
    pdfCourseCompliance: 'امتثال الدورات',
    pdfPriorityActions: 'الإجراءات ذات الأولوية',
    pdfDataQuality: 'جودة البيانات',
    pdfAssumptions: 'الافتراضات',
    pdfAssumptionsText: 'الامتثال = صالح + ينتهي خلال 30/60/90 يومًا. منتهي الصلاحية وقيد التنفيذ ولم يبدأ والمفقود = غير متوافق. غير المطلوب مستثنى من الحسابات. الموظفون غير النشطين مستثنون من مقامات مؤشرات الأداء.',
    pdfPage: 'صفحة',
    pdfNotAvailableArabic: 'تصدير PDF العربي غير مدعوم — تم تصدير PDF بالإنجليزية.',

    // Columns
    total: 'الإجمالي',
    compliant: 'متوافق',
    nonCompliant: 'غير متوافق',
    percentage: 'نسبة الامتثال %',
  },
};

export function createI18n(lang = 'en') {
  return {
    t: (key) => translations[lang]?.[key] ?? translations.en[key] ?? key,
    lang,
    isRTL: lang === 'ar',
    dir: lang === 'ar' ? 'rtl' : 'ltr',
  };
}

export const SUPPORTED_LANGUAGES = ['en', 'ar'];
export const LANGUAGE_NAMES = { en: 'English', ar: 'عربي' };

export default translations;
