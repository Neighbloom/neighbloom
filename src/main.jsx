import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'

// Chunk-mismatch recovery: after a deploy, a browser still holding
// the previous bundle can fail to fetch a renamed lazy chunk
// ("Failed to fetch dynamically imported module") and crash into
// the error boundary. Vite reports that as vite:preloadError —
// recover with ONE guarded reload (which lands on the fresh
// bundle) instead of showing a dead app. The 30s session guard
// prevents a reload loop if the failure is something else.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const KEY = 'nb_chunk_reload_at';
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 30000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
