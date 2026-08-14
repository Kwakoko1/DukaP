import { StrictMode, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/UI/ErrorBoundary';
import { initPWAUpdateService } from './services/pwaUpdateService';
import { initProductionDatabase } from './db/dexie';
import { autoHealDexieSchemaMismatch } from './utils/dbMigrationRecovery';

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

