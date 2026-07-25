import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { UtmProvider } from './features/utm/UtmContext';
import { initUtmTracking } from './features/utm/utm';
import './index.css';

// Capture UTM parameters from the page URL on initial load
initUtmTracking();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UtmProvider>
          <App />
        </UtmProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
