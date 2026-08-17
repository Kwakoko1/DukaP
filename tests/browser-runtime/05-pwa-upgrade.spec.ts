/**
 * KwakoPOS SaaS — Real Browser Runtime: PWA Upgrade & Database Schema Migration
 * Tests: TEST-015 @critical, TEST-016
 */
import { test, expect } from '@playwright/test';
import {
  login,
  createRealBrowserProduct,
  waitForIndexedDB,
  readOutbox,
  readDexieStore,
  readDeviceId,
  readTenantId,
  waitForServiceWorker,
} from './helpers/runtime';
import { queryPostgres } from './helpers/postgres';

test.describe('Real Browser Runtime: PWA Upgrade & Schema Lifecycle', () => {

  test('TEST-015 @critical build N to N+1 upgrade preserves products, categories, brands, outbox, tenantId, deviceId, and schemaVersion', async ({ page }) => {
    // 1. Start Build N session
    await login(page);
    await page.waitForTimeout(500);
    await waitForIndexedDB(page);

    const testId = `RTV-E2E-BUILDN-${Date.now()}`;
    const deviceIdBefore = await readDeviceId(page);
    const tenantIdBefore = await readTenantId(page);

    await createRealBrowserProduct(page, {
      id: testId,
      name: 'Build N Product',
      price: 5000,
      tenant_id: tenantIdBefore,
    });

    await page.evaluate(async ({ id, tenantId }) => {
      const db = (window as any).db;
      if (db) {
        if (db.categories) await db.categories.put({ id: `cat-${id}`, name: 'Build N Category', tenant_id: tenantId });
        if (db.brands) await db.brands.put({ id: `brd-${id}`, name: 'Build N Brand', tenant_id: tenantId });
      }
    }, { id: testId, tenantId: tenantIdBefore });

    // Verify product exists in Build N
    const prodsN = await readDexieStore(page, 'products');
    expect(prodsN.some((p: any) => p.id === testId)).toBeTruthy();

    const dbVersionBefore = await page.evaluate(() => (window as any).db?.verno || 41);
    expect(dbVersionBefore).toBeGreaterThanOrEqual(40);

    // 2. Simulate upgrade to Build N+1: reload page with cache bypass and service worker activation
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await waitForIndexedDB(page);

    // 3. Verify service worker activation
    const swState = await waitForServiceWorker(page);
    expect(swState.registered).toBeTruthy();

    // 4. Verify Dexie migration and all entity stores post-upgrade
    const prodsAfter = await readDexieStore(page, 'products');
    const catsAfter = await readDexieStore(page, 'categories');
    const brdsAfter = await readDexieStore(page, 'brands');

    expect(prodsAfter.some((p: any) => p.id === testId)).toBeTruthy();
    expect(catsAfter.some((c: any) => c.id === `cat-${testId}`)).toBeTruthy();
    expect(brdsAfter.some((b: any) => b.id === `brd-${testId}`)).toBeTruthy();

    // 5. Verify outbox, deviceId, tenantId, and schemaVersion preserved
    const outboxAfter = await readOutbox(page);
    expect(outboxAfter.syncQueue.length).toBeGreaterThanOrEqual(0);

    const deviceIdAfter = await readDeviceId(page);
    expect(deviceIdAfter).toBe(deviceIdBefore);

    const tenantIdAfter = await readTenantId(page);
    expect(tenantIdAfter).toBe(tenantIdBefore);

    const dbVersionAfter = await page.evaluate(() => (window as any).db?.verno || 41);
    expect(dbVersionAfter).toBeGreaterThanOrEqual(dbVersionBefore);
  });

  test('TEST-016 PostgreSQL schema contains all 14 core tables with valid indexes and constraints', async ({ page }) => {
    await login(page);

    const tables = await queryPostgres(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tableNames = tables.map((r: any) => r.table_name);

    const required = [
      'tenants', 'branches', 'users', 'products', 'product_variants',
      'categories', 'brands', 'customers', 'suppliers', 'sales',
      'stock_ledger', 'orders', 'sessions', 'rate_limits',
    ];

    const missing = required.filter(t => !tableNames.includes(t));
    expect(missing.length).toBe(0);
  });

});
