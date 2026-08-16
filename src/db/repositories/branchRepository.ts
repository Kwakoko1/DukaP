/**
 * KwakoPos — Canonical Branch Repository
 */

import { db } from '../dexie';
import type { Branch } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const branchRepository = {
  async findByTenant(tenantId: string): Promise<Branch[]> {
    if (!db.isOpen()) await db.open();
    return db.branches.where('tenant_id').equals(tenantId).toArray();
  },

  async saveBranch(branch: Branch): Promise<Branch> {
    const id = branch.id || `br_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: Branch = { ...branch, id };
    return localWriteCoordinator.executeAtomicMutation('branches', rec, branch.id ? 'UPDATE' : 'CREATE', branch.tenant_id, branch.id);
  }
};
