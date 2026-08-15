import { StrictMode, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/UI/ErrorBoundary';
import { initPWAUpdateService } from './services/pwaUpdateService';
import { initProductionDatabase } from './db/dexie';
import { autoHealDexieSchemaMismatch } from './utils/dbMigrationRecovery';
import { isChunkLoadError } from './utils/safeLazy';

// Global resilience handler for dynamic module script chunk loading failures
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      console.warn('[Global] Dynamic module script load failure caught in unhandledrejection:', event.reason);
      const attempts = parseInt(sessionStorage.getItem('dukapos_chunk_reload_attempts') || '0', 10);
      if (attempts < 2) {
        sessionStorage.setItem('dukapos_chunk_reload_attempts', String(attempts + 1));
        if ('caches' in window) {
          caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
        }
        window.location.reload();
      }
    }
  });
}

// Initialize Enterprise PWA Update Manager
initPWAUpdateService();

const container = document.getElementById('root');
const root = createRoot(container!);

// Force sequential bootstrapping:
// 1. Auto-heal any legacy schema/version mismatch on older client endpoints
// 2. Initialize production baseline
// 3. Mount React application tree safely
autoHealDexieSchemaMismatch()
  .then(() => initProductionDatabase())
  .then(() => {
    startTransition(() => {
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      );
    });
  })
  .catch((error) => {
    console.error('Failed to initialize local data layers before boot:', error);
    startTransition(() => {
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      );
    });
  });

