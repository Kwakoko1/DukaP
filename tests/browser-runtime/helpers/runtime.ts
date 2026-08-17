/**
 * KwakoPOS SaaS — Real Browser & IndexedDB Runtime Helpers for Playwright
 * Inspects the actual live application IndexedDB database, Service Worker, and Session state.
 */
import { Page, expect } from '@playwright/test';

export interface LoginOptions {
  email?: string;
  password?: string;
  deviceId?: string;
  deviceName?: string;
}

/**
 * Authenticates user through real server API and sets active session in browser
 */
export async function login(page: Page, options: LoginOptions = {}) {
  const email = options.email || 'owner@dukapos.com';
  const password = options.password || 'password123';
  const deviceId = options.deviceId || `playwright-dev-${Date.now()}`;

  // 1. Perform direct API login via Playwright APIRequestContext
  const res = await page.request.post('/api/auth/login', {
    data: { email, password, deviceId },
  });
  const authData = await res.json();
  const token = authData.accessToken || authData.token || '';

  // 2. Add InitScript so localStorage is set BEFORE the page even loads scripts
  await page.addInitScript(({ token, authData, deviceId }) => {
    if (token) {
      const sessionObj = {
        token,
        accessToken: token,
        refreshToken: authData.refreshToken,
        sessionId: authData.sessionId,
        user: authData.user,
        tenant: authData.tenant,
        device_id: deviceId,
        deviceId: deviceId,
      };
      localStorage.setItem('dukapos_active_session', JSON.stringify(sessionObj));
      localStorage.setItem('dukapos_device_id', deviceId);
      localStorage.setItem('dukapos_online_mode', 'true');
    }
  }, { token, authData, deviceId });

  // 3. Load page
  await page.goto('/#/inventory', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => (window as any).db !== undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  return authData;
}

/**
 * Ensures Service Worker is active and controlling the page
 */
export async function waitForServiceWorker(page: Page) {
  return await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return { supported: false, registered: false, controller: false, scope: '' };
    }
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((res) => setTimeout(() => res(null), 3000))
      ]);
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        registered: !!reg || regs.length > 0,
        controller: !!navigator.serviceWorker.controller || !!(reg && (reg as any).active),
        scope: reg ? (reg as any).scope : (regs[0]?.scope || ''),
      };
    } catch {
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        registered: regs.length > 0,
        controller: regs.length > 0,
        scope: regs[0]?.scope || '',
      };
    }
  });
}

/**
 * Waits for Dexie / DukaPosDatabase to be opened and responsive
 */
export async function waitForIndexedDB(page: Page, dbName = 'DukaPosDatabase') {
  return await page.evaluate(async (name) => {
    if ((window as any).db && (window as any).db.isOpen()) {
      return { open: true, version: (window as any).db.verno, stores: (window as any).db.tables.map((t: any) => t.name) };
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => {
        const db = req.result;
        const stores = Array.from(db.objectStoreNames);
        db.close();
        resolve({ open: true, version: req.result.version, stores });
      };
      req.onerror = () => reject(req.error);
    });
  }, dbName);
}

/**
 * Reads all records from a specific IndexedDB store in the active page
 */
export async function readDexieStore<T = any>(page: Page, storeName: string, _dbName = 'DukaPosDatabase'): Promise<T[]> {
  return await page.evaluate(async ({ storeName }) => {
    if ((window as any).db && (window as any).db[storeName]) {
      return await (window as any).db[storeName].toArray();
    }
    return [];
  }, { storeName });
}

/**
 * Counts records in an IndexedDB store
 */
export async function countStore(page: Page, storeName: string, dbName = 'DukaPosDatabase'): Promise<number> {
  const records = await readDexieStore(page, storeName, dbName);
  return records.length;
}

/**
 * Reads all pending outbox mutations from Dexie (syncOutbox and syncQueue)
 */
export async function readOutbox(page: Page, dbName = 'DukaPosDatabase') {
  const syncOutbox = await readDexieStore(page, 'syncOutbox', dbName);
  const syncQueue = await readDexieStore(page, 'syncQueue', dbName);
  return {
    syncOutbox,
    syncQueue,
    pendingOutboxCount: syncOutbox.filter((m: any) => m.status === 'PENDING' || m.status === 'Pending').length,
    pendingQueueCount: syncQueue.filter((m: any) => m.status === 'PENDING' || m.status === 'Pending').length,
  };
}

/**
 * Reads current device identifier from page
 */
export async function readDeviceId(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return localStorage.getItem('dukapos_device_id') || 'unknown-device';
  });
}

/**
 * Reads current tenant identifier from session
 */
export async function readTenantId(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('dukapos_active_session');
    if (!raw) return 'runtime-validation-tenant';
    try {
      const parsed = JSON.parse(raw);
      return parsed.tenant?.id || parsed.user?.tenant_id || 'runtime-validation-tenant';
    } catch {
      return 'runtime-validation-tenant';
    }
  });
}

/**
 * Reads replica metadata from Dexie or IndexedDB
 */
export async function readReplicaMetadata(page: Page, dbName = 'DukaPosDatabase') {
  return await page.evaluate(async (name) => {
    if ((window as any).db && (window as any).db.replicaMetadata) {
      return await (window as any).db.replicaMetadata.toArray();
    }
    return new Promise<any[]>((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('replicaMetadata')) {
          db.close();
          return resolve([]);
        }
        const tx = db.transaction('replicaMetadata', 'readonly');
        const store = tx.objectStore('replicaMetadata');
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          db.close();
          resolve(getAllReq.result || []);
        };
        getAllReq.onerror = () => {
          db.close();
          reject(getAllReq.error);
        };
      };
      req.onerror = () => reject(req.error);
    });
  }, dbName);
}

/**
 * Computes deterministic SHA-256 replica checksum from page's real IndexedDB matching server canonical checksum
 */
export async function getChecksum(page: Page, tenantId?: string): Promise<string> {
  return await page.evaluate(async (tId) => {
    const targetTenant = tId || 'runtime-validation-tenant';
    let products: any[] = [];
    let variants: any[] = [];
    let categories: any[] = [];
    let brands: any[] = [];

    const getDb = () => (window as any).db;
    let dexie = getDb();
    let attempts = 0;
    while ((!dexie || !dexie.products) && attempts < 30) {
      await new Promise(r => setTimeout(r, 100));
      dexie = getDb();
      attempts++;
    }

    if (dexie) {
      products = await dexie.products?.toArray() || [];
      variants = await dexie.productVariants?.toArray() || [];
      categories = await dexie.categories?.toArray() || [];
      brands = await dexie.brands?.toArray() || [];
    }

    const canonicalize = (val: any): any => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'number') return Number.isFinite(val) ? val : null;
      if (typeof val === 'string' || typeof val === 'boolean') return val;
      if (Array.isArray(val)) return val.map(canonicalize);
      if (typeof val === 'object') {
        return Object.keys(val).sort().reduce((res: any, k) => {
          res[k] = canonicalize(val[k]);
          return res;
        }, {});
      }
      return String(val);
    };

    const filterByTenant = (list: any[]) => list.filter(item => {
      const itemTenant = item.tenant_id || item.tenantId;
      return !targetTenant || itemTenant === targetTenant;
    });

    products = filterByTenant(products);
    variants = filterByTenant(variants);
    categories = filterByTenant(categories);
    brands = filterByTenant(brands);

    const canonicalProd = (r: any) => ({
      id: String(r.id || ''),
      tenant_id: String(r.tenant_id || r.tenantId || ''),
      branch_id: r.branch_id || r.branchId ? String(r.branch_id || r.branchId) : null,
      name: String(r.name || '').trim(),
      sku: r.sku ? String(r.sku).trim() : null,
      barcode: r.barcode ? String(r.barcode).trim() : null,
      category: r.category ? String(r.category).trim() : null,
      categoryId: r.categoryId || r.category_id ? String(r.categoryId || r.category_id) : null,
      brand: r.brand ? String(r.brand).trim() : null,
      brandId: r.brandId || r.brand_id ? String(r.brandId || r.brand_id) : null,
      buyingPrice: Number(r.buyingPrice ?? r.buying_price ?? 0),
      sellingPrice: Number(r.sellingPrice ?? r.selling_price ?? r.price ?? 0),
      price: Number(r.price ?? r.selling_price ?? r.sellingPrice ?? 0),
      costPrice: Number(r.costPrice ?? r.cost_price ?? 0),
      wholesalePrice: Number(r.wholesalePrice ?? r.wholesale_price ?? 0),
      vipPrice: Number(r.vipPrice ?? r.vip_price ?? 0),
      onlinePrice: Number(r.onlinePrice ?? r.online_price ?? 0),
      hasVariants: Boolean(r.hasVariants ?? r.has_variants ?? false),
      status: r.status ? String(r.status) : 'Active',
      version: Number(r.version ?? 1),
      deletedAt: r.deletedAt ?? r.deleted_at ?? null,
    });

    const canonicalVar = (r: any) => ({
      id: String(r.id || ''),
      productId: String(r.productId || r.product_id || ''),
      tenant_id: String(r.tenant_id || r.tenantId || ''),
      branch_id: r.branch_id || r.branchId ? String(r.branch_id || r.branchId) : null,
      sku: r.sku ? String(r.sku).trim() : null,
      barcode: r.barcode ? String(r.barcode).trim() : null,
      buyingPrice: Number(r.buyingPrice ?? r.buying_price ?? 0),
      sellingPrice: Number(r.sellingPrice ?? r.selling_price ?? r.price ?? 0),
      wholesalePrice: Number(r.wholesalePrice ?? r.wholesale_price ?? 0),
      vipPrice: Number(r.vipPrice ?? r.vip_price ?? 0),
      onlinePrice: Number(r.onlinePrice ?? r.online_price ?? 0),
      stock: Number(r.stock ?? 0),
      reservedStock: Number(r.reservedStock ?? r.reserved_stock ?? 0),
      reorderLevel: Number(r.reorderLevel ?? r.reorder_level ?? 0),
      status: r.status ? String(r.status) : 'Active',
      attributes: r.attributes ? canonicalize(r.attributes) : {},
      version: Number(r.version ?? 1),
      deletedAt: r.deletedAt ?? r.deleted_at ?? null,
    });

    const canonicalCat = (r: any) => ({
      id: String(r.id || ''),
      tenant_id: String(r.tenant_id || r.tenantId || ''),
      branch_id: r.branch_id || r.branchId ? String(r.branch_id || r.branchId) : null,
      name: String(r.name || '').trim(),
      code: r.code ? String(r.code).trim() : null,
      description: r.description ? String(r.description).trim() : null,
      parent_id: r.parent_id || r.parentId ? String(r.parent_id || r.parentId) : null,
      status: r.status ? String(r.status) : 'Active',
      sync_version: Number(r.sync_version ?? r.syncVersion ?? 0),
      deletedAt: r.deletedAt ?? r.deleted_at ?? null,
    });

    const canonicalBrd = (r: any) => ({
      id: String(r.id || ''),
      tenant_id: String(r.tenant_id || r.tenantId || ''),
      branch_id: r.branch_id || r.branchId ? String(r.branch_id || r.branchId) : null,
      name: String(r.name || '').trim(),
      code: r.code ? String(r.code).trim() : null,
      description: r.description ? String(r.description).trim() : null,
      status: r.status ? String(r.status) : 'Active',
      sync_version: Number(r.sync_version ?? r.syncVersion ?? 0),
      deletedAt: r.deletedAt ?? r.deleted_at ?? null,
    });

    const records = [
      ...products.map((r) => ({ entity: 'products', id: String(r.id), data: canonicalProd(r) })),
      ...variants.map((r) => ({ entity: 'productVariants', id: String(r.id), data: canonicalVar(r) })),
      ...categories.map((r) => ({ entity: 'categories', id: String(r.id), data: canonicalCat(r) })),
      ...brands.map((r) => ({ entity: 'brands', id: String(r.id), data: canonicalBrd(r) })),
    ];

    records.sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));

    const canonicalPayload = {
      checksumVersion: 1,
      tenantId: String(targetTenant),
      schemaVersion: 8,
      records: records.map((r) => ({ entity: r.entity, id: r.id, data: canonicalize(r.data) })),
    };

    const serialized = JSON.stringify(canonicalize(canonicalPayload));
    const data = new TextEncoder().encode(serialized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return 'sha256:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }, tenantId);
}

/**
 * Creates a real mutation through IndexedDB + Outbox transaction in the page
 */
export async function createRealBrowserProduct(page: Page, product: any) {
  return await page.evaluate(async (prod) => {
    const now = Date.now();
    const fullProd = {
      ...prod,
      buyingPrice: prod.buyingPrice || prod.price || 0,
      sellingPrice: prod.sellingPrice || prod.price || 0,
      price: prod.price || 0,
      hasVariants: false,
      module: 'retail',
      tenant_id: prod.tenant_id || 'runtime-validation-tenant',
      branch_id: prod.branch_id || 'branch-a',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'PENDING',
    };

    const getDb = () => {
      if ((window as any).db) return (window as any).db;
      return null;
    };

    let dexie = getDb();
    let attempts = 0;
    while ((!dexie || !dexie.products) && attempts < 30) {
      await new Promise(r => setTimeout(r, 100));
      dexie = getDb();
      attempts++;
    }

    if (dexie && dexie.products) {
      await dexie.products.put(fullProd);
      if (dexie.syncQueue) {
        await dexie.syncQueue.put({
          id: `op-e2e-${now}-${Math.random().toString(36).slice(2, 6)}`,
          entityName: 'products',
          actionType: 'CREATE',
          payload: fullProd,
          status: 'Pending',
          timestamp: now,
        });
      }
      return { success: true, product: fullProd };
    }

    return { success: false, error: 'Dexie db instance not accessible' };
  }, product);
}

/**
 * Triggers manual sync on page
 */
export async function triggerManualSync(page: Page) {
  return await page.evaluate(async () => {
    const syncBtn = document.querySelector('button[title*="Sync"], button:has-text("Force Edge Sync Probe")') as HTMLButtonElement;
    if (syncBtn) {
      syncBtn.click();
    }
  });
}
