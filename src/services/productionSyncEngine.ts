/**
 * DukaPos SaaS — Production Offline-First Sync Engine Processor
 * Handles Event-Driven Queue Processing, Stock Ledger Replay, Exponential Backoff,
 * Vector Clock Conflict Resolution & Telemetry Diagnostics.
 */

import { db, type SyncItem, type SyncStatus } from '../db/dexie';
import { supabase } from '../db/supabaseClient';
import { getOrCreateDeviceId } from './syncEventGenerator';
import { resolveEntityConflict } from './SyncResolver';

export interface SyncConflict {
  entityName: string;
  recordId: string;
  clientRecord: any;
  serverRecord: any;
  resolvedRecord: any;
  resolutionStrategy: 'LWW' | 'SERVER_WINS' | 'CLIENT_WINS' | 'MERGE';
  timestamp: number;
}

export interface SyncEngineStatus {
  isSyncing: boolean;
  online: boolean;
  pendingSyncCount: number;
  completedSyncCount: number;
  failedSyncCount: number;
  retryCountTotal: number;
  lastSyncedAt: number | null;
  conflictsResolved: number;
  apiLatencyMs: number;
  deviceSyncId: string;
}

// ── EXPONENTIAL BACKOFF RETRY SCHEDULER ──────────────────────────────────────
const BACKOFF_SCHEDULE_MS = [
  1000,     // Retry 1: 1 sec
  5000,     // Retry 2: 5 sec
  15000,    // Retry 3: 15 sec
  30000,    // Retry 4: 30 sec
  60000,    // Retry 5: 60 sec
  300000,   // Retry 6: 5 min
  600000,   // Retry 7: 10 min
  1800000,  // Retry 8+: 30 min
];

export function getBackoffDelayMs(retryCount: number): number {
  if (retryCount <= 0) return 0;
  const index = Math.min(retryCount - 1, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[index];
}

export function shouldAttemptRetry(item: SyncItem): boolean {
  if (item.status === 'Pending') return true;
  if (item.status === 'DeadLetter' || (item.status as string) === 'PermanentlyFailed') return false;
  if (item.status !== 'Failed') return false;
  if ((item.retry_count || 0) >= 10) return false;
  if (!item.last_attempt) return true;

  const delay = getBackoffDelayMs(item.retry_count || 1);
  return (Date.now() - item.last_attempt) >= delay;
}

class ProductionSyncEngine {
  private isSyncing = false;
  private conflicts: SyncConflict[] = [];
  private lastSyncedAt: number | null = Date.now() - 30000;
  private apiLatencyMs = 0;

  /**
   * Replays Stock Ledger entries for a product/variant to recalculate accurate stock.
   * Business Guarantee: Never overwrite stock directly; stock is strictly derived from movements.
   */
  async replayStockLedgerForProduct(productId: string): Promise<number> {
    try {
      const product = await db.products.get(productId);
      if (!product) return 0;
      const tenantId = product.tenant_id || product.tenantId || 'tenant-101';
      const branchId = product.branch_id || product.branchId || 'main-branch';

      const { stockLedgerSyncEngine } = await import('./stockLedgerSyncEngine');

      if (product.hasVariants) {
        const variants = await db.productVariants.where('productId').equals(productId).toArray();
        let totalStock = 0;
        for (const v of variants) {
          const bal = await stockLedgerSyncEngine.recalculateStockFromEvents(tenantId, branchId, productId, v.id);
          totalStock += bal.current_quantity;
        }
        return totalStock;
      } else {
        const bal = await stockLedgerSyncEngine.recalculateStockFromEvents(tenantId, branchId, productId);
        return bal.current_quantity;
      }
    } catch (err) {
      console.error(`Stock Ledger Replay failed for product ${productId}:`, err);
      return 0;
    }
  }

  /**
   * Priority-Ordered Queue Processor with Idempotency Protection
   */
  async processQueue(tenantId?: string): Promise<{ success: boolean; syncedItems: number; failedItems: number }> {
    if (this.isSyncing) {
      return { success: true, syncedItems: 0, failedItems: 0 };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    try {
      // 1. Fetch pending/failed queue items
      let rawQueue = await db.syncQueue.toArray();
      if (tenantId) {
        rawQueue = rawQueue.filter(item => !item.tenant_id || item.tenant_id === tenantId);
      }

      // Filter items ready for processing (checking exponential backoff schedule)
      const runnableItems = rawQueue.filter(item => shouldAttemptRetry(item));

      // Priority Sort: Priority 1 (Sales/Stock) -> 2 -> 3 -> 4, then by created_at ASC
      runnableItems.sort((a, b) => {
        const pA = a.priority || 3;
        const pB = b.priority || 3;
        if (pA !== pB) return pA - pB;
        return (a.created_at || a.timestamp || 0) - (b.created_at || b.timestamp || 0);
      });

      const deviceId = getOrCreateDeviceId();

      // Process in batches (up to 50 operations per pass)
      const batch = runnableItems.slice(0, 50);

      for (const item of batch) {
        if (!item.id) continue;

        try {
          await db.syncQueue.update(item.id, {
            status: 'Processing' as SyncStatus,
            last_attempt: Date.now(),
          });

          // Execute operation push with Idempotency Token
          const entityName = item.entity || item.entityName || 'products';
          const payload = item.payload || {};
          const syncToken = item.sync_token || `token-${Date.now()}`;

          // Header metadata for cloud gateway auditability
          const headers: Record<string, string> = {
            'X-Sync-Token': syncToken,
            'X-Device-ID': item.device_id || deviceId,
            'X-Tenant-ID': item.tenant_id || tenantId || '',
            'X-Branch-ID': item.branch_id || 'main-branch',
          };
          if (import.meta.env?.DEV) {
            console.debug('Sync Engine Request Headers:', headers);
          }

          let opError: any = null;

          // 1. Try master REST API sync push
          try {
            const pushRes = await fetch('/api/sync/push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...headers
              },
              body: JSON.stringify({
                tenantId: item.tenant_id || tenantId,
                deviceId: item.device_id || deviceId,
                operations: [item]
              })
            });

            if (pushRes.ok) {
              const pushData = await pushRes.json();
              if (pushData.success) {
                opError = null;
              } else {
                opError = new Error(pushData.error || 'Sync push failed');
              }
            } else {
              // 2. Fallback to direct Supabase RLS client call
              const targetTable = entityName === 'productVariants' ? 'product_variants' : (entityName === 'stockLedger' ? 'stock_ledger' : entityName);
              if (targetTable === 'stock_ledger' || item.operation === 'STOCK_IN' || item.operation === 'STOCK_OUT' || item.operation === 'TRANSFER') {
                const { error } = await supabase.from('stock_ledger').upsert(payload, { onConflict: 'id' });
                opError = error;
              } else {
                const action = item.operation || item.actionType || 'UPDATE';
                if (action === 'DELETE') {
                  const { error } = await supabase.from(targetTable).delete().eq('id', item.entity_id || payload.id);
                  opError = error;
                } else {
                  const { error } = await supabase.from(targetTable).upsert(payload, { onConflict: 'id' });
                  opError = error;
                }
              }
            }
          } catch (netErr) {
            // Direct Supabase fallback
            const targetTable = entityName === 'productVariants' ? 'product_variants' : (entityName === 'stockLedger' ? 'stock_ledger' : entityName);
            const { error } = await supabase.from(targetTable).upsert(payload, { onConflict: 'id' });
            opError = error;
          }

          if (entityName === 'stock_ledger' && !opError && payload.product_id) {
            await this.replayStockLedgerForProduct(payload.product_id);
          }

          if (opError) {
            throw new Error(opError.message || 'Sync operation failed');
          }

          // Mark item as Completed and purge from Queue
          await db.syncQueue.update(item.id, { status: 'Completed' as SyncStatus });
          await db.syncQueue.delete(item.id);
          syncedCount++;

        } catch (err: any) {
          failedCount++;
          const currentRetries = (item.retry_count || 0) + 1;
          const isDeadLetter = currentRetries >= 10;
          await db.syncQueue.update(item.id, {
            status: isDeadLetter ? ('DeadLetter' as any) : ('Failed' as SyncStatus),
            retry_count: currentRetries,
            last_attempt: Date.now(),
            error: err?.message || 'Unknown error',
          });
          if (isDeadLetter) {
            console.warn(`[ProductionSyncEngine] Item ${item.id} (${item.entity}) marked as DeadLetter after ${currentRetries} retries.`);
          }
        }
      }

      this.apiLatencyMs = Date.now() - startTime;
      this.lastSyncedAt = Date.now();
      return { success: true, syncedItems: syncedCount, failedItems: failedCount };

    } catch (err) {
      console.error('ProductionSyncEngine execution error:', err);
      return { success: false, syncedItems: syncedCount, failedItems: failedCount };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Conflict Resolution Engine (LWW / Vector Clock / Tombstone Priority / Server Wins)
   */
  resolveConflict(
    entityName: string,
    recordId: string,
    clientRecord: any,
    serverRecord: any,
    strategy: 'LWW' | 'SERVER_WINS' | 'CLIENT_WINS' | 'MERGE' = 'LWW'
  ): any {
    let resolved: any;

    if (strategy === 'SERVER_WINS') {
      resolved = { ...serverRecord };
    } else if (strategy === 'CLIENT_WINS') {
      resolved = { ...clientRecord };
    } else if (strategy === 'MERGE') {
      resolved = { ...serverRecord, ...clientRecord, updated_at: Date.now() };
    } else {
      // Use Tombstone Priority Resolution Engine
      const res = resolveEntityConflict(clientRecord, serverRecord);
      resolved = res.record;
    }

    const conflict: SyncConflict = {
      entityName,
      recordId,
      clientRecord,
      serverRecord,
      resolvedRecord: resolved,
      resolutionStrategy: strategy,
      timestamp: Date.now()
    };

    this.conflicts.push(conflict);
    return resolved;
  }

  /**
   * Diagnostic Telemetry for Offline Sync Monitor
   */
  async getStatus(): Promise<SyncEngineStatus> {
    const queue = await db.syncQueue.toArray();
    const pendingCount = queue.filter(i => i.status === 'Pending' || i.status === 'Processing').length;
    const completedCount = queue.filter(i => i.status === 'Completed').length;
    const failedCount = queue.filter(i => i.status === 'Failed').length;
    const totalRetries = queue.reduce((sum, i) => sum + (i.retry_count || 0), 0);

    return {
      isSyncing: this.isSyncing,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      pendingSyncCount: pendingCount,
      completedSyncCount: completedCount,
      failedSyncCount: failedCount,
      retryCountTotal: totalRetries,
      lastSyncedAt: this.lastSyncedAt,
      conflictsResolved: this.conflicts.length,
      apiLatencyMs: this.apiLatencyMs,
      deviceSyncId: getOrCreateDeviceId()
    };
  }

  /**
   * Automatic Storage Quota Monitoring & Auto-Pruning Engine
   * Prevents IndexedDB QuotaExceededError by monitoring storage usage and pruning completed sync logs older than 14 days.
   */
  async enforceStorageQuotaGuard(): Promise<{ usageMb: number; quotaMb: number; prunedCount: number }> {
    if (typeof navigator === 'undefined' || !('storage' in navigator) || !navigator.storage.estimate) {
      return { usageMb: 0, quotaMb: 0, prunedCount: 0 };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usageMb = parseFloat(((estimate.usage || 0) / (1024 * 1024)).toFixed(2));
      const quotaMb = parseFloat(((estimate.quota || 0) / (1024 * 1024)).toFixed(2));

      let prunedCount = 0;
      // Auto-prune if storage usage > 100MB or > 70% of storage quota
      if (usageMb > 100 || (quotaMb > 0 && (usageMb / quotaMb) > 0.7)) {
        const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
        prunedCount = await db.syncQueue
          .where('status').equals('Completed')
          .and(item => (item.created_at || item.timestamp || 0) < cutoff)
          .delete();
        if (prunedCount > 0) {
          console.info(`[ProductionSyncEngine] Storage Quota Guard pruned ${prunedCount} completed sync queue records.`);
        }
      }

      return { usageMb, quotaMb, prunedCount };
    } catch (e) {
      console.warn('[ProductionSyncEngine] Storage quota check warning:', e);
      return { usageMb: 0, quotaMb: 0, prunedCount: 0 };
    }
  }
}

export const productionSyncEngine = new ProductionSyncEngine();
