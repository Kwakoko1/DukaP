/**
 * DukaPOS SaaS — Enterprise PWA Update Controller
 * Handles non-disruptive Service Worker updates, version probe polling, POS checkout guards,
 * sync outbox flushing, and cross-tab update signaling via BroadcastChannel.
 */

import { db } from '../db/dexie';

export interface AppVersionInfo {
  version: string;
  buildNumber: string;
  commitSha?: string;
  buildDate?: string;
  timestamp?: number;
}

export interface PWAUpdateState {
  isUpdateAvailable: boolean;
  latestVersionInfo?: AppVersionInfo;
  isCartActive: boolean;
  pendingSyncCount: number;
  deferredUntilCheckout: boolean;
}

const UPDATE_BROADCAST_CHANNEL = 'dukapos_pwa_updates';
let swRegistration: ServiceWorkerRegistration | null = null;
let broadcastChannel: BroadcastChannel | null = null;

// Initial state
const currentVersionInfo: AppVersionInfo = {
  version: (import.meta.env.VITE_APP_VERSION as string) || '1.2.0',
  buildNumber: (import.meta.env.VITE_BUILD_NUMBER as string) || '20260811.115',
  commitSha: (import.meta.env.VITE_GIT_COMMIT as string) || 'main',
  buildDate: (import.meta.env.VITE_BUILD_DATE as string) || new Date().toISOString().split('T')[0]
};

let currentState: PWAUpdateState = {
  isUpdateAvailable: false,
  isCartActive: false,
  pendingSyncCount: 0,
  deferredUntilCheckout: false
};

const listeners: Set<(state: PWAUpdateState) => void> = new Set();

export function getPWAUpdateState(): PWAUpdateState {
  return { ...currentState };
}

export function getCurrentVersion(): AppVersionInfo {
  return { ...currentVersionInfo };
}

export function subscribePWAUpdate(listener: (state: PWAUpdateState) => void): () => void {
  listeners.add(listener);
  listener(getPWAUpdateState());
  return () => listeners.delete(listener);
}

function notifyListeners() {
  const snapshot = getPWAUpdateState();
  listeners.forEach(fn => fn(snapshot));
}

/**
 * Check if cashier currently has an active, non-empty POS cart
 */
export function checkIsCartActive(): boolean {
  try {
    const rawCart = localStorage.getItem('dukapos_active_pos_cart');
    if (rawCart) {
      const items = JSON.parse(rawCart);
      if (Array.isArray(items) && items.length > 0) return true;
    }
  } catch (e) {}
  return false;
}

/**
 * Count unsynced offline operations in IndexedDB
 */
export async function getPendingSyncCount(): Promise<number> {
  try {
    if (db.syncQueue) {
      const pending = await db.syncQueue.where('status').equals('PENDING').count();
      return pending;
    }
  } catch (e) {}
  return 0;
}

/**
 * Initialize Service Worker & PWA Update Manager
 */
export function initPWAUpdateService(): void {
  if (typeof window === 'undefined') return;

  // 1. Initialize Cross-Tab Broadcast Channel
  if ('BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel(UPDATE_BROADCAST_CHANNEL);
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
          handleNewVersionDetected(event.data.versionInfo);
        }
      };
    } catch (e) {}
  }

  // 2. Register Service Worker listeners if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      swRegistration = reg;

      // Check for updates on register
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            handleNewVersionDetected();
          }
        });
      });
    });

    // Listen for controller changes (reload after skipWaiting)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  // 3. Start Periodic Server Version Polling (every 10 minutes & tab focus)
  pollServerVersion();
  setInterval(pollServerVersion, 10 * 60 * 1000);

  window.addEventListener('focus', pollServerVersion);
}

/**
 * Poll server /api/version or /version.json to check for new releases
 */
export async function pollServerVersion(): Promise<void> {
  try {
    const res = await fetch(`/api/version?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;

    const data: AppVersionInfo = await res.json();
    const appliedBuild = typeof localStorage !== 'undefined' ? localStorage.getItem('dukapos_applied_build_number') : null;

    const normServer = String(data?.buildNumber || '').replace(/[^0-9.]/g, '');
    const normClient = String(currentVersionInfo.buildNumber || '').replace(/[^0-9.]/g, '');
    const normApplied = String(appliedBuild || '').replace(/[^0-9.]/g, '');

    if (
      data &&
      data.buildNumber &&
      normServer &&
      normServer !== normClient &&
      normServer !== normApplied
    ) {
      handleNewVersionDetected(data);
    }
  } catch (e) {
    // Fail silently when offline
  }
}

/**
 * Manually trigger update check (e.g. when user clicks build number in footer)
 */
export async function forceCheckPWAUpdate(): Promise<boolean> {
  await pollServerVersion();
  return currentState.isUpdateAvailable;
}

async function handleNewVersionDetected(latestInfo?: AppVersionInfo) {
  const isCart = checkIsCartActive();
  const pendingSync = await getPendingSyncCount();

  currentState = {
    isUpdateAvailable: true,
    latestVersionInfo: latestInfo || {
      version: currentVersionInfo.version,
      buildNumber: 'NEW',
    },
    isCartActive: isCart,
    pendingSyncCount: pendingSync,
    deferredUntilCheckout: isCart
  };

  // Broadcast to other open tabs
  if (broadcastChannel && latestInfo) {
    try {
      broadcastChannel.postMessage({
        type: 'NEW_VERSION_AVAILABLE',
        versionInfo: latestInfo
      });
    } catch (e) {}
  }

  notifyListeners();
}

/**
 * Execute Safe Guarded PWA Update:
 * 1. Flush pending sync outbox to server if online
 * 2. Persist applied build number to localStorage
 * 3. Clear Service Worker Cache storage & send SKIP_WAITING
 * 4. Perform clean page reload
 */
export async function executeSafePWAUpdate(): Promise<void> {
  // Check if active cart warning needed
  if (checkIsCartActive()) {
    const confirmProceed = window.confirm(
      'Notice: You currently have active items in your register cart. Are you sure you want to apply the update now?'
    );
    if (!confirmProceed) return;
  }

  // Flush sync queue if possible
  try {
    const pendingCount = await getPendingSyncCount();
    if (pendingCount > 0 && navigator.onLine) {
      // Trigger background sync worker if present
      const syncWorker = (window as any).__dukapos_trigger_sync;
      if (typeof syncWorker === 'function') {
        await syncWorker();
      }
    }
  } catch (e) {
    console.warn('[PWAUpdate] Pre-update sync flush warning:', e);
  }

  const targetBuild = currentState.latestVersionInfo?.buildNumber || currentVersionInfo.buildNumber;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('dukapos_applied_build_number', targetBuild);
  }

  // Clear stale Service Worker caches
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(k => caches.delete(k)));
    } catch (_) {}
  }

  // Trigger SW skipWaiting
  if (swRegistration && swRegistration.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      try {
        await reg.update();
      } catch (_) {}
    }
  }

  // Clean application reload
  window.location.reload();
}
