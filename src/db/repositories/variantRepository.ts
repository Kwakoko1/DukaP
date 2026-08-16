/**
 * KwakoPos — Canonical Variant Repository
 */

import { db } from '../dexie';
import type { ProductVariant } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const variantRepository = {
  async findByProduct(productId: string): Promise<ProductVariant[]> {
    if (!db.isOpen()) await db.open();
    const vars = await db.productVariants.where('productId').equals(productId).toArray();
    return vars.filter((v: any) => !v.deletedAt);
  },

  async saveVariant(variant: ProductVariant): Promise<ProductVariant> {
    const tenantId = variant.tenant_id || 'tenant-default';
    const id = variant.id || `var_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: ProductVariant = { ...variant, id, updatedAt: Date.now() };
    return localWriteCoordinator.executeAtomicMutation('productVariants', rec, variant.id ? 'UPDATE' : 'CREATE', tenantId, variant.branch_id);
  },

  async deleteVariant(id: string, tenantId: string): Promise<void> {
    const rec = await db.productVariants.get(id);
    if (rec) {
      await localWriteCoordinator.executeAtomicMutation('productVariants', rec, 'DELETE', tenantId, rec.branch_id);
    }
  }
};
