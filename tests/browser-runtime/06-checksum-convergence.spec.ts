/**
 * KwakoPOS SaaS — Real Browser Runtime: Canonical Checksum Convergence
 * Tests: TEST-018 @critical Canonical SHA-256 Checksum Convergence (Client A === Client B === Server)
 */
import { test, expect } from '@playwright/test';
import {
  login,
  createRealBrowserProduct,
  waitForIndexedDB,
  getChecksum,
} from './helpers/runtime';

test.describe('Real Browser Runtime: Checksum Convergence', () => {

  test('TEST-018 @critical canonical SHA-256 checksum converges across Device A, Device B, and Server (A === B === Server)', async ({ browser }) => {
    const tenantId = 'runtime-validation-tenant';

    // 1. Initialize Device A
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, { deviceId: 'playwright-chk-A' });
    await pageA.waitForLoadState('domcontentloaded');
    await pageA.waitForTimeout(800);
    await waitForIndexedDB(pageA);

    // 2. Initialize Device B
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await login(pageB, { deviceId: 'playwright-chk-B' });
    await pageB.waitForLoadState('domcontentloaded');
    await pageB.waitForTimeout(800);
    await waitForIndexedDB(pageB);

    const testId = `RTV-E2E-CHK-${Date.now()}`;
    const testProduct = {
      id: testId,
      name: 'Checksum Verification Item',
      price: 3800,
      stock: 40,
      tenant_id: tenantId,
      branch_id: 'branch-a',
    };

    // Device A creates product and pushes to server
    await createRealBrowserProduct(pageA, testProduct);
    await pageA.request.post('/api/sync/push', {
      data: {
        tenantId,
        deviceId: 'playwright-chk-A',
        mutations: [{
          operationId: `op-chk-${testId}`,
          idempotencyKey: `chk:${testId}`,
          entity: 'products',
          operation: 'CREATE',
          payload: testProduct,
        }],
      },
    });

    // Device B pulls full delta from server
    await pageB.waitForLoadState('domcontentloaded');
    await pageB.waitForTimeout(800);
    await pageB.evaluate(async (tId) => {
      const [deltaRes, catRes, brdRes] = await Promise.all([
        fetch(`/api/sync/delta?tenantId=${tId}&since=0`),
        fetch(`/api/sync/categories?tenantId=${tId}&sinceVersion=0`),
        fetch(`/api/sync/brands?tenantId=${tId}&sinceVersion=0`),
      ]);
      const delta = await deltaRes.json();
      const catJson = await catRes.json();
      const brdJson = await brdRes.json();

      if ((window as any).db) {
        await (window as any).db.products.clear();
        await (window as any).db.productVariants.clear();
        await (window as any).db.categories.clear();
        await (window as any).db.brands.clear();

        if (delta.changes?.products?.length) await (window as any).db.products.bulkPut(delta.changes.products);
        if (delta.changes?.productVariants?.length) await (window as any).db.productVariants.bulkPut(delta.changes.productVariants);
        if (catJson.serverCategories?.length) await (window as any).db.categories.bulkPut(catJson.serverCategories);
        if (brdJson.serverBrands?.length) await (window as any).db.brands.bulkPut(brdJson.serverBrands);
      }
    }, tenantId);

    // Also sync Device A with full delta from server
    await pageA.waitForLoadState('domcontentloaded');
    await pageA.waitForTimeout(800);
    await pageA.evaluate(async (tId) => {
      const [deltaRes, catRes, brdRes] = await Promise.all([
        fetch(`/api/sync/delta?tenantId=${tId}&since=0`),
        fetch(`/api/sync/categories?tenantId=${tId}&sinceVersion=0`),
        fetch(`/api/sync/brands?tenantId=${tId}&sinceVersion=0`),
      ]);
      const delta = await deltaRes.json();
      const catJson = await catRes.json();
      const brdJson = await brdRes.json();

      if ((window as any).db) {
        await (window as any).db.products.clear();
        await (window as any).db.productVariants.clear();
        await (window as any).db.categories.clear();
        await (window as any).db.brands.clear();

        if (delta.changes?.products?.length) await (window as any).db.products.bulkPut(delta.changes.products);
        if (delta.changes?.productVariants?.length) await (window as any).db.productVariants.bulkPut(delta.changes.productVariants);
        if (catJson.serverCategories?.length) await (window as any).db.categories.bulkPut(catJson.serverCategories);
        if (brdJson.serverBrands?.length) await (window as any).db.brands.bulkPut(brdJson.serverBrands);
      }
    }, tenantId);

    // 3. Fetch server authoritative checksum from GET /api/sync/checksum
    const serverChkRes = await pageA.request.get(`/api/sync/checksum?tenantId=${tenantId}`);
    expect(serverChkRes.status()).toBe(200);
    const serverChkJson = await serverChkRes.json();
    const serverChecksum = serverChkJson.checksum;
    expect(serverChecksum).toBeDefined();

    // 4. Trigger sync on Device B and calculate local canonical SHA-256 checksums
    await pageB.evaluate(async () => {
      if ((window as any).productionSyncEngine) {
        await (window as any).productionSyncEngine.syncPendingQueue();
      }
    });
    await pageB.waitForTimeout(500);

    const checksumA = await getChecksum(pageA, tenantId);
    const checksumB = await getChecksum(pageB, tenantId);

    // 5. Assert: Device A Checksum === Device B Checksum === Server Checksum
    expect(checksumA).toBe(checksumB);
    expect(checksumA).toBe(serverChecksum);

    await contextA.close();
    await contextB.close();
  });

});
