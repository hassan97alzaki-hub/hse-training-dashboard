import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthGate } from './components/AuthGate.jsx';
import { AccountBar } from './components/AccountBar.jsx';

// The gate only asks for a sign-in when the build is configured for a cloud
// backend. A local-only build renders the dashboard straight away.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      {(session) => (
        <>
          <AccountBar session={session} />
          <App />
        </>
      )}
    </AuthGate>
  </StrictMode>,
);
