import { useState, useMemo, useCallback } from 'react';
import { DEMO_AS_OF_DATE, DEFAULT_COMPANY, DEFAULT_PROJECT } from './lib/constants.js';
import { createI18n } from './lib/i18n.js';
import { buildComplianceUniverse, calculateKPIs, getPriorityActions } from './lib/complianceEngine.js';
import { importTrainingFile, importRequirementsFile } from './lib/dataImport.js';
import { loadDemoDataFromPublic } from './lib/demoData.js';
import { exportComplianceCSV, exportPriorityActionsCSV, exportManagementPDF } from './lib/exportService.js';

import Header from './components/Header.jsx';
import ImportPanel from './components/ImportPanel.jsx';
import KpiCards from './components/KpiCards.jsx';
import Filters from './components/Filters.jsx';
import ComplianceTable from './components/ComplianceTable.jsx';
import { DeptComplianceChart, StatusBreakdownChart, CourseComplianceChart } from './components/Charts.jsx';
import PriorityActions from './components/PriorityActions.jsx';
import DataQualityPanel from './components/DataQualityPanel.jsx';

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

  const complianceResult = useMemo(() => {
    if (trainingRecords.length === 0) return null;
    return buildComplianceUniverse(trainingRecords, requirements, DEMO_AS_OF_DATE);
  }, [trainingRecords, requirements]);

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
    } catch (e) {
      showBanner('error', t('importError'), [e.message]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTrainingImport(file) {
    setIsLoading(true);
    setImportBanner(null);
    try {
      const result = await importTrainingFile(file);
      setLastImportResult(result);
      if (result.success) {
        setTrainingRecords(result.validRecords);
        setSourceFileName(result.sourceFileName);
        const lines = [
          `${result.importSummary.valid} ${t('validRecords')}, ${result.importSummary.invalid} ${t('invalidRecords')}, ${result.importSummary.duplicates} ${t('duplicateGroups')}`,
          ...result.warnings,
        ];
        showBanner(result.importSummary.invalid > 0 ? 'warning' : 'success', t('importSuccess'), lines);
      } else {
        showBanner('error', t('importError'), result.errors.slice(0, 6));
      }
    } catch (e) {
      showBanner('error', t('importError'), [e.message]);
    } finally {
      setIsLoading(false);
    }
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
      asOfDate: DEMO_AS_OF_DATE,
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
    exportComplianceCSV(complianceResult.universe, kpis, { asOfDate: DEMO_AS_OF_DATE }, t);
  }

  function handleExportPriorityCSV() {
    if (priorityActions.length === 0) return;
    exportPriorityActionsCSV(priorityActions, { asOfDate: DEMO_AS_OF_DATE }, t);
  }

  function handleReset() {
    setTrainingRecords([]); setRequirements([]); setLastImportResult(null);
    setImportBanner({ type: 'success', title: t('dataReset'), lines: [] });
    setSourceFileName(''); setFilters(EMPTY_FILTERS);
  }

  const hasData = trainingRecords.length > 0;
  const hasRequirements = requirements.length > 0;

  return (
    <div className="app-shell" dir={i18n.dir}>
      <Header
        companyName={companyName} projectName={projectName}
        asOfDate={DEMO_AS_OF_DATE} lang={lang} t={t}
        onLangToggle={() => setLang(l => l === 'en' ? 'ar' : 'en')}
        onCompanyChange={setCompanyName} onProjectChange={setProjectName}
      />

      <main className="main-content">
        <ImportPanel
          t={t}
          onLoadDemo={handleLoadDemo}
          onTrainingImport={handleTrainingImport}
          onRequirementsImport={handleRequirementsImport}
          onExportPDF={handleExportPDF}
          onExportCSV={handleExportCSV}
          onExportPriorityCSV={handleExportPriorityCSV}
          onReset={handleReset}
          hasData={hasData} hasRequirements={hasRequirements}
          isLoading={isLoading} importBanner={importBanner}
        />

        {!hasData && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>{t('noData')}</h3>
            <p>{t('noDataHint')}</p>
            {!hasRequirements && (
              <p style={{ marginTop: 8, fontSize: 12 }}>{t('requirementsNotLoadedHint')}</p>
            )}
          </div>
        )}

        {hasData && (
          <>
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
                <span className="section-title">Compliance Detail</span>
                <label style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  Show Inactive/Left employees
                </label>
              </div>
              <p style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                Global KPI cards reflect the full dataset. Table filters apply to this table only.
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
              <div className="section" style={{ borderColor: '#7c3aed' }}>
                <div className="section-title" style={{ color: '#a78bfa', marginBottom: 8 }}>
                  Requirements Not Configured ({complianceResult.unconfiguredEmployees.length} employee(s))
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  These active employees have training records but no matching Department/Job_Title in the requirements matrix.
                  They are excluded from compliance KPI denominators until requirements are configured.
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
    </div>
  );
}
