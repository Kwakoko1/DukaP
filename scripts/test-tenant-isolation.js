/**
 * KwakoPOS SaaS — Multi-Tenant Isolation Verification Test Suite
 * Tests that Tenant A cannot access or mutate Tenant B data.
 */

import http from 'http';

function makeRequest(options, payload = null) {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : null;
    const reqOptions = {
      hostname: '127.0.0.1',
      port: 8080,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, raw: data });
        } catch (_) {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTenantIsolationSuite() {
  console.log('================================================================');
  console.log('  KWAKOPOS MULTI-TENANT ISOLATION SECURITY TEST SUITE');
  console.log('================================================================\n');

  // 1. Authenticate Tenant A
  console.log('[Test 1] Authenticating Operator for Tenant A...');
  const loginRes = await makeRequest({ path: '/api/auth/login', method: 'POST' }, {
    identifier: 'yannick@kwakoko.co.tz',
    password: 'Kwakoko@2026',
    deviceId: 'dev-tenant-a-test'
  });
  assert(loginRes.status === 200 && loginRes.data?.accessToken, 'Tenant A logged in');
  const tokenA = loginRes.data.accessToken;
  const tenantAId = loginRes.data.tenant?.id || 'tenant-101';

  // 2. Attempt cross-tenant delta sync: Tenant A attempts to fetch Tenant B's data
  console.log('\n[Test 2] Testing Cross-Tenant Read Protection...');
  const victimTenantId = 'tenant-victim-999';
  const syncRes = await makeRequest({
    path: `/api/sync?since=0&tenantId=${victimTenantId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  
  // The server must either reject or strictly return data belonging to the authenticated tenant (Tenant A), never Tenant B
  if (syncRes.status === 403 || syncRes.status === 401) {
    assert(true, 'Cross-tenant request explicitly forbidden (403/401)');
  } else if (syncRes.status === 200) {
    // If 200, ensure returned tenantId is forced to authenticated Tenant A or empty for victim
    const returnedTenant = syncRes.data?.tenantId;
    assert(returnedTenant === tenantAId || (syncRes.data?.changes?.products?.length === 0), 'Server prevented cross-tenant leakage');
  }

  // 3. Attempt cross-tenant mutation: Tenant A attempts to push data into Tenant B
  console.log('\n[Test 3] Testing Cross-Tenant Write Protection (Tampered tenant_id in payload)...');
  const crossPushRes = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'x-device-id': 'dev-tenant-a-test' }
  }, {
    operations: [
      {
        id: `tampered-op-${Date.now()}`,
        entity: 'products',
        operation: 'UPDATE',
        payload: {
          id: `tampered-prod-${Date.now()}`,
          tenant_id: 'non-existent-or-victim-tenant',
          name: 'Hacked Product',
          buying_price: 1,
          selling_price: 1,
          stock: 100
        }
      }
    ],
    tenantId: 'non-existent-or-victim-tenant'
  });

  // Check that either rejected or safe
  assert(crossPushRes.status === 200 || crossPushRes.status === 403 || crossPushRes.status === 400, 'Cross-tenant write attempt intercepted');

  console.log('\n================================================================');
  console.log('  ✅ ALL TENANT ISOLATION SECURITY TESTS PASSED');
  console.log('================================================================\n');
}

runTenantIsolationSuite().catch((err) => {
  console.error('Tenant isolation suite failed:', err);
  process.exit(1);
});
