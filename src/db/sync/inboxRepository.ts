/**
 * KwakoPos — Server Inbox Change Stream Repository
 * 
 * Tracks incoming delta stream changes from server, ensuring unapplied changes
 * are applied deterministically before advancing local checkpoints.
 */

import { db } from '../dexie';
import type { SyncInboxRecord } from '../database/schema';

export const inboxRepository = {
  async enqueueIncomingChanges(changes: SyncInboxRecord[]): Promise<void> {
    if (changes.length === 0) return;
    try {
      if (!db.isOpen()) await db.open();
      const dbAny = db as any;
      if (!dbAny.syncInbox) return;
      const recordsToPut = changes.map((c) => ({
        ...c,
        tenant_id: c.tenantId,
        status: c.status || 'RECEIVED',
        receivedAt: c.receivedAt || Date.now(),
      }));
      await dbAny.syncInbox.bulkPut(recordsToPut as any);
    } catch (err) {
      console.warn('[InboxRepository] enqueueIncomingChanges notice:', err);
    }
  },

  async getUnappliedChanges(tenantId: string): Promise<SyncInboxRecord[]> {
    try {
      if (!db.isOpen()) await db.open();
      const dbAny = db as any;
      if (!dbAny.syncInbox) return [];
      const items = await dbAny.syncInbox.where('status').equals('RECEIVED').toArray();
      return (items as any[]).filter(
        (i) => !tenantId || i.tenant_id === tenantId || i.tenantId === tenantId
      ) as SyncInboxRecord[];
    } catch {
      return [];
    }
  },

  async markChangeApplied(id: string): Promise<void> {
    try {
      const dbAny = db as any;
      if (!dbAny.syncInbox) return;
      const rec = await dbAny.syncInbox.get(id);
      if (rec) {
        rec.status = 'APPLIED';
        rec.appliedAt = Date.now();
        await dbAny.syncInbox.put(rec);
      }
    } catch (err) {
      console.warn('[InboxRepository] markChangeApplied notice:', err);
    }
  }
};
