/**
 * KwakoPos — Durable Outbox Sync Queue Repository
 * 
 * Manages local mutation queuing, idempotency checks, retry tracking,
 * and state transitions (PENDING -> PROCESSING -> SYNCED / FAILED).
 */

import { db } from '../dexie';
import type { SyncOutboxRecord } from '../database/schema';

export const outboxRepository = {
  async getPendingMutations(tenantId: string): Promise<SyncOutboxRecord[]> {
    try {
      if (!db.isOpen()) await db.open();
      const records = await db.syncQueue.toArray();
      return (records as any[]).filter((r) => {
        const matchesTenant = !tenantId || r.tenant_id === tenantId || r.tenantId === tenantId;
        const status = String(r.status || '').toUpperCase();
        const isPending = status === 'PENDING' || status === 'PROCESSING';
        return matchesTenant && isPending;
      }) as SyncOutboxRecord[];
    } catch {
      return [];
    }
  },

  async enqueueMutation(mutation: SyncOutboxRecord, tx?: any): Promise<void> {
    const recordToSave = {
      ...mutation,
      tenant_id: mutation.tenantId,
      status: 'PENDING',
      createdAt: mutation.createdAt || Date.now(),
    };

    if (tx) {
      await tx.table('syncQueue').put(recordToSave);
    } else {
      await db.syncQueue.put(recordToSave as any);
    }
  },

  async markMutationSynced(id: string): Promise<void> {
    try {
      const rec = (await db.syncQueue.get(id)) as any;
      if (rec) {
        rec.status = 'Synced';
        await db.syncQueue.put(rec);
      }
    } catch (err) {
      console.warn('[OutboxRepository] markMutationSynced warning:', err);
    }
  },

  async markMutationFailed(id: string, errorMsg: string): Promise<void> {
    try {
      const rec = (await db.syncQueue.get(id)) as any;
      if (rec) {
        rec.status = 'Failed';
        rec.last_error = errorMsg;
        rec.retry_count = (rec.retry_count || 0) + 1;
        rec.last_attempt = Date.now();
        await db.syncQueue.put(rec);
      }
    } catch (err) {
      console.warn('[OutboxRepository] markMutationFailed warning:', err);
    }
  },

  async getPendingCount(tenantId?: string): Promise<number> {
    try {
      const pending = await this.getPendingMutations(tenantId || '');
      return pending.length;
    } catch {
      return 0;
    }
  }
};
