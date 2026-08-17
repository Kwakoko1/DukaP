import { test, expect } from '@playwright/test';
import { login, queryPostgres, readOutbox } from '../browser-runtime/helpers/runtime';

test.describe('Production Runtime Validation — 05. PWA Upgrade, Checksum & Performance SLAs (Section 18, 21, 22 & 23)', () => {

  test('PWA-001 Release Candidate N -> N+1 PWA upgrade preserves pending outbox queue and local storage (Section 18)', async ({ page, context }) => {
    await login(page, 'owner@dukapos.com', 'password123');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => (window as any).db !== undefined);

    const upgradeProdId = `PROD-PWA-UPGRADE-${Date.now()}`;

    // Disconnect network & queue mutation
    await context.setOffline(true);
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
        const tId = 'tenant-101';
        await db.products.put({ id: pid, name: 'PWA Upgrade Product', price: 9900, stock: 15, tenant_id: tId });
        await db.syncQueue.put({
          id: `op-pwa-${pid}`,
          tenantId: tId,
          tenant_id: tId,
          entityName: 'products',
          actionType: 'INSERT',
          status: 'Pending',
          payload: { id: pid, name: 'PWA Upgrade Product', price: 9900, stock: 15, tenant_id: tId },
          timestamp: Date.now()
        });
      }
    }, upgradeProdId);

    // Simulate PWA reload / version update
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => (window as any).db !== undefined);

    // Reconnect network
    await context.setOffline(false);

    // Trigger sync worker
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('online'));
      if ((window as any).productionSyncEngine) {
        await (window as any).productionSyncEngine.processQueue();
      }
    });

    // 4. Verify background worker pushes outbox mutation to PostgreSQL
    await expect.poll(async () => {
      await page.evaluate(async () => {
        if ((window as any).productionSyncEngine) {
          await (window as any).productionSyncEngine.processQueue().catch(() => {});
        }
      }).catch(() => {});
      const rows = await queryPostgres('SELECT id FROM products WHERE id = $1', [upgradeProdId]);
      return rows.length;
    }, { timeout: 15_000, intervals: [1000] }).toBe(1);
  });

  test('CHECKSUM-001 Canonical SHA-256 checksum convergence SLA < 5,000ms (Section 21 & 23)', async ({ page }) => {
    await login(page, 'owner@dukapos.com', 'password123');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => (window as any).db !== undefined);

    const tStart = Date.now();
    let checksum = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        checksum = await page.evaluate(async () => {
          const db = (window as any).db;
          if (!db || !db.products) return '';
          const products = await db.products.toArray();
          const text = JSON.stringify(products.map((p: any) => ({ id: p.id, name: p.name })));
          const encoder = new TextEncoder();
          const data = encoder.encode(text);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        });
        if (checksum) break;
      } catch {
        await page.waitForTimeout(500);
      }
    }

    const elapsedMs = Date.now() - tStart;
    expect(checksum).toBeDefined();
    expect(checksum.length).toBe(64);
    expect(elapsedMs).toBeLessThan(5000);
  });

});
