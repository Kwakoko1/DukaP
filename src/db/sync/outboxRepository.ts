/**
 * KwakoPos — Durable Outbox Sync Queue Repository
 * 
 * Manages local mutation queuing, idempotency checks, retry tracking,
 * and state transitions (PENDING -> PROCESSING -> SYNCED / FAILED / CONFLICT / DEAD_LETTER).
 */

import { db } from '../dexie';
import type { SyncOutboxRecord } from '../database/schema';

export const outboxRepository = {
  async getPendingMutations(tenantId: string): Promise<SyncOutboxRecord[]> {
    try {
      if (!db.isOpen()) await db.open();
      if (tenantId) {
        try {
          const [pendingRows, processingRows] = await Promise.all([
            db.syncQueue.where('[tenant_id+status]').equals([tenantId, 'PENDING']).toArray(),
            db.syncQueue.where('[tenant_id+status]').equals([tenantId, 'PROCESSING']).toArray(),
          ]);
          return ([...pendingRows, ...processingRows] as unknown) as SyncOutboxRecord[];
        } catch {
          // Fallback to in-memory filter if compound index is pending upgrade
        }
      }
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

  async bulkEnqueueMutations(mutations: SyncOutboxRecord[], tx?: any): Promise<void> {
    if (mutations.length === 0) return;
    const recordsToSave = mutations.map((mutation) => ({
      ...mutation,
      tenant_id: mutation.tenantId,
      status: 'PENDING',
      createdAt: mutation.createdAt || Date.now(),
    }));

    if (tx) {
      await tx.table('syncQueue').bulkPut(recordsToSave);
    } else {
      await db.syncQueue.bulkPut(recordsToSave as any);
    }
  },

  async markMutationProcessing(id: string | number): Promise<void> {
    try {
      const rec = (await db.syncQueue.get(id as any)) as any;
      if (rec) {
        rec.status = 'PROCESSING';
        rec.last_attempt = Date.now();
        await db.syncQueue.put(rec);
      }
    } catch (err) {
      console.warn('[OutboxRepository] markMutationProcessing warning:', err);
    }
  },

  async markMutationSynced(id: string | number): Promise<void> {
    try {
      const rec = (await db.syncQueue.get(id as any)) as any;
      if (rec) {
        rec.status = 'SYNCED';
        await db.syncQueue.put(rec);
      }
    } catch (err) {
      console.warn('[OutboxRepository] markMutationSynced warning:', err);
    }
  },

  async markMutationFailed(id: string | number, errorMsg: string): Promise<void> {
    try {
      const rec = (await db.syncQueue.get(id as any)) as any;
      if (rec) {
        const nextRetry = (rec.retry_count || rec.retryCount || 0) + 1;
        rec.retry_count = nextRetry;
        rec.retryCount = nextRetry;
        rec.last_attempt = Date.now();
        rec.last_error = errorMsg;
        rec.lastError = errorMsg;
        rec.error = errorMsg;
        // If retried more than 10 times with persistent error, transition to DEAD_LETTER
        rec.status = nextRetry > 10 ? 'DEAD_LETTER' : 'FAILED';
        await db.syncQueue.put(rec);
      }
    } catch (err) {
      console.warn('[OutboxRepository] markMutationFailed warning:', err);
    }
  },

  async markMutationConflict(id: string | number, conflictDetail: string): Promise<void> {
    try {
      const rec = (await db.syncQueue.get(id as any)) as any;
      if (rec) {
        rec.status = 'CONFLICT';
        rec.last_error = conflictDetail;
        rec.last_attempt = Date.now();
        await db.syncQueue.put(rec);
      }
    } catch (err) {
      console.warn('[OutboxRepository] markMutationConflict warning:', err);
    }
  },

  async markMutationDeadLetter(id: string | number, reason: string): Promise<void> {
    try {
      const rec = (await db.syncQueue.get(id as any)) as any;
      if (rec) {
        rec.status = 'DEAD_LETTER';
        rec.last_error = reason;
        rec.last_attempt = Date.now();
        await db.syncQueue.put(rec);
      }
    } catch (err) {
      console.warn('[OutboxRepository] markMutationDeadLetter warning:', err);
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
