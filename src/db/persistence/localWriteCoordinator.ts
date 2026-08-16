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

    return entity;
  },

  /**
   * Performs high-throughput batch atomic mutations for bulk imports and sync reconciliation.
   */
  async executeBatchAtomicMutations<T extends { id: string }>(
    tableName: string,
    items: { entity: T; operation: 'CREATE' | 'UPDATE' | 'DELETE' }[],
    tenantId: string,
    branchId?: string
  ): Promise<T[]> {
    if (items.length === 0) return [];
    if (!db.isOpen()) await db.open();

    let deviceId = 'device-default';
    try {
      deviceId = localStorage.getItem('dukapos_device_id') || 'device-default';
    } catch (_) {}

    const now = Date.now();
    const entitiesToSave: any[] = [];
    const outboxRecords: SyncOutboxRecord[] = [];

    items.forEach(({ entity, operation }, idx) => {
      const mutationId = `mut_${now}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
      const idempotencyKey = `${deviceId}_${mutationId}`;

      const recToSave = operation === 'DELETE' 
        ? { ...entity, deletedAt: now, syncStatus: 'PENDING' }
        : { ...entity, syncStatus: 'PENDING', updatedAt: now };

      entitiesToSave.push(recToSave);

      outboxRecords.push({
        id: mutationId,
        tenantId,
        branchId: branchId || (entity as any).branch_id || (entity as any).branchId || '',
        deviceId,
        entity: tableName,
        entityId: entity.id,
        operation,
        payload: entity,
        clientVersion: (entity as any).version || 1,
        createdAt: now,
        status: 'PENDING',
        retryCount: 0,
        idempotencyKey,
      });
    });

    await db.transaction('rw', [tableName, 'syncQueue'], async (tx) => {
      const table = tx.table(tableName);
      await table.bulkPut(entitiesToSave);
      for (const outboxRec of outboxRecords) {
        await outboxRepository.enqueueMutation(outboxRec, tx);
      }
    });

    return items.map((i) => i.entity);
  }
};
