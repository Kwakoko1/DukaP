/**
 * offlineSyncWorker.ts
 * Hardened Background Resumption & Offline Sync Worker for KwakoPos / Kwakoko SaaS.
 * 
 * Automatically handles reconnection triggers, Web Locks Leader Election, client-side
 * payload serialization normalization, DeadLetter quarantines, and Service Worker background sync.
 */

import { db } from '../db/dexie';
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
   * Hardened Outbox Serialization & Push Engine
   */
  async flushSyncQueueWithGuards(tenantId: string, branchId: string): Promise<void> {
    if (!isLeaderTab()) return;

    const pendingItems = await db.syncQueue
      .where('status')
      .equals('Pending')
      .toArray();

    if (pendingItems.length === 0) return;

    const sanitizedPayloads = pendingItems.map(item => {
      const data = { ...(item.payload || {}) };
      
      // A. Defensive variant_id normalization matching compound index requirements
      if ('variant_id' in data || 'variantId' in data) {
        const v = data.variant_id || data.variantId;
        data.variant_id = (v === null || v === undefined || v === 'null' || v === 'undefined' || v === 'no-variant')
          ? 'no-variant'
          : v;
      }
      
      // B. Explicit 13-digit Unix Epoch Millisecond mapping with dynamic fallback
      const localTs = Number(data.updated_at || data.updatedAt) || Date.now();
      const numD = Number(data.deleted_at || data.deletedAt) || (data.deleted ? localTs : 0);
      data.deleted_at = numD;
      
      // C. Remove legacy properties to minimize JSON transit size
      delete data.deleted;
      delete data.deletedAt;

      return { ...item, payload: data };
    });

    for (const item of sanitizedPayloads) {
      try {
        await db.syncQueue.update(item.id, { status: 'Processing' });
        
        const response = await fetch('/api/sync/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': tenantId,
            'X-Branch-ID': branchId,
            'X-Bypass-Replica': 'true' // Force primary node routing to bypass WAL streaming lag
          },
          body: JSON.stringify(item.payload)
        });

        if (response.status === 200) {
          await db.syncQueue.update(item.id, { status: 'Completed', last_attempt: Date.now() });
        } else if (response.status === 410) {
          // Tenant is archived on server - Quarantine record in DeadLetter queue
          await db.syncQueue.update(item.id, { status: 'DeadLetter', error: 'Tenant Archived' });
        } else {
          await db.syncQueue.update(item.id, { status: 'Pending' }); // Retry transient errors
        }
      } catch (err) {
        await db.syncQueue.update(item.id, { status: 'Pending' });
      }
    }
  },

  /**
   * Triggers an immediate full sync flush across CRUD queue and Stock Ledger Outbox
   */
  async triggerSyncNow(tenantId: string, branchId: string): Promise<{ syncedCount: number; failedCount: number }> {
    if (!tenantId) return { syncedCount: 0, failedCount: 0 };
    try {
      await this.flushSyncQueueWithGuards(tenantId, branchId);
      
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
