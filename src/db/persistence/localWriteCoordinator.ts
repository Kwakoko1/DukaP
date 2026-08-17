/**
 * KwakoPos — Atomic Local Write Coordinator
 * 
 * Guarantees atomic writes combining local IndexedDB entity state changes
 * and Outbox queue mutations within a single Dexie transaction.
 */

import { db } from '../dexie';
import { outboxRepository } from '../sync/outboxRepository';
import type { SyncOutboxRecord } from '../database/schema';
import { generateSecureUUID, getOrCreateDeviceId } from '../../services/syncEventGenerator';
import { hlcEngine } from '../../services/hlcEngine';

export const localWriteCoordinator = {
  /**
   * Performs an atomic IndexedDB transaction containing the business record mutation
   * AND the durable outbox queue record conforming to MutationEnvelope.
   */
  async executeAtomicMutation<T extends { id: string }>(
    tableName: string,
    entity: T,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    tenantId: string,
    branchId?: string,
    userId?: string
  ): Promise<T> {
    if (!db.isOpen()) await db.open();

    const deviceId = getOrCreateDeviceId();
    const mutationId = generateSecureUUID();
    const operationId = generateSecureUUID();
    const idempotencyKey = `${deviceId}:${operationId}`;
    const hlc = hlcEngine.now();
    const now = Date.now();

    const outboxRecord: SyncOutboxRecord = {
      id: operationId,
      mutationId,
      operationId,
      tenantId,
      branchId: branchId || (entity as any).branch_id || (entity as any).branchId || '',
      deviceId,
      userId: userId || (entity as any).user_id || 'usr-system',
      entity: tableName,
      entityId: entity.id,
      operation,
      payload: entity,
      clientVersion: (entity as any).version || 1,
      hlc,
      schemaVersion: 8,
      createdAt: now,
      status: 'PENDING',
      retryCount: 0,
      idempotencyKey,
      correlationId: generateSecureUUID(),
    };

    await db.transaction('rw', [tableName, 'syncQueue'], async (tx) => {
      const table = tx.table(tableName);
      if (operation === 'DELETE') {
        const softDeletedEntity = {
          ...entity,
          deletedAt: now,
          deleted_at: now,
          syncStatus: 'PENDING',
          isSynced: 0,
        };
        await table.put(softDeletedEntity);
      } else {
        const recordToSave = {
          ...entity,
          syncStatus: 'PENDING',
          isSynced: 0,
          updatedAt: now,
          updated_at: now,
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
    branchId?: string,
    userId?: string
  ): Promise<T[]> {
    if (items.length === 0) return [];
    if (!db.isOpen()) await db.open();

    const deviceId = getOrCreateDeviceId();
    const now = Date.now();
    const entitiesToSave: any[] = [];
    const outboxRecords: SyncOutboxRecord[] = [];

    items.forEach(({ entity, operation }) => {
      const mutationId = generateSecureUUID();
      const operationId = generateSecureUUID();
      const idempotencyKey = `${deviceId}:${operationId}`;
      const hlc = hlcEngine.now();

      const recToSave = operation === 'DELETE' 
        ? { ...entity, deletedAt: now, deleted_at: now, syncStatus: 'PENDING', isSynced: 0 }
        : { ...entity, syncStatus: 'PENDING', isSynced: 0, updatedAt: now, updated_at: now };

      entitiesToSave.push(recToSave);

      outboxRecords.push({
        id: operationId,
        mutationId,
        operationId,
        tenantId,
        branchId: branchId || (entity as any).branch_id || (entity as any).branchId || '',
        deviceId,
        userId: userId || (entity as any).user_id || 'usr-system',
        entity: tableName,
        entityId: entity.id,
        operation,
        payload: entity,
        clientVersion: (entity as any).version || 1,
        hlc,
        schemaVersion: 8,
        createdAt: now,
        status: 'PENDING',
        retryCount: 0,
        idempotencyKey,
        correlationId: generateSecureUUID(),
      });
    });

    await db.transaction('rw', [tableName, 'syncQueue'], async (tx) => {
      const table = tx.table(tableName);
      await table.bulkPut(entitiesToSave);
      await outboxRepository.bulkEnqueueMutations(outboxRecords, tx);
    });

    return items.map((i) => i.entity);
  }
};
