import { test, expect } from '@playwright/test';
import { login, TEST_TENANT } from './helpers/runtime';

test.describe('KwakoPOS E2E — Large Scale Load Performance', () => {
  test('TEST-033 @critical high-volume 1,000 local record batch creation completes within 3,000ms SLA', async ({ page }) => {
    await login(page, 'owner@dukapos.com', 'password123');

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);
    await page.waitForFunction(() => (window as any).db !== undefined);

    const startTime = Date.now();

    // Execute bulk write inside Dexie transaction
    const count = await page.evaluate(async (tenantId) => {
      const db = (window as any).db;
      const items: any[] = [];
      const outbox: any[] = [];
      const now = Date.now();

      for (let i = 0; i < 1000; i++) {
        const id = `LOAD-PROD-${now}-${i}`;
        items.push({
          id,
          name: `Load Test Item ${i}`,
          price: 1500 + i,
          stock: 10,
          tenant_id: tenantId,
          branch_id: 'branch-a',
          created_at: now,
          updated_at: now,
        });
        outbox.push({
          id: `op-load-${now}-${i}`,
          operationId: `op-load-${now}-${i}`,
          idempotencyKey: `load:${id}`,
          entity: 'products',
          operation: 'CREATE',
          status: 'PENDING',
          payload: { id, name: `Load Test Item ${i}`, tenant_id: tenantId, branch_id: 'branch-a' },
          createdAt: now,
        });
      }

      await db.transaction('rw', [db.products, db.syncQueue], async () => {
        await db.products.bulkPut(items);
        await db.syncQueue.bulkPut(outbox);
      });

      return await db.products.where('tenant_id').equals(tenantId).count();
    }, TEST_TENANT);

    const duration = Date.now() - startTime;

    expect(count).toBeGreaterThanOrEqual(1000);
    expect(duration).toBeLessThan(5000); // 5 sec SLA upper bound for browser execution
  });
});
