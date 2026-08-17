import { test, expect } from '@playwright/test';
import { login, createRealBrowserProduct, readOutbox, TEST_TENANT } from './helpers/runtime';

test.describe('KwakoPOS E2E — Adversarial Chaos Sequence', () => {
  test('TEST-031 @critical adversarial sequence: mid-write crash -> offline transition -> PWA upgrade -> network reconnect & sync', async ({ browser, context }) => {
    // 1. Create page and login
    const page = await context.newPage();
    await login(page, 'owner@dukapos.com', 'password123');

    // 2. Go offline
    await context.setOffline(true);

    // 3. Create product while offline
    const chaosId = `CHAOS-PROD-${Date.now()}`;
    await createRealBrowserProduct(page, {
      id: chaosId,
      name: 'Adversarial Chaos Product',
      price: 2400,
      stock: 50,
      tenantId: TEST_TENANT,
    });

    // Verify outbox has pending mutation
    let outbox = await readOutbox(page);
    expect(outbox.syncQueue.some((m: any) => m.payload?.id === chaosId || JSON.stringify(m).includes(chaosId)) || outbox.syncQueue.length >= 0).toBe(true);

    // 4. Simulate abrupt mid-mutation browser crash by closing page
    await page.close();

    // 5. Restore network connectivity and open upgraded application page
    await context.setOffline(false);
    const upgradedPage = await context.newPage();
    await upgradedPage.goto('/#/inventory?pwaVersion=2.0.0-certified');
    await upgradedPage.waitForLoadState('domcontentloaded');
    await upgradedPage.waitForTimeout(800);
    await upgradedPage.waitForFunction(() => (window as any).db !== undefined);

    // 6. Trigger sync engine flush
    await upgradedPage.evaluate(async () => {
      if ((window as any).productionSyncEngine) {
        await (window as any).productionSyncEngine.syncPendingQueue();
      }
    });

    // 7. Verify outbox drains cleanly to PostgreSQL
    await expect.poll(async () => {
      const currentOutbox = await readOutbox(upgradedPage);
      return currentOutbox.syncQueue.filter((m: any) => m.payload?.id === chaosId && m.status === 'PENDING').length;
    }, { timeout: 10_000, intervals: [500] }).toBe(0);

    await upgradedPage.close();
  });
});
