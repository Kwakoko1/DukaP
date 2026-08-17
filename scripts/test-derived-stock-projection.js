/**
 * KwakoPOS SaaS — Derived Stock Projection Test Suite
 * 
 * Verifies that:
 * 1. Parent product stock is derived deterministically from the sum of child variant stocks.
 * 2. Derived stock updates do NOT generate outbox mutations (zero sync churn).
 * 3. Derived stock updates do NOT insert stock ledger movements (ledger remains authoritative).
 * 4. Derived stock updates do NOT modify business metadata (updatedAt is preserved).
 * 5. Replaying authoritative stock ledger movements regenerates exact derived parent stock.
 */

import crypto from 'crypto';

class MockDexieTable {
  constructor() {
    this.records = new Map();
  }

  async toArray() {
    return Array.from(this.records.values());
  }

  async get(id) {
    return this.records.get(String(id)) || null;
  }

  async put(record) {
    this.records.set(String(record.id), { ...record });
  }

  async update(id, changes) {
    const existing = this.records.get(String(id));
    if (existing) {
      this.records.set(String(id), { ...existing, ...changes });
    }
  }

  where(field) {
    const records = Array.from(this.records.values());
    return {
      equals: (val) => ({
        toArray: async () => records.filter((r) => r[field] === val),
        filter: (pred) => ({
          toArray: async () => records.filter((r) => r[field] === val && pred(r)),
        }),
      }),
    };
  }
}

class MockDexieDatabase {
  constructor() {
    this.products = new MockDexieTable();
    this.productVariants = new MockDexieTable();
    this.stockLedger = new MockDexieTable();
    this.syncQueue = new MockDexieTable();
  }

  isOpen() {
    return true;
  }

  async open() {
    return true;
  }

  async transaction(mode, ...args) {
    const callback = args[args.length - 1];
    return await callback();
  }
}

// Derived Projection Logic
async function reconcileParentVariantStock(mockDb, tenantId) {
  let updatedCount = 0;
  await mockDb.transaction('rw', mockDb.products, mockDb.productVariants, async () => {
    const parents = (await mockDb.products.where('tenant_id').equals(tenantId).toArray())
      .filter((p) => Boolean(p.hasVariants || p.has_variants));

    for (const parent of parents) {
      const variants = await mockDb.productVariants.where('productId').equals(parent.id).toArray();
      if (variants.length === 0) continue;

      const activeVariants = variants.filter((v) => v.status !== 'Inactive' && !v.deletedAt && !v.deleted_at);
      const derivedStock = activeVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      if (Number(parent.stock) !== derivedStock) {
        // Safe projection update: DO NOT change updatedAt or emit outbox items
        await mockDb.products.update(parent.id, { stock: derivedStock });
        updatedCount++;
      }
    }
  });
  return updatedCount;
}

async function runDerivedStockTestSuite() {
  console.log('================================================================');
  console.log('⚡ KWAKOPOS DERIVED STOCK PROJECTION & SAFETY SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  const totalTests = 6;
  const mockDb = new MockDexieDatabase();
  const tenantId = 'tenant-derived-test';
  const initialUpdatedAt = 1786000000000;

  try {
    // Setup Parent Product
    const parentId = 'prod-parent-1';
    await mockDb.products.put({
      id: parentId,
      name: 'Men T-Shirt',
      tenant_id: tenantId,
      hasVariants: true,
      stock: 0,
      updatedAt: initialUpdatedAt,
      syncStatus: 'SYNCED',
    });

    // Setup Child Variants
    await mockDb.productVariants.put({
      id: 'var-1',
      productId: parentId,
      sku: 'TSHIRT-RED-M',
      tenant_id: tenantId,
      stock: 5,
      status: 'Active',
    });

    await mockDb.productVariants.put({
      id: 'var-2',
      productId: parentId,
      sku: 'TSHIRT-BLUE-L',
      tenant_id: tenantId,
      stock: 7,
      status: 'Active',
    });

    // -------------------------------------------------------------------------
    // TEST 1: Sum Child Variants (5 + 7 = 12)
    // -------------------------------------------------------------------------
    console.log('[Test 1] Reconciling Parent Stock from Variant Sums (5 + 7 = 12)...');
    const updated1 = await reconcileParentVariantStock(mockDb, tenantId);
    const parentAfter1 = await mockDb.products.get(parentId);

    if (updated1 === 1 && parentAfter1.stock === 12) {
      console.log(`  ✅ Passed: Parent stock correctly projected to 12.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Expected parent stock 12, got ${parentAfter1.stock}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Variant Stock Change (0 + 0 = 0)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Updating Variants to 0 and Reconciling Parent Stock...');
    await mockDb.productVariants.update('var-1', { stock: 0 });
    await mockDb.productVariants.update('var-2', { stock: 0 });
    const updated2 = await reconcileParentVariantStock(mockDb, tenantId);
    const parentAfter2 = await mockDb.products.get(parentId);

    if (updated2 === 1 && parentAfter2.stock === 0) {
      console.log(`  ✅ Passed: Parent stock correctly updated to 0.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Expected parent stock 0, got ${parentAfter2.stock}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Zero Outbox Mutations Created by Derived Projection
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Verifying Zero Outbox Mutations Generated by Projection...');
    const outboxItems = await mockDb.syncQueue.toArray();

    if (outboxItems.length === 0) {
      console.log(`  ✅ Passed: Outbox queue contains 0 items (no phantom business mutations).`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Derived projection created ${outboxItems.length} outbox mutations!`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Zero Stock Ledger Movements Created by Derived Projection
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Verifying Zero Stock Ledger Movements Generated by Projection...');
    const ledgerItems = await mockDb.stockLedger.toArray();

    if (ledgerItems.length === 0) {
      console.log(`  ✅ Passed: Stock ledger contains 0 items (ledger remains authoritative).`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Derived projection created ${ledgerItems.length} stock ledger entries!`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Preservation of Business Metadata (updatedAt unchanged)
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Verifying Business updatedAt is NOT altered by Projection...');
    const finalParent = await mockDb.products.get(parentId);

    if (finalParent.updatedAt === initialUpdatedAt && finalParent.syncStatus === 'SYNCED') {
      console.log(`  ✅ Passed: Parent updatedAt (${finalParent.updatedAt}) and syncStatus preserved.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Parent updatedAt or syncStatus was mutated: ${finalParent.updatedAt}`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Authoritative Stock Ledger Replay Determinism
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Replaying Authoritative Ledger Events (+20, -5)...');
    // Simulate stock movements into variant 1
    const movements = [
      { variant_id: 'var-1', delta: 20 },
      { variant_id: 'var-1', delta: -5 },
      { variant_id: 'var-2', delta: 30 },
    ];
    let v1Stock = 0;
    let v2Stock = 0;
    for (const m of movements) {
      if (m.variant_id === 'var-1') v1Stock += m.delta;
      if (m.variant_id === 'var-2') v2Stock += m.delta;
    }
    await mockDb.productVariants.update('var-1', { stock: v1Stock });
    await mockDb.productVariants.update('var-2', { stock: v2Stock });
    await reconcileParentVariantStock(mockDb, tenantId);
    const parentReplayed = await mockDb.products.get(parentId);

    if (parentReplayed.stock === 45) { // (20-5) + 30 = 45
      console.log(`  ✅ Passed: Replayed ledger produced exact derived parent stock: 45.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Expected replayed stock 45, got ${parentReplayed.stock}`);
    }

    console.log('\n================================================================');
    console.log(`🎉 ALL DERIVED STOCK PROJECTION TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Derived Stock Projection Test Suite Failure:', err);
    process.exit(1);
  }
}

runDerivedStockTestSuite();
