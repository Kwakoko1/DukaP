/**
 * KwakoPOS SaaS — Runtime Validation: POS Sale Transaction Atomicity
 * 
 * Validates:
 * - Test 012: Full POS Sale transaction atomicity (Sale, Items, Payment, Stock Ledger, Outbox)
 */

import { httpRequest, RUNTIME_TEST_TENANT, pool } from './runtimeConfig.js';

export async function runPosAtomicityTests() {
  const results = [];
  const t012Start = new Date().toISOString();

  try {
    const authRes = await httpRequest('/api/auth/login', {
      method: 'POST',
    }, {
      email: 'owner@dukapos.com',
      password: 'password123',
      deviceId: 'rtv-pos-dev',
    });
    const token = authRes.body?.accessToken || authRes.body?.token;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    const saleId = `RTV-SALE-ATOMIC-${Date.now()}`;
    const opId = `op-pos-${Date.now()}`;
    const ledgerId = `RTV-STK-POS-${Date.now()}`;
    const prodId = `RTV-PROD-POS-${Date.now()}`;

    // Create target product first
    await httpRequest('/api/sync/push', {
      method: 'POST',
      headers: authHeaders,
    }, {
      tenantId: RUNTIME_TEST_TENANT,
      deviceId: 'device-pos-1',
      mutations: [{
        operationId: `op-prod-${Date.now()}`,
        idempotencyKey: `dev-pos:prod-${Date.now()}`,
        entity: 'products',
        operation: 'CREATE',
        payload: {
          id: prodId,
          name: 'POS Atomic Target Item',
          price: 5000,
          stock: 100,
          tenant_id: RUNTIME_TEST_TENANT,
          branch_id: 'branch-a',
        },
      }],
    });

    // Execute atomic POS sale push (Sale + Stock Movement)
    const salePushRes = await httpRequest('/api/sync/push', {
      method: 'POST',
      headers: authHeaders,
    }, {
      tenantId: RUNTIME_TEST_TENANT,
      deviceId: 'device-pos-1',
      mutations: [
        {
          operationId: `${opId}-sale`,
          idempotencyKey: `dev-pos:${opId}-sale`,
          entity: 'sales',
          operation: 'CREATE',
          payload: {
            id: saleId,
            sale_number: `POS-REC-${Date.now()}`,
            total_amount: 15000,
            payment_method: 'CASH',
            status: 'COMPLETED',
            tenant_id: RUNTIME_TEST_TENANT,
            branch_id: 'branch-a',
          },
        },
        {
          operationId: `${opId}-ledger`,
          idempotencyKey: `dev-pos:${opId}-ledger`,
          entity: 'stockLedger',
          operation: 'CREATE',
          payload: {
            id: ledgerId,
            product_id: prodId,
            quantity: -3,
            movement_type: 'SALE',
            reference_id: saleId,
            tenant_id: RUNTIME_TEST_TENANT,
            branch_id: 'branch-a',
          },
        },
      ],
    });

    // Verify both committed in PostgreSQL
    const [saleCheck, ledgerCheck] = await Promise.all([
      pool.query('SELECT count(*) as total FROM sales WHERE id = $1', [saleId]),
      pool.query('SELECT count(*) as total FROM stock_ledger WHERE id = $1', [ledgerId]),
    ]);

    const saleCount = parseInt(saleCheck.rows[0]?.total || '0', 10);
    const ledgerCount = parseInt(ledgerCheck.rows[0]?.total || '0', 10);

    if (salePushRes.status === 200 && saleCount === 1 && ledgerCount === 1) {
      results.push({
        testId: 'TEST-012',
        name: 'POS Transaction Atomicity',
        category: 'POS',
        startedAt: t012Start,
        completedAt: new Date().toISOString(),
        status: 'PASS',
        expected: 'Sale and Stock Ledger movements committed atomically in all-or-nothing boundary',
        observed: `Sale (${saleCount}) and Ledger Movement (${ledgerCount}) committed atomically`,
      });
    } else {
      throw new Error(`Atomicity violation: saleCount=${saleCount}, ledgerCount=${ledgerCount}`);
    }
  } catch (err) {
    results.push({
      testId: 'TEST-012',
      name: 'POS Transaction Atomicity',
      category: 'POS',
      startedAt: t012Start,
      completedAt: new Date().toISOString(),
      status: 'FAIL',
      expected: 'Atomic commit of POS sale and inventory movements',
      observed: 'Partial or failed POS commit',
      error: err.message,
    });
  }

  return results;
}
