/**
 * KwakoPos — Canonical Product Repository
 */

import { db } from '../dexie';
import type { Product } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const productRepository = {
  async findById(id: string): Promise<Product | undefined> {
    if (!db.isOpen()) await db.open();
    return db.products.get(id);
  },

  async findByTenant(tenantId: string): Promise<Product[]> {
    if (!db.isOpen()) await db.open();
    const prods = await db.products.where('tenant_id').equals(tenantId).toArray();
    return prods.filter((p) => !p.deletedAt);
  },

  async saveProduct(product: Product): Promise<Product> {
    const tenantId = product.tenant_id || product.tenantId || 'tenant-default';
    const isNew = !product.id || !(await this.findById(product.id));
    const entityToSave: Product = {
      ...product,
      id: product.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      updatedAt: Date.now(),
      createdAt: product.createdAt || Date.now(),
    };
    return localWriteCoordinator.executeAtomicMutation(
      'products',
      entityToSave,
      isNew ? 'CREATE' : 'UPDATE',
      tenantId,
      product.branch_id
    );
  },

  async deleteProduct(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing) {
      await localWriteCoordinator.executeAtomicMutation(
        'products',
        existing,
        'DELETE',
        tenantId,
        existing.branch_id
      );
    }
  }
};
