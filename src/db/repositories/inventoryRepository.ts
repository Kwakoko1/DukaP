/**
 * KwakoPos — Canonical Inventory Projection Repository
 */

import { db } from '../dexie';
import type { ProductBranchStock as StockBalance } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const inventoryRepository = {
  async getStockBalance(tenantId: string, productId: string, variantId?: string): Promise<StockBalance | undefined> {
    if (!db.isOpen()) await db.open();
    if (variantId) {
      return db.stockBalance.where({ tenant_id: tenantId, product_id: productId, variant_id: variantId }).first();
    }
    return db.stockBalance.where({ tenant_id: tenantId, product_id: productId }).first();
  },

  async updateStockBalance(balance: StockBalance): Promise<StockBalance> {
    const id = balance.id || `bal_${balance.tenant_id}_${balance.product_id}_${balance.variant_id || 'base'}`;
    const rec: StockBalance = { ...balance, id };
    return localWriteCoordinator.executeAtomicMutation('stockBalance', rec, balance.id ? 'UPDATE' : 'CREATE', balance.tenant_id, balance.branch_id);
  }
};
