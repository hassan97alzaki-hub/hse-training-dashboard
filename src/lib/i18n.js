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
    kpiDescImmediateAction: 'Immediate action required',
    kpiDescNoRecord: 'No training record on file',
    kpiDescReqCompliantSuffix: 'requirements compliant',
    kpiDescEmployeesSuffix: 'employees',
    kpiSubNoMandatoryReqs: 'no mandatory reqs',

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

    // Compliance detail section
    complianceDetailTitle: 'Compliance Detail',
    showInactiveLabel: 'Show Inactive/Left employees',
    complianceDetailHint: 'Global KPI cards reflect the full dataset. Table filters apply to this table only.',
    unconfiguredSectionTitle: 'Requirements Not Configured',
    unconfiguredSectionHint: 'These active employees have training records but no matching Department/Job_Title in the requirements matrix. They are excluded from compliance KPI denominators until requirements are configured.',
    employeesSuffix: 'employee(s)',

    // Priority actions
    priorityActionsTitle: 'Priority Actions',
    noPriorityActions: 'No priority actions — all configured requirements are compliant.',
    renewImmediately: 'Renew Certificate',
    scheduleRenewal: 'Schedule Renewal',
    startTraining: 'Start Training',
    completePending: 'Complete Training',

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

    // Executive summary
    execSummaryTitle: 'Executive Summary',
    execOverallCompliance: 'Overall Compliance',
    execImmediateAction: 'Employees Requiring Immediate Action',
    execMissingTraining: 'Missing Training',
    execDuplicateRecords: 'Duplicate Records',
    execTopRiskDept: 'Top Risk Department',
    execNoRisk: 'None — fully compliant',

    // Header / branding
    lastRefresh: 'Last Refresh',
    companyLogoAlt: 'Company logo',
    projectLogoAlt: 'Project logo',
    neverRefreshed: 'Not yet loaded',

    // Filters — groups
    filterGroupEmployee: 'Employee',
    filterGroupClassification: 'Classification',
    filterGroupStatus: 'Status & Priority',
    filterGroupEmployment: 'Employment',
    collapseFilters: 'Collapse filters',
    expandFilters: 'Expand filters',

    // Pagination aria
    ariaPrevPage: 'Previous page',
    ariaNextPage: 'Next page',

    // Data quality cards
    dqInvalidTitle: 'Invalid Data',
    dqDuplicateTitle: 'Duplicate Records',
    dqConfigTitle: 'Missing Configuration',
    dqAllClearTitle: 'No Data Quality Issues',
    dqAllClearBody: 'All imported records passed validation and every active employee has configured requirements.',

    // Footer
    footerVersion: 'Version',
    footerBuild: 'Build',
    footerEnvironment: 'Environment',
    footerEnvironmentValue: 'Management Demonstration — Local Browser Session',
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
    kpiDescImmediateAction: 'يتطلب إجراءً فورياً',
    kpiDescNoRecord: 'لا يوجد سجل تدريب',
    kpiDescReqCompliantSuffix: 'متطلبات متوافقة',
    kpiDescEmployeesSuffix: 'موظف',
    kpiSubNoMandatoryReqs: 'بدون متطلبات إلزامية',

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

    // Compliance detail section
    complianceDetailTitle: 'تفاصيل الامتثال',
    showInactiveLabel: 'إظهار الموظفين غير النشطين/المغادرين',
    complianceDetailHint: 'تعكس بطاقات المؤشرات الرئيسية كامل البيانات. تُطبَّق عوامل التصفية على هذا الجدول فقط.',
    unconfiguredSectionTitle: 'متطلبات غير مُهيأة',
    unconfiguredSectionHint: 'هؤلاء الموظفون النشطون لديهم سجلات تدريب لكن لا يوجد قسم/مسمى وظيفي مطابق في مصفوفة المتطلبات. يُستبعدون من مقامات مؤشرات الامتثال إلى أن تتم تهيئة المتطلبات.',
    employeesSuffix: 'موظف(ين)',

    // Priority actions
    priorityActionsTitle: 'الإجراءات ذات الأولوية',
    noPriorityActions: 'لا توجد إجراءات ذات أولوية — جميع المتطلبات المُهيأة متوافقة.',
    renewImmediately: 'تجديد الشهادة',
    scheduleRenewal: 'جدولة التجديد',
    startTraining: 'بدء التدريب',
    completePending: 'إتمام التدريب',

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

    // Executive summary
    execSummaryTitle: 'الملخص التنفيذي',
    execOverallCompliance: 'الامتثال الإجمالي',
    execImmediateAction: 'موظفون بحاجة لإجراء فوري',
    execMissingTraining: 'تدريب مفقود',
    execDuplicateRecords: 'سجلات مكررة',
    execTopRiskDept: 'القسم الأعلى خطورة',
    execNoRisk: 'لا يوجد — امتثال كامل',

    // Header / branding
    lastRefresh: 'آخر تحديث',
    companyLogoAlt: 'شعار الشركة',
    projectLogoAlt: 'شعار المشروع',
    neverRefreshed: 'لم يتم التحميل بعد',

    // Filters — groups
    filterGroupEmployee: 'الموظف',
    filterGroupClassification: 'التصنيف',
    filterGroupStatus: 'الحالة والأولوية',
    filterGroupEmployment: 'التوظيف',
    collapseFilters: 'طي الفلاتر',
    expandFilters: 'توسيع الفلاتر',

    // Pagination aria
    ariaPrevPage: 'الصفحة السابقة',
    ariaNextPage: 'الصفحة التالية',

    // Data quality cards
    dqInvalidTitle: 'بيانات غير صالحة',
    dqDuplicateTitle: 'سجلات مكررة',
    dqConfigTitle: 'تهيئة مفقودة',
    dqAllClearTitle: 'لا توجد مشكلات في جودة البيانات',
    dqAllClearBody: 'اجتازت جميع السجلات المستوردة التحقق، ولدى كل موظف نشط متطلبات مُهيأة.',

    // Footer
    footerVersion: 'الإصدار',
    footerBuild: 'البناء',
    footerEnvironment: 'البيئة',
    footerEnvironmentValue: 'عرض توضيحي للإدارة — جلسة متصفح محلية',
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
