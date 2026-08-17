/**
 * KwakoPOS SaaS — Runtime Validation: Concurrent Duplicate Request Storm
 * 
 * Validates:
 * - Test 007: Sending identical operationId 5 times concurrently yields 1 commit and 4 deduplications
 */

import { httpRequest, RUNTIME_TEST_TENANT, pool } from './runtimeConfig.js';

export async function runDuplicateRetryTests() {
  const results = [];
  const t007Start = new Date().toISOString();

  try {
    const authRes = await httpRequest('/api/auth/login', {
      method: 'POST',
    }, {
      email: 'owner@dukapos.com',
      password: 'password123',
      deviceId: 'rtv-retry-dev',
    });
    const token = authRes.body?.accessToken || authRes.body?.token;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    const stormOpId = `op-storm-${Date.now()}`;
    const stormIdempotencyKey = `dev-storm:${stormOpId}`;
    const stormCustomer = {
      id: `RTV-CUST-STORM-${Date.now()}`,
      name: 'Concurrent Storm Customer',
      phone: '+255788990011',
      tenant_id: RUNTIME_TEST_TENANT,
      branch_id: 'branch-a',
    };

    const payload = {
      tenantId: RUNTIME_TEST_TENANT,
      deviceId: 'device-storm-test',
      mutations: [{
        operationId: stormOpId,
        idempotencyKey: stormIdempotencyKey,
        entity: 'customers',
        operation: 'CREATE',
        payload: stormCustomer,
      }],
    };

    // Send 5 identical requests concurrently
    const promises = [
      httpRequest('/api/sync/push', { method: 'POST', headers: authHeaders }, payload),
      httpRequest('/api/sync/push', { method: 'POST', headers: authHeaders }, payload),
      httpRequest('/api/sync/push', { method: 'POST', headers: authHeaders }, payload),
      httpRequest('/api/sync/push', { method: 'POST', headers: authHeaders }, payload),
      httpRequest('/api/sync/push', { method: 'POST', headers: authHeaders }, payload),
    ];

    const responses = await Promise.all(promises);
    const allSuccessful = responses.every((r) => r.status === 200);

    // Verify DB count
    const dbRes = await pool.query(
      'SELECT count(*) as total FROM customers WHERE id = $1 AND tenant_id = $2',
      [stormCustomer.id, RUNTIME_TEST_TENANT]
    );
    const totalRecords = parseInt(dbRes.rows[0]?.total || '0', 10);

    if (allSuccessful && totalRecords === 1) {
      results.push({
        testId: 'TEST-007',
        name: 'Concurrent Duplicate Request Deduplication',
        category: 'CONCURRENCY',
        startedAt: t007Start,
        completedAt: new Date().toISOString(),
        status: 'PASS',
        expected: '5 concurrent identical mutations produce exactly 1 database record',
        observed: `All 5 concurrent requests succeeded with 200 OK; PostgreSQL has exactly ${totalRecords} record`,
      });
    } else {
      throw new Error(`Expected 1 customer record, found ${totalRecords}`);
    }
  } catch (err) {
    results.push({
      testId: 'TEST-007',
      name: 'Concurrent Duplicate Request Deduplication',
      category: 'CONCURRENCY',
      startedAt: t007Start,
      completedAt: new Date().toISOString(),
      status: 'FAIL',
      expected: '1 customer record',
      observed: 'Duplicate insertion or error',
      error: err.message,
    });
  }

  return results;
}
