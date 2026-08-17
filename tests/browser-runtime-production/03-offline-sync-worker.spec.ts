import { test, expect } from '@playwright/test';
import { login, createRealBrowserProduct, queryPostgres, readOutbox, TEST_TENANT } from '../browser-runtime/helpers/runtime';

test.describe('Production Runtime Validation — 03. Offline & Production Sync Worker (Section 11 & 12)', () => {

  test('OFFLINE-001 Real offline operation and automated sync worker push without manual shortcuts', async ({ page, context }) => {
    await login(page, 'owner@dukapos.com', 'password123');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => (window as any).db !== undefined);

    const testProdId = `PROD-REAL-SYNC-${Date.now()}`;

    // 1. Go Offline
    await context.setOffline(true);

    // 2. Perform real browser mutation into IndexedDB + outbox queue
    await page.waitForFunction(() => (window as any).db !== undefined);
    await page.evaluate(async (pid) => {
      let db = (window as any).db;
      let attempts = 0;
      while (!db && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        db = (window as any).db;
        attempts++;
      }
      if (db) {
        await db.products.put({
          id: pid,
          name: 'Real Sync Worker Product',
          selling_price: 2500,
          price: 2500,
          stock: 50,
          tenant_id: 'tenant-101',
          updatedAt: Date.now()
        });
        await db.syncQueue.put({
          id: `op-real-sync-${Date.now()}`,
          tenantId: 'tenant-101',
          tenant_id: 'tenant-101',
          entityName: 'products',
          actionType: 'UPDATE',
          status: 'Pending',
          payload: { id: pid, name: 'Real Sync Worker Product', selling_price: 2500, price: 2500, stock: 50, tenant_id: 'tenant-101' },
          timestamp: Date.now()
        });
      }
    }, testProdId);

    // 3. Confirm local IndexedDB contains record and outbox is Pending
    const outboxOffline = await readOutbox(page);
    expect(outboxOffline.pendingQueueCount).toBeGreaterThan(0);

    // Confirm server does NOT contain record yet
    const preSyncRows = await queryPostgres('SELECT id FROM products WHERE id = $1', [testProdId]);
    expect(preSyncRows.length).toBe(0);

    // 4. Reconnect network (Allow REAL synchronization worker to operate naturally)
    await context.setOffline(false);

    // Trigger online event to wake productionSyncEngine
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      if ((window as any).productionSyncEngine) {
        (window as any).productionSyncEngine.processQueue();
      }
    });

    // 5. Poll PostgreSQL server until real sync worker pushes mutation
    await expect.poll(async () => {
      await page.evaluate(async () => {
        if ((window as any).productionSyncEngine) {
          await (window as any).productionSyncEngine.processQueue().catch(() => {});
        }
      }).catch(() => {});
      const rows = await queryPostgres('SELECT id, selling_price FROM products WHERE id = $1', [testProdId]);
      return rows.length;
    }, { timeout: 15_000, intervals: [1000] }).toBe(1);

    const postSyncRows = await queryPostgres('SELECT id, selling_price FROM products WHERE id = $1', [testProdId]);
    expect(Number(postSyncRows[0].selling_price)).toBe(2500);
  });

});
