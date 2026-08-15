import React, { lazy } from 'react';

/**
 * Robust detection for module chunk loading / dynamic import network errors.
 * Covers Webpack, Vite, Rollup, Chrome, Firefox, Safari, and WebKit error messages.
 */
export function isChunkLoadError(error: any): boolean {
  if (!error) return false;
  if (error?.name === 'ChunkLoadError') return true;

  const msg = typeof error === 'string' ? error : (error?.message || String(error));
  const lowerMsg = msg.toLowerCase();

  return (
    lowerMsg.includes('dynamically imported module') ||
    lowerMsg.includes('importing a module script failed') ||
    lowerMsg.includes('failed to load module script') ||
    lowerMsg.includes('failed to fetch dynamically imported module') ||
    lowerMsg.includes('error loading dynamically imported module') ||
    lowerMsg.includes('error loading chunk') ||
    lowerMsg.includes('loading chunk') ||
    lowerMsg.includes('loading css chunk') ||
    (lowerMsg.includes('failed to fetch') && (lowerMsg.includes('assets/') || lowerMsg.includes('.js') || lowerMsg.includes('.css')))
  );
}

/**
 * Resilient lazy loader for React dynamic component imports.
 * Automatically handles ChunkLoadError and network chunk fetch failures
 * (e.g., when a deployment updates build bundle asset hashes while a user is active).
 * Triggers a seamless page reload to fetch the latest index.html and assets.
 */
export function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | T | any>
) {
  return lazy(async () => {
    try {
      const component = await factory();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('dukapos_chunk_reload_attempts');
      }
      return component;
    } catch (error: any) {
      console.warn('[safeLazy] Dynamic module import failed:', error);

      if (isChunkLoadError(error) && typeof window !== 'undefined') {
        const attempts = parseInt(sessionStorage.getItem('dukapos_chunk_reload_attempts') || '0', 10);
        if (attempts < 2) {
          sessionStorage.setItem('dukapos_chunk_reload_attempts', String(attempts + 1));
          console.info('[safeLazy] Reloading workspace to fetch updated bundle assets...');
          if ('caches' in window) {
            caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
          }
          window.location.reload();
          return new Promise(() => {}) as any;
        }
      }
      throw error;
    }
  });
}

