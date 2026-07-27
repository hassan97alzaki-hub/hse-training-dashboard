import { ShieldCheck, Building2, FolderKanban, Languages } from 'lucide-react';

export default function Header({
  companyName, projectName, asOfDate, lang, t,
  onLangToggle, onCompanyChange, onProjectChange,
  lastRefresh,
  onExportPDF, onExportCSV, onExportPriorityCSV, hasData,
}) {
  return (
    <header className="app-header">
      <div className="header-row">
        <div className="header-brand">
          <div className="logo-slot" title={t('companyLogoAlt')}>
            <Building2 size={18} />
          </div>
          <div className="logo-slot" title={t('projectLogoAlt')}>
            <FolderKanban size={18} />
          </div>
          <div className="header-brand-text">
            <div className="header-title">{t('appTitle')}</div>
            <div className="header-subtitle">{t('appSubtitle')}</div>
          </div>
        </div>

        <div className="header-actions">
          <span className="privacy-badge">
            <ShieldCheck size={14} />
            {t('privacyNote')}
          </span>
          <button
            className="lang-toggle"
            onClick={onLangToggle}
            title={t('langToggleTitle')}
            aria-label={t('langToggleTitle')}
          >
            <Languages size={14} />
            {t('langToggle')}
          </button>
        </div>
      </div>

      <div className="header-row header-row-secondary">
        <div className="header-meta-fields">
          <div className="header-field">
            <label>{t('companyLabel')}</label>
            <input
              type="text"
              value={companyName}
              onChange={e => onCompanyChange(e.target.value)}
              maxLength={60}
              aria-label={t('companyLabel')}
            />
          </div>
          <div className="header-field">
            <label>{t('projectLabel')}</label>
            <input
              type="text"
              value={projectName}
              onChange={e => onProjectChange(e.target.value)}
              maxLength={60}
              aria-label={t('projectLabel')}
            />
          </div>
          <div className="header-field">
            <label>{t('asOfDate')}</label>
            <div className="header-field-static">{asOfDate}</div>
          </div>
          <div className="header-field">
            <label>{t('lastRefresh')}</label>
            <div className="header-field-static muted">{lastRefresh || t('neverRefreshed')}</div>
          </div>
        </div>

        <div className="header-export-group">
          <button className="btn btn-secondary btn-sm" onClick={onExportPDF} disabled={!hasData}>
            {t('exportPDF')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onExportCSV} disabled={!hasData}>
            {t('exportCSV')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onExportPriorityCSV} disabled={!hasData}>
            {t('exportPriorityCSV')}
          </button>
        </div>
      </div>
    </header>
  );
}
