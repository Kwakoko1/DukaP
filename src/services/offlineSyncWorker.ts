/**
 * offlineSyncWorker.ts
 * Background Resumption & Offline Sync Worker for DukaPos SaaS.
 * 
 * Automatically handles reconnection triggers, background timers, pre-logout flushing,
 * and Service Worker background sync.
 */

import { stockLedgerSyncEngine } from './stockLedgerSyncEngine';

let syncTimerId: any = null;
let isWorkerRunning = false;

export const offlineSyncWorker = {

  /**
   * Initializes client offline sync event listeners & background intervals
   */
  startWorker(tenantId: string, branchId: string, intervalMs: number = 30000) {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    // 1. Online reconnection trigger
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.info('[OfflineSyncWorker] Network reconnected. Flushing all sync queues...');
        this.triggerSyncNow(tenantId, branchId).catch(() => {});
      });
    }

    // 2. Periodic background interval
    syncTimerId = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      this.triggerSyncNow(tenantId, branchId).catch(() => {});
    }, intervalMs);

    console.info(`[OfflineSyncWorker] Sync worker active (Interval: ${intervalMs}ms).`);
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
