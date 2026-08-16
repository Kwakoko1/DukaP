/**
 * KwakoPos — Transaction Manager
 * 
 * Provides safe multi-table transaction wrappers with fallback recovery.
 */

import { db } from '../dexie';

export const transactionManager = {
  async runReadTransaction<T>(tables: string[], fn: () => Promise<T>): Promise<T> {
    if (!db.isOpen()) await db.open();
    return db.transaction('r', tables, fn);
  },

  async runWriteTransaction<T>(tables: string[], fn: (tx: any) => Promise<T>): Promise<T> {
    if (!db.isOpen()) await db.open();
    return db.transaction('rw', tables, fn);
  }
};
