import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthGate } from './components/AuthGate.jsx';
import { AccountBar } from './components/AccountBar.jsx';
import { createI18n } from './lib/i18n.js';

const { t } = createI18n('en');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate t={t}>
      {(session) => (
        <>
          <AccountBar session={session} t={t} />
          <App />
        </>
      )}
    </AuthGate>
  </StrictMode>,
);
