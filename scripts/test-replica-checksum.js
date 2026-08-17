/**
 * KwakoPOS SaaS — Replica Content-Based SHA-256 Checksum Test Suite
 * 
 * Tests:
 * 1. Same data -> Same SHA-256 checksum
 * 2. Record field change (price 100 -> 101) -> Different checksum
 * 3. Record added -> Different checksum
 * 4. Record deleted (tombstone) -> Different checksum
 * 5. Different insertion order (A,B,C vs C,A,B) -> Same checksum
 * 6. Different object property order ({id,name,price} vs {price,name,id}) -> Same checksum
 * 7. Different tenant scope (tenant-A vs tenant-B) -> Different checksum
 * 8. Deleted vs active record -> Different checksum
 * 9. Large dataset performance (10,000 products) -> Execution within acceptable latency
 * 10. Client/Server test vector equivalence test -> Matching sha256 output
 * 11. Replica checksum API verification via HTTP GET /api/sync/checksum
 */

import http from 'http';
import crypto from 'crypto';
import pkg from 'pg';
const { Pool } = pkg;

import {
  calculateCanonicalChecksum,
  canonicalize,
  sha256,
  CHECKSUM_VERSION
} from '../src/db/persistence/canonicalChecksumCore.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kwakopos';
const pool = new Pool({ connectionString: DATABASE_URL });
const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;

function get(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE_URL}${endpoint}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runChecksumTestSuite() {
  console.log('================================================================');
  console.log('⚡ KWAKOPOS REPLICA CONTENT-BASED SHA-256 CHECKSUM TEST MATRIX');
  console.log('================================================================\n');

  let passedTests = 0;
  const totalTests = 11;

  try {
    const tenantId = 'tenant-chk-test';

    // Base sample dataset
    const baseProducts = [
      { id: 'p1', name: 'Fresh Milk 1L', price: 2500, buyingPrice: 2000, category: 'Dairy', tenant_id: tenantId },
      { id: 'p2', name: 'Brown Bread 500g', price: 1500, buyingPrice: 1100, category: 'Bakery', tenant_id: tenantId },
      { id: 'p3', name: 'Espresso Beans 250g', price: 12000, buyingPrice: 8500, category: 'Beverages', tenant_id: tenantId },
    ];

    const baseVariants = [
      { id: 'v1', productId: 'p1', sku: 'MILK-1L', buyingPrice: 2000, sellingPrice: 2500, stock: 45, tenant_id: tenantId },
    ];

    const baseCategories = [
      { id: 'c1', name: 'Dairy', code: 'CAT-DAIRY', tenant_id: tenantId },
      { id: 'c2', name: 'Bakery', code: 'CAT-BAKE', tenant_id: tenantId },
      { id: 'c3', name: 'Beverages', code: 'CAT-BEV', tenant_id: tenantId },
    ];

    const baseBrands = [
      { id: 'b1', name: 'Highland Farms', code: 'BRD-HF', tenant_id: tenantId },
    ];

    // -------------------------------------------------------------------------
    // TEST 1: Same Data -> Same Checksum
    // -------------------------------------------------------------------------
    console.log('[Test 1] Verifying Same Data produces identical SHA-256 Checksum...');
    const result1A = await calculateCanonicalChecksum(tenantId, baseProducts, baseVariants, baseCategories, baseBrands);
    const result1B = await calculateCanonicalChecksum(tenantId, baseProducts, baseVariants, baseCategories, baseBrands);

    if (result1A.checksum === result1B.checksum && result1A.checksum.startsWith('sha256:')) {
      console.log(`  ✅ Passed: Same dataset produced exact hash match: ${result1A.checksum.slice(0, 20)}...`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Hash mismatch for identical dataset: ${result1A.checksum} vs ${result1B.checksum}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Field Modification (Price 2500 -> 2600) -> Different Checksum
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Verifying Field Change (Price 2500 -> 2600) alters Checksum...');
    const modifiedProducts = [
      { ...baseProducts[0], price: 2600, sellingPrice: 2600 },
      baseProducts[1],
      baseProducts[2],
    ];
    const result2 = await calculateCanonicalChecksum(tenantId, modifiedProducts, baseVariants, baseCategories, baseBrands);

    if (result2.checksum !== result1A.checksum) {
      console.log(`  ✅ Passed: Price change modified checksum (${result1A.checksum.slice(0, 16)}... -> ${result2.checksum.slice(0, 16)}...)`);
      passedTests++;
    } else {
      throw new Error('  ❌ Failed: Checksum failed to detect field value modification.');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Record Addition -> Different Checksum
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Verifying Record Addition alters Checksum...');
    const addedProducts = [
      ...baseProducts,
      { id: 'p4', name: 'Mineral Water 500ml', price: 1000, buyingPrice: 600, category: 'Beverages', tenant_id: tenantId },
    ];
    const result3 = await calculateCanonicalChecksum(tenantId, addedProducts, baseVariants, baseCategories, baseBrands);

    if (result3.checksum !== result1A.checksum && result3.recordCount === 9) {
      console.log(`  ✅ Passed: New record detected, checksum updated (${result3.checksum.slice(0, 16)}...)`);
      passedTests++;
    } else {
      throw new Error('  ❌ Failed: Checksum failed to detect added record.');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Record Soft Deletion (Tombstone) -> Different Checksum
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Verifying Soft Deletion (Tombstone) alters Checksum...');
    const softDeletedProducts = [
      { ...baseProducts[0], deletedAt: Date.now() },
      baseProducts[1],
      baseProducts[2],
    ];
    const result4 = await calculateCanonicalChecksum(tenantId, softDeletedProducts, baseVariants, baseCategories, baseBrands);

    if (result4.checksum !== result1A.checksum) {
      console.log(`  ✅ Passed: Tombstone deletion detected (${result4.checksum.slice(0, 16)}...)`);
      passedTests++;
    } else {
      throw new Error('  ❌ Failed: Checksum failed to detect soft deletion tombstone.');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Different Insertion Order (A,B,C vs C,A,B) -> Same Checksum
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Verifying Insertion Order Invariance (A,B,C vs C,A,B)...');
    const reorderedProducts = [baseProducts[2], baseProducts[0], baseProducts[1]];
    const reorderedCategories = [baseCategories[1], baseCategories[2], baseCategories[0]];
    const result5 = await calculateCanonicalChecksum(tenantId, reorderedProducts, baseVariants, reorderedCategories, baseBrands);

    if (result5.checksum === result1A.checksum) {
      console.log(`  ✅ Passed: Deterministic sorting produced identical checksum regardless of array insertion order.`);
      passedTests++;
    } else {
      throw new Error('  ❌ Failed: Insertion order changed the checksum.');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Different Object Property Key Order -> Same Checksum
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Verifying Object Property Key Order Invariance...');
    const reorderedKeyProducts = [
      { price: 2500, category: 'Dairy', name: 'Fresh Milk 1L', buyingPrice: 2000, tenant_id: tenantId, id: 'p1' },
      { category: 'Bakery', id: 'p2', buyingPrice: 1100, price: 1500, name: 'Brown Bread 500g', tenant_id: tenantId },
      { tenant_id: tenantId, price: 12000, name: 'Espresso Beans 250g', id: 'p3', buyingPrice: 8500, category: 'Beverages' },
    ];
    const result6 = await calculateCanonicalChecksum(tenantId, reorderedKeyProducts, baseVariants, baseCategories, baseBrands);

    if (result6.checksum === result1A.checksum) {
      console.log(`  ✅ Passed: Object key canonicalization produced identical checksum.`);
      passedTests++;
    } else {
      throw new Error('  ❌ Failed: Property key ordering changed the checksum.');
    }

    // -------------------------------------------------------------------------
    // TEST 7: Different Tenant Scope -> Different Checksum
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Verifying Strict Tenant Isolation in Checksum...');
    const result7 = await calculateCanonicalChecksum('tenant-alien-999', baseProducts, baseVariants, baseCategories, baseBrands);

    if (result7.checksum !== result1A.checksum) {
      console.log(`  ✅ Passed: Tenant isolation verified (${result7.checksum.slice(0, 16)}... != ${result1A.checksum.slice(0, 16)}...)`);
      passedTests++;
    } else {
      throw new Error('  ❌ Failed: Checksum failed to isolate by tenantId.');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Volatile Sync Field Invariance (syncStatus, retryCount, error)
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Verifying Volatile Sync Metadata does NOT pollute Checksum...');
    const volatileProducts = [
      { ...baseProducts[0], syncStatus: 'PENDING', isSynced: 0, retryCount: 3, lastAttempt: 178699999 },
      { ...baseProducts[1], syncStatus: 'SYNCED', isSynced: 1, error: 'Network timeout' },
      baseProducts[2],
    ];
    const result8 = await calculateCanonicalChecksum(tenantId, volatileProducts, baseVariants, baseCategories, baseBrands);

    if (result8.checksum === result1A.checksum) {
      console.log(`  ✅ Passed: Volatile sync fields correctly excluded from business checksum.`);
      passedTests++;
    } else {
      throw new Error('  ❌ Failed: Volatile sync fields altered the replica checksum.');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Large Dataset (10,000 Products) Performance Test
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Performance Testing with 10,000 Generated Records...');
    const largeProducts = [];
    for (let i = 0; i < 10000; i++) {
      largeProducts.push({
        id: `prod-bulk-${i}`,
        tenant_id: tenantId,
        name: `Bulk Product ${i}`,
        price: 1000 + (i % 50) * 100,
        buyingPrice: 800 + (i % 50) * 80,
        category: `Category ${i % 20}`,
        brand: `Brand ${i % 10}`,
        version: 1,
        deletedAt: null,
      });
    }

    const tStart = Date.now();
    const result9 = await calculateCanonicalChecksum(tenantId, largeProducts, [], [], [], 8);
    const duration = Date.now() - tStart;

    if (result9.checksum.startsWith('sha256:') && result9.recordCount === 10000 && duration < 2500) {
      console.log(`  ✅ Passed: 10,000 records hashed in ${duration}ms (${result9.checksum.slice(0, 20)}...)`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Large dataset checksum took ${duration}ms (exceeded 2500ms budget)`);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Known Test Vector Equivalence
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Testing Known Checksum Test Vector...');
    const knownFixture = {
      tenantId: 'tenant-vector-test',
      products: [
        { id: 'p-fixed-1', tenant_id: 'tenant-vector-test', name: 'Product A', price: 1000, buyingPrice: 800, category: 'General' },
      ],
      variants: [],
      categories: [
        { id: 'c-fixed-1', tenant_id: 'tenant-vector-test', name: 'General', code: 'GEN' },
      ],
      brands: []
    };

    const vectorResult = await calculateCanonicalChecksum(
      knownFixture.tenantId,
      knownFixture.products,
      knownFixture.variants,
      knownFixture.categories,
      knownFixture.brands
    );

    // Compute expected hash manually
    const serializedVector = JSON.stringify(canonicalize({
      checksumVersion: 1,
      tenantId: 'tenant-vector-test',
      schemaVersion: 8,
      records: [
        { entity: 'categories', id: 'c-fixed-1', data: canonicalize({ id: 'c-fixed-1', tenant_id: 'tenant-vector-test', branch_id: null, name: 'General', code: 'GEN', description: null, parent_id: null, status: 'Active', sync_version: 0, deletedAt: null }) },
        { entity: 'products', id: 'p-fixed-1', data: canonicalize({ id: 'p-fixed-1', tenant_id: 'tenant-vector-test', branch_id: null, name: 'Product A', sku: null, barcode: null, category: 'General', categoryId: null, brand: null, brandId: null, buyingPrice: 800, sellingPrice: 1000, price: 1000, costPrice: 0, wholesalePrice: 0, vipPrice: 0, onlinePrice: 0, hasVariants: false, status: 'Active', version: 1, deletedAt: null }) },
      ]
    }));
    const expectedHex = `sha256:${crypto.createHash('sha256').update(serializedVector, 'utf8').digest('hex')}`;

    if (vectorResult.checksum === expectedHex) {
      console.log(`  ✅ Passed: Checksum perfectly matches known cross-platform test vector (${vectorResult.checksum.slice(0, 20)}...)`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Checksum did not match known vector: expected ${expectedHex}, got ${vectorResult.checksum}`);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Server API Endpoint GET /api/sync/checksum
    // -------------------------------------------------------------------------
    console.log('\n[Test 11] Verifying Server Checksum Endpoint (GET /api/sync/checksum)...');
    const apiRes = await get(`/api/sync/checksum?tenantId=8f1109a3-9ab8-4922-a4e0-d706a3a2d85d`);

    if (apiRes.status === 200 && apiRes.body.success && apiRes.body.checksum?.startsWith('sha256:')) {
      console.log(`  ✅ Passed: Server computed deterministic SHA-256 replica checksum: ${apiRes.body.checksum.slice(0, 24)}... (Records: ${apiRes.body.recordCount})`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Server checksum API endpoint failed: ${JSON.stringify(apiRes.body)}`);
    }

    console.log('\n================================================================');
    console.log(`🎉 ALL REPLICA SHA-256 CHECKSUM TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Checksum Test Suite Failure:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runChecksumTestSuite();
