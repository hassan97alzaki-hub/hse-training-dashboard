import { useState, useMemo, useCallback } from 'react';
import { ClipboardList } from 'lucide-react';
import { DEMO_AS_OF_DATE, DEFAULT_COMPANY, DEFAULT_PROJECT } from './lib/constants.js';
import { getRuntimeAsOfDate } from './lib/clock.js';
import { createI18n } from './lib/i18n.js';
import { buildComplianceUniverse, calculateKPIs, getPriorityActions } from './lib/complianceEngine.js';
import { importTrainingFile, importRequirementsFile } from './lib/dataImport.js';
import { loadDemoDataFromPublic } from './lib/demoData.js';
import {
  readWorkbookFromFile, isMatrixWorkbook, readMatrixSheets,
  convertMatrixWorkbook, compareSourceStatus, toImportResult,
} from './lib/matrixWorkbook.js';
import { exportComplianceCSV, exportPriorityActionsCSV, exportManagementPDF } from './lib/exportService.js';

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
import Footer from './components/Footer.jsx';

import './styles/dashboard.css';

const EMPTY_FILTERS = {
  employeeId: '', employeeName: '', department: '', jobTitle: '',
  course: '', status: '', employmentStatus: '', priority: '',
};

export default function App() {
  const [lang, setLang] = useState('en');
  const i18n = useMemo(() => createI18n(lang), [lang]);
  const t = i18n.t;

  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY);
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

  const filterOptions = useMemo(() => {
    if (!complianceResult) return {};
    const universe = complianceResult.universe;
    const departments = [...new Set(universe.map(i => i.Department).filter(Boolean))].sort();
    const jobTitles = [...new Set(universe.map(i => i.Job_Title).filter(Boolean))].sort();
    const courseSet = new Map();
    for (const i of universe) if (i.Course_Code) courseSet.set(i.Course_Code, i.Course_Name);
    const courses = [...courseSet.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
    return { departments, jobTitles, courses };
  }, [complianceResult]);

  const showBanner = useCallback((type, title, lines = []) => {
    setImportBanner({ type, title, lines });
  }, []);

  async function handleLoadDemo() {
    setIsLoading(true);
    setImportBanner(null);
    try {
      const { trainingResult, reqResult } = await loadDemoDataFromPublic();
      if (trainingResult.success) {
        setEmployeeMaster(null);
        setTrainingRecords(trainingResult.validRecords);
        setSourceFileName(trainingResult.sourceFileName);
        setLastImportResult(trainingResult);
      }
      if (reqResult.success) setRequirements(reqResult.validRecords);
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
    setIsLoading(true);
    setImportBanner(null);
    setMatrixPreview(null);
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        const workbook = await readWorkbookFromFile(file);
        if (isMatrixWorkbook(workbook)) {
          const conversion = convertMatrixWorkbook(readMatrixSheets(workbook));
          const previewAsOf = getRuntimeAsOfDate();
          let comparison = null;
          if (conversion.employees.length > 0) {
            const cr = buildComplianceUniverse(conversion.trainingRecords, conversion.requirements, previewAsOf, conversion.employees);
            comparison = compareSourceStatus(conversion.sourceStatuses, cr.universe);
          }
          setMatrixPreview({ conversion, comparison, asOfDate: previewAsOf, fileName: file.name });
          return;
        }
      }
      const result = await importTrainingFile(file);
      setLastImportResult(result);
      if (result.success) {
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
    const { conversion, asOfDate: previewAsOf, fileName } = matrixPreview;
    const result = toImportResult(conversion, fileName);
    setLastImportResult(result);
    setEmployeeMaster(conversion.employees);
    setTrainingRecords(result.validRecords);
    setRequirements(conversion.requirements);
    setSourceFileName(fileName);
    setAsOfDate(previewAsOf);
    setLastRefresh(new Date().toLocaleString());
    const c = conversion.counts;
    showBanner(conversion.warningCount > 0 ? 'warning' : 'success', t('importSuccess'), [
      `${c.importedRecords} ${t('mxCountImported')} · ${c.skippedNoEvidence} ${t('mxCountSkipped')}`,
      `${c.requirementRows} ${t('mxCountRequirements')}`,
    ]);
    setMatrixPreview(null);
  }

  async function handleRequirementsImport(file) {
    setIsLoading(true);
    setImportBanner(null);
    try {
      const result = await importRequirementsFile(file);
      if (result.success) {
        setRequirements(result.validRecords);
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
      kpis, priorityActions,
      dataQuality: {
        invalidRows: lastImportResult?.importSummary?.invalid || 0,
        duplicateGroups: complianceResult?.duplicates?.length || 0,
        configWarnings: complianceResult?.configWarnings?.length || 0,
      },
      universe: complianceResult?.universe || [],
      lang, t,
    });
  }

  function handleExportCSV() {
    if (!complianceResult) return;
    exportComplianceCSV(complianceResult.universe, kpis, { asOfDate }, t);
  }

  function handleExportPriorityCSV() {
    if (priorityActions.length === 0) return;
    exportPriorityActionsCSV(priorityActions, { asOfDate }, t);
  }

  function handleReset() {
    setTrainingRecords([]); setRequirements([]); setLastImportResult(null);
    setImportBanner({ type: 'success', title: t('dataReset'), lines: [] });
    setSourceFileName(''); setFilters(EMPTY_FILTERS); setLastRefresh(null); setMatrixPreview(null);
    setEmployeeMaster(null);
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
        <ImportPanel
          t={t}
          onLoadDemo={handleLoadDemo}
          onTrainingImport={handleTrainingImport}
          onRequirementsImport={handleRequirementsImport}
          onReset={handleReset}
          hasData={hasData} hasRequirements={hasRequirements}
          isLoading={isLoading} importBanner={importBanner}
        />

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
            <ExecutiveSummary
              kpis={kpis}
              priorityActions={priorityActions}
              duplicateCount={complianceResult?.duplicates?.length || 0}
              t={t}
            />

            <KpiCards kpis={kpis} t={t} />

            <div className="charts-grid">
              <div className="chart-wrap">
                <div className="chart-title">{t('deptComplianceTitle')}</div>
                <DeptComplianceChart data={kpis?.departmentCompliance} t={t} lang={lang} />
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
              <CourseComplianceChart data={kpis?.courseCompliance} t={t} lang={lang} />
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
                universe={complianceResult?.universe || []}
                inactiveUniverse={complianceResult?.inactiveUniverse || []}
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
              <PriorityActions actions={priorityActions} t={t} lang={lang} />
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
                      {complianceResult.unconfiguredEmployees.map((emp, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{emp.Employee_ID}</td>
                          <td>{emp.Employee_Name}</td>
                          <td>{emp.Department}</td>
                          <td>{emp.Job_Title}</td>
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

      <Footer t={t} asOfDate={asOfDate} />
    </div>
  );
}
