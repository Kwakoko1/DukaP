import { test, expect } from '@playwright/test';
import { login, createRealBrowserProduct, readOutbox, TEST_TENANT } from './helpers/runtime';
import { queryPostgres } from './helpers/postgres';

test.describe('KwakoPOS E2E — Master-Data Conflict Matrix', () => {
  test('TEST-032 @critical concurrent edits on Device A and Device B resolve deterministically via server conflict policy', async ({ browser }) => {
    // 1. Setup Device A and Device B browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await login(pageA, 'owner@dukapos.com', 'password123');
    await pageA.goto('/#/inventory');
    await pageA.waitForLoadState('domcontentloaded');
    await pageA.waitForFunction(() => (window as any).db !== undefined);

    await login(pageB, 'owner@dukapos.com', 'password123');
    await pageB.goto('/#/inventory');
    await pageB.waitForLoadState('domcontentloaded');
    await pageB.waitForFunction(() => (window as any).db !== undefined);

    // 2. Device A and Device B create shared item while online
    const conflictId = `CONFLICT-PROD-${Date.now()}`;
    await createRealBrowserProduct(pageA, {
      id: conflictId,
      name: 'Initial Product Name',
      price: 1000,
      stock: 100,
      tenantId: TEST_TENANT,
    });

    await createRealBrowserProduct(pageB, {
      id: conflictId,
      name: 'Initial Product Name',
      price: 1000,
      stock: 100,
      tenantId: TEST_TENANT,
    });

    // Wait for initial sync to server
    await expect.poll(async () => {
      const rows = await queryPostgres('SELECT id FROM products WHERE id = $1', [conflictId]);
      return rows.length;
    }, { timeout: 10_000, intervals: [500] }).toBe(1);

    // 3. Disconnect both devices to prepare offline concurrent edits
    await contextA.setOffline(true);
    await contextB.setOffline(true);

    // Device A updates name
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await pageA.evaluate(async (pid) => {
          const getDb = () => (window as any).db;
          let db = getDb();
          let attempts = 0;
          while ((!db || !db.products) && attempts < 20) {
            await new Promise(r => setTimeout(r, 100));
            db = getDb();
            attempts++;
          }
          if (!db || !db.products) return;
          await db.products.update(pid, { name: 'Device A Updated Name', updatedAt: Date.now() + 100 }).catch(async () => {
            await db.products.put({ id: pid, name: 'Device A Updated Name', tenant_id: 'runtime-validation-tenant', price: 1000, updatedAt: Date.now() + 100 });
          });
          await db.syncQueue.put({
            id: `op-conf-a-${Date.now()}`,
            entityName: 'products',
            actionType: 'UPDATE',
            status: 'Pending',
            payload: { id: pid, name: 'Device A Updated Name', selling_price: 1000, price: 1000, tenant_id: 'runtime-validation-tenant', updatedAt: Date.now() + 100 },
            timestamp: Date.now() + 100,
          });
        }, conflictId);
        break;
      } catch {
        await pageA.waitForTimeout(500);
      }
    }

    // Device B updates price (Higher timestamp: +2000ms)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await pageB.evaluate(async (pid) => {
          const getDb = () => (window as any).db;
          let db = getDb();
          let attempts = 0;
          while ((!db || !db.products) && attempts < 20) {
            await new Promise(r => setTimeout(r, 100));
            db = getDb();
            attempts++;
          }
          if (!db || !db.products) return;
          await db.products.update(pid, { price: 3500, selling_price: 3500, buying_price: 3500, updatedAt: Date.now() + 2000 }).catch(async () => {
            await db.products.put({ id: pid, name: 'Initial Product Name', tenant_id: 'runtime-validation-tenant', price: 3500, selling_price: 3500, buying_price: 3500, updatedAt: Date.now() + 2000 });
          });
          await db.syncQueue.put({
            id: `op-conf-b-${Date.now()}`,
            entityName: 'products',
            actionType: 'UPDATE',
            status: 'Pending',
            payload: { id: pid, price: 3500, selling_price: 3500, buying_price: 3500, name: 'Initial Product Name', tenant_id: 'runtime-validation-tenant', updatedAt: Date.now() + 2000 },
            timestamp: Date.now() + 2000,
          });
        }, conflictId);
        break;
      } catch {
        await pageB.waitForTimeout(500);
      }
    }

    // 4. Reconnect both devices
    await contextA.setOffline(false);
    await contextB.setOffline(false);

    // Sync Device A first (updated name)
    await pageA.evaluate(async () => {
      if ((window as any).productionSyncEngine) {
        await (window as any).productionSyncEngine.processQueue();
      }
    });
    await pageA.waitForTimeout(1200);

    // Sync Device B second (higher timestamp updated price: 3500)
    await pageB.evaluate(async () => {
      if ((window as any).productionSyncEngine) {
        await (window as any).productionSyncEngine.processQueue();
      }
    });
    await pageB.waitForTimeout(1200);

    // Drain outboxes
    await expect.poll(async () => {
      await pageA.evaluate(async () => {
        if ((window as any).productionSyncEngine) {
          await (window as any).productionSyncEngine.processQueue();
        }
      }).catch(() => {});
      await pageB.evaluate(async () => {
        if ((window as any).productionSyncEngine) {
          await (window as any).productionSyncEngine.processQueue();
        }
      }).catch(() => {});

      const outA = await readOutbox(pageA);
      const outB = await readOutbox(pageB);
      return outA.syncQueue.filter((m: any) => m.status === 'Pending').length + outB.syncQueue.filter((m: any) => m.status === 'Pending').length;
    }, { timeout: 15_000, intervals: [1000] }).toBe(0);

    // 5. Verify PostgreSQL authoritative state reflects higher timestamp write
    const finalRows = await queryPostgres('SELECT * FROM products WHERE id = $1', [conflictId]);
    console.log('FINAL ROWS FROM POSTGRES:', JSON.stringify(finalRows));
    expect(finalRows.length).toBe(1);
    expect(Number(finalRows[0].selling_price ?? finalRows[0].price ?? 0)).toBe(3500);

    await contextA.close();
    await contextB.close();
  });
});
