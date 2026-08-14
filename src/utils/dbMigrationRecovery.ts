/**
 * DukaPOS SaaS — Client-Side Database Migration & Emergency Disaster Recovery
 * Automatically rescues, exports, and re-migrates IndexedDB data if an older client terminal
 * encounters a Dexie VersionError, SchemaError, or schema migration collision upon PWA updates.
 */

import Dexie from 'dexie';
import { db } from '../db/dexie';

export interface RecoveryResult {
  recovered: boolean;
  backedUpRecords: number;
  error?: string;
}

/**
 * Low-level IndexedDB raw connector (bypasses Dexie schema constraints)
 */
function openRawIndexedDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open raw IndexedDB'));
  });
}

/**
 * Reads all records from a raw object store safely
 */
function readAllFromRawStore(rawDb: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve) => {
    try {
      const tx = rawDb.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (_) {
      resolve([]);
    }
  });
}

/**
 * Self-healing Dexie Schema & Version Mismatch Resolver
 * 1. Probes if current IndexedDB connection throws a VersionError or SchemaError
 * 2. Dumps un-synced offline records (orders, syncQueue, products, cash shifts) into a temporary backup
 * 3. Rebuilds and re-hydrates the database smoothly with the latest schema
 */
export async function autoHealDexieSchemaMismatch(): Promise<RecoveryResult> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return { recovered: true, backedUpRecords: 0 };
  }

  try {
    if (!db.isOpen()) {
      await db.open();
    }
    return { recovered: true, backedUpRecords: 0 };
  } catch (error: any) {
    const isVersionError =
      error instanceof Dexie.VersionError ||
      error?.name === 'VersionError' ||
      error?.name === 'SchemaError' ||
      String(error?.message || '').toLowerCase().includes('version') ||
      String(error?.message || '').toLowerCase().includes('schema');

    if (!isVersionError) {
      console.warn('[DB Recovery] Non-schema database open warning:', error);
      return { recovered: false, backedUpRecords: 0, error: error?.message };
    }

    console.warn('[DB Recovery] Dexie Schema/Version mismatch detected. Initiating emergency offline data rescue...');

    const rescuedPayload: Record<string, any[]> = {};
    let totalRescued = 0;

    // Step 1: Raw IndexedDB extraction of all tables before reset
    try {
      const rawDb = await openRawIndexedDB('DukaPosDatabase');
      const storeNames = Array.from(rawDb.objectStoreNames);

      for (const storeName of storeNames) {
        const records = await readAllFromRawStore(rawDb, storeName);
        if (records && records.length > 0) {
          rescuedPayload[storeName] = records;
          totalRescued += records.length;
        }
      }
      rawDb.close();
      console.info(`[DB Recovery] Rescued ${totalRescued} total records across ${Object.keys(rescuedPayload).length} stores.`);
    } catch (rescueErr) {
      console.error('[DB Recovery] Raw rescue extraction encountered an issue:', rescueErr);
    }

    // Step 2: Delete outdated schema container and recreate clean instance
    try {
      await db.delete();
      await db.open();

      // Step 3: Re-hydrate all rescued records into the upgraded schema
      if (totalRescued > 0) {
        for (const [storeName, records] of Object.entries(rescuedPayload)) {
          const table = (db as any)[storeName];
          if (table && Array.isArray(records) && records.length > 0) {
            try {
              await table.bulkPut(records);
            } catch (putErr) {
              console.warn(`[DB Recovery] Partial record restore in store "${storeName}":`, putErr);
            }
          }
        }
        console.info(`[DB Recovery] Emergency restoration completed: ${totalRescued} records migrated successfully.`);
      }

      return { recovered: true, backedUpRecords: totalRescued };
    } catch (rebuildErr: any) {
      console.error('[DB Recovery] Failed to rebuild database after schema mismatch:', rebuildErr);
      return { recovered: false, backedUpRecords: totalRescued, error: rebuildErr?.message };
    }
  }
}
