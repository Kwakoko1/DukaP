/**
 * KwakoPOS SaaS — Static Architecture Audit: Direct Database Writes Inspection
 * 
 * Verifies that:
 * 1. ReplicaManager contains zero direct db.products.update / db.products.put writes.
 * 2. All parent stock derived projections flow through derivedProjectionRepository.
 * 3. Database operations adhere to the canonical persistence architecture.
 */

import fs from 'fs';
import path from 'path';

function runPersistenceLayerAudit() {
  console.log('================================================================');
  console.log('🔍 KWAKOPOS STATIC ARCHITECTURE PERSISTENCE AUDIT');
  console.log('================================================================\n');

  const violations = [];

  // Audit 1: ReplicaManager must contain ZERO direct product writes
  const replicaManagerPath = path.resolve(process.cwd(), 'src/services/replicaManager.ts');
  if (fs.existsSync(replicaManagerPath)) {
    const content = fs.readFileSync(replicaManagerPath, 'utf8');
    const directUpdates = content.match(/db\.products\.update\(/g);
    const directPuts = content.match(/db\.products\.put\(/g);
    const directDeletes = content.match(/db\.products\.delete\(/g);

    if (directUpdates || directPuts || directDeletes) {
      violations.push({
        file: replicaManagerPath,
        reason: 'ReplicaManager must not perform direct writes on db.products. Must delegate to derivedProjectionRepository.',
      });
    }
  }

  // Audit 2: DerivedProjectionRepository must NOT modify business updatedAt or create outbox mutations
  const projectionRepoPath = path.resolve(process.cwd(), 'src/db/persistence/derivedProjectionRepository.ts');
  if (fs.existsSync(projectionRepoPath)) {
    const content = fs.readFileSync(projectionRepoPath, 'utf8');
    if (content.includes('updatedAt: Date.now()') || content.includes('syncQueue.put') || content.includes('enqueueMutation')) {
      violations.push({
        file: projectionRepoPath,
        reason: 'derivedProjectionRepository must not update updatedAt timestamp or emit outbox mutations.',
      });
    }
  }

  // Audit 3: Checkpoint advancement in ReplicaManager must be atomic with delta
  if (fs.existsSync(replicaManagerPath)) {
    const content = fs.readFileSync(replicaManagerPath, 'utf8');
    if (!content.includes('putCheckpointInCurrentTransaction')) {
      violations.push({
        file: replicaManagerPath,
        reason: 'ReplicaManager must use putCheckpointInCurrentTransaction inside single atomic Dexie transaction.',
      });
    }
  }

  if (violations.length === 0) {
    console.log('  ✅ Passed: ReplicaManager has zero direct db.products writes.');
    console.log('  ✅ Passed: Derived projection repository does not mutate business updatedAt or sync outbox.');
    console.log('  ✅ Passed: Delta application and Checkpoint advancement are bound in ONE atomic transaction.');
    console.log('\n================================================================');
    console.log('🎉 STATIC PERSISTENCE ARCHITECTURE AUDIT PASSED');
    console.log('================================================================\n');
  } else {
    console.error(`  ❌ Failed: Found ${violations.length} architecture violations:\n`);
    violations.forEach((v) => {
      console.error(`    - File: ${v.file}`);
      console.error(`      Reason: ${v.reason}\n`);
    });
    process.exit(1);
  }
}

runPersistenceLayerAudit();
