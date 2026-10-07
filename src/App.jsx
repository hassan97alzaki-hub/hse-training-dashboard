import { useState, useMemo, useCallback } from 'react';
import { ClipboardList } from 'lucide-react';
import { DEMO_AS_OF_DATE, DEFAULT_COMPANY, DEFAULT_PROJECT } from './lib/constants.js';
import { getRuntimeAsOfDate } from './lib/clock.js';
import { createI18n } from './lib/i18n.js';
import { buildComplianceUniverse, calculateKPIs, getPriorityActions } from './lib/complianceEngine.js';
import { importTrainingFile, importRequirementsFile } from './lib/dataImport.js';
import { loadDemoDataFromPublic } from './lib/demoData.js';
import {
  readWorkbookFromFile, looksLikeMatrixWorkbook, readMatrixSheets,
  convertMatrixWorkbook, compareSourceStatus, toImportResult,
} from './lib/matrixWorkbook.js';
import { exportComplianceCSV, exportPriorityActionsCSV, exportManagementPDF } from './lib/exportService.js';
import { defaultBatchId, defaultApprovedAt } from './lib/localBatch.js';
import {
  REQUIREMENTS_PROVENANCE, resolveRequirementsProvenance,
} from './lib/contract/requirementsProvenance.js';
import { readTrialConfig, resolveTrialState, customerDataAllowed } from './lib/trial.js';
import { createApprovedState, clearOrganizationBinding } from './lib/contract/staging.js';
import {
  readProductionWorkbook, isProductionPackage, validateProductionPackage,
  buildProductionPreview, approveProductionPackage,
  projectForDisplay, projectEmployeesForDisplay,
} from './lib/contract/productionPackage.js';

import Header from './components/Header.jsx';
import ImportPanel from './components/ImportPanel.jsx';
import ExecutiveSummary from './components/ExecutiveSummary.jsx';
import KpiCards from './components/KpiCards.jsx';
import Filters from './components/Filters.jsx';
import ComplianceTable from './components/ComplianceTable.jsx';
import { DeptComplianceChart, StatusBreakdownChart, CourseComplianceChart } from './components/Charts.jsx';
import PriorityActions from './components/PriorityActions.jsx';
import DataQualityPanel from './components/DataQualityPanel.jsx';
import MatrixImportPreview from './components/MatrixImportPreview.jsx';
import ProductionPackagePreview from './components/ProductionPackagePreview.jsx';
import TestRequirementsBanner from './components/TestRequirementsBanner.jsx';
import TrialBanner from './components/TrialBanner.jsx';
import TrialQuickStart from './components/TrialQuickStart.jsx';
import Footer from './components/Footer.jsx';

import './styles/dashboard.css';

const EMPTY_FILTERS = {
  employeeId: '', employeeName: '', department: '', jobTitle: '',
  course: '', status: '', employmentStatus: '', priority: '',
};

export default function App({
  now = defaultApprovedAt,
  newBatchId = defaultBatchId,
  // Injectable so a test never depends on the build environment or the clock.
  trialConfig,
  trialNow,
} = {}) {
  // Trial Mode is a build-time presentation layer. Without VITE_TRIAL_MODE the
  // state is `off` and nothing below changes behaviour.
  const trial = useMemo(() => {
    const config = trialConfig ?? readTrialConfig();
    return resolveTrialState(config, trialNow ? trialNow() : new Date());
  }, [trialConfig, trialNow]);
  const customerDataEnabled = customerDataAllowed(trial);

  const [lang, setLang] = useState('en');
  const i18n = useMemo(() => createI18n(lang), [lang]);
  const t = i18n.t;

  const [companyName, setCompanyName] = useState(
    () => trial.phase !== 'off' && trial.company ? trial.company : DEFAULT_COMPANY,
  );
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT);

  const [trainingRecords, setTrainingRecords] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [lastImportResult, setLastImportResult] = useState(null);
  const [importBanner, setImportBanner] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceFileName, setSourceFileName] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [lastRefresh, setLastRefresh] = useState(null);
  // As Of Date: fixed DEMO_AS_OF_DATE only while demo data is loaded; otherwise today (Asia/Riyadh).
  const [asOfDate, setAsOfDate] = useState(() => getRuntimeAsOfDate());
  // Pending three-sheet workbook import, shown as a preview until approved.
  const [matrixPreview, setMatrixPreview] = useState(null);
  // Employee master list (three-sheet workbook only). null = derive employees
  // from training records, the original behaviour.
  const [employeeMaster, setEmployeeMaster] = useState(null);
  // Local Mode approved data of HSE-DC-1.0 packages, and the pending preview.
  const [approvedState, setApprovedState] = useState(() => createApprovedState());
  const [productionPreview, setProductionPreview] = useState(null);
  const [approverRole, setApproverRole] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  // Code → display name lookups of the approved production data.
  const [displayLookups, setDisplayLookups] = useState(null);
  // Where the loaded requirements come from. Only an approved HSE-DC-1.0
  // Requirements sheet is production data (AT-13).
  const [requirementsSource, setRequirementsSource] = useState(REQUIREMENTS_PROVENANCE.NONE);

  const visibleImportBanner = useMemo(() => {
    if (importBanner?.kind !== 'productionApproved') return importBanner;
    const { rowsNew, changed, unchanged, organizationCode } = importBanner;
    return {
      type: importBanner.type,
      title: t('ppApprovedTitle'),
      lines: [
        `${rowsNew} ${t('ppApprovedRows')} · ${changed} ${t('ppApprovedChanged')} · ${unchanged} ${t('ppApprovedUnchanged')}`,
        `${t('ppOrgBound')}: ${organizationCode}`,
      ],
    };
  }, [importBanner, t]);

  // A derived row wins over the declared source, so test data can never be
  // shown as approved.
  const requirementsProvenance = useMemo(
    () => resolveRequirementsProvenance(requirements, requirementsSource),
    [requirements, requirementsSource],
  );

  const complianceResult = useMemo(() => {
    if (trainingRecords.length === 0 && !employeeMaster?.length) return null;
    return buildComplianceUniverse(trainingRecords, requirements, asOfDate, employeeMaster ?? undefined);
  }, [trainingRecords, requirements, asOfDate, employeeMaster]);

  const kpis = useMemo(() => {
    if (!complianceResult) return null;
    return calculateKPIs(
      complianceResult.universe,
      complianceResult.employees,
      complianceResult.unconfiguredEmployees,
    );
  }, [complianceResult]);

  const priorityActions = useMemo(() => {
    if (!complianceResult) return [];
    return getPriorityActions(complianceResult.universe);
  }, [complianceResult]);

  // Display projection: codes stay the matching keys inside the engine; the
  // names are added afterwards, in the language of the interface.
  const displayUniverse = useMemo(
    () => projectForDisplay(complianceResult?.universe ?? [], displayLookups, lang),
    [complianceResult, displayLookups, lang],
  );
  const displayInactiveUniverse = useMemo(
    () => projectForDisplay(complianceResult?.inactiveUniverse ?? [], displayLookups, lang),
    [complianceResult, displayLookups, lang],
  );
  const displayUnconfigured = useMemo(
    () => projectEmployeesForDisplay(complianceResult?.unconfiguredEmployees ?? [], displayLookups, lang),
    [complianceResult, displayLookups, lang],
  );
  const displayKpis = useMemo(() => {
    if (!kpis || !displayLookups) return kpis;
    const name = (lookup, code) => {
      const row = lookup?.get(code);
      if (!row) return code;
      const value = lang === 'ar' ? row.name_ar || row.name_en : row.name_en || row.name_ar;
      return value || code;
    };
    return {
      ...kpis,
      departmentCompliance: kpis.departmentCompliance.map((entry) => ({
        ...entry,
        department_code: entry.department,
        department: name(displayLookups.departments, entry.department),
      })),
      courseCompliance: kpis.courseCompliance.map((entry) => ({
        ...entry,
        course_name: name(displayLookups.courses, entry.course_code) || entry.course_name,
      })),
    };
  }, [kpis, displayLookups, lang]);
  const displayPriorityActions = useMemo(
    () => projectForDisplay(priorityActions, displayLookups, lang),
    [priorityActions, displayLookups, lang],
  );

  const filterOptions = useMemo(() => {
    if (!complianceResult) return {};
    const universe = displayUniverse;
    const departments = [...new Set(universe.map(i => i.Department).filter(Boolean))].sort();
    const jobTitles = [...new Set(universe.map(i => i.Job_Title).filter(Boolean))].sort();
    const courseSet = new Map();
    for (const i of universe) if (i.Course_Code) courseSet.set(i.Course_Code, i.Course_Name);
    const courses = [...courseSet.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
    const departmentNames = new Map(universe.map(i => [i.Department, i.Department_Name ?? i.Department]));
    const jobTitleNames = new Map(universe.map(i => [i.Job_Title, i.Job_Title_Name ?? i.Job_Title]));
    return { departments, jobTitles, courses, departmentNames, jobTitleNames };
  }, [complianceResult, displayUniverse]);

  const showBanner = useCallback((type, title, lines = []) => {
    setImportBanner({ type, title, lines });
  }, []);

  /** Any legacy path drops the production binding first (§6). */
  function clearProductionBinding() {
    setApprovedState((state) => clearOrganizationBinding(state));
    setProductionPreview(null);
    setDisplayLookups(null);
    setApproverRole('');
  }

  async function handleLoadDemo() {
    setIsLoading(true);
    setImportBanner(null);
    clearProductionBinding();
    try {
      const { trainingResult, reqResult } = await loadDemoDataFromPublic();
      if (trainingResult.success) {
        setEmployeeMaster(null);
        setTrainingRecords(trainingResult.validRecords);
        setSourceFileName(trainingResult.sourceFileName);
        setLastImportResult(trainingResult);
      }
      if (reqResult.success) {
        setRequirements(reqResult.validRecords);
        setRequirementsSource(REQUIREMENTS_PROVENANCE.DEMO);
      }
      const lines = [
        `Training: ${trainingResult.importSummary.valid} valid, ${trainingResult.importSummary.invalid} invalid, ${trainingResult.importSummary.duplicates} duplicate groups`,
        `Requirements: ${reqResult.importSummary.valid} rows loaded`,
      ];
      showBanner('success', t('demoLoaded'), lines);
      if (trainingResult.success) setAsOfDate(DEMO_AS_OF_DATE);
      setLastRefresh(new Date().toLocaleString());
    } catch (e) {
      showBanner('error', t('importError'), [e.message]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTrainingImport(file) {
    // UX gate only (see src/lib/trial.js): an ended trial hides the feature,
    // it does not protect the page.
    if (!customerDataEnabled) {
      showBanner('warning', t('trialImportBlocked'), []);
      return;
    }
    setIsLoading(true);
    setImportBanner(null);
    setMatrixPreview(null);
    setProductionPreview(null);
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        // 1. HSE-DC-1.0 production package.
        const parsed = await readProductionWorkbook(file);
        if (isProductionPackage(parsed)) {
          const previewAsOf = getRuntimeAsOfDate();
          const validated = await validateProductionPackage(parsed, { approvedState, asOfDate: previewAsOf });
          const metadata = {
            batchId: newBatchId(),
            preparedByRole: validated.contract.prepared_by_role ?? '',
            approvedByRole: approverRole || 'pending',
            approvedAt: now(),
          };
          const preview = await buildProductionPreview(validated, { approvedState, approvalMetadata: metadata });
          setProductionPreview({ ...preview, fileName: file.name, batchId: metadata.batchId, asOfDate: previewAsOf });
          return;
        }

        // 2. Legacy three-sheet Training Matrix workbook.
        const workbook = await readWorkbookFromFile(file);
        if (looksLikeMatrixWorkbook(workbook)) {
          const conversion = convertMatrixWorkbook(readMatrixSheets(workbook));
          const previewAsOf = getRuntimeAsOfDate();
          let comparison = null;
          if (conversion.employees.length > 0) {
            const cr = buildComplianceUniverse(conversion.trainingRecords, conversion.requirements, previewAsOf, conversion.employees);
            comparison = compareSourceStatus(conversion.sourceStatuses, cr.universe);
          }
          setMatrixPreview({ conversion, comparison, asOfDate: previewAsOf, fileName: file.name });
          clearProductionBinding();
          return;
        }
      }
      // 3. Legacy CSV / XLSX path.
      clearProductionBinding();
      const result = await importTrainingFile(file);
      if (result.success) {
        setLastImportResult(result);
        setEmployeeMaster(null);
        setTrainingRecords(result.validRecords);
        setSourceFileName(result.sourceFileName);
        const lines = [
          `${result.importSummary.valid} ${t('validRecords')}, ${result.importSummary.invalid} ${t('invalidRecords')}, ${result.importSummary.duplicates} ${t('duplicateGroups')}`,
          ...result.warnings,
        ];
        showBanner(result.importSummary.invalid > 0 ? 'warning' : 'success', t('importSuccess'), lines);
        setAsOfDate(getRuntimeAsOfDate());
        setLastRefresh(new Date().toLocaleString());
      } else {
        showBanner('error', t('importError'), result.errors.slice(0, 6));
      }
    } catch (e) {
      showBanner('error', t('importError'), [e.message]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleApproveMatrix() {
    if (!customerDataEnabled) {
      showBanner('warning', t('trialImportBlocked'), []);
      return;
    }
    const { conversion, asOfDate: previewAsOf, fileName } = matrixPreview;
    const result = toImportResult(conversion, fileName);
    setLastImportResult(result);
    setEmployeeMaster(conversion.employees);
    setTrainingRecords(result.validRecords);
    setRequirements(conversion.requirements);
    setRequirementsSource(REQUIREMENTS_PROVENANCE.DERIVED);
    setSourceFileName(fileName);
    setAsOfDate(previewAsOf);
    setLastRefresh(new Date().toLocaleString());
    const c = conversion.counts;
    showBanner(conversion.warningCount > 0 ? 'warning' : 'success', t('importSuccess'), [
      `${c.importedRecords} ${t('mxBannerImported')} · ${c.skippedNoEvidence} ${t('mxCountSkipped')}`,
      `${c.requirementRows} ${t('mxCountRequirements')}`,
    ]);
    setMatrixPreview(null);
  }

  async function handleApproveProductionPackage() {
    if (!productionPreview || isApplying) return;
    if (!customerDataEnabled) {
      showBanner('warning', t('trialImportBlocked'), []);
      return;
    }
    setIsApplying(true);
    try {
      const metadata = {
        batchId: productionPreview.batchId,
        preparedByRole: productionPreview.validated.contract.prepared_by_role ?? '',
        approvedByRole: approverRole.trim(),
        approvedAt: now(),
      };
      const result = await approveProductionPackage(approvedState, productionPreview.validated, metadata);
      if (!result.ok) {
        showBanner('error', t('ppBlockedNote'), [
          `${t('ppBlocks')}: ${result.plan.counts.blocking}`,
        ]);
        setProductionPreview({ ...productionPreview, plan: result.plan, impact: { ...productionPreview.impact, after: null } });
        return;
      }

      setApprovedState(result.state);
      setDisplayLookups(result.view.prepared.lookups);
      setEmployeeMaster(result.view.prepared.employees);
      setTrainingRecords(result.view.prepared.records);
      setRequirements(result.view.prepared.requirements);
      setRequirementsSource(REQUIREMENTS_PROVENANCE.APPROVED);
      setSourceFileName(productionPreview.fileName);
      setAsOfDate(productionPreview.asOfDate);
      setLastImportResult(null);
      setLastRefresh(new Date().toLocaleString());
      setProductionPreview(null);

      const counts = result.plan.counts;
      const sum = (suffix) => Object.entries(counts)
        .filter(([key]) => key.endsWith(suffix))
        .reduce((total, [, value]) => total + value, 0);
      setImportBanner({
        type: 'success',
        kind: 'productionApproved',
        rowsNew: sum('.new'),
        changed: sum('.changed'),
        unchanged: sum('.unchanged'),
        organizationCode: result.state.organizationCode,
      });
    } catch (e) {
      showBanner('error', t('importError'), [e.message]);
    } finally {
      setIsApplying(false);
    }
  }

  async function handleRequirementsImport(file) {
    if (!customerDataEnabled) {
      showBanner('warning', t('trialImportBlocked'), []);
      return;
    }
    setIsLoading(true);
    setImportBanner(null);
    // A legacy path never sits on approved production data (§6).
    clearProductionBinding();
    try {
      const result = await importRequirementsFile(file);
      if (result.success) {
        setRequirements(result.validRecords);
        setRequirementsSource(REQUIREMENTS_PROVENANCE.LEGACY);
        showBanner('success', `Requirements loaded — ${result.importSummary.valid} rows`, result.warnings);
      } else {
        showBanner('error', t('importError'), result.errors.slice(0, 6));
      }
    } catch (e) {
      showBanner('error', t('importError'), [e.message]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleExportPDF() {
    if (!kpis) return;
    exportManagementPDF({
      companyName, projectName,
      asOfDate,
      sourceFileName,
      kpis: displayKpis, priorityActions: displayPriorityActions,
      dataQuality: {
        invalidRows: lastImportResult?.importSummary?.invalid || 0,
        duplicateGroups: complianceResult?.duplicates?.length || 0,
        configWarnings: complianceResult?.configWarnings?.length || 0,
      },
      universe: displayUniverse,
      requirementsProvenance,
      lang, t,
    });
  }

  function handleExportCSV() {
    if (!complianceResult) return;
    exportComplianceCSV(displayUniverse, displayKpis, { asOfDate, requirementsProvenance }, t);
  }

  function handleExportPriorityCSV() {
    if (priorityActions.length === 0) return;
    exportPriorityActionsCSV(displayPriorityActions, { asOfDate, requirementsProvenance }, t);
  }

  function handleReset() {
    setTrainingRecords([]); setRequirements([]); setLastImportResult(null);
    setRequirementsSource(REQUIREMENTS_PROVENANCE.NONE);
    setImportBanner({ type: 'success', title: t('dataReset'), lines: [] });
    setSourceFileName(''); setFilters(EMPTY_FILTERS); setLastRefresh(null); setMatrixPreview(null);
    setEmployeeMaster(null);
    clearProductionBinding();
    setAsOfDate(getRuntimeAsOfDate());
  }

  const hasData = trainingRecords.length > 0 || (employeeMaster?.length ?? 0) > 0;
  const hasRequirements = requirements.length > 0;

  return (
    <div className="app-shell" dir={i18n.dir}>
      <Header
        companyName={companyName} projectName={projectName}
        asOfDate={asOfDate} lang={lang} t={t}
        onLangToggle={() => setLang(l => l === 'en' ? 'ar' : 'en')}
        onCompanyChange={setCompanyName} onProjectChange={setProjectName}
        lastRefresh={lastRefresh}
        onExportPDF={handleExportPDF} onExportCSV={handleExportCSV}
        onExportPriorityCSV={handleExportPriorityCSV} hasData={hasData}
      />

      <main className="main-content">
        <TrialBanner state={trial} t={t} />

        <ImportPanel
          t={t}
          onLoadDemo={handleLoadDemo}
          onTrainingImport={handleTrainingImport}
          onRequirementsImport={handleRequirementsImport}
          onReset={handleReset}
          hasData={hasData} hasRequirements={hasRequirements}
          isLoading={isLoading} importBanner={visibleImportBanner}
          customerDataAllowed={customerDataEnabled}
        />

        {trial.phase !== 'off' && !hasData && (
          <TrialQuickStart t={t} customerDataAllowed={customerDataEnabled} />
        )}

        {productionPreview && (
          <ProductionPackagePreview
            preview={productionPreview}
            fileName={productionPreview.fileName}
            approverRole={approverRole}
            onApproverRoleChange={setApproverRole}
            onApprove={handleApproveProductionPackage}
            onCancel={() => setProductionPreview(null)}
            isApplying={isApplying}
            t={t}
          />
        )}

        {matrixPreview && (
          <MatrixImportPreview
            preview={matrixPreview} t={t}
            onApprove={handleApproveMatrix}
            onCancel={() => setMatrixPreview(null)}
          />
        )}

        {!hasData && (
          <div className="empty-state">
            <div className="empty-icon"><ClipboardList size={26} /></div>
            <h3>{t('noData')}</h3>
            <p>{t('noDataHint')}</p>
            {!hasRequirements && (
              <p style={{ marginTop: 8, fontSize: 12 }}>{t('requirementsNotLoadedHint')}</p>
            )}
          </div>
        )}

        {hasData && (
          <>
            <TestRequirementsBanner provenance={requirementsProvenance} t={t} />

            <ExecutiveSummary
              kpis={displayKpis}
              priorityActions={priorityActions}
              duplicateCount={complianceResult?.duplicates?.length || 0}
              t={t}
            />

            <KpiCards kpis={displayKpis} t={t} />

            <div className="charts-grid">
              <div className="chart-wrap">
                <div className="chart-title">{t('deptComplianceTitle')}</div>
                <DeptComplianceChart data={displayKpis?.departmentCompliance} t={t} lang={lang} />
              </div>
              <div className="chart-wrap">
                <div className="chart-title">{t('statusBreakdownTitle')}</div>
                <StatusBreakdownChart statusCounts={kpis?.statusCounts} t={t} lang={lang} />
              </div>
            </div>

            <div className="section">
              <div className="section-header">
                <span className="section-title">{t('courseComplianceTitle')}</span>
              </div>
              <CourseComplianceChart data={displayKpis?.courseCompliance} t={t} lang={lang} />
            </div>

            <div className="section">
              <div className="section-header">
                <span className="section-title">{t('complianceDetailTitle')}</span>
                <label className="checkbox-label">
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  {t('showInactiveLabel')}
                </label>
              </div>
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                {t('complianceDetailHint')}
              </p>
              <Filters
                filters={filters} options={filterOptions} t={t}
                onChange={(k, v) => setFilters(prev => ({ ...prev, [k]: v }))}
                onClear={() => setFilters(EMPTY_FILTERS)}
              />
              <ComplianceTable
                universe={displayUniverse}
                inactiveUniverse={displayInactiveUniverse}
                filters={filters} t={t} lang={lang} showInactive={showInactive}
              />
            </div>

            <div className="section">
              <div className="section-header">
                <span className="section-title">{t('priorityActionsTitle')}</span>
                {priorityActions.length > 0 && (
                  <span className="badge-count" style={{ background: '#dc2626' }}>{priorityActions.length}</span>
                )}
              </div>
              <PriorityActions actions={displayPriorityActions} t={t} lang={lang} />
            </div>

            <div className="section">
              <div className="section-header">
                <span className="section-title">{t('dataQualityTitle')}</span>
              </div>
              <DataQualityPanel
                importResult={lastImportResult}
                unconfiguredEmployees={complianceResult?.unconfiguredEmployees || []}
                duplicates={complianceResult?.duplicates || []}
                configWarnings={complianceResult?.configWarnings || []}
                t={t}
              />
            </div>

            {(complianceResult?.unconfiguredEmployees?.length ?? 0) > 0 && (
              <div className="section" style={{ '--accent-line': 'var(--info)', borderLeft: '3px solid var(--info)' }}>
                <div className="section-title" style={{ color: 'var(--info)', marginBottom: 8 }}>
                  {t('unconfiguredSectionTitle')} ({complianceResult.unconfiguredEmployees.length} {t('employeesSuffix')})
                </div>
                <p className="text-muted text-sm" style={{ marginBottom: 8 }}>
                  {t('unconfiguredSectionHint')}
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('employeeId')}</th>
                        <th>{t('employeeName')}</th>
                        <th>{t('department')}</th>
                        <th>{t('jobTitle')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayUnconfigured.map((emp, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{emp.Employee_ID}</td>
                          <td>{emp.Employee_Name}</td>
                          <td>{emp.Department_Name ?? emp.Department}</td>
                          <td>{emp.Job_Title_Name ?? emp.Job_Title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <Footer t={t} asOfDate={asOfDate} isTrial={trial.phase !== 'off'} />
    </div>
  );
}
