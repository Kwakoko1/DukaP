/**
 * KwakoPos — Server Checkpoint Repository
 * 
 * Manages monotonic server watermark cursors (sinceVersion) per tenant & device.
 * Enforces monotonic progression and transactional atomicity during delta synchronization.
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

  /**
   * Puts checkpoint record in the CURRENT active Dexie transaction without opening a new transaction.
   * Enforces monotonic checkpoint progression and propagates errors for automatic transaction rollback.
   */
  async putCheckpointInCurrentTransaction(
    tenantId: string,
    deviceId: string,
    serverVersion: number
  ): Promise<void> {
    const dbAny = db as any;
    const id = `${tenantId}_${deviceId}`;

    // Monotonic Checkpoint Protection
    const currentRec = dbAny.serverCheckpoints ? await dbAny.serverCheckpoints.get(id) : null;
    const currentMeta = await db.syncMetadata.get('lastSyncVersion');
    const currentVersion = Math.max(
      Number(currentRec?.lastServerVersion || 0),
      Number(currentMeta?.value || 0)
    );

    if (serverVersion < currentVersion) {
      throw new Error(`Checkpoint regression rejected: new version ${serverVersion} < current version ${currentVersion}`);
    }

    const record: ServerCheckpointRecord = {
      id,
      tenantId,
      deviceId,
      lastServerVersion: serverVersion,
      lastSyncedAt: Date.now(),
    };

    if (dbAny.serverCheckpoints) {
      await dbAny.serverCheckpoints.put(record);
    }

    await db.syncMetadata.put({
      key: 'lastSyncVersion',
      value: serverVersion,
      updatedAt: Date.now(),
    });
  },

  /**
   * Standalone checkpoint update wrapped in an explicit transaction if needed.
   */
  async updateCheckpoint(tenantId: string, deviceId: string, serverVersion: number): Promise<void> {
    if (!db.isOpen()) await db.open();
    const dbAny = db as any;
    const tables = [db.syncMetadata];
    if (dbAny.serverCheckpoints) {
      tables.push(dbAny.serverCheckpoints);
    }

    await db.transaction('rw', tables, async () => {
      await this.putCheckpointInCurrentTransaction(tenantId, deviceId, serverVersion);
    });
  }
};
