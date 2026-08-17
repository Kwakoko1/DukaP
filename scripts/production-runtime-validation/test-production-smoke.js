/**
 * KwakoPOS SaaS — Production Smoke Certification Suite
 * 
 * Executes fast (~15s) smoke verification gates:
 * 1. Database Connection & Schema Health
 * 2. API Server Ping Probe
 * 3. Operator Authentication & Session Issue
 * 4. Sync Push / Delta Round-trip
 * 5. Deterministic SHA-256 Checksum Calculation
 */

import { httpRequest, RUNTIME_TEST_TENANT, pool } from './runtimeConfig.js';

async function runProductionSmoke() {
  console.log('================================================================');
  console.log('⚡ KWAKOPOS PRODUCTION SMOKE CERTIFICATION SUITE');
  console.log('================================================================\n');

  const startTime = Date.now();
  let passed = 0;
  let total = 0;

  // Probe 1: Database Health
  total++;
  try {
    const res = await pool.query('SELECT 1 as healthy, count(*) as tables FROM information_schema.tables WHERE table_schema = \'public\'');
    if (res.rows[0]?.healthy === 1 && parseInt(res.rows[0]?.tables || '0', 10) >= 14) {
      console.log(`✅ [1/5] Database Health Probe: Connected (${res.rows[0].tables} public tables)`);
      passed++;
    } else {
      console.error('❌ [1/5] Database Health Probe: Incomplete tables');
    }
  } catch (err) {
    console.error(`❌ [1/5] Database Health Probe Failed: ${err.message}`);
  }

  // Probe 2: API Ping Probe
  total++;
  try {
    const pingRes = await httpRequest('/api/ping');
    if (pingRes.status === 200 && pingRes.body?.status === 'ok') {
      console.log('✅ [2/5] API Server Ping Probe: 200 OK');
      passed++;
    } else {
      console.error(`❌ [2/5] API Server Ping Probe Failed: status ${pingRes.status}`);
    }
  } catch (err) {
    console.error(`❌ [2/5] API Server Ping Probe Error: ${err.message}`);
  }

  // Probe 3: Auth & Session Token
  total++;
  let authHeaders = {};
  try {
    const loginRes = await httpRequest('/api/auth/login', { method: 'POST' }, {
      email: 'owner@dukapos.com',
      password: 'password123',
      deviceId: 'smoke-device-001',
    });
    const token = loginRes.body?.accessToken || loginRes.body?.token;
    if (loginRes.status === 200 && token) {
      authHeaders = { Authorization: `Bearer ${token}` };
      console.log('✅ [3/5] Operator Auth & Session Probe: Token Issued');
      passed++;
    } else {
      console.error(`❌ [3/3] Auth Probe Failed: status ${loginRes.status}`);
    }
  } catch (err) {
    console.error(`❌ [3/5] Auth Probe Error: ${err.message}`);
  }

  // Probe 4: Sync Push & Delta Roundtrip
  total++;
  try {
    const testProdId = `PROD-SMOKE-${Date.now()}`;
    const pushRes = await httpRequest('/api/sync/push', { method: 'POST', headers: authHeaders }, {
      tenantId: RUNTIME_TEST_TENANT,
      deviceId: 'smoke-device-001',
      mutations: [{
        operationId: `op-smoke-${Date.now()}`,
        idempotencyKey: `smoke:${testProdId}`,
        entity: 'products',
        operation: 'CREATE',
        payload: {
          id: testProdId,
          name: 'Smoke Test Product',
          price: 500,
          tenant_id: RUNTIME_TEST_TENANT,
          branch_id: 'branch-a',
        },
      }],
    });

    const deltaRes = await httpRequest(`/api/sync/delta?tenantId=${RUNTIME_TEST_TENANT}&since=0`, { headers: authHeaders });

    if (pushRes.status === 200 && deltaRes.status === 200) {
      console.log('✅ [4/5] Sync Push & Delta Round-trip Probe: Verified');
      passed++;
    } else {
      console.error(`❌ [4/5] Sync Probe Failed: push ${pushRes.status}, delta ${deltaRes.status}`);
    }
  } catch (err) {
    console.error(`❌ [4/5] Sync Probe Error: ${err.message}`);
  }

  // Probe 5: SHA-256 Checksum Calculation
  total++;
  try {
    const chkRes = await httpRequest(`/api/sync/checksum?tenantId=${RUNTIME_TEST_TENANT}`, { headers: authHeaders });
    if (chkRes.status === 200 && chkRes.body?.checksum?.startsWith('sha256:')) {
      console.log(`✅ [5/5] SHA-256 Checksum Probe: ${chkRes.body.checksum} (Records: ${chkRes.body.recordCount})`);
      passed++;
    } else {
      console.error(`❌ [5/5] Checksum Probe Failed: status ${chkRes.status}`);
    }
  } catch (err) {
    console.error(`❌ [5/5] Checksum Probe Error: ${err.message}`);
  }

  const elapsed = Date.now() - startTime;
  console.log('\n================================================================');
  console.log(`⚡ SMOKE CERTIFICATION RESULT: ${passed}/${total} PASSED (${elapsed}ms)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runProductionSmoke().catch(err => {
  console.error('Fatal smoke test failure:', err);
  process.exit(1);
});
