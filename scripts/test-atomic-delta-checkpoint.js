/**
 * KwakoPOS SaaS — Atomic Delta + Checkpoint Advancement Test Suite
 * 
 * Verifies that:
 * 1. Delta application and Checkpoint progression occur in ONE atomic transaction.
 * 2. If delta application fails, checkpoint does NOT advance.
 * 3. If checkpoint update fails, incoming delta mutations roll back completely.
 * 4. Monotonic checkpoint regressions (e.g. 9 < 10) are strictly rejected.
 * 5. Replaying identical delta versions is idempotent.
 */

class TransactionalDatabase {
  constructor() {
    this.store = {
      products: new Map(),
      categories: new Map(),
      syncMetadata: new Map(),
      serverCheckpoints: new Map(),
    };
  }

  async getCheckpoint(tenantId, deviceId) {
    const id = `${tenantId}_${deviceId}`;
    const rec = this.store.serverCheckpoints.get(id);
    const meta = this.store.syncMetadata.get('lastSyncVersion');
    return Math.max(
      Number(rec?.lastServerVersion || 0),
      Number(meta?.value || 0)
    );
  }

  // Atomic transaction runner with snapshot isolation and rollback
  async transaction(mode, tables, callback) {
    // Snapshot current state
    const snapshot = {
      products: new Map(this.store.products),
      categories: new Map(this.store.categories),
      syncMetadata: new Map(this.store.syncMetadata),
      serverCheckpoints: new Map(this.store.serverCheckpoints),
    };

    try {
      await callback();
    } catch (err) {
      // Rollback to snapshot on any failure
      this.store.products = snapshot.products;
      this.store.categories = snapshot.categories;
      this.store.syncMetadata = snapshot.syncMetadata;
      this.store.serverCheckpoints = snapshot.serverCheckpoints;
      throw err;
    }
  }

  async putCheckpointInCurrentTransaction(tenantId, deviceId, serverVersion) {
    const currentVersion = await this.getCheckpoint(tenantId, deviceId);
    if (serverVersion < currentVersion) {
      throw new Error(`Checkpoint regression rejected: new version ${serverVersion} < current version ${currentVersion}`);
    }

    const id = `${tenantId}_${deviceId}`;
    this.store.serverCheckpoints.set(id, {
      id,
      tenantId,
      deviceId,
      lastServerVersion: serverVersion,
      lastSyncedAt: Date.now(),
    });

    this.store.syncMetadata.set('lastSyncVersion', {
      key: 'lastSyncVersion',
      value: serverVersion,
      updatedAt: Date.now(),
    });
  }

  async advanceCheckpointSafely(tenantId, deviceId, newServerVersion, applyDeltaCallback) {
    if (!newServerVersion || newServerVersion <= 0) {
      return { success: false, committedVersion: 0 };
    }

    try {
      await this.transaction('rw', ['products', 'categories', 'syncMetadata', 'serverCheckpoints'], async () => {
        await applyDeltaCallback();
        await this.putCheckpointInCurrentTransaction(tenantId, deviceId, newServerVersion);
      });
      return { success: true, committedVersion: newServerVersion };
    } catch (err) {
      return { success: false, committedVersion: 0, error: err.message };
    }
  }
}

async function runAtomicDeltaCheckpointTestSuite() {
  console.log('================================================================');
  console.log('⚡ KWAKOPOS ATOMIC DELTA + CHECKPOINT ADVANCEMENT SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  const totalTests = 5;
  const db = new TransactionalDatabase();
  const tenantId = 'tenant-atomic-test';
  const deviceId = 'dev-atomic-1';

  try {
    // Initial Setup: Set checkpoint to version 10
    await db.putCheckpointInCurrentTransaction(tenantId, deviceId, 10);
    const initialCp = await db.getCheckpoint(tenantId, deviceId);

    // -------------------------------------------------------------------------
    // TEST A: Normal Atomic Commit (version 10 -> 11)
    // -------------------------------------------------------------------------
    console.log('[Test A] Applying Delta (v11) with atomic checkpoint advancement...');
    const resultA = await db.advanceCheckpointSafely(tenantId, deviceId, 11, async () => {
      db.store.products.set('p-atomic-1', { id: 'p-atomic-1', name: 'Atomic Product 1', stock: 100 });
    });

    const cpA = await db.getCheckpoint(tenantId, deviceId);
    const prodA = db.store.products.get('p-atomic-1');

    if (resultA.success && cpA === 11 && prodA && prodA.stock === 100) {
      console.log(`  ✅ Passed: Delta applied and checkpoint advanced to 11 in ONE atomic transaction.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Atomic advancement failed: success=${resultA.success}, cp=${cpA}`);
    }

    // -------------------------------------------------------------------------
    // TEST B: Force Delta Failure -> Checkpoint Unchanged & Delta Rolled Back
    // -------------------------------------------------------------------------
    console.log('\n[Test B] Forcing Delta Application Error (simulating parse/constraint failure)...');
    const resultB = await db.advanceCheckpointSafely(tenantId, deviceId, 12, async () => {
      db.store.products.set('p-atomic-corrupt', { id: 'p-atomic-corrupt', name: 'Corrupt' });
      throw new Error('Simulated payload deserialization corruption');
    });

    const cpB = await db.getCheckpoint(tenantId, deviceId);
    const prodB = db.store.products.get('p-atomic-corrupt');

    if (!resultB.success && cpB === 11 && !prodB) {
      console.log(`  ✅ Passed: Delta failure rolled back completely. Checkpoint unchanged at ${cpB}.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: State mutated despite delta failure: cp=${cpB}, itemExists=${Boolean(prodB)}`);
    }

    // -------------------------------------------------------------------------
    // TEST C: Force Checkpoint Failure -> Entire Transaction Rolled Back
    // -------------------------------------------------------------------------
    console.log('\n[Test C] Forcing Checkpoint Write Failure (simulating metadata write crash)...');
    const dbC = new TransactionalDatabase();
    await dbC.putCheckpointInCurrentTransaction(tenantId, deviceId, 10);
    
    // Override putCheckpoint to throw
    dbC.putCheckpointInCurrentTransaction = async () => {
      throw new Error('Simulated IndexedDB checkpoint write IO error');
    };

    const resultC = await dbC.advanceCheckpointSafely(tenantId, deviceId, 11, async () => {
      dbC.store.products.set('p-atomic-rollback', { id: 'p-atomic-rollback', name: 'Should Rollback' });
    });

    const cpC = await dbC.getCheckpoint(tenantId, deviceId);
    const prodC = dbC.store.products.get('p-atomic-rollback');

    if (!resultC.success && cpC === 10 && !prodC) {
      console.log(`  ✅ Passed: Checkpoint failure caused complete rollback of delta entity.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Entity persisted despite checkpoint failure.`);
    }

    // -------------------------------------------------------------------------
    // TEST D: Monotonic Checkpoint Regression Rejected (v9 < v11)
    // -------------------------------------------------------------------------
    console.log('\n[Test D] Attempting Checkpoint Regression (serverVersion 9 < current 11)...');
    const resultD = await db.advanceCheckpointSafely(tenantId, deviceId, 9, async () => {
      db.store.products.set('p-atomic-regress', { id: 'p-atomic-regress', name: 'Regress' });
    });

    const cpD = await db.getCheckpoint(tenantId, deviceId);
    const prodD = db.store.products.get('p-atomic-regress');

    if (!resultD.success && cpD === 11 && !prodD) {
      console.log(`  ✅ Passed: Checkpoint regression strictly rejected. Checkpoint remains ${cpD}.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Checkpoint regression was improperly permitted.`);
    }

    // -------------------------------------------------------------------------
    // TEST E: Replay Same Version (v11) Idempotence
    // -------------------------------------------------------------------------
    console.log('\n[Test E] Replaying Same Version (v11 duplicate delivery)...');
    const resultE = await db.advanceCheckpointSafely(tenantId, deviceId, 11, async () => {
      db.store.products.set('p-atomic-1', { id: 'p-atomic-1', name: 'Atomic Product 1 Updated', stock: 100 });
    });

    const cpE = await db.getCheckpoint(tenantId, deviceId);
    const prodE = db.store.products.get('p-atomic-1');

    if (resultE.success && cpE === 11 && prodE && prodE.stock === 100) {
      console.log(`  ✅ Passed: Duplicate delta replay is idempotent. Checkpoint remains 11.`);
      passedTests++;
    } else {
      throw new Error(`  ❌ Failed: Idempotent replay failed: cp=${cpE}`);
    }

    console.log('\n================================================================');
    console.log(`🎉 ALL ATOMIC DELTA + CHECKPOINT TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Atomic Delta Checkpoint Test Suite Failure:', err);
    process.exit(1);
  }
}

runAtomicDeltaCheckpointTestSuite();
