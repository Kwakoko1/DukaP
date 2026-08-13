/**
 * offlineSyncWorker.ts
 * Background Resumption & Offline Sync Worker for DukaPos SaaS.
 * 
 * Automatically handles reconnection triggers, background timers, pre-logout flushing,
 * and Service Worker background sync.
 */

import { stockLedgerSyncEngine } from './stockLedgerSyncEngine';
import { isLeaderTab } from './tabLeaderElectionService';

let syncTimerId: any = null;
let isWorkerRunning = false;

export const offlineSyncWorker = {

  /**
   * Initializes client offline sync event listeners & background intervals
   */
  startWorker(tenantId: string, branchId: string, intervalMs: number = 30000) {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    // 1. Online reconnection trigger (only elected Web Locks Leader Tab flushes queue)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!isLeaderTab()) return;
        console.info('[OfflineSyncWorker] Network reconnected. Flushing sync queues from elected Leader Tab...');
        this.triggerSyncNow(tenantId, branchId).catch(() => {});
      });
    }

    // 2. Periodic background interval (guaranteed single Leader execution)
    syncTimerId = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (!isLeaderTab()) return;
      this.triggerSyncNow(tenantId, branchId).catch(() => {});
    }, intervalMs);

    // 3. Register Browser Native Background Sync tag with Service Worker
    void this.registerBackgroundSync();

    console.info(`[OfflineSyncWorker] Sync worker active (Interval: ${intervalMs}ms).`);
  },

  /**
   * Registers Browser Native Background Sync tag with Service Worker
   */
  async registerBackgroundSync() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).sync.register('dukapos-sync-queue');
        console.info('[OfflineSyncWorker] Native Service Worker Background Sync tag registered.');
      } catch (err) {
        console.debug('[OfflineSyncWorker] Background sync tag registration notice:', err);
      }
    }
  },

  /**
   * Stops background worker timer
   */
  stopWorker() {
    if (syncTimerId) {
      clearInterval(syncTimerId);
      syncTimerId = null;
    }
    isWorkerRunning = false;
  },

  /**
   * Triggers an immediate full sync flush across CRUD queue and Stock Ledger Outbox
   */
  async triggerSyncNow(tenantId: string, branchId: string): Promise<{ syncedCount: number; failedCount: number }> {
    if (!tenantId) return { syncedCount: 0, failedCount: 0 };
    try {
      const { productionSyncEngine } = await import('./productionSyncEngine');
      const prodRes = await productionSyncEngine.processQueue(tenantId);
      await productionSyncEngine.pullChanges(tenantId, branchId).catch(() => {});
      let stockRes = { syncedCount: 0, failedCount: 0 };
      if (branchId) {
        stockRes = await stockLedgerSyncEngine.syncPendingEvents(tenantId, branchId);
      }
      return {
        syncedCount: (prodRes.syncedItems || 0) + (stockRes.syncedCount || 0),
        failedCount: (prodRes.failedItems || 0) + (stockRes.failedCount || 0)
      };
    } catch (err) {
      console.warn('[OfflineSyncWorker] Sync execution error:', err);
      return { syncedCount: 0, failedCount: 0 };
    }
  }
};
