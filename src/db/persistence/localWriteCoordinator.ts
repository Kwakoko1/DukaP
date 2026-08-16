/**
 * KwakoPos — Atomic Local Write Coordinator
 * 
 * Guarantees atomic writes combining local IndexedDB entity state changes
 * and Outbox queue mutations within a single Dexie transaction.
 */

import { db } from '../dexie';
import { outboxRepository } from '../sync/outboxRepository';
import type { SyncOutboxRecord } from '../database/schema';

export const localWriteCoordinator = {
  /**
   * Performs an atomic IndexedDB transaction containing the business record mutation
   * AND the durable outbox queue record.
   */
  async executeAtomicMutation<T extends { id: string }>(
    tableName: string,
    entity: T,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    tenantId: string,
    branchId?: string
  ): Promise<T> {
    if (!db.isOpen()) await db.open();

    let deviceId = 'device-default';
    try {
      deviceId = localStorage.getItem('dukapos_device_id') || 'device-default';
    } catch (_) {}

    const mutationId = `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = `${deviceId}_${mutationId}`;

    const outboxRecord: SyncOutboxRecord = {
      id: mutationId,
      tenantId,
      branchId: branchId || (entity as any).branch_id || (entity as any).branchId || '',
      deviceId,
      entity: tableName,
      entityId: entity.id,
      operation,
      payload: entity,
      clientVersion: (entity as any).version || 1,
      createdAt: Date.now(),
      status: 'PENDING',
      retryCount: 0,
      idempotencyKey,
    };

    await db.transaction('rw', [tableName, 'syncQueue'], async (tx) => {
      const table = tx.table(tableName);
      if (operation === 'DELETE') {
        const softDeletedEntity = {
          ...entity,
          deletedAt: Date.now(),
          syncStatus: 'PENDING',
        };
        await table.put(softDeletedEntity);
      } else {
        const recordToSave = {
          ...entity,
          syncStatus: 'PENDING',
          updatedAt: Date.now(),
        };
        await table.put(recordToSave);
      }

      await outboxRepository.enqueueMutation(outboxRecord, tx);
    });

    console.log(`[LocalWriteCoordinator] Atomic write committed for ${tableName}:${entity.id} (${operation}). Outbox ID: ${mutationId}`);
    return entity;
  }
};
