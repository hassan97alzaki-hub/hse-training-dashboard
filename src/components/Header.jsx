export default function Header({ companyName, projectName, asOfDate, lang, t, onLangToggle, onCompanyChange, onProjectChange }) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-title">{t('appTitle')}</div>
        <div className="header-subtitle">{t('appSubtitle')}</div>
      </div>

      <div className="header-meta">
        <div className="header-field">
          <label>{t('companyLabel')}</label>
          <input
            type="text"
            value={companyName}
            onChange={e => onCompanyChange(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="header-field">
          <label>{t('projectLabel')}</label>
          <input
            type="text"
            value={projectName}
            onChange={e => onProjectChange(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="header-field">
          <label>{t('asOfDate')}</label>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f97316', padding: '4px 0' }}>
            {asOfDate}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="privacy-badge">{t('privacyNote')}</span>
        <button
          className="lang-toggle"
          onClick={onLangToggle}
          title={t('langToggleTitle')}
        >
          {t('langToggle')}
        </button>
      </div>
    </header>
  );
}
