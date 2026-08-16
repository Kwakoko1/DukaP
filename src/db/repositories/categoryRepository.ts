/**
 * KwakoPos — Canonical Category Repository
 */

import { db } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export interface CategoryRecord {
  id: string;
  name: string;
  code?: string;
  description?: string;
  tenant_id: string;
  parent_id?: string | null;
  sync_version?: number;
  created_at?: number;
  deletedAt?: number;
}

export const categoryRepository = {
  async findByTenant(tenantId: string): Promise<CategoryRecord[]> {
    if (!db.isOpen()) await db.open();
    const cats = await db.categories.where('tenant_id').equals(tenantId).toArray();
    return (cats as CategoryRecord[]).filter((c) => !c.deletedAt);
  },

  async saveCategory(category: Partial<CategoryRecord> & { name: string; tenant_id: string }): Promise<CategoryRecord> {
    const id = category.id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: CategoryRecord = {
      id,
      name: category.name,
      code: category.code || '',
      description: category.description || '',
      tenant_id: category.tenant_id,
      parent_id: category.parent_id || null,
      sync_version: category.sync_version || 1,
      created_at: category.created_at || Date.now(),
    };
    return localWriteCoordinator.executeAtomicMutation('categories', rec, category.id ? 'UPDATE' : 'CREATE', category.tenant_id);
  },

  async deleteCategory(id: string, tenantId: string): Promise<void> {
    const rec = await db.categories.get(id);
    if (rec) {
      await localWriteCoordinator.executeAtomicMutation('categories', rec as any, 'DELETE', tenantId);
    }
  }
};
