/**
 * KwakoPos — Server Checkpoint Repository
 * 
 * Manages monotonic server watermark cursors (sinceVersion) per tenant & device.
 */

import { db } from '../dexie';
import type { ServerCheckpointRecord } from '../database/schema';

export const checkpointRepository = {
  async getCheckpoint(tenantId: string, deviceId: string): Promise<ServerCheckpointRecord | null> {
    try {
      if (!db.isOpen()) await db.open();
      const dbAny = db as any;
      const id = `${tenantId}_${deviceId}`;
      const rec = dbAny.serverCheckpoints ? await dbAny.serverCheckpoints.get(id) : null;
      if (rec) return rec as ServerCheckpointRecord;
      
      const watermarkObj = await db.syncMetadata.get('lastSyncVersion');
      return {
        id,
        tenantId,
        deviceId,
        lastServerVersion: Number(watermarkObj?.value || 0),
        lastSyncedAt: Date.now(),
      };
    } catch {
      return null;
    }
  },

  async updateCheckpoint(tenantId: string, deviceId: string, serverVersion: number): Promise<void> {
    try {
      if (!db.isOpen()) await db.open();
      const dbAny = db as any;
      const id = `${tenantId}_${deviceId}`;
      const rec: ServerCheckpointRecord = {
        id,
        tenantId,
        deviceId,
        lastServerVersion: serverVersion,
        lastSyncedAt: Date.now(),
      };
      if (dbAny.serverCheckpoints) {
        await dbAny.serverCheckpoints.put(rec as any);
      }
      await db.syncMetadata.put({ key: 'lastSyncVersion', value: serverVersion, updatedAt: Date.now() });
    } catch (err) {
      console.warn('[CheckpointRepository] updateCheckpoint notice:', err);
    }
  }
};
