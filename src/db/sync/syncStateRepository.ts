/**
 * KwakoPos — Sync Telemetry State Repository
 * 
 * Tracks global health scores, network connection status, and monotonic HLC clock state.
 */

import { db } from '../dexie';
import type { SyncStateRecord } from '../database/schema';

export const syncStateRepository = {
  async getSyncState(): Promise<SyncStateRecord | null> {
    try {
      if (!db.isOpen()) await db.open();
      const dbAny = db as any;
      const rec = dbAny.syncState ? await dbAny.syncState.get('global_state') : null;
      if (rec) return rec as SyncStateRecord;
      return {
        id: 'global_state',
        healthScore: 100,
        lastSyncStatus: 'ONLINE',
        pendingOutboxCount: 0,
        currentHlc: new Date().toISOString(),
        updatedAt: Date.now(),
      };
    } catch {
      return null;
    }
  },

  async updateSyncState(partial: Partial<SyncStateRecord>): Promise<void> {
    try {
      if (!db.isOpen()) await db.open();
      const dbAny = db as any;
      const existing = (await this.getSyncState()) || {
        id: 'global_state',
        healthScore: 100,
        lastSyncStatus: 'ONLINE',
        pendingOutboxCount: 0,
        currentHlc: new Date().toISOString(),
        updatedAt: Date.now(),
      };
      const updated: SyncStateRecord = {
        ...existing,
        ...partial,
        updatedAt: Date.now(),
      };
      if (dbAny.syncState) {
        await dbAny.syncState.put(updated as any);
      }
    } catch (err) {
      console.warn('[SyncStateRepository] updateSyncState notice:', err);
    }
  }
};
