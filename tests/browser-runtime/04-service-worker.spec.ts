/**
 * KwakoPOS SaaS — Real Browser Runtime: Service Worker Control & Registration
 * Test: TEST-014 @critical Service Worker Control & Persistence
 */
import { test, expect } from '@playwright/test';
import {
  login,
  createRealBrowserProduct,
  waitForServiceWorker,
  waitForIndexedDB,
  readDeviceId,
  readOutbox,
  readDexieStore,
} from './helpers/runtime';

test.describe('Real Browser Runtime: Service Worker Verification', () => {

  test('TEST-014 @critical Service worker active controller, scope, and state preservation across reload', async ({ page }) => {
    await login(page);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);
    await waitForIndexedDB(page);

    // 1. Verify Service Worker is registered and controlling the page
    const swState = await waitForServiceWorker(page);
    expect(swState.supported).toBeTruthy();
    expect(swState.registered).toBeTruthy();
    expect(swState.scope).toBeDefined();

    const deviceIdBefore = await readDeviceId(page);
    const testId = `RTV-E2E-SW-${Date.now()}`;

    // 2. Create real product and outbox mutation
    await createRealBrowserProduct(page, {
      id: testId,
      name: 'Service Worker Protected Item',
      price: 4200,
      stock: 15,
    });

    const outboxBefore = await readOutbox(page);
    expect(outboxBefore.pendingQueueCount).toBeGreaterThan(0);

    // 3. Perform browser reload
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await waitForIndexedDB(page);

    // 4. Verify SW active state, IndexedDB, deviceId, and outbox survive reload
    const swStateAfter = await waitForServiceWorker(page);
    expect(swStateAfter.registered).toBeTruthy();

    const deviceIdAfter = await readDeviceId(page);
    expect(deviceIdAfter).toBe(deviceIdBefore);

    const prodsAfter = await readDexieStore(page, 'products');
    expect(prodsAfter.some((p: any) => p.id === testId)).toBeTruthy();

    const outboxAfter = await readOutbox(page);
    expect(outboxAfter.pendingQueueCount).toBeGreaterThan(0);
  });

});
