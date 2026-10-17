export default function Footer({ t, asOfDate, isTrial = false }) {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <span>{t('appTitle')}</span>
        <div className="app-footer-meta">
          <span>{t('footerVersion')}: 2.0.0</span>
          <span>{t('footerReportDate')}: {asOfDate}</span>
          <span>{t('footerEnvironment')}: {t(isTrial ? 'footerTrialEnvironmentValue' : 'footerEnvironmentValue')}</span>
        </div>
      </div>
    </footer>
  );
}
