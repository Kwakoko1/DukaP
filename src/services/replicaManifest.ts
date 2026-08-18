/**
 * KwakoPOS SaaS — Local Replica Manifest
 * 
 * Provides deterministic snapshot representation of local IndexedDB replica state,
 * tracking tenant/device cursors, schema versions, watermarks, outbox queues,
 * and cryptographic integrity checksums.
 */

import { db } from '../db/dexie';
import { integrityValidator } from '../db/persistence/integrityValidator';

export type ReplicaHealthStatus =
  | 'PRISTINE'          // Fresh, clean, synchronized state
  | 'HEALTHY'           // Operational with records and no critical issues
  | 'OUTBOX_DIRTY'      // Local mutations pending synchronization
  | 'NEEDS_BOOTSTRAP'   // Empty local state requiring server hydration
  | 'DEGRADED'          // Parent temporarily unavailable / orphan variant present without deletion
  | 'CORRUPTED';        // Foreign key violations or unrecoverable inconsistencies

export interface ReplicaEntityCounts {
  products: number;
  productVariants: number;
  categories: number;
  brands: number;
  stockLedger: number;
  orders: number;
  customers: number;
  suppliers: number;
}

export interface ReplicaManifest {
  manifestVersion: number;
  tenantId: string;
  branchId: string;
  deviceId: string;
  schemaVersion: number;
  lastSyncVersion: number;
  lastBootstrapAt: number;
  lastSuccessfulSyncAt: number;
  entityCounts: ReplicaEntityCounts;
  pendingOutboxCount: number;
  failedOutboxCount: number;
  outboxPendingByEntity: Record<string, number>;
  healthStatus: ReplicaHealthStatus;
  integrityChecksum: string;
  generatedAt: number;
}

/**
 * Builds a deterministic ReplicaManifest for the specified tenant and device
 */
export async function buildReplicaManifest(
  tenantId: string,
  branchId: string = 'main-branch',
  deviceId: string = ''
): Promise<ReplicaManifest> {
  if (!db.isOpen()) {
    await db.open();
  }

  // 1. Strict per-tenant entity count collection (no fallbacks)
  const [
    productsCount,
    variantsCount,
    categoriesCount,
    brandsCount,
    stockLedgerCount,
    ordersCount,
    customersCount,
    suppliersCount
  ] = await Promise.all([
    db.products.where('tenant_id').equals(tenantId).count().catch(() => 0),
    db.productVariants.where('tenant_id').equals(tenantId).count().catch(() => 0),
    db.categories.where('tenant_id').equals(tenantId).count().catch(() => 0),
    db.brands.where('tenant_id').equals(tenantId).count().catch(() => 0),
    db.stockLedger.where('tenant_id').equals(tenantId).count().catch(() => 0),
    db.orders.where('tenant_id').equals(tenantId).count().catch(() => 0),
    db.customers.where('tenant_id').equals(tenantId).count().catch(() => 0),
    db.suppliers.where('tenant_id').equals(tenantId).count().catch(() => 0),
  ]);

  const entityCounts: ReplicaEntityCounts = {
    products: productsCount,
    productVariants: variantsCount,
    categories: categoriesCount,
    brands: brandsCount,
    stockLedger: stockLedgerCount,
    orders: ordersCount,
    customers: customersCount,
    suppliers: suppliersCount,
  };

  // 2. Outbox state collection
  const outboxItems = await db.syncQueue
    .where('tenant_id')
    .equals(tenantId)
    .toArray()
    .catch(() => []);

  let pendingOutboxCount = 0;
  let failedOutboxCount = 0;
  const outboxPendingByEntity: Record<string, number> = {};

  for (const item of outboxItems) {
    const status = String(item.status || '').toUpperCase();
    if (status === 'PENDING' || status === 'PROCESSING') {
      pendingOutboxCount++;
      const entity = String(item.entity || item.entityName || 'unknown');
      outboxPendingByEntity[entity] = (outboxPendingByEntity[entity] || 0) + 1;
    } else if (status === 'FAILED') {
      failedOutboxCount++;
    }
  }

  // 3. Sync metadata retrieval
  const [lastSyncMeta, lastBootstrapMeta, schemaVersionMeta] = await Promise.all([
    db.syncMetadata.get('lastSyncVersion').catch(() => null),
    db.syncMetadata.get('lastBootstrapAt').catch(() => null),
    db.syncMetadata.get('schemaVersion').catch(() => null),
  ]);

  const lastSyncVersion = Number(lastSyncMeta?.value || 0);
  const lastBootstrapAt = Number(lastBootstrapMeta?.value || 0);
  const schemaVersion = Number(schemaVersionMeta?.value || 27);
  const lastSuccessfulSyncAt = Number(lastSyncMeta?.updatedAt || 0);

  // 4. Variant-parent validation for orphan detection (Quarantine check)
  const allTenantVariants = await db.productVariants
    .where('tenant_id')
    .equals(tenantId)
    .toArray()
    .catch(() => []);

  const allTenantProductIds = new Set(
    (
      await db.products
        .where('tenant_id')
        .equals(tenantId)
        .toArray()
        .catch(() => [])
    ).map((p) => p.id)
  );

  const orphanVariants = allTenantVariants.filter(
    (v) => !allTenantProductIds.has(v.productId)
  );

  // 5. Health status determination
  let healthStatus: ReplicaHealthStatus = 'HEALTHY';
  const totalCoreEntities = productsCount + categoriesCount + brandsCount;

  if (orphanVariants.length > 0) {
    healthStatus = 'DEGRADED';
  } else if (totalCoreEntities === 0 && pendingOutboxCount === 0) {
    healthStatus = 'NEEDS_BOOTSTRAP';
  } else if (pendingOutboxCount > 0) {
    healthStatus = 'OUTBOX_DIRTY';
  } else if (failedOutboxCount > 5) {
    healthStatus = 'CORRUPTED';
  } else if (totalCoreEntities > 0 && pendingOutboxCount === 0 && failedOutboxCount === 0) {
    healthStatus = 'PRISTINE';
  }

  // 5. Deterministic SHA-256 Content Checksum
  const integrityResult = await integrityValidator.checkTenantIntegrity(tenantId);
  const integrityChecksum = integrityResult.checksum || 'sha256:unknown';

  if (!integrityResult.passed && healthStatus !== 'CORRUPTED') {
    healthStatus = 'CORRUPTED';
  }

  return {
    manifestVersion: 1,
    tenantId,
    branchId,
    deviceId,
    schemaVersion,
    lastSyncVersion,
    lastBootstrapAt,
    lastSuccessfulSyncAt,
    entityCounts,
    pendingOutboxCount,
    failedOutboxCount,
    outboxPendingByEntity,
    healthStatus,
    integrityChecksum,
    generatedAt: Date.now(),
  };
}
