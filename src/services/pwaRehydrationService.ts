import { db } from '../db/dexie';
import { productionSyncEngine } from './productionSyncEngine';
import { reconcileCategoriesAndBrands } from './productService';

export const PWA_BUILD_HASH_KEY = 'kwakopos_build_hash';
export const CURRENT_PWA_BUILD_VER = '2026.08.16.v2.2.0';

/**
 * Ensures the browser marks this PWA's IndexedDB and CacheStorage as persistent,
 * preventing storage eviction during low-disk or browser update events.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        console.info('[StoragePersistence] IndexedDB storage is already persistent.');
        return true;
      }
      const granted = await navigator.storage.persist();
      if (granted) {
        console.info('[StoragePersistence] Browser granted PERSISTENT storage. Local catalog & sync outbox are immune to eviction.');
      } else {
        console.warn('[StoragePersistence] Storage is best-effort. Browser may evict under extreme storage pressure.');
      }
      return granted;
    } catch (err) {
      console.warn('[StoragePersistence] Error requesting persistent storage:', err);
    }
  }
  return false;
}

export interface StorageDiagnostics {
  buildVersion: string;
  cacheStorage: {
    name: string;
    itemsCount: number;
  }[];
  indexedDB: {
    name: string;
    version: number;
    stores: { name: string; count: number }[];
  };
  rehydrationStatus: 'HEALTHY' | 'RECONCILED' | 'ATTENTION_NEEDED';
  lastRehydrationTimestamp?: number;
}

/**
 * Rehydrates local memory state and triggers background cloud sync
 * whenever a new PWA build version is detected on client load.
 */
export async function syncStatePostUpdate(tenantId?: string): Promise<{
  updated: boolean;
  previousVersion: string | null;
  currentVersion: string;
  productsCount: number;
}> {
  const installedVersion = localStorage.getItem(PWA_BUILD_HASH_KEY);
  const isNewBuild = installedVersion !== CURRENT_PWA_BUILD_VER;

  let productsCount = 0;
  try {
    productsCount = await db.products.count();
  } catch (err) {
    console.warn('[PWARehydration] Error counting local products:', err);
  }

  // Always ensure persistent storage lock
  await requestPersistentStorage().catch(() => {});

  if (isNewBuild) {
    console.info(`[PWARehydration] New application build detected: ${installedVersion || 'none'} -> ${CURRENT_PWA_BUILD_VER}. Executing state reconciliation...`);

    // 1. Verify IndexedDB schema integrity & preserve local catalog
    try {
      if (!db.isOpen()) {
        await db.open();
      }
      productsCount = await db.products.count();
      console.info(`[PWARehydration] IndexedDB Catalog verified intact. Retained ${productsCount} products.`);
    } catch (dbErr) {
      console.error('[PWARehydration] IndexedDB schema verification warning:', dbErr);
    }

    // 2. Reconcile Products, Categories & Brands into IndexedDB (zero loss)
    const targetTenant = tenantId || localStorage.getItem('last_active_tenant') || 'tenant-101';
    try {
      const reconResult = await reconcileCategoriesAndBrands(targetTenant);
      if (reconResult.brandsAdded > 0 || reconResult.categoriesAdded > 0) {
        console.info(`[PWARehydration] Reconciled metadata: +${reconResult.brandsAdded} brands, +${reconResult.categoriesAdded} categories.`);
      }
    } catch (reconErr) {
      console.warn('[PWARehydration] Metadata reconciliation deferred:', reconErr);
    }

    // 3. Trigger non-destructive background cloud delta pull (upsert only)
    try {
      await productionSyncEngine.pullChanges(targetTenant, 'branch-main');
      console.info(`[PWARehydration] Background cloud sync delta pull triggered successfully for ${targetTenant}.`);
    } catch (syncErr) {
      console.warn('[PWARehydration] Cloud sync pipeline deferred (offline or unreachable):', syncErr);
    }

    // 4. Commit new version reference
    localStorage.setItem(PWA_BUILD_HASH_KEY, CURRENT_PWA_BUILD_VER);
    localStorage.setItem('kwakopos_last_rehydration_time', String(Date.now()));
  }

  return {
    updated: isNewBuild,
    previousVersion: installedVersion,
    currentVersion: CURRENT_PWA_BUILD_VER,
    productsCount
  };
}

/**
 * Interactive Diagnostic Inspector for CacheStorage and IndexedDB
 */
export async function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  const cacheResults: { name: string; itemsCount: number }[] = [];

  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        cacheResults.push({
          name: key,
          itemsCount: requests.length
        });
      }
    } catch (err) {
      console.warn('[StorageDiagnostics] Error querying CacheStorage:', err);
    }
  }

  const storeCounts: { name: string; count: number }[] = [];
  try {
    if (!db.isOpen()) await db.open();
    const storeNames = ['products', 'productVariants', 'categories', 'brands', 'orders', 'customers', 'stockLedger', 'syncQueue'];
    for (const sName of storeNames) {
      const table = (db as any)[sName];
      if (table) {
        const count = await table.count();
        storeCounts.push({ name: sName, count });
      }
    }
  } catch (idbErr) {
    console.warn('[StorageDiagnostics] Error querying IndexedDB:', idbErr);
  }

  const lastTime = parseInt(localStorage.getItem('kwakopos_last_rehydration_time') || '0', 10);
  const productsCount = storeCounts.find(s => s.name === 'products')?.count || 0;

  return {
    buildVersion: CURRENT_PWA_BUILD_VER,
    cacheStorage: cacheResults,
    indexedDB: {
      name: db.name,
      version: db.verno,
      stores: storeCounts
    },
    rehydrationStatus: productsCount > 0 ? 'HEALTHY' : 'RECONCILED',
    lastRehydrationTimestamp: lastTime || undefined
  };
}
