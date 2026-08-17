/**
 * KwakoPOS SaaS — Multi-Device Concurrency & Idempotency Test Suite
 * Simulates concurrent offline POS terminals (Device A, B, C) committing sales and stock adjustments.
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

async function runConcurrencySuite() {
  console.log('================================================================');
  console.log('  KWAKOPOS MULTI-DEVICE CONCURRENCY & IDEMPOTENCY SUITE');
  console.log('================================================================\n');

  const suffix = Date.now().toString(36);
  const deviceA = `pos-kiosk-A-${suffix}`;
  const deviceB = `pos-kiosk-B-${suffix}`;
  const deviceC = `pos-kiosk-C-${suffix}`;

  // 1. Authenticate Operator
  const loginRes = await makeRequest({ path: '/api/auth/login', method: 'POST' }, {
    identifier: 'yannick@kwakoko.co.tz',
    password: 'Kwakoko@2026',
    deviceId: deviceA
  });
  assert(loginRes.status === 200 && loginRes.data?.accessToken, 'Operator authenticated');
  const token = loginRes.data.accessToken;
  const tenantId = loginRes.data.tenant?.id || 'tenant-101';

  // 2. Create Target Product with initial stock of 200
  const productId = `prod-concurrent-${suffix}`;
  console.log(`\n[Setup] Initializing target product ${productId} (Stock: 200)...`);
  await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-device-id': deviceA }
  }, {
    operations: [
      {
        id: `op-init-prod-${suffix}`,
        entity: 'products',
        operation: 'UPDATE',
        payload: {
          id: productId,
          tenant_id: tenantId,
          name: `Concurrent Stress Product ${suffix}`,
          sku: `SKU-CC-${suffix}`,
          buying_price: 100,
          selling_price: 150,
          stock: 200,
          status: 'Active'
        }
      },
      {
        id: `op-init-stock-${suffix}`,
        entity: 'stock_ledger',
        operation: 'CREATE',
        payload: {
          id: `mov-init-${suffix}`,
          tenant_id: tenantId,
          product_id: productId,
          movement_type: 'OPENING',
          quantity_before: 0,
          quantity_change: 200,
          quantity_after: 200,
          operation_id: `op-init-stock-${suffix}`
        }
      }
    ],
    tenantId
  });

  // 3. Concurrently submit 3 offline operations from Device A, B, C
  console.log('\n[Concurrency Test] Submitting concurrent operations from Device A, B, C...');

  const opA = {
    id: `op-concurrent-sale-A-${suffix}`,
    entity: 'stock_ledger',
    operation: 'CREATE',
    payload: {
      id: `mov-sale-A-${suffix}`,
      tenant_id: tenantId,
      product_id: productId,
      movement_type: 'SALE',
      quantity_before: 200,
      quantity_change: -20, // Sale 20 units
      quantity_after: 180,
      operation_id: `op-concurrent-sale-A-${suffix}`
    }
  };

  const opB = {
    id: `op-concurrent-sale-B-${suffix}`,
    entity: 'stock_ledger',
    operation: 'CREATE',
    payload: {
      id: `mov-sale-B-${suffix}`,
      tenant_id: tenantId,
      product_id: productId,
      movement_type: 'SALE',
      quantity_before: 200,
      quantity_change: -30, // Sale 30 units
      quantity_after: 170,
      operation_id: `op-concurrent-sale-B-${suffix}`
    }
  };

  const opC = {
    id: `op-concurrent-adj-C-${suffix}`,
    entity: 'stock_ledger',
    operation: 'CREATE',
    payload: {
      id: `mov-adj-C-${suffix}`,
      tenant_id: tenantId,
      product_id: productId,
      movement_type: 'PURCHASE',
      quantity_before: 200,
      quantity_change: 50, // Stock Received +50 units
      quantity_after: 250,
      operation_id: `op-concurrent-adj-C-${suffix}`
    }
  };

  // Launch concurrently
  const [resA, resB, resC] = await Promise.all([
    makeRequest({
      path: '/api/sync/push',
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-device-id': deviceA }
    }, { operations: [opA], tenantId }),
    makeRequest({
      path: '/api/sync/push',
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-device-id': deviceB }
    }, { operations: [opB], tenantId }),
    makeRequest({
      path: '/api/sync/push',
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-device-id': deviceC }
    }, { operations: [opC], tenantId })
  ]);

  assert(resA.status === 200 && resA.data?.success, 'Device A (-20 sale) processed');
  assert(resB.status === 200 && resB.data?.success, 'Device B (-30 sale) processed');
  assert(resC.status === 200 && resC.data?.success, 'Device C (+50 purchase) processed');

  // 4. Test Idempotency: Re-send identical operation from Device A
  console.log('\n[Idempotency Test] Replaying duplicate operation from Device A (Network Retry simulation)...');
  const duplicateRes = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-device-id': deviceA }
  }, { operations: [opA], tenantId });
  assert(duplicateRes.status === 200 && duplicateRes.data?.success, 'Duplicate operation handled idempotently without error');

  // 5. Verify movements in Stock Ledger
  console.log('\n[Stock Integrity] Fetching stock ledger to verify ledger movements...');
  const ledgerRes = await makeRequest({
    path: `/api/sync?since=0&tenantId=${tenantId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(ledgerRes.status === 200 && Array.isArray(ledgerRes.data?.changes?.stockLedger), 'Ledger movements retrieved');
  const prodLedger = ledgerRes.data.changes.stockLedger.filter(l => l.product_id === productId);
  assert(prodLedger.length === 4, `Expected exactly 4 ledger movements (1 init + 3 ops), found: ${prodLedger.length}`);

  console.log('\n================================================================');
  console.log('  ✅ ALL MULTI-DEVICE CONCURRENCY & IDEMPOTENCY TESTS PASSED');
  console.log('================================================================\n');
}

runConcurrencySuite().catch((err) => {
  console.error('Concurrency suite failed:', err);
  process.exit(1);
});
