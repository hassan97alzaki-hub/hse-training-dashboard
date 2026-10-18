import { PlayCircle, Upload, BarChart3, Shield, ArrowRight } from 'lucide-react';

export default function WelcomeOnboarding({ t, onLoadDemo, hasRequirements }) {
  return (
    <div className="welcome-onboarding" data-testid="welcome-onboarding">
      <div className="welcome-hero">
        <div className="welcome-icon-ring">
          <Shield size={32} />
        </div>
        <h2>{t('welcomeTitle')}</h2>
        <p className="welcome-subtitle">{t('welcomeSubtitle')}</p>
      </div>

      <div className="welcome-cards">
        <button className="welcome-card welcome-card--primary" onClick={onLoadDemo}>
          <div className="welcome-card-icon" style={{ background: 'var(--brand-soft)' }}>
            <PlayCircle size={22} style={{ color: 'var(--brand)' }} />
          </div>
          <div className="welcome-card-body">
            <h3>{t('welcomeDemoTitle')}</h3>
            <p>{t('welcomeDemoDesc')}</p>
          </div>
          <ArrowRight size={16} className="welcome-card-arrow" />
        </button>

        <div className="welcome-card">
          <div className="welcome-card-icon" style={{ background: 'var(--success-soft)' }}>
            <Upload size={22} style={{ color: 'var(--success)' }} />
          </div>
          <div className="welcome-card-body">
            <h3>{t('welcomeImportTitle')}</h3>
            <p>{t('welcomeImportDesc')}</p>
          </div>
        </div>

        <div className="welcome-card">
          <div className="welcome-card-icon" style={{ background: 'var(--info-soft)' }}>
            <BarChart3 size={22} style={{ color: 'var(--info)' }} />
          </div>
          <div className="welcome-card-body">
            <h3>{t('welcomeAnalyzeTitle')}</h3>
            <p>{t('welcomeAnalyzeDesc')}</p>
          </div>
        </div>
      </div>

      {!hasRequirements && (
        <p className="welcome-hint">{t('requirementsNotLoadedHint')}</p>
      )}
    </div>
  );
}
