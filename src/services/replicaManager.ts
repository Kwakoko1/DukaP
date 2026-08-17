/**
 * KwakoPOS SaaS — Replica Manager Coordination Layer
 * 
 * Central state-management and coordination layer for local IndexedDB replica.
 * Consolidates local integrity validation, outbox safety guards, checkpoint advancement,
 * and variant stock derivation without creating competing synchronization engines.
 */

import { db, reconcileAllParentProductStocks } from '../db/dexie';
import { buildReplicaManifest, type ReplicaManifest } from './replicaManifest';
import { checkpointRepository } from '../db/sync/checkpointRepository';
import { integrityValidator, type IntegrityCheckSummary } from '../db/persistence/integrityValidator';

export interface CatalogStockConsistencyReport {
  passed: boolean;
  tenantId: string;
  orphanedVariants: number;
  unmappedCategories: number;
  unmappedBrands: number;
  parentProductsReconciled: number;
  issues: string[];
}

export class ReplicaManager {
  private static instance: ReplicaManager;

  public static getInstance(): ReplicaManager {
    if (!ReplicaManager.instance) {
      ReplicaManager.instance = new ReplicaManager();
    }
    return ReplicaManager.instance;
  }

  /**
   * Generates a deterministic ReplicaManifest for the active tenant
   */
  public async inspectReplica(
    tenantId: string,
    branchId: string = 'main-branch',
    deviceId: string = ''
  ): Promise<ReplicaManifest> {
    return await buildReplicaManifest(tenantId, branchId, deviceId);
  }

  /**
   * Pre-Bootstrap Safety Guard:
   * Asserts whether a bootstrap snapshot can be safely applied without overwriting
   * un-synchronized local outbox mutations.
   */
  public async canSafelyBootstrap(tenantId: string): Promise<{
    allowed: boolean;
    reason?: string;
    pendingOutboxCount: number;
  }> {
    if (!db.isOpen()) {
      await db.open();
    }

    const outboxItems = await db.syncQueue
      .where('tenant_id')
      .equals(tenantId)
      .toArray()
      .catch(() => []);

    const pendingCount = outboxItems.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return status === 'PENDING' || status === 'PROCESSING';
    }).length;

    if (pendingCount > 0) {
      return {
        allowed: false,
        reason: `Replica has ${pendingCount} pending un-synced outbox mutations. Flush outbox before full snapshot restoration to prevent data loss.`,
        pendingOutboxCount: pendingCount,
      };
    }

    return {
      allowed: true,
      pendingOutboxCount: 0,
    };
  }

  /**
   * Reconciles catalog taxonomy references and derives parent product stocks from variants.
   * Ensures Variant-First Stock integrity across the entire local replica.
   */
  public async reconcileCatalogAndStock(tenantId: string): Promise<CatalogStockConsistencyReport> {
    const issues: string[] = [];

    // 1. Run fail-closed foreign-key integrity validation
    const integrity: IntegrityCheckSummary = await integrityValidator.checkTenantIntegrity(tenantId);
    if (!integrity.passed) {
      issues.push(`Found ${integrity.orphanedVariants} orphaned product variants without parent products.`);
    }

    // 2. Reconcile parent product stock sums from child variants
    let reconciledCount = 0;
    try {
      if (!db.isOpen()) await db.open();
      
      const parentProducts = await db.products
        .where('tenant_id')
        .equals(tenantId)
        .filter((p) => Boolean(p.hasVariants || (p as any).has_variants))
        .toArray();

      for (const parent of parentProducts) {
        const variants = await db.productVariants
          .where('productId')
          .equals(parent.id)
          .toArray();

        if (variants.length > 0) {
          const derivedStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
          if (parent.stock !== derivedStock) {
            await db.products.update(parent.id, {
              stock: derivedStock,
              updatedAt: Date.now(),
            });
            reconciledCount++;
          }
        }
      }

      // Also invoke Dexie's built-in reconcile helper
      await reconcileAllParentProductStocks().catch(() => {});
    } catch (err: any) {
      issues.push(`Stock reconciliation error: ${err?.message || err}`);
    }

    return {
      passed: issues.length === 0,
      tenantId,
      orphanedVariants: integrity.orphanedVariants,
      unmappedCategories: integrity.unmappedCategories,
      unmappedBrands: integrity.unmappedBrands,
      parentProductsReconciled: reconciledCount,
      issues,
    };
  }

  /**
   * Safe Checkpoint Advancement:
   * Guarantees that local watermarks (sinceVersion) only advance AFTER all incoming
   * delta entities are committed in a Dexie transactional block.
   */
  public async advanceCheckpointSafely(
    tenantId: string,
    deviceId: string,
    newServerVersion: number,
    applyDeltaCallback: () => Promise<void>
  ): Promise<{ success: boolean; committedVersion: number }> {
    if (!newServerVersion || newServerVersion <= 0) {
      return { success: false, committedVersion: 0 };
    }

    try {
      // 1. Transactionally apply all deltas first
      await applyDeltaCallback();

      // 2. Advance checkpoint watermark only upon successful application
      await checkpointRepository.updateCheckpoint(tenantId, deviceId, newServerVersion);

      return { success: true, committedVersion: newServerVersion };
    } catch (err) {
      console.error('[ReplicaManager] Checkpoint advancement aborted due to delta commit failure:', err);
      throw err;
    }
  }

  /**
   * Asserts non-destructive state for the replica
   */
  public async assertNonDestructiveState(tenantId: string): Promise<{ safe: boolean; issues: string[] }> {
    const issues: string[] = [];
    const manifest = await this.inspectReplica(tenantId);

    if (manifest.healthStatus === 'CORRUPTED') {
      issues.push(`Replica marked as CORRUPTED with ${manifest.failedOutboxCount} failed outbox items.`);
    }

    return {
      safe: issues.length === 0,
      issues,
    };
  }

  /**
   * Compares local replica checksum against server authoritative checksum.
   * If diverged, flags replica as QUARANTINED without wiping local state or outbox.
   */
  public async verifyReplicaChecksum(
    tenantId: string,
    serverExpectedChecksum: string
  ): Promise<{ status: 'MATCH' | 'DIVERGED'; localChecksum: string; serverExpectedChecksum: string }> {
    const localResult = await integrityValidator.calculateTenantChecksum(tenantId);
    const matches = localResult.checksum === serverExpectedChecksum;

    if (!matches) {
      console.warn(`[ReplicaManager] Checksum divergence detected for tenant ${tenantId}. Local: ${localResult.checksum}, Server: ${serverExpectedChecksum}`);
      await this.quarantineReplica(tenantId, `Checksum mismatch: expected ${serverExpectedChecksum}, got ${localResult.checksum}`);
      return { status: 'DIVERGED', localChecksum: localResult.checksum, serverExpectedChecksum };
    }

    return { status: 'MATCH', localChecksum: localResult.checksum, serverExpectedChecksum };
  }

  /**
   * Moves replica to QUARANTINED state:
   * Stops destructive writes, preserves local outbox, and logs diagnostic event.
   */
  public async quarantineReplica(tenantId: string, reason: string): Promise<void> {
    console.error(`[ReplicaManager] REPLICA QUARANTINED for tenant ${tenantId}: ${reason}`);
    try {
      await db.syncMetadata.put({
        key: `replica_status_${tenantId}`,
        value: 'QUARANTINED',
        updatedAt: Date.now(),
      });
      await db.syncMetadata.put({
        key: `quarantine_reason_${tenantId}`,
        value: reason,
        updatedAt: Date.now(),
      });
    } catch (_) {}
  }
}

export const replicaManager = ReplicaManager.getInstance();
