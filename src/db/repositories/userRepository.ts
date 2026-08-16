/**
 * KwakoPos — Canonical User Repository
 */

import { db } from '../dexie';
import type { DbUser as User } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const userRepository = {
  async findById(id: string): Promise<User | undefined> {
    if (!db.isOpen()) await db.open();
    return db.users.get(id);
  },

  async findByTenant(tenantId: string): Promise<User[]> {
    if (!db.isOpen()) await db.open();
    return db.users.where('tenant_id').equals(tenantId).toArray();
  },

  async saveUser(user: User): Promise<User> {
    const id = user.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: User = { ...user, id };
    return localWriteCoordinator.executeAtomicMutation('users', rec, user.id ? 'UPDATE' : 'CREATE', user.tenant_id || '');
  }
};
