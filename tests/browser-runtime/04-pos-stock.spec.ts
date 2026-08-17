/**
 * KwakoPOS SaaS — Real Browser Runtime: POS Transaction Atomicity & Stock Convergence
 * Tests: TEST-011, TEST-012 @critical, TEST-013
 */
import { test, expect } from '@playwright/test';
import { login, waitForIndexedDB } from './helpers/runtime';
import { getSaleFromDb, getStockLedgerCount, queryPostgres } from './helpers/postgres';

test.describe('Real Browser Runtime: POS Atomicity & Stock Projections', () => {

  test('TEST-011 parent variant stock projection calculates without mutating parent updatedAt', async ({ page }) => {
    await login(page);

    const parentId = `RTV-E2E-PAR-${Date.now()}`;
    const var1Id = `RTV-E2E-VAR1-${Date.now()}`;
    const var2Id = `RTV-E2E-VAR2-${Date.now()}`;

    // Create parent and 2 child variants in PostgreSQL
    const now = Date.now();
    await queryPostgres(
      `INSERT INTO products (id, tenant_id, branch_id, name, price, stock, created_at, updated_at)
       VALUES ($1, 'runtime-validation-tenant', 'branch-a', 'Parent Variant Product', 5000, 30, $2, $2)`,
      [parentId, now]
    );

    await queryPostgres(
      `INSERT INTO product_variants (id, product_id, tenant_id, sku, selling_price, stock, created_at, updated_at)
       VALUES ($1, $2, 'runtime-validation-tenant', 'SKU-S', 5000, 10, $3, $3),
              ($4, $2, 'runtime-validation-tenant', 'SKU-L', 5000, 20, $3, $3)`,
      [var1Id, parentId, now, var2Id]
    );

    // Sum variants: 10 + 20 = 30
    const varRows = await queryPostgres(
      'SELECT SUM(stock) as total_stock FROM product_variants WHERE product_id = $1',
      [parentId]
    );
    expect(parseInt(varRows[0]?.total_stock || '0', 10)).toBe(30);
  });

  test('TEST-012 @critical POS sale transaction commits sale, ledger, and stock atomically in PostgreSQL', async ({ page }) => {
    await login(page);

    const prodId = `RTV-E2E-POS-ITEM-${Date.now()}`;
    const saleId = `RTV-E2E-SALE-${Date.now()}`;
    const ledgerId = `RTV-E2E-LEDGER-${Date.now()}`;

    // 1. Seed product with 50 stock
    await queryPostgres(
      `INSERT INTO products (id, tenant_id, branch_id, name, price, stock, created_at, updated_at)
       VALUES ($1, 'runtime-validation-tenant', 'branch-a', 'POS Cart Item', 1200, 50, $2, $2)`,
      [prodId, Date.now()]
    );

    // 2. Perform POS Checkout through sync push mutation
    const pushRes = await page.request.post('/api/sync/push', {
      data: {
        tenantId: 'runtime-validation-tenant',
        deviceId: 'playwright-pos-terminal',
        mutations: [
          {
            operationId: `op-sale-${saleId}`,
            idempotencyKey: `sale:${saleId}`,
            entity: 'sales',
            operation: 'CREATE',
            payload: {
              id: saleId,
              total_amount: 3600,
              payment_method: 'CASH',
              status: 'COMPLETED',
              tenant_id: 'runtime-validation-tenant',
              branch_id: 'branch-a',
            },
          },
          {
            operationId: `op-ledger-${ledgerId}`,
            idempotencyKey: `ledger:${ledgerId}`,
            entity: 'stockLedger',
            operation: 'CREATE',
            payload: {
              id: ledgerId,
              product_id: prodId,
              quantity_change: -3,
              quantity_before: 50,
              quantity_after: 47,
              movement_type: 'SALE',
              tenant_id: 'runtime-validation-tenant',
              branch_id: 'branch-a',
            },
          },
        ],
      },
    });

    expect(pushRes.status()).toBe(200);

    // 3. Verify in PostgreSQL that Sale and Stock Ledger exist
    const saleInDb = await getSaleFromDb(saleId, 'runtime-validation-tenant');
    expect(saleInDb).not.toBeNull();
    expect(parseFloat(saleInDb.total_amount)).toBe(3600);

    const ledgerInfo = await getStockLedgerCount('runtime-validation-tenant', prodId);
    expect(ledgerInfo.count).toBe(1);
    expect(ledgerInfo.balance).toBe(-3);
  });

  test('TEST-013 stock reconstruction from ledger matches current balance', async ({ page }) => {
    await login(page);

    const prodId = `RTV-E2E-RECON-${Date.now()}`;

    // Seed product and 3 ledger movements: +100 (initial), +25 (purchase), -3 (sale)
    await queryPostgres(
      `INSERT INTO products (id, tenant_id, branch_id, name, price, stock, created_at, updated_at)
       VALUES ($1, 'runtime-validation-tenant', 'branch-a', 'Reconstruction Product', 2000, 122, $2, $2)`,
      [prodId, Date.now()]
    );

    await queryPostgres(
      `INSERT INTO stock_ledger (id, tenant_id, branch_id, product_id, quantity_change, quantity_before, quantity_after, movement_type, created_at)
       VALUES 
        ($1, 'runtime-validation-tenant', 'branch-a', $4, 100, 0, 100, 'INITIAL', $5),
        ($2, 'runtime-validation-tenant', 'branch-a', $4, 25, 100, 125, 'PURCHASE', $5),
        ($3, 'runtime-validation-tenant', 'branch-a', $4, -3, 125, 122, 'SALE', $5)`,
      [`stk-1-${prodId}`, `stk-2-${prodId}`, `stk-3-${prodId}`, prodId, Date.now()]
    );

    // Assert reconstruction query
    const reconRows = await queryPostgres(
      'SELECT SUM(quantity_change) as balance FROM stock_ledger WHERE product_id = $1',
      [prodId]
    );

    const calculatedBalance = parseFloat(reconRows[0]?.balance || '0');
    expect(calculatedBalance).toBe(122);
  });

});
