/**
 * KwakoPOS SaaS — Runtime Validation: Server Commit & Client Timeout Simulation
 * 
 * Validates:
 * - Test 006: Server commits transaction, response dropped, client retries -> single business record
 */

import { httpRequest, RUNTIME_TEST_TENANT, pool } from './runtimeConfig.js';

export async function runServerTimeoutTests() {
  const results = [];
  const t006Start = new Date().toISOString();

  try {
    const authRes = await httpRequest('/api/auth/login', {
      method: 'POST',
    }, {
      email: 'owner@dukapos.com',
      password: 'password123',
      deviceId: 'rtv-timeout-dev',
    });
    const token = authRes.body?.accessToken || authRes.body?.token;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    const uniqueOpId = `op-timeout-sim-${Date.now()}`;
    const uniqueSaleId = `RTV-SALE-TIMEOUT-${Date.now()}`;

    const mutationPayload = {
      tenantId: RUNTIME_TEST_TENANT,
      deviceId: 'device-timeout-test',
      mutations: [{
        operationId: uniqueOpId,
        idempotencyKey: `dev-timeout:${uniqueOpId}`,
        entity: 'sales',
        operation: 'CREATE',
        payload: {
          id: uniqueSaleId,
          sale_number: `TIMEOUT-REC-${Date.now()}`,
          total_amount: 88000,
          payment_method: 'CARD',
          status: 'COMPLETED',
          tenant_id: RUNTIME_TEST_TENANT,
          branch_id: 'branch-a',
        },
      }],
    };

    // Step 1: Server processes mutation
    const initialRes = await httpRequest('/api/sync/push', {
      method: 'POST',
      headers: authHeaders,
    }, mutationPayload);

    if (initialRes.status !== 200) {
      throw new Error(`Initial push failed: ${initialRes.status}`);
    }

    // Step 2: Simulate client network drop / retry loop (3 retries)
    for (let i = 1; i <= 3; i++) {
      const retryRes = await httpRequest('/api/sync/push', {
        method: 'POST',
        headers: authHeaders,
      }, mutationPayload);
      if (retryRes.status !== 200) {
        throw new Error(`Retry ${i} failed: ${retryRes.status}`);
      }
    }

    // Step 3: Query authoritative PostgreSQL database directly
    const dbRes = await pool.query(
      'SELECT count(*) as total FROM sales WHERE id = $1 AND tenant_id = $2',
      [uniqueSaleId, RUNTIME_TEST_TENANT]
    );
    const count = parseInt(dbRes.rows[0]?.total || '0', 10);

    if (count === 1) {
      results.push({
        testId: 'TEST-006',
        name: 'Server Commit / Client Timeout Idempotency',
        category: 'SYNC',
        startedAt: t006Start,
        completedAt: new Date().toISOString(),
        status: 'PASS',
        expected: 'Exactly ONE sale committed in PostgreSQL after timeout/retry simulation',
        observed: `Authoritative DB confirmed exactly ${count} record created`,
      });
    } else {
      throw new Error(`Expected exactly 1 committed sale, found: ${count}`);
    }
  } catch (err) {
    results.push({
      testId: 'TEST-006',
      name: 'Server Commit / Client Timeout Idempotency',
      category: 'SYNC',
      startedAt: t006Start,
      completedAt: new Date().toISOString(),
      status: 'FAIL',
      expected: '1 committed sale record',
      observed: 'Duplicate or missing records detected',
      error: err.message,
    });
  }

  return results;
}
