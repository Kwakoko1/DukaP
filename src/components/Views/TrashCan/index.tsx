import React, { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { 
  Trash2, RotateCcw, ShieldAlert, AlertTriangle, 
  Receipt as ReceiptIcon, Package, Users, Wallet,
  Search, CheckCircle2, Clock
} from 'lucide-react';
import { Badge } from '../../UI/custom-ui';
import { productRepository } from '../../../db/repositories/productRepository';
import { localWriteCoordinator } from '../../../db/persistence/localWriteCoordinator';
import { broadcastMutation } from '../../../services/crossTabSyncService';
import { getDeletedReceiptNumbers, purgeOrderAndReceipt } from '../../../services/receiptEngine';

export const TrashCan: React.FC = () => {
  const { currentTenant, user } = useAuth();
  const tenantId = currentTenant?.id || '';

  const [activeTab, setActiveTab] = useState<'receipts' | 'products' | 'customers' | 'expenses'>('receipts');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const isOwnerOrManager = useMemo(() => {
    return ['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager', 'Business Administrator'].includes(user?.role || '');
  }, [user]);

  // 1. Reactive Queries for Trashed Items
  const deletedReceiptNumbers = useMemo(() => getDeletedReceiptNumbers(), []);

  const trashedReceipts = useLiveQuery(async () => {
    if (!tenantId) return [];
    const all = await db.receipts.where('tenant_id').equals(tenantId).toArray();
    return all.filter(r => 
      (r as any).is_deleted || 
      (r as any).deletedAt || 
      ['Cancelled', 'Voided', 'Deleted'].includes(r.status) ||
      deletedReceiptNumbers.has(r.id) ||
      deletedReceiptNumbers.has(r.receipt_number)
    );
  }, [tenantId, deletedReceiptNumbers]) || [];

  const trashedProducts = useLiveQuery(async () => {
    if (!tenantId) return [];
    const all = await db.products.where('tenant_id').equals(tenantId).toArray();
    return all.filter(p => (p as any).is_deleted || (p as any).deletedAt || (p as any).status === 'Deleted');
  }, [tenantId]) || [];

  const trashedCustomers = useLiveQuery(async () => {
    if (!tenantId) return [];
    const all = await db.customers.where('tenant_id').equals(tenantId).toArray();
    return all.filter(c => (c as any).is_deleted || (c as any).deletedAt || (c as any).status === 'Deleted');
  }, [tenantId]) || [];

  const trashedExpenses = useLiveQuery(async () => {
    if (!tenantId) return [];
    const all = await db.expenses.where('tenant_id').equals(tenantId).toArray();
    return all.filter(e => (e as any).is_deleted || (e as any).deletedAt || (e as any).status === 'Deleted');
  }, [tenantId]) || [];

  // Total counts
  const totalTrashedCount = trashedReceipts.length + trashedProducts.length + trashedCustomers.length + trashedExpenses.length;

  // ── Actions: Restore & Permanent Purge ──────────────────────────────────────

  const handleRestoreReceipt = async (receipt: any) => {
    try {
      setIsBusy(true);
      // Remove from deleted tombstone set
      const set = getDeletedReceiptNumbers();
      set.delete(receipt.id);
      set.delete(receipt.receipt_number);
      if (receipt.transaction_id) set.delete(receipt.transaction_id);
      localStorage.setItem('dukapos_deleted_receipt_numbers', JSON.stringify(Array.from(set)));

      // Restore receipt state
      await db.receipts.update(receipt.id, {
        status: 'Completed',
        is_deleted: false,
        deletedAt: null,
        updated_at: Date.now()
      } as any);

      // Restore matching order if present
      const orderId = receipt.transaction_id || receipt.id;
      const order = await db.orders.get(orderId);
      if (order) {
        await db.orders.update(order.id, {
          status: 'Completed',
          is_deleted: false,
          deletedAt: null,
          updated_at: Date.now()
        } as any);
      }

      broadcastMutation('receipts', 'UPDATE', { id: receipt.id });
      showToast(`Receipt #${receipt.receipt_number} restored to active records ✅`);
    } catch (e: any) {
      showToast(e?.message || 'Failed to restore receipt', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePurgeReceipt = async (receipt: any) => {
    if (!isOwnerOrManager) {
      alert('Only Business Owners and Managers can execute permanent purges.');
      return;
    }
    if (window.confirm(`PERMANENT DELETE: Are you sure you want to permanently purge receipt #${receipt.receipt_number}? This action CANNOT be undone.`)) {
      try {
        setIsBusy(true);
        await purgeOrderAndReceipt({
          receipt_number: receipt.receipt_number,
          id: receipt.id,
          transaction_id: receipt.transaction_id,
          total: receipt.total
        });
        showToast(`Receipt #${receipt.receipt_number} permanently purged 🗑️`);
      } catch (e: any) {
        showToast(e?.message || 'Failed to purge receipt', 'error');
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleRestoreProduct = async (product: any) => {
    try {
      setIsBusy(true);
      await db.products.update(product.id, {
        status: 'Active',
        is_deleted: false,
        deletedAt: null,
        updatedAt: Date.now()
      } as any);
      broadcastMutation('products', 'UPDATE', { id: product.id });
      showToast(`Product "${product.name}" restored successfully ✅`);
    } catch (e: any) {
      showToast(e?.message || 'Failed to restore product', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePurgeProduct = async (product: any) => {
    if (!isOwnerOrManager) {
      alert('Only Business Owners and Managers can execute permanent purges.');
      return;
    }
    if (window.confirm(`PERMANENT DELETE: Purge product "${product.name}" permanently from database?`)) {
      try {
        setIsBusy(true);
        await productRepository.deleteProduct(product.id, tenantId);
        await db.productVariants.where('productId').equals(product.id).delete();
        showToast(`Product "${product.name}" permanently purged 🗑️`);
      } catch (e: any) {
        showToast(e?.message || 'Failed to purge product', 'error');
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleRestoreCustomer = async (customer: any) => {
    try {
      setIsBusy(true);
      await db.customers.update(customer.id, {
        status: 'Active',
        is_deleted: false,
        deletedAt: null,
        updated_at: Date.now()
      } as any);
      broadcastMutation('customers', 'UPDATE', { id: customer.id });
      showToast(`Customer "${customer.name}" restored successfully ✅`);
    } catch (e: any) {
      showToast(e?.message || 'Failed to restore customer', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePurgeCustomer = async (customer: any) => {
    if (!isOwnerOrManager) {
      alert('Only Business Owners and Managers can execute permanent purges.');
      return;
    }
    if (window.confirm(`PERMANENT DELETE: Purge customer "${customer.name}" permanently?`)) {
      try {
        setIsBusy(true);
        await localWriteCoordinator.executeAtomicMutation('customers', customer, 'DELETE', tenantId, user?.branch_id);
        showToast(`Customer "${customer.name}" permanently purged 🗑️`);
      } catch (e: any) {
        showToast(e?.message || 'Failed to purge customer', 'error');
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleRestoreExpense = async (expense: any) => {
    try {
      setIsBusy(true);
      await db.expenses.update(expense.id, {
        status: 'Paid',
        is_deleted: false,
        deletedAt: null,
        updated_at: Date.now()
      } as any);
      broadcastMutation('expenses', 'UPDATE', { id: expense.id });
      showToast(`Expense "${(expense as any).title || expense.category}" restored successfully ✅`);
    } catch (e: any) {
      showToast(e?.message || 'Failed to restore expense', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePurgeExpense = async (expense: any) => {
    if (!isOwnerOrManager) {
      alert('Only Business Owners and Managers can execute permanent purges.');
      return;
    }
    if (window.confirm(`PERMANENT DELETE: Purge expense permanently?`)) {
      try {
        setIsBusy(true);
        await db.expenses.delete(expense.id);
        showToast(`Expense permanently purged 🗑️`);
      } catch (e: any) {
        showToast(e?.message || 'Failed to purge expense', 'error');
      } finally {
        setIsBusy(false);
      }
    }
  };

  // Filter helpers
  const q = searchTerm.toLowerCase();

  const filteredReceipts = useMemo(() => {
    if (!q) return trashedReceipts;
    return trashedReceipts.filter(r => r.receipt_number.toLowerCase().includes(q) || (r.customer_name || '').toLowerCase().includes(q));
  }, [trashedReceipts, q]);

  const filteredProducts = useMemo(() => {
    if (!q) return trashedProducts;
    return trashedProducts.filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [trashedProducts, q]);

  const filteredCustomers = useMemo(() => {
    if (!q) return trashedCustomers;
    return trashedCustomers.filter(c => c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q));
  }, [trashedCustomers, q]);

  const filteredExpenses = useMemo(() => {
    if (!q) return trashedExpenses;
    return trashedExpenses.filter(e => ((e as any).title || e.category || '').toLowerCase().includes(q));
  }, [trashedExpenses, q]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl border text-xs font-bold flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-red-500 text-white border-red-600'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl border border-slate-800 text-white shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 shrink-0">
            <Trash2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold flex items-center gap-2">
              DukaPOS Trash Can & Recovery Console
              <Badge variant="outline" className="text-red-400 border-red-500/40 text-[10px] uppercase font-mono">30-Day DLP Safety</Badge>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Centralized Data Loss Prevention (DLP) & Recovery hub. Restore accidentally deleted items or execute permanent purges.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className="bg-slate-800 text-slate-300 border-slate-700 px-3 py-1 text-xs">
            <Clock size={12} className="mr-1.5 text-amber-400" />
            {totalTrashedCount} Trashed Item{totalTrashedCount === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-darkbg-border pb-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('receipts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'receipts'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            <ReceiptIcon size={14} />
            <span>Receipts & Sales ({trashedReceipts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'products'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            <Package size={14} />
            <span>Products ({trashedProducts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'customers'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            <Users size={14} />
            <span>Customers ({trashedCustomers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'expenses'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            <Wallet size={14} />
            <span>Expenses ({trashedExpenses.length})</span>
          </button>
        </div>

        {/* Search Field */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search trashed items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
        </div>
      </div>

      {/* ── TAB 1: TRASHED RECEIPTS ────────────────────────────────────────── */}
      {activeTab === 'receipts' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5 pl-6">Receipt #</th>
                  <th className="p-3.5">Customer / Cashier</th>
                  <th className="p-3.5">Payment</th>
                  <th className="p-3.5">Total Amount</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      <ShieldAlert className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      No trashed receipts found.
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-3.5 pl-6 font-mono font-bold text-slate-800 dark:text-white">
                        {r.receipt_number}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-300">
                        {r.customer_name || 'Walk-in Customer'} &bull; <span className="text-slate-400">{r.cashier_name}</span>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300 uppercase">
                        {r.payment_method}
                      </td>
                      <td className="p-3.5 font-extrabold text-slate-900 dark:text-white">
                        TZS {(r.total || 0).toLocaleString()}
                      </td>
                      <td className="p-3.5">
                        <Badge variant="danger" className="text-[10px] uppercase font-bold">
                          {r.status || 'Deleted'}
                        </Badge>
                      </td>
                      <td className="p-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRestoreReceipt(r)}
                            disabled={isBusy}
                            title="Restore Receipt to Active Ledger"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 transition"
                          >
                            <RotateCcw size={12} />
                            <span>Restore</span>
                          </button>
                          <button
                            onClick={() => handlePurgeReceipt(r)}
                            disabled={isBusy}
                            title="Permanently Purge Receipt"
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: TRASHED PRODUCTS ────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5 pl-6">SKU / Product</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Stock</th>
                  <th className="p-3.5">Price</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                      <ShieldAlert className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      No trashed products found.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-3.5 pl-6">
                        <div className="font-bold text-slate-800 dark:text-white">{p.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{p.sku || 'No SKU'}</div>
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-300">{p.category || 'General'}</td>
                      <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">{p.stock} units</td>
                      <td className="p-3.5 font-extrabold text-slate-900 dark:text-white">TZS {(p.sellingPrice || p.price || 0).toLocaleString()}</td>
                      <td className="p-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRestoreProduct(p)}
                            disabled={isBusy}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 transition"
                          >
                            <RotateCcw size={12} />
                            <span>Restore</span>
                          </button>
                          <button
                            onClick={() => handlePurgeProduct(p)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: TRASHED CUSTOMERS ────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5 pl-6">Customer Name</th>
                  <th className="p-3.5">Phone / Contact</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                      <ShieldAlert className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      No trashed customers found.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-slate-800 dark:text-white">{c.name}</td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-300">{c.phone || 'No phone'}</td>
                      <td className="p-3.5 text-slate-500">{c.type || 'Customer'}</td>
                      <td className="p-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRestoreCustomer(c)}
                            disabled={isBusy}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 transition"
                          >
                            <RotateCcw size={12} />
                            <span>Restore</span>
                          </button>
                          <button
                            onClick={() => handlePurgeCustomer(c)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: TRASHED EXPENSES ────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5 pl-6">Expense Title / Category</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                      <ShieldAlert className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      No trashed expenses found.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-slate-800 dark:text-white">
                        {(e as any).title || e.category || 'Uncategorized Expense'}
                      </td>
                      <td className="p-3.5 font-extrabold text-slate-900 dark:text-white">TZS {(e.amount || 0).toLocaleString()}</td>
                      <td className="p-3.5 text-slate-500">{new Date(e.created_at || Date.now()).toLocaleDateString()}</td>
                      <td className="p-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRestoreExpense(e)}
                            disabled={isBusy}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 transition"
                          >
                            <RotateCcw size={12} />
                            <span>Restore</span>
                          </button>
                          <button
                            onClick={() => handlePurgeExpense(e)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
