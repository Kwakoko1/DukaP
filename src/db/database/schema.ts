/**
 * KwakoPos — Canonical Database Schema Definitions
 * 
 * Defines all entity models, indexing schemes, and store structures
 * for local IndexedDB replication (KwakoPosDB).
 */

export interface SyncOutboxRecord {
  id: string;
  tenantId: string;
  branchId?: string;
  deviceId: string;
  entity: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  clientVersion: number;
  createdAt: number;
  status: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
  idempotencyKey: string;
}

export interface SyncInboxRecord {
  id: string;
  tenantId: string;
  deviceId: string;
  entity: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
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
  customers: 'id, tenant_id, name, phone, email',
  suppliers: 'id, tenant_id, name, contactPerson, phone',
  orders: 'id, tenant_id, branch_id, orderNumber, createdAt, paymentStatus, orderStatus',
  stockLedger: 'id, tenant_id, branch_id, productId, variantId, movementType, createdAt',
  stockBalance: 'id, tenant_id, branch_id, productId, variantId',
  tenants: 'id, name, status',
  branches: 'id, tenant_id, name',
  tenantSettings: 'id, tenant_id, key',
  users: 'id, tenant_id, email, is_super_admin',
  syncQueue: 'id, tenant_id, status, idempotencyKey, createdAt',
  syncInbox: 'id, tenant_id, status, serverVersion, receivedAt',
  serverCheckpoints: 'id, tenant_id, deviceId',
  syncState: 'id, updatedAt',
};
