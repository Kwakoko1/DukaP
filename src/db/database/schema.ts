/**
 * KwakoPos — Canonical Database Schema Definitions
 * 
 * Defines all entity models, indexing schemes, and store structures
 * for local IndexedDB replication (KwakoPosDB).
 */

export interface MutationEnvelope {
  mutationId: string;
  operationId: string;
  tenantId: string;
  branchId?: string;
  deviceId: string;
  userId?: string;
  entity: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'INSERT' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'SALE';
  payload: unknown;
  clientVersion?: number;
  serverVersion?: number;
  hlc: string;
  schemaVersion: number;
  createdAt: string | number;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
}

export interface SyncOutboxRecord {
  id: string; // operationId
  mutationId?: string;
  operationId?: string;
  tenantId: string;
  branchId?: string;
  deviceId: string;
  userId?: string;
  entity: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'INSERT' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'SALE';
  payload: any;
  clientVersion?: number;
  serverVersion?: number;
  hlc?: string;
  schemaVersion?: number;
  createdAt: number;
  status: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'CONFLICT' | 'DEAD_LETTER';
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
  idempotencyKey: string;
  correlationId?: string;
  causationId?: string;
}

export interface SyncInboxRecord {
  id: string;
  tenantId: string;
  deviceId: string;
  entity: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'INSERT' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'SALE';
  payload: any;
  serverVersion: number;
  receivedAt: number;
  appliedAt?: number;
  status: 'RECEIVED' | 'APPLIED' | 'FAILED';
}

export interface ServerCheckpointRecord {
  id: string; // tenantId + '_' + deviceId
  tenantId: string;
  deviceId: string;
  lastServerVersion: number;
  lastSyncedAt: number;
}

export interface SyncStateRecord {
  id: string;
  healthScore: number;
  lastSyncStatus: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR';
  pendingOutboxCount: number;
  currentHlc: string;
  updatedAt: number;
}

export const CANONICAL_STORES = {
  products: 'id, tenant_id, branch_id, category, brand, sku, barcode, syncStatus, deletedAt',
  productVariants: 'id, productId, tenant_id, branch_id, sku, barcode, syncStatus, deletedAt',
  categories: 'id, tenant_id, name, parent_id, sync_version',
  brands: 'id, tenant_id, name, sync_version',
  stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, idempotency_key, created_at',
  syncQueue: '++id, tenant_id, entity, entity_id, status, sync_token, created_at, idempotencyKey',
  syncOutbox: 'id, tenantId, entity, entityId, status, idempotencyKey, createdAt',
  syncInbox: 'id, tenantId, entity, entityId, status, receivedAt',
  syncCheckpoints: 'id, tenantId, deviceId',
  syncState: 'id',
};
