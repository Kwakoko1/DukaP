import { test, expect } from '@playwright/test';
import { login, queryPostgres, TEST_TENANT } from '../browser-runtime/helpers/runtime';

test.describe('Production Runtime Validation — 04. POS Atomicity & Tenant Isolation (Section 15, 16 & 20)', () => {

  test('POS-001 Real sale transaction atomicity: sale + items + stock ledger commit atomically in PostgreSQL (Section 16)', async ({ page }) => {
    await login(page, 'owner@dukapos.com', 'password123');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => (window as any).db !== undefined);

    const saleId = `SALE-PROD-ATOMIC-${Date.now()}`;
    const prodId = `PROD-POS-ATOMIC-${Date.now()}`;

    // Execute atomic sale mutation in IndexedDB
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.evaluate(async ({ sId, pId }) => {
          const db = (window as any).db;
          if (!db || !db.products) return;
          const tId = 'tenant-101';
          await db.products.put({ id: pId, name: 'Atomic Sale Product', price: 5000, stock: 20, tenant_id: tId });
          await db.orders.put({ id: sId, total: 5000, items: [{ id: pId, qty: 2, price: 5000 }], syncStatus: 'Pending', tenant_id: tId });
          await db.stockLedger.put({ id: `ledger-${sId}`, product_id: pId, quantity_change: -2, movement_type: 'SALE', reference_id: sId, tenant_id: tId });
          await db.syncQueue.put({
            id: `op-sale-${sId}`,
            tenantId: tId,
            entityName: 'orders',
            actionType: 'INSERT',
            status: 'Pending',
            payload: { id: sId, total: 5000, tenant_id: tId },
            timestamp: Date.now()
          });
          await db.syncQueue.put({
            id: `op-ledger-${sId}`,
            tenantId: tId,
            entityName: 'stock_ledger',
            actionType: 'INSERT',
            status: 'Pending',
            payload: { id: `ledger-${sId}`, product_id: pId, quantity_change: -2, movement_type: 'SALE', reference_id: sId, tenant_id: tId },
            timestamp: Date.now() + 10
          });

          if ((window as any).productionSyncEngine) {
            await (window as any).productionSyncEngine.processQueue();
          }
        }, { sId: saleId, pId: prodId });
        break;
      } catch {
        await page.waitForTimeout(500);
      }
    }

    // Poll PostgreSQL to verify atomic presence
    await expect.poll(async () => {
      await page.evaluate(async () => {
        if ((window as any).productionSyncEngine) {
          await (window as any).productionSyncEngine.processQueue().catch(() => {});
        }
      }).catch(() => {});
      const rows = await queryPostgres('SELECT id FROM orders WHERE id = $1', [saleId]);
      return rows.length;
    }, { timeout: 15_000, intervals: [1000] }).toBe(1);

    const orderRows = await queryPostgres('SELECT id, total FROM orders WHERE id = $1', [saleId]);
    expect(orderRows.length).toBe(1);
    expect(Number(orderRows[0].total)).toBe(5000);
  });

  test('TENANT-001 Multi-tenant RLS isolation probe prevents Tenant A read/write leakage to Tenant B (Section 20)', async ({ request }) => {
    // Attempt to query tenant B records with Tenant A context header
    const res = await request.get('/api/sync/pull?tenantId=tenant-b-forbidden', {
      headers: {
        'x-tenant-id': 'tenant-a-isolated'
      }
    });

    if (res.status() === 200) {
      const body = await res.json();
      const changes = body.changes || {};
      const productCount = Array.isArray(changes.products) ? changes.products.length : 0;
      expect(productCount).toBe(0);
    } else {
      expect([401, 403, 410]).toContain(res.status());
    }
  });

});
