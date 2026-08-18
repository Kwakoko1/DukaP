/**
 * KwakoPOS SaaS — Replica Manager Coordination Layer
 * 
 * Central state-management and coordination layer for local IndexedDB replica.
 * Consolidates local integrity validation, outbox safety guards, atomic checkpoint advancement,
 * and variant stock derivation without creating competing synchronization engines.
 */

import { db } from '../db/dexie';
import { buildReplicaManifest, type ReplicaManifest } from './replicaManifest';
import { checkpointRepository } from '../db/sync/checkpointRepository';
import { integrityValidator, type IntegrityCheckSummary } from '../db/persistence/integrityValidator';
import { derivedProjectionRepository } from '../db/persistence/derivedProjectionRepository';

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

  private constructor() {}

  public static getInstance(): ReplicaManager {
    if (!ReplicaManager.instance) {
      ReplicaManager.instance = new ReplicaManager();
    }
    return ReplicaManager.instance;
  }

  /**
   * Diagnostic inspection of local replica state without mutating business data
   */
  public async inspectReplica(
    tenantId: string,
    branchId: string = 'main-branch',
    deviceId: string = ''
  ): Promise<ReplicaManifest> {
    try {
      return await buildReplicaManifest(tenantId, branchId, deviceId);
    } catch (err: any) {
      console.error('[ReplicaManager] inspectReplica error:', err.message || err);
      return {
        manifestVersion: 1,
        tenantId,
        branchId,
        deviceId,
        schemaVersion: 41,
        lastSyncVersion: 0,
        lastBootstrapAt: 0,
        lastSuccessfulSyncAt: 0,
        entityCounts: {
          products: 0,
          productVariants: 0,
          categories: 0,
          brands: 0,
          stockLedger: 0,
          orders: 0,
          customers: 0,
          suppliers: 0,
        },
        pendingOutboxCount: 0,
        failedOutboxCount: 0,
        outboxPendingByEntity: {},
        healthStatus: 'CORRUPTED',
        integrityChecksum: 'sha256:corrupted',
        generatedAt: Date.now(),
      };
    }
  }

  /**
   * Evaluates if local replica has zero business records and no pending outbox mutations
   */
  public async isReplicaEmpty(tenantId: string): Promise<boolean> {
    try {
      const manifest = await this.inspectReplica(tenantId);
      const totalCoreEntities =
        manifest.entityCounts.products +
        manifest.entityCounts.categories +
        manifest.entityCounts.brands;
      
      return totalCoreEntities === 0 && manifest.pendingOutboxCount === 0;
    } catch (err: any) {
      console.error('[ReplicaManager] isReplicaEmpty error:', err.message || err);
      return false;
    }
  }

  /**
   * Pre-Bootstrap safety check ensuring uncommitted outbox mutations are not wiped
   */
  public async canSafelyBootstrap(tenantId: string): Promise<{ allowed: boolean; pendingOutboxCount: number }> {
    try {
      const manifest = await this.inspectReplica(tenantId);
      return {
        allowed: manifest.pendingOutboxCount === 0,
        pendingOutboxCount: manifest.pendingOutboxCount,
      };
    } catch (err: any) {
      console.error('[ReplicaManager] canSafelyBootstrap error:', err.message || err);
      return { allowed: false, pendingOutboxCount: 0 };
    }
  }

  /**
   * Evaluates if replica has un-synchronized local mutations
   */
  public async isOutboxDirty(tenantId: string): Promise<boolean> {
    try {
      const manifest = await this.inspectReplica(tenantId);
      return manifest.pendingOutboxCount > 0;
    } catch (err: any) {
      console.error('[ReplicaManager] isOutboxDirty error:', err.message || err);
      return false;
    }
  }

  /**
   * Evaluates if replica exhibits signs of structural or cryptographic corruption
   */
  public async isReplicaCorrupted(tenantId: string): Promise<boolean> {
    try {
      const manifest = await this.inspectReplica(tenantId);
      return manifest.healthStatus === 'CORRUPTED';
    } catch (err: any) {
      console.error('[ReplicaManager] isReplicaCorrupted error:', err.message || err);
      return true; // Fail-safe: assume corrupted on error
    }
  }

  /**
   * Validates foreign-key consistency across Catalog, Products, and Variants.
   * Reconciles parent-level stock balances using canonical derivedProjectionRepository.
   */
  public async validateCatalogAndStockConsistency(tenantId: string): Promise<CatalogStockConsistencyReport> {
    const issues: string[] = [];
    
    try {
      // 1. Run foreign-key integrity validation
      const integrity: IntegrityCheckSummary = await integrityValidator.checkTenantIntegrity(tenantId);
      if (!integrity.passed) {
        if (integrity.orphanedVariants > 0) {
          issues.push(`Found ${integrity.orphanedVariants} orphaned variants without parent products.`);
        }
        if (integrity.unmappedCategories > 0) {
          issues.push(`Found ${integrity.unmappedCategories} products referencing unknown categories.`);
        }
        if (integrity.unmappedBrands > 0) {
          issues.push(`Found ${integrity.unmappedBrands} products referencing unknown brands.`);
        }
      }

      // 2. Reconcile parent product stock sums from child variants via canonical derived projection repository
      let reconciledCount = 0;
      try {
        reconciledCount = await derivedProjectionRepository.reconcileParentVariantStock(tenantId);
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
    } catch (err: any) {
      return {
        passed: false,
        tenantId,
        orphanedVariants: 0,
        unmappedCategories: 0,
        unmappedBrands: 0,
        parentProductsReconciled: 0,
        issues: [`Catalog validation exception: ${err?.message || err}`],
      };
    }
  }

  /**
   * Atomic Delta Application & Checkpoint Advancement:
   * Guarantees that delta mutation application and checkpoint watermark progression
   * occur in ONE atomic Dexie transaction. If delta or checkpoint fails, the entire transaction rolls back.
   */
  public async advanceCheckpointSafely(
    tenantId: string,
    deviceId: string,
    newServerVersion: number,
    applyDeltaCallback: () => Promise<void>
  ): Promise<{ success: boolean; committedVersion: number }> {
    if (!newServerVersion || newServerVersion <= 0) {
      console.warn('[ReplicaManager] Invalid newServerVersion:', newServerVersion);
      return { success: false, committedVersion: 0 };
    }

    if (!tenantId || !deviceId) {
      console.error('[ReplicaManager] Missing tenantId or deviceId for checkpoint advancement');
      return { success: false, committedVersion: 0 };
    }

    try {
      if (!db.isOpen()) {
        await db.open();
      }

      const dbAny = db as any;
      const syncTables: any[] = [
        db.syncMetadata,
        db.products,
        db.productVariants,
        db.categories,
        db.brands,
        db.stockLedger,
        db.orders,
        db.customers,
        db.suppliers,
        db.syncQueue,
      ];

      if (dbAny.serverCheckpoints) {
        syncTables.push(dbAny.serverCheckpoints);
      }

      await db.transaction('rw', syncTables, async () => {
        // 1. Transactionally apply all incoming delta records
        await applyDeltaCallback();

        // 2. Transactionally update checkpoint watermark inside the same transaction
        // If this fails, delta application is rolled back
        await checkpointRepository.putCheckpointInCurrentTransaction(
          tenantId,
          deviceId,
          newServerVersion
        );
      });

      return { success: true, committedVersion: newServerVersion };
    } catch (err: any) {
      console.error('[ReplicaManager] Atomic delta/checkpoint transaction rolled back:', err.message || err);
      return { success: false, committedVersion: 0 };
    }
  }

  /**
   * Asserts non-destructive state for the replica
   */
  public async assertNonDestructiveState(tenantId: string): Promise<{ safe: boolean; issues: string[] }> {
    try {
      const issues: string[] = [];
      const manifest = await this.inspectReplica(tenantId);

      if (manifest.healthStatus === 'CORRUPTED') {
        issues.push(`Replica marked as CORRUPTED with ${manifest.failedOutboxCount} failed outbox items.`);
      }

      return {
        safe: issues.length === 0,
        issues,
      };
    } catch (err: any) {
      return {
        safe: false,
        issues: [`Error asserting non-destructive state: ${err?.message || err}`],
      };
    }
  }

  /**
   * Compares local replica checksum against server authoritative checksum.
   * If diverged, flags replica as QUARANTINED without wiping local state or outbox.
   */
  public async verifyReplicaChecksum(
    tenantId: string,
    serverExpectedChecksum: string
  ): Promise<{ status: 'MATCH' | 'DIVERGED'; localChecksum: string; serverExpectedChecksum: string }> {
    try {
      const localResult = await integrityValidator.calculateTenantChecksum(tenantId);
      const matches = localResult.checksum === serverExpectedChecksum;

      if (!matches) {
        console.warn(`[ReplicaManager] Checksum divergence detected for tenant ${tenantId}. Local: ${localResult.checksum}, Server: ${serverExpectedChecksum}`);
        await this.quarantineReplica(tenantId, `Checksum mismatch: expected ${serverExpectedChecksum}, got ${localResult.checksum}`);
        return { status: 'DIVERGED', localChecksum: localResult.checksum, serverExpectedChecksum };
      }

      return { status: 'MATCH', localChecksum: localResult.checksum, serverExpectedChecksum };
    } catch (err: any) {
      console.error('[ReplicaManager] verifyReplicaChecksum error:', err.message || err);
      return { status: 'DIVERGED', localChecksum: 'ERROR', serverExpectedChecksum };
    }
  }

  /**
   * Moves replica to QUARANTINED state:
   * Stops destructive writes, preserves local outbox, and logs diagnostic event.
   */
  public async quarantineReplica(tenantId: string, reason: string): Promise<void> {
    try {
      console.error(`[ReplicaManager] REPLICA QUARANTINED for tenant ${tenantId}: ${reason}`);
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
    } catch (err: any) {
      console.error('[ReplicaManager] quarantineReplica error:', err.message || err);
    }
  }
}

export const replicaManager = ReplicaManager.getInstance();
