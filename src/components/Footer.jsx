export default function Footer({ t, asOfDate }) {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <span>HSE Training Compliance Dashboard</span>
        <div className="app-footer-meta">
          <span>{t('footerVersion')}: 2.0.0</span>
          <span>{t('footerReportDate')}: {asOfDate}</span>
          <span>{t('footerEnvironment')}: {t('footerEnvironmentValue')}</span>
        </div>
      </div>
    </footer>
  );
}
