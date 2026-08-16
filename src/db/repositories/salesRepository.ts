/**
 * KwakoPos — Canonical Sales Order Repository
 */

import { db } from '../dexie';
import type { Order } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const salesRepository = {
  async findByTenant(tenantId: string): Promise<Order[]> {
    if (!db.isOpen()) await db.open();
    return db.orders.where('tenant_id').equals(tenantId).toArray();
  },

  async saveOrder(order: Order): Promise<Order> {
    const id = order.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: Order = { ...order, id };
    return localWriteCoordinator.executeAtomicMutation('orders', rec, order.id ? 'UPDATE' : 'CREATE', order.tenant_id, order.branch_id);
  }
};
