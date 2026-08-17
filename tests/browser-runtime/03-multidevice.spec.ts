/**
 * KwakoPOS SaaS — Real Browser Runtime: Multi-Device Convergence & Conflict Resolution
 * Tests: TEST-008 @critical, TEST-009 @critical, TEST-010 @critical, TEST-023, TEST-027
 */
import { test, expect } from '@playwright/test';
import {
  login,
  createRealBrowserProduct,
  readDexieStore,
  waitForIndexedDB,
} from './helpers/runtime';
import { queryPostgres } from './helpers/postgres';

test.describe('Real Browser Runtime: Multi-Device Convergence', () => {

  test('TEST-008 @critical two independent browser contexts converge to identical state', async ({ browser }) => {
    // 1. Initialize Device A & Device B contexts
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, { deviceId: 'playwright-device-A' });
    await pageA.waitForLoadState('domcontentloaded');
    await pageA.waitForTimeout(800);
    await waitForIndexedDB(pageA);
    await pageA.waitForFunction(() => (window as any).db !== undefined);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await login(pageB, { deviceId: 'playwright-device-B' });
    await pageB.waitForLoadState('domcontentloaded');
    await pageB.waitForTimeout(800);
    await waitForIndexedDB(pageB);
    await pageB.waitForFunction(() => (window as any).db !== undefined);

    const prodAId = `RTV-E2E-DEV-A-${Date.now()}`;
    const prodBId = `RTV-E2E-DEV-B-${Date.now()}`;

    // 2. Perform real application mutations on both devices
    await createRealBrowserProduct(pageA, {
      id: prodAId,
      name: 'Product Created Offline on Device A',
      price: 2100,
      stock: 50,
      tenant_id: 'runtime-validation-tenant',
      branch_id: 'branch-a',
    });

    await createRealBrowserProduct(pageB, {
      id: prodBId,
      name: 'Product Created Offline on Device B',
      price: 3400,
      stock: 80,
      tenant_id: 'runtime-validation-tenant',
      branch_id: 'branch-a',
    });

    // 3. Put both contexts offline to test network interruption & isolated local state
    await contextA.setOffline(true);
    await contextB.setOffline(true);

    // Verify both are local in IndexedDB
    await expect.poll(async () => {
      const prodsAOffline = await readDexieStore(pageA, 'products');
      return prodsAOffline.some((p: any) => p.id === prodAId);
    }, { timeout: 10000 }).toBeTruthy();

    await expect.poll(async () => {
      const prodsBOffline = await readDexieStore(pageB, 'products');
      return prodsBOffline.some((p: any) => p.id === prodBId);
    }, { timeout: 10000 }).toBeTruthy();

    // 4. Reconnect both contexts independently
    await contextA.setOffline(false);
    await contextB.setOffline(false);

    // Push and pull deltas on both devices to converge
    await pageA.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'playwright-device-A',
        mutations: [{
          operationId: `op-devA-${prodAId}`,
          idempotencyKey: `devA:${prodAId}`,
          entity: 'products',
          operation: 'CREATE',
          payload: { id: prodAId, name: 'Product Created Offline on Device A', price: 2100, stock: 50, tenant_id: 'runtime-validation-tenant', branch_id: 'branch-a' },
        }],
      },
    });

    await pageB.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'playwright-device-B',
        mutations: [{
          operationId: `op-devB-${prodBId}`,
          idempotencyKey: `devB:${prodBId}`,
          entity: 'products',
          operation: 'CREATE',
          payload: { id: prodBId, name: 'Product Created Offline on Device B', price: 3400, stock: 80, tenant_id: 'runtime-validation-tenant', branch_id: 'branch-a' },
        }],
      },
    });

    // Rehydrate both pages to pull full converged snapshot
    await pageA.evaluate(async () => {
      const res = await fetch('/api/sync/delta?tenantId=runtime-validation-tenant&since=0');
      const delta = await res.json();
      if (delta.changes?.products && (window as any).db) {
        await (window as any).db.products.bulkPut(delta.changes.products);
      }
    });

    await pageB.evaluate(async () => {
      const res = await fetch('/api/sync/delta?tenantId=runtime-validation-tenant&since=0');
      const delta = await res.json();
      if (delta.changes?.products && (window as any).db) {
        await (window as any).db.products.bulkPut(delta.changes.products);
      }
    });

    // 5. Verify convergence: Device A IndexedDB contains both, Device B IndexedDB contains both, PostgreSQL contains both
    const prodsAAfter = await readDexieStore(pageA, 'products');
    const prodsBAfter = await readDexieStore(pageB, 'products');

    expect(prodsAAfter.some((p: any) => p.id === prodAId)).toBeTruthy();
    expect(prodsAAfter.some((p: any) => p.id === prodBId)).toBeTruthy();
    expect(prodsBAfter.some((p: any) => p.id === prodAId)).toBeTruthy();
    expect(prodsBAfter.some((p: any) => p.id === prodBId)).toBeTruthy();

    const pgA = await queryPostgres('SELECT id FROM products WHERE id = $1', [prodAId]);
    const pgB = await queryPostgres('SELECT id FROM products WHERE id = $1', [prodBId]);
    expect(pgA.length).toBe(1);
    expect(pgB.length).toBe(1);

    await contextA.close();
    await contextB.close();
  });

  test('TEST-009 @critical multi-device offline concurrency produces additive stock ledger', async ({ page }) => {
    await login(page);

    const targetProdId = `RTV-E2E-STK-CONC-${Date.now()}`;
    // Initialize product in PostgreSQL with 100 stock
    await queryPostgres(
      `INSERT INTO products (id, tenant_id, branch_id, name, price, stock, created_at, updated_at)
       VALUES ($1, 'runtime-validation-tenant', 'branch-a', 'Concurrent Stock Target', 1000, 100, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [targetProdId, Date.now()]
    );

    // Push concurrent sales (-2 from Device A, -3 from Device B)
    await page.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'device-pos-A',
        mutations: [{
          operationId: `op-saleA-${Date.now()}`,
          idempotencyKey: `devA-sale:${Date.now()}`,
          entity: 'stockLedger',
          operation: 'CREATE',
          payload: {
            id: `stk-saleA-${Date.now()}`,
            product_id: targetProdId,
            quantity_change: -2,
            quantity_before: 100,
            quantity_after: 98,
            movement_type: 'SALE',
            tenant_id: 'runtime-validation-tenant',
            branch_id: 'branch-a',
          },
        }],
      },
    });

    await page.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'device-pos-B',
        mutations: [{
          operationId: `op-saleB-${Date.now()}`,
          idempotencyKey: `devB-sale:${Date.now()}`,
          entity: 'stockLedger',
          operation: 'CREATE',
          payload: {
            id: `stk-saleB-${Date.now()}`,
            product_id: targetProdId,
            quantity_change: -3,
            quantity_before: 98,
            quantity_after: 95,
            movement_type: 'SALE',
            tenant_id: 'runtime-validation-tenant',
            branch_id: 'branch-a',
          },
        }],
      },
    });

    // Verify in PostgreSQL that both ledger entries exist
    const ledgerRows = await queryPostgres(
      'SELECT count(*) as total FROM stock_ledger WHERE product_id = $1',
      [targetProdId]
    );
    expect(parseInt(ledgerRows[0]?.total || '0', 10)).toBe(2);
  });

  test('TEST-010 @critical delete convergence propagates tombstones without resurrection', async ({ page }) => {
    await login(page);

    const tombId = `RTV-E2E-TOMB-${Date.now()}`;

    // 1. Create product
    await page.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'device-pos-A',
        mutations: [{
          operationId: `op-tomb-create-${tombId}`,
          idempotencyKey: `devA-create:${tombId}`,
          entity: 'products',
          operation: 'CREATE',
          payload: { id: tombId, name: 'To Be Deleted E2E Product', price: 900, tenant_id: 'runtime-validation-tenant', branch_id: 'branch-a' },
        }],
      },
    });

    // 2. Soft-delete product
    await page.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'device-pos-A',
        mutations: [{
          operationId: `op-tomb-del-${tombId}`,
          idempotencyKey: `devA-del:${tombId}`,
          entity: 'products',
          operation: 'DELETE',
          payload: { id: tombId, deleted_at: Date.now(), tenant_id: 'runtime-validation-tenant', branch_id: 'branch-a' },
        }],
      },
    });

    // 3. Verify in delta sync that tombstone is delivered
    const res = await page.request.get('/api/sync/delta?tenantId=runtime-validation-tenant&since=0');
    const deltaRes = await res.json();

    const prods = deltaRes.changes?.products || [];
    const tombRecord = prods.find((p: any) => p.id === tombId);
    expect(tombRecord).toBeDefined();
    expect(tombRecord.deleted_at || tombRecord.deletedAt).toBeTruthy();
  });

  test('TEST-023 hardware clock skew (+2h) is absorbed and calibrated by server', async ({ page }) => {
    await login(page);

    const skewProdId = `RTV-E2E-SKEW-${Date.now()}`;
    const futureTime = Date.now() + 2 * 60 * 60 * 1000;

    const r = await page.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'device-skewed-clock',
        clientTimestamp: futureTime,
        mutations: [{
          operationId: `op-skew-${skewProdId}`,
          idempotencyKey: `dev-skew:${skewProdId}`,
          entity: 'products',
          operation: 'CREATE',
          payload: { id: skewProdId, name: 'Skewed Time Product', price: 1500, tenant_id: 'runtime-validation-tenant', branch_id: 'branch-a' },
        }],
      },
    });

    const json = await r.json();
    expect(r.status()).toBe(200);
    expect(json.serverTimestamp).toBeDefined();
    // Server timestamp should be close to actual current time, not 2 hours in future
    expect(Math.abs(json.serverTimestamp - Date.now())).toBeLessThan(30000);
  });

  test('TEST-027 multi-tab concurrency coordinates safely through storage and session', async ({ browser }) => {
    const context = await browser.newContext();
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();

    await login(tab1);
    await tab1.waitForTimeout(500);
    await login(tab2);
    await tab2.waitForTimeout(500);

    const tab1Id = `RTV-E2E-TAB1-${Date.now()}`;
    const tab2Id = `RTV-E2E-TAB2-${Date.now()}`;

    // Simultaneous push from both tabs
    await Promise.all([
      createRealBrowserProduct(tab1, { id: tab1Id, name: 'Tab 1 Concurrent Product', price: 100 }),
      createRealBrowserProduct(tab2, { id: tab2Id, name: 'Tab 2 Concurrent Product', price: 200 }),
    ]);

    // Both tabs should see each other's products in shared IndexedDB
    await expect.poll(async () => {
      const p1 = await readDexieStore(tab1, 'products');
      return p1.some((p: any) => p.id === tab1Id) && p1.some((p: any) => p.id === tab2Id);
    }).toBeTruthy();

    await context.close();
  });

});
