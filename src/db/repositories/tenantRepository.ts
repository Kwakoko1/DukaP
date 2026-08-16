/**
 * KwakoPos — Canonical Tenant Repository
 */

import { db } from '../dexie';
import type { Tenant } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const tenantRepository = {
  async findById(id: string): Promise<Tenant | undefined> {
    if (!db.isOpen()) await db.open();
    return db.tenants.get(id);
  },

  async saveTenant(tenant: Tenant): Promise<Tenant> {
    const rec: Tenant = { ...tenant };
    return localWriteCoordinator.executeAtomicMutation('tenants', rec, 'UPDATE', tenant.id);
  }
};
