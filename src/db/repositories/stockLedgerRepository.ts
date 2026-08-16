/**
 * KwakoPos — Canonical Stock Ledger Repository
 */

import { db } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export interface StockLedgerMovement {
  id: string;
  tenant_id: string;
  branch_id?: string;
  productId: string;
  variantId?: string;
  movementType: 'SALE' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER' | 'OPENING_BALANCE';
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  createdAt: number;
  deviceId?: string;
  serverVersion?: number;
}

export const stockLedgerRepository = {
  async recordMovement(movement: Partial<StockLedgerMovement> & { tenant_id: string; productId: string; movementType: any; quantity: number }): Promise<StockLedgerMovement> {
    const id = movement.id || `stk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: StockLedgerMovement = {
      id,
      tenant_id: movement.tenant_id,
      branch_id: movement.branch_id || 'branch-main',
      productId: movement.productId,
      variantId: movement.variantId,
      movementType: movement.movementType,
      quantity: movement.quantity,
      referenceType: movement.referenceType || 'MANUAL',
      referenceId: movement.referenceId || '',
      createdAt: movement.createdAt || Date.now(),
      deviceId: movement.deviceId || 'device-default',
      serverVersion: movement.serverVersion || 1,
    };
    return localWriteCoordinator.executeAtomicMutation('stockLedger', rec, 'CREATE', movement.tenant_id, movement.branch_id);
  },

  async findByProduct(productId: string): Promise<StockLedgerMovement[]> {
    if (!db.isOpen()) await db.open();
    return ((await db.stockLedger.where('productId').equals(productId).toArray()) as unknown) as StockLedgerMovement[];
  }
};
