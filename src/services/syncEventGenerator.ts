/**
 * DukaPos SaaS — Sync Event Generator Service
 * Captures all local offline-first mutations as persistent Sync Events with idempotency tokens (UUID v4),
 * tenant isolation, priority classification, and device telemetry.
 */

import { db, type SyncItem, type SyncOperation, type SyncStatus } from '../db/dexie';

export interface CreateSyncEventParams {
  tenant_id: string;
  branch_id?: string;
  entity: string;
  entity_id: string;
  operation: SyncOperation;
  payload: any;
  user_id?: string;
  priority?: 1 | 2 | 3 | 4;
}

/**
 * Resolves persistent unique Device ID for POS terminal / browser session telemetry
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'dev-node-server';
  let deviceId = localStorage.getItem('dukapos_device_id');
  if (!deviceId) {
    deviceId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? `dev-node-${crypto.randomUUID()}`
      : `dev-node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('dukapos_device_id', deviceId);
  }
  return deviceId;
}

/**
 * Derives operational priority (1 = Highest / Transactions to 4 = Lowest / Settings)
 */
export function deriveSyncPriority(entity: string, operation: SyncOperation): 1 | 2 | 3 | 4 {
  const e = entity.toLowerCase();
  const op = operation.toUpperCase();

  // Priority 1: Critical Financial & Stock Ledger Transactions
  if (
    op === 'STOCK_IN' || op === 'STOCK_OUT' || op === 'TRANSFER' ||
    op === 'PAYMENT' || op === 'REFUND' || op === 'RETURN' ||
    e === 'orders' || e === 'stock_ledger' || e === 'payments' || e === 'invoices'
  ) {
    return 1;
  }

  // Priority 2: Purchasing & Expenses
  if (op === 'PURCHASE' || op === 'EXPENSE' || e === 'purchase_orders' || e === 'goods_receipts') {
    return 2;
  }

  // Priority 3: Master Data Entities (Products, Customers, Suppliers)
  if (e === 'products' || e === 'product_variants' || e === 'customers' || e === 'suppliers') {
    return 3;
  }

  // Priority 4: Background Configs & Settings
  return 4;
}

/**
 * Converts SyncOperation to legacy actionType for backwards compatibility
 */
export function mapOperationToLegacyActionType(operation: SyncOperation): 'INSERT' | 'UPDATE' | 'DELETE' {
  if (operation === 'DELETE') return 'DELETE';
  if (operation === 'UPDATE') return 'UPDATE';
  return 'INSERT';
}

/**
 * Generates compact field-level delta payload for UPDATE operations
 * Reduces mobile 2G/3G network data usage by only sending changed fields over the wire.
 */
export function computeDeltaPayload(previousState: Record<string, any>, newState: Record<string, any>): Record<string, any> {
  if (!previousState || typeof previousState !== 'object') return newState;
  const delta: Record<string, any> = { id: newState.id || newState.id, _isDelta: true };
  for (const key of Object.keys(newState)) {
    if (key === 'id' || key === 'tenant_id' || key === 'branch_id') {
      delta[key] = newState[key];
    } else if (JSON.stringify(previousState[key]) !== JSON.stringify(newState[key])) {
      delta[key] = newState[key];
    }
  }
  return delta;
}

/**
 * Generates and enqueues a persistent Event-Driven SyncItem in IndexedDB
 */
export async function createSyncEvent(params: CreateSyncEventParams): Promise<SyncItem> {
  const deviceId = getOrCreateDeviceId();

  // Resolve user_id from session if not explicitly passed
  let userId = params.user_id || 'usr-system';
  if (!params.user_id && typeof window !== 'undefined') {
    const sessionStr = localStorage.getItem('dukapos_session');
    if (sessionStr) {
      try {
        const parsed = JSON.parse(sessionStr);
        userId = parsed?.user?.id || 'usr-system';
      } catch {}
    }
  }

  const syncToken = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const priority = params.priority || deriveSyncPriority(params.entity, params.operation);
  const actionType = mapOperationToLegacyActionType(params.operation);

  const syncItem: SyncItem = {
    tenant_id: params.tenant_id,
    branch_id: params.branch_id || 'main-branch',
    entity: params.entity,
    entity_id: params.entity_id,
    operation: params.operation,
    payload: params.payload,
    status: 'Pending' as SyncStatus,
    retry_count: 0,
    priority,
    created_at: Date.now(),
    last_attempt: null,
    error: null,
    device_id: deviceId,
    user_id: userId,
    sync_token: syncToken,

    // Backwards compatibility properties
    actionType,
    entityName: params.entity,
    timestamp: Date.now(),
  };

  const id = await db.syncQueue.add(syncItem);
  return { ...syncItem, id };
}
