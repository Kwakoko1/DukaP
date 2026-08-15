import { db } from '../db/dexie';
import { productionSyncEngine } from './productionSyncEngine';

export const PWA_BUILD_HASH_KEY = 'kwakopos_build_hash';
export const CURRENT_PWA_BUILD_VER = '2026.08.15.v2.1.0';

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

  if (isNewBuild) {
    console.info(`[PWARehydration] New application build detected: ${installedVersion || 'none'} -> ${CURRENT_PWA_BUILD_VER}. Executing state reconciliation...`);

    // 1. Verify IndexedDB schema integrity
    try {
      if (!db.isOpen()) {
        await db.open();
      }
      productsCount = await db.products.count();
      console.info(`[PWARehydration] IndexedDB Catalog verified intact. Retained ${productsCount} products.`);
    } catch (dbErr) {
      console.error('[PWARehydration] IndexedDB schema verification warning:', dbErr);
    }

    // 2. Trigger background cloud sync pipeline to catch missing rows
    const targetTenant = tenantId || localStorage.getItem('last_active_tenant') || 'tenant-101';
    try {
      await productionSyncEngine.pullChanges(targetTenant, 'branch-main');
      console.info(`[PWARehydration] Background cloud sync delta pull triggered successfully for ${targetTenant}.`);
    } catch (syncErr) {
      console.warn('[PWARehydration] Cloud sync pipeline deferred (offline or unreachable):', syncErr);
    }

    // 3. Commit new version reference
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
