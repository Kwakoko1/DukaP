/**
 * KwakoPos — Canonical Customer Repository
 */

import { db } from '../dexie';
import type { Customer } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const customerRepository = {
  async findByTenant(tenantId: string): Promise<Customer[]> {
    if (!db.isOpen()) await db.open();
    return db.customers.where('tenant_id').equals(tenantId).toArray();
  },

  async saveCustomer(customer: Customer): Promise<Customer> {
    const id = customer.id || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: Customer = { ...customer, id };
    return localWriteCoordinator.executeAtomicMutation('customers', rec, customer.id ? 'UPDATE' : 'CREATE', customer.tenant_id);
  }
};
