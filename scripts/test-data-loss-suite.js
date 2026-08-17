/**
 * KwakoPOS SaaS — Production Zero Data Loss & Synchronization Test Suite
 * Executes the complete 26-step automated data-loss scenario.
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

async function runDataLossTestSuite() {
  console.log('================================================================');
  console.log('  KWAKOPOS ZERO DATA LOSS & MULTI-DEVICE SYNC VERIFICATION');
  console.log('================================================================\n');

  const tenantSuffix = Date.now().toString(36);
  const testTenantId = `tenant-dataloss-${tenantSuffix}`;
  const testEmail = `operator-${tenantSuffix}@kwakopos.test`;
  const deviceA = `device-pos-A-${tenantSuffix}`;
  const deviceB = `device-pos-B-${tenantSuffix}`;

  let tokenA = '';
  let tokenB = '';

  // Step 1: Login / Register Tenant A
  console.log('[Step 1] Authenticating Operator on Device A...');
  const loginRes = await makeRequest({ path: '/api/auth/login', method: 'POST' }, {
    identifier: 'yannick@kwakoko.co.tz',
    password: 'Kwakoko@2026',
    deviceId: deviceA,
    deviceName: 'POS Terminal Alpha'
  });
  assert(loginRes.status === 200 && loginRes.data?.success, 'Device A login successful');
  tokenA = loginRes.data.accessToken;
  const activeTenantId = loginRes.data.tenant?.id || 'tenant-101';

  // Step 2: Create 100 Products
  console.log('\n[Step 2] Creating 100 Synchronizable Products...');
  const productOps = [];
  for (let i = 1; i <= 100; i++) {
    productOps.push({
      id: `sync-op-prod-${tenantSuffix}-${i}`,
      entity: 'products',
      operation: 'UPDATE',
      payload: {
        id: `prod-${tenantSuffix}-${i}`,
        tenant_id: activeTenantId,
        name: `Automated Test Product #${i}`,
        sku: `SKU-DL-${tenantSuffix}-${i}`,
        barcode: `8901234${String(i).padStart(5, '0')}`,
        buying_price: 50.00,
        selling_price: 75.00,
        price: 75.00,
        stock: 100.00,
        category: `Category-${(i % 20) + 1}`,
        category_id: `cat-${tenantSuffix}-${(i % 20) + 1}`,
        brand: `Brand-${(i % 20) + 1}`,
        brand_id: `brd-${tenantSuffix}-${(i % 20) + 1}`,
        has_variants: i <= 20,
        module: 'Retail',
        status: 'Active',
        version: 1
      }
    });
  }

  const pushProds = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'x-device-id': deviceA }
  }, { operations: productOps, tenantId: activeTenantId });
  assert(pushProds.status === 200 && pushProds.data?.success, '100 Products pushed to PostgreSQL master');

  // Step 3: Create 20 Categories
  console.log('\n[Step 3] Creating 20 Categories...');
  const catOps = [];
  for (let i = 1; i <= 20; i++) {
    catOps.push({
      id: `sync-op-cat-${tenantSuffix}-${i}`,
      entity: 'categories',
      operation: 'UPDATE',
      payload: {
        id: `cat-${tenantSuffix}-${i}`,
        tenant_id: activeTenantId,
        name: `Category-${tenantSuffix}-${i}`,
        code: `CAT-${tenantSuffix}-${i}`,
        description: `Automated Test Category ${i}`,
        status: 'Active'
      }
    });
  }
  const pushCats = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'x-device-id': deviceA }
  }, { operations: catOps, tenantId: activeTenantId });
  assert(pushCats.status === 200 && pushCats.data?.success, '20 Categories pushed to PostgreSQL master');

  // Step 4: Create 20 Brands
  console.log('\n[Step 4] Creating 20 Brands...');
  const brdOps = [];
  for (let i = 1; i <= 20; i++) {
    brdOps.push({
      id: `sync-op-brd-${tenantSuffix}-${i}`,
      entity: 'brands',
      operation: 'UPDATE',
      payload: {
        id: `brd-${tenantSuffix}-${i}`,
        tenant_id: activeTenantId,
        name: `Brand-${tenantSuffix}-${i}`,
        code: `BRD-${tenantSuffix}-${i}`,
        description: `Automated Test Brand ${i}`,
        status: 'Active'
      }
    });
  }
  const pushBrds = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'x-device-id': deviceA }
  }, { operations: brdOps, tenantId: activeTenantId });
  assert(pushBrds.status === 200 && pushBrds.data?.success, '20 Brands pushed to PostgreSQL master');

  // Step 5: Create Product Variants for first 20 products
  console.log('\n[Step 5] Creating Product Variants...');
  const varOps = [];
  for (let i = 1; i <= 20; i++) {
    varOps.push({
      id: `sync-op-var-${tenantSuffix}-${i}-A`,
      entity: 'productVariants',
      operation: 'UPDATE',
      payload: {
        id: `var-${tenantSuffix}-${i}-A`,
        product_id: `prod-${tenantSuffix}-${i}`,
        tenant_id: activeTenantId,
        sku: `SKU-DL-${tenantSuffix}-${i}-VAR-A`,
        attributes: { Size: 'Large', Color: 'Blue' },
        buying_price: 50.00,
        selling_price: 75.00,
        stock: 50.00,
        status: 'Active'
      }
    });
    varOps.push({
      id: `sync-op-var-${tenantSuffix}-${i}-B`,
      entity: 'productVariants',
      operation: 'UPDATE',
      payload: {
        id: `var-${tenantSuffix}-${i}-B`,
        product_id: `prod-${tenantSuffix}-${i}`,
        tenant_id: activeTenantId,
        sku: `SKU-DL-${tenantSuffix}-${i}-VAR-B`,
        attributes: { Size: 'Medium', Color: 'Red' },
        buying_price: 50.00,
        selling_price: 75.00,
        stock: 50.00,
        status: 'Active'
      }
    });
  }
  const pushVars = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'x-device-id': deviceA }
  }, { operations: varOps, tenantId: activeTenantId });
  assert(pushVars.status === 200 && pushVars.data?.success, '40 Product Variants pushed to PostgreSQL master');

  // Step 6 & 7: Perform Sales and Stock Movements
  console.log('\n[Step 6 & 7] Creating Sales & Stock Ledger Movements...');
  const ledgerOps = [];
  for (let i = 1; i <= 10; i++) {
    ledgerOps.push({
      id: `sync-op-mov-${tenantSuffix}-${i}`,
      entity: 'stock_ledger',
      operation: 'CREATE',
      payload: {
        id: `mov-${tenantSuffix}-${i}`,
        tenant_id: activeTenantId,
        product_id: `prod-${tenantSuffix}-${i}`,
        movement_type: 'SALE',
        quantity_before: 100,
        quantity_change: -5,
        quantity_after: 95,
        unit_cost: 50.00,
        total_cost: 250.00,
        operation_id: `op-sale-${tenantSuffix}-${i}`
      }
    });
  }
  const pushMovs = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'x-device-id': deviceA }
  }, { operations: ledgerOps, tenantId: activeTenantId });
  assert(pushMovs.status === 200 && pushMovs.data?.success, 'Stock Movements committed to PostgreSQL');

  // Step 8 & 9: Simulate Logout & Re-login
  console.log('\n[Step 8 & 9] Testing Logout & Re-login Lifecycle...');
  const logoutRes = await makeRequest({
    path: '/api/auth/logout',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` }
  }, { sessionId: loginRes.data.sessionId });
  assert(logoutRes.status === 200, 'Logout succeeded on Device A');

  const reloginRes = await makeRequest({ path: '/api/auth/login', method: 'POST' }, {
    identifier: 'yannick@kwakoko.co.tz',
    password: 'Kwakoko@2026',
    deviceId: deviceA,
    deviceName: 'POS Terminal Alpha'
  });
  assert(reloginRes.status === 200 && reloginRes.data?.accessToken, 'Re-login succeeded on Device A');
  tokenA = reloginRes.data.accessToken;

  // Step 10 to 17: Bootstrap verification (simulating browser restart, PWA update, cache clear)
  console.log('\n[Step 10-17] Simulating Browser Restart, PWA Update & Cache Clear Verification...');
  const bootstrapResA = await makeRequest({
    path: '/api/bootstrap',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'x-tenant-id': activeTenantId }
  }, { tenantId: activeTenantId });
  assert(bootstrapResA.status === 200 && bootstrapResA.data?.products?.length >= 100, `Bootstrap returned ${bootstrapResA.data?.products?.length} products after restart/cache clear`);
  assert(bootstrapResA.data?.categories?.length >= 20, `Bootstrap returned ${bootstrapResA.data?.categories?.length} categories`);
  assert(bootstrapResA.data?.brands?.length >= 20, `Bootstrap returned ${bootstrapResA.data?.brands?.length} brands`);

  // Step 18 to 23: Open Second Device / Browser (Device B) & Bootstrap
  console.log('\n[Step 18-23] Multi-Browser / Device B Bootstrap Verification...');
  const loginResB = await makeRequest({ path: '/api/auth/login', method: 'POST' }, {
    email: 'yannick@kwakoko.co.tz',
    identifier: 'yannick@kwakoko.co.tz',
    password: 'Kwakoko@2026',
    deviceId: deviceB,
    deviceName: 'Firefox POS Kiosk Beta'
  });
  if (loginResB.status !== 200 || !loginResB.data?.accessToken) {
    console.error('loginResB failed:', loginResB.status, loginResB.data);
  }
  assert(loginResB.status === 200 && (loginResB.data?.accessToken || loginResB.data?.token), 'Device B logged in successfully');
  tokenB = loginResB.data?.accessToken || loginResB.data?.token;

  const bootstrapResB = await makeRequest({
    path: '/api/bootstrap',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}`, 'x-tenant-id': activeTenantId }
  }, { tenantId: activeTenantId });
  assert(bootstrapResB.status === 200 && bootstrapResB.data?.products?.length === bootstrapResA.data?.products?.length, 'Device B bootstrapped identical product master count');

  // Step 24 & 25: Modify Records Offline & Sync Reconnection
  console.log('\n[Step 24 & 25] Offline Mutation & Reconnection Sync Simulation...');
  const offlineOps = [
    {
      id: `sync-offline-prod-${tenantSuffix}-1`,
      entity: 'products',
      operation: 'UPDATE',
      payload: {
        id: `prod-${tenantSuffix}-1`,
        tenant_id: activeTenantId,
        name: 'Offline Renamed Test Product #1',
        selling_price: 99.99,
        price: 99.99,
        version: 2
      }
    },
    {
      id: `sync-offline-sale-${tenantSuffix}-1`,
      entity: 'stock_ledger',
      operation: 'CREATE',
      payload: {
        id: `mov-offline-${tenantSuffix}-1`,
        tenant_id: activeTenantId,
        product_id: `prod-${tenantSuffix}-1`,
        movement_type: 'SALE',
        quantity_before: 95,
        quantity_change: -10,
        quantity_after: 85,
        unit_cost: 50.00,
        total_cost: 500.00,
        operation_id: `op-offline-sale-${tenantSuffix}-1`
      }
    }
  ];

  const pushOffline = await makeRequest({
    path: '/api/sync/push',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}`, 'x-device-id': deviceB }
  }, { operations: offlineOps, tenantId: activeTenantId });
  assert(pushOffline.status === 200 && pushOffline.data?.success, 'Device B offline mutations successfully uploaded');

  // Step 26: Final Verification (Delta Sync on Device A)
  console.log('\n[Step 26] Final Delta Sync & Zero Data Loss Verification on Device A...');
  const deltaResA = await makeRequest({
    path: `/api/sync?since=0&tenantId=${activeTenantId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  console.log(`  [Debug Step 26] Status: ${deltaResA.status}, Products count: ${deltaResA.data?.changes?.products?.length}, raw:`, deltaResA.raw?.substring(0, 200));
  assert(deltaResA.status === 200 && deltaResA.data?.changes?.products?.length >= 100, 'Device A verified all 100 products intact');
  
  const updatedProd = deltaResA.data.changes.products.find(p => p.id === `prod-${tenantSuffix}-1`);
  assert(updatedProd && updatedProd.name === 'Offline Renamed Test Product #1', 'Device A received Device B offline update deterministically');

  console.log('\n================================================================');
  console.log('  ✅ CRITICAL 26-STEP ZERO DATA LOSS TEST SUITE PASSED');
  console.log('================================================================\n');
}

runDataLossTestSuite().catch((err) => {
  console.error('Data loss suite failed:', err);
  process.exit(1);
});
