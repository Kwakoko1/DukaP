import React, { lazy } from 'react';

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
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        (error?.message && (
          error.message.includes('Failed to fetch dynamically imported module') ||
          error.message.includes('Importing a module script failed') ||
          error.message.includes('error loading chunk') ||
          error.message.includes('Loading chunk')
        ));

      if (isChunkError && typeof window !== 'undefined') {
        const attempts = parseInt(sessionStorage.getItem('dukapos_chunk_reload_attempts') || '0', 10);
        if (attempts < 2) {
          sessionStorage.setItem('dukapos_chunk_reload_attempts', String(attempts + 1));
          console.info('[safeLazy] Reloading workspace to fetch updated bundle assets...');
          window.location.reload();
          return new Promise(() => {}) as any;
        }
      }
      throw error;
    }
  });
}
