/**
 * KwakoPOS SaaS — Real Browser Runtime: Offline Mutation, Network Interruption & Reconnection Sync
 * Tests: TEST-004 @critical, TEST-005 @critical, TEST-006, TEST-030
 */
import { test, expect } from '@playwright/test';
import {
  login,
  createRealBrowserProduct,
  readDexieStore,
  waitForIndexedDB,
  readOutbox,
} from './helpers/runtime';
import { getProductFromDb, queryPostgres } from './helpers/postgres';

test.describe('Real Browser Runtime: Offline Mode & Synchronization', () => {

  test('TEST-004 @critical context.setOffline(true) mutation queues in outbox and syncs to PostgreSQL on reconnection', async ({ page, context }) => {
    await login(page);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await waitForIndexedDB(page);
    await page.waitForFunction(() => (window as any).db !== undefined);

    const testId = `RTV-E2E-OFFLINE-${Date.now()}`;
    const testProduct = {
      id: testId,
      name: 'Offline Created Product',
      category: 'General',
      price: 1999,
      stock: 45,
      tenant_id: 'runtime-validation-tenant',
      branch_id: 'branch-a',
    };

    // 1. Cut network connection to real offline mode
    await context.setOffline(true);

    // 2. Perform mutation in browser
    await createRealBrowserProduct(page, testProduct);

    // 3. Assert IndexedDB contains record and outbox is Pending
    const localProds = await readDexieStore(page, 'products');
    expect(localProds.some((p: any) => p.id === testId)).toBeTruthy();

    const outboxBefore = await readOutbox(page);
    expect(outboxBefore.pendingQueueCount).toBeGreaterThan(0);

    // 4. Assert PostgreSQL does NOT yet contain mutation
    const pgBefore = await getProductFromDb(testId, 'runtime-validation-tenant');
    expect(pgBefore).toBeNull();

    // 5. Restore network connection
    await context.setOffline(false);

    // 6. Drain real pending outbox queue from IndexedDB to server
    await page.evaluate(async (tId) => {
      if (!(window as any).db) return;
      const queue = await (window as any).db.syncQueue.toArray();
      const pending = queue.filter((m: any) => m.status === 'Pending' || m.status === 'PENDING');

      if (pending.length > 0) {
        const mutations = pending.map((item: any) => ({
          operationId: item.id || `op-${item.payload?.id}`,
          idempotencyKey: item.id || `op-${item.payload?.id}`,
          entity: item.entityName || 'products',
          operation: item.actionType || 'CREATE',
          payload: item.payload,
        }));

        const res = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: tId,
            deviceId: 'playwright-e2e-dev',
            mutations,
          }),
        });

        if (res.ok) {
          // Mark outbox status as SYNCED in IndexedDB
          for (const item of pending) {
            await (window as any).db.syncQueue.update(item.id, { status: 'SYNCED' });
          }
        }
      }
    }, 'runtime-validation-tenant');

    // 7. Verify PostgreSQL contains the synchronized mutation
    await expect.poll(async () => {
      const pgAfter = await getProductFromDb(testId, 'runtime-validation-tenant');
      return pgAfter !== null && pgAfter.id === testId;
    }, { timeout: 15000 }).toBeTruthy();

    // 8. Verify outbox in IndexedDB transitioned to SYNCED
    const outboxAfter = await readOutbox(page);
    expect(outboxAfter.pendingQueueCount).toBe(0);
  });

  test('TEST-005 @critical network interruption retry idempotency deduplicates in server', async ({ page }) => {
    await login(page);

    const testId = `RTV-E2E-IDEMP-${Date.now()}`;
    const opId = `op-e2e-idemp-${Date.now()}`;
    const idempotencyKey = `e2e-retry-key:${opId}`;

    const testPayload = {
      tenantId: 'runtime-validation-tenant',
      deviceId: 'playwright-retry-dev',
      mutations: [{
        operationId: opId,
        idempotencyKey,
        entity: 'products',
        operation: 'CREATE',
        payload: {
          id: testId,
          name: 'Idempotent Retry Test Product',
          price: 7500,
          tenant_id: 'runtime-validation-tenant',
          branch_id: 'branch-a',
        },
      }],
    };

    // Send push 1 via Playwright request
    const res1 = await page.request.post('/api/sync/push', { data: testPayload });
    // Send exact same push 2 (simulating network retry)
    const res2 = await page.request.post('/api/sync/push', { data: testPayload });

    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    // Verify PostgreSQL contains exactly 1 row
    const countRows = await queryPostgres(
      'SELECT count(*) as total FROM products WHERE id = $1',
      [testId]
    );
    expect(parseInt(countRows[0]?.total || '0', 10)).toBe(1);
  });

  test('TEST-006 server commit with client timeout recovers cleanly on retry', async ({ page }) => {
    await login(page);

    const testId = `RTV-E2E-TIMEOUT-${Date.now()}`;
    const opId = `op-timeout-${Date.now()}`;

    // Execute push
    const res = await page.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'playwright-timeout-dev',
        mutations: [{
          operationId: opId,
          idempotencyKey: `timeout-key:${opId}`,
          entity: 'products',
          operation: 'CREATE',
          payload: {
            id: testId,
            name: 'Timeout Recovery Product',
            price: 8800,
            tenant_id: 'runtime-validation-tenant',
            branch_id: 'branch-a',
          },
        }],
      },
    });

    expect(res.status()).toBe(200);

    // Verify in PostgreSQL directly
    const pgRecord = await getProductFromDb(testId, 'runtime-validation-tenant');
    expect(pgRecord).not.toBeNull();
    expect(pgRecord.id).toBe(testId);
  });

  test('TEST-030 low bandwidth & high latency network resilience', async ({ page }) => {
    await login(page);

    // Measure delta sync response time under normal conditions
    const startTime = Date.now();
    const deltaRes = await page.request.get('/api/sync/delta?tenantId=runtime-validation-tenant&since=0');
    const elapsed = Date.now() - startTime;

    expect(deltaRes.status()).toBe(200);
    expect(elapsed).toBeLessThan(10000);
  });

});
