/**
 * Fast Bootstrap & Monotonic Synchronization Engine
 * Single-request compressed bootstrap snapshot restoration & background delta sync.
 */

import { db, type StockLedgerEntry } from '../db/dexie';
import { replicaManager } from './replicaManager';
import { productionSyncEngine } from './productionSyncEngine';
import { hlcEngine } from './hlcEngine';
import { stockLedgerSyncEngine, sanitizeAndProcessLedgerEntry } from './stockLedgerSyncEngine';
import { derivedProjectionRepository } from '../db/persistence/derivedProjectionRepository';

export interface BootstrapSnapshotPayload {
  tenant: any;
  user: any;
  branches: any[];
  settings: Record<string, any>;
  categories: any[];
  brands: any[];
  products: any[];
  variants: any[];
  stockLedger: any[];
  customers: any[];
  permissions: any[];
  subscriptionPlans: any[];
  syncVersion: number;
  schemaVersion: number;
  generatedAt: string;
  serverTimestamp: number;
}

export class BootstrapEngine {
  private syncChannel: BroadcastChannel | null = null;
  private isSyncing: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.syncChannel = new BroadcastChannel('dukapos-sync-channel');
    }
  }

  /**
   * Canonical Inbound Sync Pipeline.
   * Single entry point for both Bootstrap & Delta sync payloads.
   */
  private async applyInboundSync(
    tenantId: string,
    payload: {
      categories?: any[];
      brands?: any[];
      products?: any[];
      productVariants?: any[];
      variants?: any[];
      stockLedger?: any[];
      syncVersion: number;
    }
  ): Promise<number> {
    const affectedPairs = new Map<string, { productId: string; variantId?: string; branchId: string }>();

    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    const brands = Array.isArray(payload.brands) ? payload.brands : [];
    const products = Array.isArray(payload.products) ? payload.products : [];
    const rawVariants = Array.isArray(payload.productVariants)
      ? payload.productVariants
      : Array.isArray(payload.variants)
      ? payload.variants
      : [];
    const ledger = Array.isArray(payload.stockLedger) ? payload.stockLedger : [];

    await db.transaction(
      'rw',
      [
        db.categories,
        db.brands,
        db.products,
        db.productVariants,
        db.stockLedger,
        db.syncMetadata,
      ],
      async () => {
        if (categories.length) {
          const mappedCategories = categories.map((c) => ({
            ...c,
            tenant_id: c.tenant_id || tenantId,
            sync_version: c.sync_version || payload.syncVersion,
          }));
          await db.categories.bulkPut(mappedCategories);
        }

        if (brands.length) {
          const mappedBrands = brands.map((b) => ({
            ...b,
            tenant_id: b.tenant_id || tenantId,
            sync_version: b.sync_version || payload.syncVersion,
          }));
          await db.brands.bulkPut(mappedBrands);
        }

        if (products.length) {
          const mappedProducts = products.map((p) => ({
            ...p,
            tenant_id: p.tenant_id || tenantId,
            price: Number(p.selling_price || p.price || 0),
            buyingPrice: Number(p.buying_price || p.cost_price || 0),
            sellingPrice: Number(p.selling_price || p.price || 0),
            stock: Number(p.stock || 0),
            hasVariants: Boolean(p.has_variants || p.hasVariants),
            syncStatus: 'SYNCED',
          }));
          await db.products.bulkPut(mappedProducts);
        }

        if (rawVariants.length) {
          const mappedVariants = rawVariants.map((v) => ({
            ...v,
            productId: v.product_id || v.productId,
            tenant_id: v.tenant_id || tenantId,
            buyingPrice: Number(v.buying_price || 0),
            sellingPrice: Number(v.selling_price || 0),
            stock: Number(v.stock || 0),
            reservedStock: Number(v.reserved_stock || 0),
            syncStatus: 'SYNCED',
          }));
          await db.productVariants.bulkPut(mappedVariants);
        }

        if (ledger.length) {
          const sanitized = ledger.map((e) => sanitizeAndProcessLedgerEntry(e));

          // Inbound Idempotency Verification
          const uniqueEvents: StockLedgerEntry[] = [];
          for (const event of sanitized) {
            let exists = false;
            if (event.idempotency_key) {
              const found = await db.stockLedger
                .where('idempotency_key')
                .equals(event.idempotency_key)
                .first();
              if (found) exists = true;
            }
            if (!exists && event.id) {
              const foundById = await db.stockLedger.get(event.id);
              if (foundById) exists = true;
            }
            if (!exists) {
              uniqueEvents.push(event);
            }
          }

          if (uniqueEvents.length) {
            await db.stockLedger.bulkPut(uniqueEvents);
          }

          for (const e of sanitized) {
            const key = `${e.branch_id || 'branch-default'}:${e.product_id}:${e.variant_id || ''}`;
            affectedPairs.set(key, {
              productId: e.product_id,
              variantId: e.variant_id === 'no-variant' ? undefined : e.variant_id,
              branchId: e.branch_id || 'branch-default',
            });
          }
        }

        /**
         * IMPORTANT
         * checkpoint is written LAST.
         */
        await db.syncMetadata.put({
          key: 'lastSyncVersion',
          value: payload.syncVersion,
          updatedAt: Date.now(),
        });
      }
    );

    /**
     * Rebuild projections only after transaction commits.
     */
    for (const target of affectedPairs.values()) {
      await stockLedgerSyncEngine.recalculateStockFromEvents(
        tenantId,
        target.branchId,
        target.productId,
        target.variantId
      );
    }

    await derivedProjectionRepository.reconcileParentVariantStock(tenantId);

    return affectedPairs.size;
  }

  /**
   * Execute Fast Bootstrap (<2-5 seconds UI ready target)
   * Replaces sequentialREST downloads with a single atomic snapshot restoration.
   */
  public async executeFastBootstrap(
    tenantId: string,
    _user?: any,
    branchId?: string
  ): Promise<{ success: boolean; syncVersion: number; restoredCounts: Record<string, number>; notModified?: boolean }> {
    const startTime = Date.now();
    console.log(`[BootstrapEngine] Initiating fast bootstrap snapshot for tenant: ${tenantId}`);

    try {
      // 0a. Pre-Bootstrap Outbox Safety Check
      const safetyCheck = await replicaManager.canSafelyBootstrap(tenantId);
      if (!safetyCheck.allowed) {
        console.warn(`[BootstrapEngine] Outbox dirty (${safetyCheck.pendingOutboxCount} pending mutations). Attempting outbox flush before snapshot...`);
        await productionSyncEngine.processQueue(tenantId).catch(() => {});
      }

      // 0b. Get local watermark for conditional ETag re-validation
      const localWatermark = await db.syncMetadata.get('lastSyncVersion');
      const watermarkVal = localWatermark?.value || 1;
      const clientETag = `W/"sync-${tenantId}-v${watermarkVal}"`;

      // 1. Single compressed bootstrap snapshot POST request with If-None-Match ETag header
      const response = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'x-branch-id': branchId || '',
          'If-None-Match': clientETag,
        },
        body: JSON.stringify({ tenantId, branchId, ifNoneMatch: clientETag }),
      });

      // 2. Handle 304 Not Modified Fast-Path (<50ms startup time)
      if (response.status === 304) {
        console.log(
          `[BootstrapEngine] ⚡ 304 Not Modified (Watermark: ${watermarkVal}). Data unchanged. Bypassing restoration in ${Date.now() - startTime}ms!`
        );
        return { success: true, syncVersion: Number(watermarkVal), restoredCounts: {}, notModified: true };
      }

      if (!response.ok) {
        throw new Error(`Bootstrap snapshot API failed with status ${response.status}`);
      }

      const snapshot: BootstrapSnapshotPayload = await response.json();
      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('Invalid or empty bootstrap snapshot received from server.');
      }

      // Calibrate local clock offset with authoritative server timestamp
      if (snapshot.serverTimestamp || (snapshot as any).serverTime) {
        hlcEngine.calibrateOffset(snapshot.serverTimestamp || (snapshot as any).serverTime, Date.now() - startTime);
      }

      console.log(
        `[BootstrapEngine] Snapshot received (${snapshot.syncVersion} watermark) in ${Date.now() - startTime}ms`
      );

      // 3. Parallelized Bulk IndexedDB Restore via Canonical Inbound Sync Pipeline
      const restoredCounts = await this.bulkRestoreIndexedDB(snapshot, tenantId);

      // 4. Persist Monotonic Watermark Metadata
      await db.syncMetadata.bulkPut([
        { key: 'lastSyncVersion', value: snapshot.syncVersion || 1, updatedAt: Date.now() },
        { key: 'lastBootstrapAt', value: Date.now(), updatedAt: Date.now() },
        { key: 'schemaVersion', value: snapshot.schemaVersion || 8, updatedAt: Date.now() },
        { key: 'activeTenantId', value: tenantId, updatedAt: Date.now() },
      ]);

      // 5. Multi-tab synchronization broadcast
      if (this.syncChannel) {
        this.syncChannel.postMessage({
          type: 'BOOTSTRAP_COMPLETE',
          tenantId,
          syncVersion: snapshot.syncVersion,
          timestamp: Date.now(),
        });
      }

      console.log(
        `[BootstrapEngine] Fast Bootstrap complete in ${Date.now() - startTime}ms. UI Ready!`
      );
      return { success: true, syncVersion: snapshot.syncVersion, restoredCounts };
    } catch (err: any) {
      console.warn(`[BootstrapEngine] Fast bootstrap failed: ${err?.message}. Falling back to cached local storage.`);
      return { success: false, syncVersion: 0, restoredCounts: {} };
    }
  }

  /**
   * Bulk Atomic IndexedDB Restoration using canonical inbound sync pipeline
   */
  private async bulkRestoreIndexedDB(
    snapshot: BootstrapSnapshotPayload,
    tenantId: string
  ): Promise<Record<string, number>> {
    await this.applyInboundSync(tenantId, {
      categories: snapshot.categories,
      brands: snapshot.brands,
      products: snapshot.products,
      variants: snapshot.variants,
      stockLedger: snapshot.stockLedger,
      syncVersion: snapshot.syncVersion,
    });

    return {
      categories: snapshot.categories?.length || 0,
      brands: snapshot.brands?.length || 0,
      products: snapshot.products?.length || 0,
      variants: snapshot.variants?.length || 0,
      stockLedger: snapshot.stockLedger?.length || 0,
    };
  }

  /**
   * Background Incremental Delta Sync (Monotonic `sinceVersion` Watermark)
   */
  public async executeDeltaSync(tenantId: string): Promise<{ success: boolean; updatedCount: number }> {
    if (this.isSyncing) return { success: true, updatedCount: 0 };
    this.isSyncing = true;

    try {
      const watermarkObj = await db.syncMetadata.get('lastSyncVersion');
      const sinceVersion = Number(watermarkObj?.value || 0);

      const response = await fetch(`/api/sync?tenantId=${encodeURIComponent(tenantId)}&sinceVersion=${sinceVersion}`);
      if (!response.ok) {
        throw new Error('Delta sync failed');
      }

      const syncData = await response.json();
      if (syncData?.serverTimestamp || syncData?.serverTime) {
        hlcEngine.calibrateOffset(syncData.serverTimestamp || syncData.serverTime);
      }
      const changes = syncData?.changes || {};
      const nextVersion = Number(syncData.syncVersion || syncData.serverTimestamp || Date.now());

      const affected = await this.applyInboundSync(tenantId, {
        categories: changes.categories,
        brands: changes.brands,
        products: changes.products,
        productVariants: changes.productVariants || changes.variants,
        stockLedger: changes.stockLedger,
        syncVersion: nextVersion,
      });

      return {
        success: true,
        updatedCount: affected,
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        updatedCount: 0,
      };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const bootstrapEngine = new BootstrapEngine();
