/**
 * Fast Bootstrap & Monotonic Synchronization Engine
 * Single-request compressed bootstrap snapshot restoration & background delta sync.
 */

import { db } from '../db/dexie';

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
      // 0. Get local watermark for conditional ETag re-validation
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
      console.log(
        `[BootstrapEngine] Snapshot received (${snapshot.syncVersion} watermark) in ${Date.now() - startTime}ms`
      );

      // 3. Parallelized Bulk IndexedDB Restore via Single Dexie Transaction
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
   * Bulk Atomic IndexedDB Restoration (Parallel Write Throughput)
   */
  private async bulkRestoreIndexedDB(
    snapshot: BootstrapSnapshotPayload,
    tenantId: string
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    // Pre-map snapshot data arrays
    const catsToPut = Array.isArray(snapshot.categories) ? snapshot.categories.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code || '',
      description: c.description || '',
      tenant_id: c.tenant_id || tenantId,
      parent_id: c.parent_id || null,
      sync_version: c.sync_version || 1,
      created_at: c.created_at || Date.now(),
    })) : [];

    const brandsToPut = Array.isArray(snapshot.brands) ? snapshot.brands.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code || '',
      description: b.description || '',
      tenant_id: b.tenant_id || tenantId,
      sync_version: b.sync_version || 1,
      created_at: b.created_at || Date.now(),
    })) : [];

    const prodsToPut = Array.isArray(snapshot.products) ? snapshot.products.map((p) => ({
      ...p,
      tenant_id: p.tenant_id || tenantId,
      price: Number(p.selling_price || p.price || 0),
      buyingPrice: Number(p.buying_price || p.cost_price || 0),
      sellingPrice: Number(p.selling_price || p.price || 0),
      stock: Number(p.stock || 0),
      hasVariants: Boolean(p.has_variants || p.hasVariants),
      syncStatus: 'SYNCED',
    })) : [];

    const varsToPut = Array.isArray(snapshot.variants) ? snapshot.variants.map((v) => ({
      ...v,
      productId: v.product_id || v.productId,
      tenant_id: v.tenant_id || tenantId,
      buyingPrice: Number(v.buying_price || 0),
      sellingPrice: Number(v.selling_price || 0),
      stock: Number(v.stock || 0),
      reservedStock: Number(v.reserved_stock || 0),
      syncStatus: 'SYNCED',
    })) : [];

    await db.transaction(
      'rw',
      [
        db.tenants,
        db.branches,
        db.categories,
        db.brands,
        db.products,
        db.productVariants,
        db.stockLedger,
        db.customers,
        db.suppliers,
        db.subscriptionPlans,
        db.syncMetadata,
      ],
      async () => {
        const tasks: Promise<void>[] = [];

        if (snapshot.tenant?.id) {
          tasks.push(db.tenants.put(snapshot.tenant).then(() => { counts.tenants = 1; }));
        }
        if (Array.isArray(snapshot.branches) && snapshot.branches.length > 0) {
          tasks.push(db.branches.bulkPut(snapshot.branches).then(() => { counts.branches = snapshot.branches.length; }));
        }
        if (catsToPut.length > 0) {
          tasks.push(db.categories.bulkPut(catsToPut).then(() => { counts.categories = catsToPut.length; }));
        }
        if (brandsToPut.length > 0) {
          tasks.push(db.brands.bulkPut(brandsToPut).then(() => { counts.brands = brandsToPut.length; }));
        }
        if (prodsToPut.length > 0) {
          tasks.push(db.products.bulkPut(prodsToPut).then(() => { counts.products = prodsToPut.length; }));
        }
        if (varsToPut.length > 0) {
          tasks.push(db.productVariants.bulkPut(varsToPut).then(() => { counts.variants = varsToPut.length; }));
        }
        if (Array.isArray(snapshot.stockLedger) && snapshot.stockLedger.length > 0) {
          tasks.push(db.stockLedger.bulkPut(snapshot.stockLedger).then(() => { counts.stockLedger = snapshot.stockLedger.length; }));
        }
        if (Array.isArray(snapshot.customers) && snapshot.customers.length > 0) {
          tasks.push(db.customers.bulkPut(snapshot.customers).then(() => { counts.customers = snapshot.customers.length; }));
        }
        if (Array.isArray((snapshot as any).suppliers) && (snapshot as any).suppliers.length > 0) {
          tasks.push(db.suppliers.bulkPut((snapshot as any).suppliers).then(() => { counts.suppliers = (snapshot as any).suppliers.length; }));
        }
        if (Array.isArray(snapshot.subscriptionPlans) && snapshot.subscriptionPlans.length > 0) {
          tasks.push(db.subscriptionPlans.bulkPut(snapshot.subscriptionPlans).then(() => { counts.subscriptionPlans = snapshot.subscriptionPlans.length; }));
        }

        await Promise.all(tasks);
      }
    );

    return counts;
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
        throw new Error(`Delta sync failed with status ${response.status}`);
      }

      const syncData = await response.json();
      const changes = syncData?.changes || {};
      let updatedCount = 0;

      await db.transaction(
        'rw',
        [db.categories, db.brands, db.products, db.productVariants, db.stockLedger, db.syncMetadata],
        async () => {
          if (Array.isArray(changes.categories) && changes.categories.length > 0) {
            await db.categories.bulkPut(changes.categories);
            updatedCount += changes.categories.length;
          }
          if (Array.isArray(changes.brands) && changes.brands.length > 0) {
            await db.brands.bulkPut(changes.brands);
            updatedCount += changes.brands.length;
          }
          if (Array.isArray(changes.products) && changes.products.length > 0) {
            const mappedProds = changes.products.map((p: any) => ({
              ...p,
              tenant_id: p.tenant_id || tenantId,
              price: Number(p.selling_price || p.price || 0),
              buyingPrice: Number(p.buying_price || p.cost_price || 0),
              sellingPrice: Number(p.selling_price || p.price || 0),
              stock: Number(p.stock || 0),
              hasVariants: Boolean(p.has_variants || p.hasVariants),
            }));
            await db.products.bulkPut(mappedProds);
            updatedCount += mappedProds.length;
          }
          if (Array.isArray(changes.productVariants) && changes.productVariants.length > 0) {
            const mappedVars = changes.productVariants.map((v: any) => ({
              ...v,
              productId: v.product_id || v.productId,
              tenant_id: v.tenant_id || tenantId,
              stock: Number(v.stock || 0),
              buyingPrice: Number(v.buying_price || 0),
              sellingPrice: Number(v.selling_price || 0),
            }));
            await db.productVariants.bulkPut(mappedVars);
            updatedCount += mappedVars.length;
          }

          const newWatermark = syncData.serverTimestamp || Date.now();
          await db.syncMetadata.put({ key: 'lastSyncVersion', value: newWatermark, updatedAt: Date.now() });
        }
      );

      return { success: true, updatedCount };
    } catch (err: any) {
      console.warn(`[BootstrapEngine] Background delta sync error: ${err?.message}`);
      return { success: false, updatedCount: 0 };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const bootstrapEngine = new BootstrapEngine();
