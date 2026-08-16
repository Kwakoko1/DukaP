/**
 * KwakoPos — Canonical Supplier Repository
 */

import { db } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export interface SupplierRecord {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  tenant_id: string;
}

export const supplierRepository = {
  async findByTenant(tenantId: string): Promise<SupplierRecord[]> {
    if (!db.isOpen()) await db.open();
    return (await db.suppliers.where('tenant_id').equals(tenantId).toArray()) as SupplierRecord[];
  },

  async saveSupplier(supplier: SupplierRecord): Promise<SupplierRecord> {
    const id = supplier.id || `supp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: SupplierRecord = { ...supplier, id };
    return localWriteCoordinator.executeAtomicMutation('suppliers', rec, supplier.id ? 'UPDATE' : 'CREATE', supplier.tenant_id);
  }
};
