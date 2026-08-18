/**
 * KwakoPOS SaaS — Derived Projection Repository
 * 
 * Owns local materialized/derived state that is calculated from authoritative domain data
 * and must NOT create business outbox mutations or alter business metadata (such as updatedAt).
 * 
 * Invariants:
 * - Deterministic, tenant-scoped, and rebuildable from authoritative domain tables.
 * - Stock Ledger = authoritative history
 * - Variant stock = materialized inventory state
 * - Parent product stock = derived projection
 */

import { db } from '../dexie';

export const derivedProjectionRepository = {
  /**
   * Reconciles parent product stock projections by summing up active child variant stocks.
   * Runs in a single read-write Dexie transaction.
   * Does NOT alter updatedAt or emit outbox sync mutations.
   */
  async reconcileParentVariantStock(tenantId: string): Promise<number> {
    if (!db.isOpen()) {
      await db.open();
    }

    let updatedCount = 0;

    await db.transaction('rw', db.products, db.productVariants, async () => {
      const products = await db.products
        .where('tenant_id')
        .equals(tenantId)
        .toArray();

      for (const product of products) {
        const variants = await db.productVariants
          .where('productId')
          .equals(product.id)
          .toArray();

        if (variants.length === 0) {
          continue;
        }

        const total = variants.reduce(
          (sum, v) => sum + Number(v.stock || 0),
          0
        );

        if (Number(product.stock) !== total) {
          await db.products.update(product.id, {
            stock: total,
          });
          updatedCount++;
        }
      }
    });

    return updatedCount;
  },

  /**
   * Global audit & reconciliation across all tenants.
   * Delegates strictly to tenant-scoped reconciliation logic.
   */
  async reconcileAllTenants(): Promise<number> {
    if (!db.isOpen()) {
      await db.open();
    }

    const distinctTenants = await db.products
      .orderBy('tenant_id')
      .uniqueKeys();

    let totalUpdated = 0;
    for (const tenantKey of distinctTenants) {
      const tenantId = String(tenantKey);
      if (tenantId) {
        totalUpdated += await this.reconcileParentVariantStock(tenantId);
      }
    }
    return totalUpdated;
  },
};
