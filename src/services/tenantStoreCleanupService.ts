/**
 * Tenant Store Cleanup Service
 * Handles isolated tenant store data cleanup routines for DukaPOS SaaS.
 * Synchronizes purging between Dexie IndexedDB and backend PostgreSQL.
 */

import { db } from '../db/dexie';

export class TenantStoreCleanupService {
  /**
   * Helper to trigger backend purge call on server (with offline fallback)
   */
  private static async syncBackendPurge(tenantId: string, scope: 'products' | 'sales' | 'contacts'): Promise<void> {
    try {
      const response = await fetch('/api/tenant/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ tenantId, scope }),
      });
      if (!response.ok) {
        console.warn(`[TenantCleanup] Backend purge returned status ${response.status} for scope ${scope}`);
      }
    } catch (err: any) {
      console.warn(`[TenantCleanup] Offline mode: backend purge skipped for scope ${scope}: ${err?.message}`);
    }
  }

  /**
   * PURGE 1: Delete All Products & Stock Ledgers
   */
  public static async purgeProductsAndLedgers(tenantId: string): Promise<void> {
    console.info('[TenantCleanup] Executing purgeProductsAndLedgers for tenantId:', tenantId);
    if (!tenantId) throw new Error('Valid tenant ID required for purge operation.');

    // 1. Sync backend PostgreSQL purge
    await this.syncBackendPurge(tenantId, 'products');

    // 2. Atomic IndexedDB bulk deletion
    await db.transaction(
      'rw',
      [
        db.products,
        db.productVariants,
        db.stockBalance,
        db.stockLedger,
        db.batchLots,
        db.serialNumbers,
        db.reorderRules,
        db.inventoryValuations,
      ],
      async () => {
        // Delete by tenant_id index
        await db.products.where('tenant_id').equals(tenantId).delete();
        await db.productVariants.where('tenant_id').equals(tenantId).delete();
        await db.stockBalance.where('tenant_id').equals(tenantId).delete();
        await db.stockLedger.where('tenant_id').equals(tenantId).delete();
        await db.batchLots.where('tenant_id').equals(tenantId).delete();
        await db.serialNumbers.where('tenant_id').equals(tenantId).delete();
        await db.reorderRules.where('tenant_id').equals(tenantId).delete();
        await db.inventoryValuations.where('tenant_id').equals(tenantId).delete();
      }
    );

    // 3. Dispatch live UI refresh event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DUKAPOS_DATA_PURGED', { detail: { scope: 'products', tenantId } }));
    }
    console.info('[TenantCleanup] Products and Stock Ledgers purged successfully.');
  }

  /**
   * PURGE 2: Delete All Sales & Receipts Permanently
   */
  public static async purgeSalesAndReceipts(tenantId: string): Promise<void> {
    console.info('[TenantCleanup] Executing purgeSalesAndReceipts for tenantId:', tenantId);
    if (!tenantId) throw new Error('Valid tenant ID required for purge operation.');

    // 1. Sync backend PostgreSQL purge
    await this.syncBackendPurge(tenantId, 'sales');

    // 2. Atomic IndexedDB bulk deletion with full cascade
    await db.transaction(
      'rw',
      [
        db.orders,
        db.receipts,
        db.receiptItems,
        db.receiptPrintLogs,
        db.receiptShareLogs,
        db.receiptAuditLogs,
        db.receiptQrCodes,
        db.receiptSignatures,
        db.receiptNumberSequences,
        db.heldCarts,
        db.posShifts,
        db.tabs,
        db.syncQueue,
        db.syncOutbox,
      ],
      async () => {
        await db.orders.where('tenant_id').equals(tenantId).delete();
        await db.receipts.where('tenant_id').equals(tenantId).delete();
        await db.receiptItems.where('tenant_id').equals(tenantId).delete();
        await db.receiptPrintLogs.where('tenant_id').equals(tenantId).delete();
        await db.receiptShareLogs.where('tenant_id').equals(tenantId).delete();
        await db.receiptAuditLogs.where('tenant_id').equals(tenantId).delete();
        await db.receiptQrCodes.where('tenant_id').equals(tenantId).delete();
        await db.receiptSignatures.where('tenant_id').equals(tenantId).delete();
        await db.receiptNumberSequences.where('tenant_id').equals(tenantId).delete();
        await db.heldCarts.where('tenant_id').equals(tenantId).delete();
        await db.posShifts.where('tenant_id').equals(tenantId).delete();
        await db.tabs.where('tenant_id').equals(tenantId).delete();

        // Sanitize pending syncQueue items for sales/receipts
        await db.syncQueue
          .where('tenant_id').equals(tenantId)
          .filter(item => ['orders', 'receipts', 'receiptItems', 'sales'].includes(item.entity || item.entityName || ''))
          .delete();

        // Sanitize pending syncOutbox events for sales/receipts
        await db.syncOutbox
          .where('tenant_id').equals(tenantId)
          .filter(item => ['orders', 'receipts', 'sales', 'POS_SALE'].includes(item.entity || item.action || ''))
          .delete();
      }
    );

    // 3. Reset local tombstone registry
    try {
      localStorage.removeItem('dukapos_deleted_receipt_numbers');
    } catch (_) {}

    // 4. Dispatch cross-tab sync and live UI refresh events
    try {
      const { broadcastMutation } = await import('./crossTabSyncService');
      broadcastMutation('receipts', 'DELETE', { scope: 'sales', tenantId });
      broadcastMutation('orders', 'DELETE', { scope: 'sales', tenantId });
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DUKAPOS_DATA_PURGED', { detail: { scope: 'sales', tenantId } }));
    }
    console.info('[TenantCleanup] Sales histories, receipts, and associated queue logs cleared.');
  }

  /**
   * PURGE 3: Delete Contacts & Expense Records
   */
  public static async purgeContactsAndExpenses(tenantId: string): Promise<void> {
    console.info('[TenantCleanup] Executing purgeContactsAndExpenses for tenantId:', tenantId);
    if (!tenantId) throw new Error('Valid tenant ID required for purge operation.');

    // 1. Sync backend PostgreSQL purge
    await this.syncBackendPurge(tenantId, 'contacts');

    // 2. Atomic IndexedDB bulk deletion
    await db.transaction(
      'rw',
      [
        db.customers,
        db.suppliers,
        db.supplierContacts,
        db.supplierInvoices,
        db.supplierLedger,
        db.supplierPayments,
        db.expenses,
      ],
      async () => {
        await db.customers.where('tenant_id').equals(tenantId).delete();
        await db.suppliers.where('tenant_id').equals(tenantId).delete();
        await db.supplierContacts.where('tenant_id').equals(tenantId).delete();
        await db.supplierInvoices.where('tenant_id').equals(tenantId).delete();
        await db.supplierLedger.where('tenant_id').equals(tenantId).delete();
        await db.supplierPayments.where('tenant_id').equals(tenantId).delete();
        await db.expenses.where('tenant_id').equals(tenantId).delete();
      }
    );

    // 3. Dispatch live UI refresh event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DUKAPOS_DATA_PURGED', { detail: { scope: 'contacts', tenantId } }));
    }
    console.info('[TenantCleanup] Customer contacts and expense records deleted.');
  }
}
