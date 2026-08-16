/**
 * KwakoPos — Canonical Brand Repository
 */

import { db } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export interface BrandRecord {
  id: string;
  name: string;
  code?: string;
  description?: string;
  tenant_id: string;
  sync_version?: number;
  created_at?: number;
  deletedAt?: number;
}

export const brandRepository = {
  async findByTenant(tenantId: string): Promise<BrandRecord[]> {
    if (!db.isOpen()) await db.open();
    const brands = await db.brands.where('tenant_id').equals(tenantId).toArray();
    return (brands as BrandRecord[]).filter((b) => !b.deletedAt);
  },

  async saveBrand(brand: Partial<BrandRecord> & { name: string; tenant_id: string }): Promise<BrandRecord> {
    const id = brand.id || `brand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: BrandRecord = {
      id,
      name: brand.name,
      code: brand.code || '',
      description: brand.description || '',
      tenant_id: brand.tenant_id,
      sync_version: brand.sync_version || 1,
      created_at: brand.created_at || Date.now(),
    };
    return localWriteCoordinator.executeAtomicMutation('brands', rec, brand.id ? 'UPDATE' : 'CREATE', brand.tenant_id);
  },

  async deleteBrand(id: string, tenantId: string): Promise<void> {
    const rec = await db.brands.get(id);
    if (rec) {
      await localWriteCoordinator.executeAtomicMutation('brands', rec as any, 'DELETE', tenantId);
    }
  }
};
