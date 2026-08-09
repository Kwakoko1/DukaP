import React, { useState, useEffect, useMemo } from 'react';
import { useModule } from '../../../context/ModuleContext';
import { useAuth } from '../../../context/AuthContext';
import { db } from '../../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Download, Printer, Search, Calendar, ChevronDown,
  TrendingUp, DollarSign, Package, Users, CreditCard,
  Tag, RotateCcw, GitBranch, User, Clock, BarChart2, Percent, Activity, Building2
} from 'lucide-react';
import type { MainReportTab, DateFilter } from './types';

// --- Tab sub-components (lazy-loaded for performance) ---
import { SalesReport } from './SalesReport';
import { ProfitReport } from './ProfitReport';
import { InventoryReport } from './InventoryReport';
import { TaxReport } from './TaxReport';
import { CustomerReport } from './CustomerReport';
import { ExpenseReport } from './ExpenseReport';
import { PaymentMethodsReport } from './PaymentMethodsReport';
import { StockMovementReport } from './StockMovementReport';
import { PurchasingReport } from './PurchasingReport';
import { DiscountReport } from './DiscountReport';
import { ReturnsReport } from './ReturnsReport';
import { BranchReport } from './BranchReport';
import { CashierReport } from './CashierReport';
import { AgingReport } from './AgingReport';

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS: {
  key: MainReportTab;
  label: string;
  icon: React.ReactNode;
  phase: 1 | 2 | 3;
  sidebarKeys: string[];
}[] = [
  { key: 'sales',         label: 'Sales',             icon: <TrendingUp className="h-3.5 w-3.5" />,  phase: 1, sidebarKeys: ['sales', 'sales report', 'gross sales'] },
  { key: 'profit',        label: 'Profit & Loss',     icon: <DollarSign className="h-3.5 w-3.5" />,  phase: 1, sidebarKeys: ['profit', 'profit & loss', 'profit and loss', 'p&l'] },
  { key: 'inventory',     label: 'Inventory',         icon: <Package className="h-3.5 w-3.5" />,     phase: 1, sidebarKeys: ['inventory valuation', 'inventory', 'stock valuation', 'inventory report'] },
  { key: 'tax',           label: 'Tax / VAT',         icon: <Percent className="h-3.5 w-3.5" />,     phase: 1, sidebarKeys: ['tax', 'vat', 'tax report', 'tax / vat'] },
  { key: 'customers',     label: 'Customers',         icon: <Users className="h-3.5 w-3.5" />,       phase: 1, sidebarKeys: ['customers report', 'customers', 'customer report'] },
  { key: 'expenses',      label: 'Expenses',          icon: <BarChart2 className="h-3.5 w-3.5" />,   phase: 1, sidebarKeys: ['expenses report', 'expenses', 'expense report'] },
  { key: 'payments',      label: 'Payment Methods',   icon: <CreditCard className="h-3.5 w-3.5" />,  phase: 1, sidebarKeys: ['payment methods', 'payment method', 'payments'] },
  { key: 'stock-movement',label: 'Stock Movement',    icon: <Activity className="h-3.5 w-3.5" />,    phase: 2, sidebarKeys: ['stock movement', 'stock movement report', 'stock audit'] },
  { key: 'purchasing',    label: 'Purchasing',        icon: <Package className="h-3.5 w-3.5" />,     phase: 2, sidebarKeys: ['purchasing report', 'purchasing', 'purchase orders'] },
  { key: 'discounts',     label: 'Discounts',         icon: <Tag className="h-3.5 w-3.5" />,         phase: 2, sidebarKeys: ['discounts', 'discount report'] },
  { key: 'returns',       label: 'Returns & Refunds', icon: <RotateCcw className="h-3.5 w-3.5" />,   phase: 2, sidebarKeys: ['returns & refunds', 'returns', 'refunds', 'refund report'] },
  { key: 'branches',      label: 'Branch Comparison', icon: <GitBranch className="h-3.5 w-3.5" />,   phase: 3, sidebarKeys: ['branch comparison', 'branch report', 'branches'] },
  { key: 'cashiers',      label: 'Cashier Perf.',     icon: <User className="h-3.5 w-3.5" />,        phase: 3, sidebarKeys: ['cashier performance', 'cashier report', 'cashiers'] },
  { key: 'aging',         label: 'A/R Aging',         icon: <Clock className="h-3.5 w-3.5" />,       phase: 3, sidebarKeys: ['receivables aging', 'aging report', 'accounts receivable aging', 'ar aging'] },
];

// ─── Currency formatter ───────────────────────────────────────────────────────
const fmtCcy = (n: number) =>
  `Tsh ${Number(n || 0).toLocaleString('en-TZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── Date range helper ────────────────────────────────────────────────────────
function getDateRange(filter: DateFilter, startDate: string, endDate: string): { fromTs: number; toTs: number } {
  const now = new Date();
  let fromTs = 0;
  let toTs = Date.now();
  if (filter === 'today') {
    const d = new Date(); d.setHours(0, 0, 0, 0); fromTs = d.getTime();
  } else if (filter === '7days') {
    const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); fromTs = d.getTime();
  } else if (filter === '30days') {
    const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); fromTs = d.getTime();
  } else if (filter === 'month') {
    fromTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else if (filter === 'custom') {
    if (startDate) fromTs = new Date(startDate).getTime();
    if (endDate) toTs = new Date(endDate).getTime() + 86399999;
  }
  return { fromTs, toTs };
}

// ─── Export CSV helper ────────────────────────────────────────────────────────
function exportCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Reports Shell ───────────────────────────────────────────────────────
export const Reports: React.FC = () => {
  const { activeModule, activeTab: sidebarActiveTab } = useModule();
  const { currentBranch, currentTenant, hasPermission, role } = useAuth();

  const canViewReports = hasPermission('reports.view') || hasPermission('reports.branch') || hasPermission('financial_reports.view');
  const isMultiBranchAuthorized = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Accountant', 'Read Only Auditor'].includes(role);

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedBranchId, setSelectedBranchId] = useState<string>(currentBranch.id);
  const [activeTab, setActiveTab] = useState<MainReportTab>('sales');
  const [dateFilter, setDateFilter] = useState<DateFilter>('30days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Sidebar sync ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sidebarActiveTab) return;
    const norm = sidebarActiveTab.toLowerCase().trim();
    const tab = TABS.find(t => t.sidebarKeys.some(k => k.toLowerCase() === norm));
    if (tab) setActiveTab(tab.key);
  }, [sidebarActiveTab]);

  // ── Live Queries (Multi-Tenant & Multi-Branch Scoped) ─────────────────────
  const { fromTs, toTs } = useMemo(() => getDateRange(dateFilter, startDate, endDate), [dateFilter, startDate, endDate]);

  const receipts = useLiveQuery(() =>
    db.receipts.where('tenant_id').equals(currentTenant.id)
      .and(r => {
        const br = r.branch_id;
        const matchBranch = selectedBranchId === 'ALL' || !br || br === selectedBranchId || br === 'all' || br.includes('hq');
        const ts = r.created_at;
        return matchBranch && ts >= fromTs && ts <= toTs;
      }).toArray()
  , [currentTenant.id, selectedBranchId, fromTs, toTs]) || [];

  const orders = useLiveQuery(() =>
    db.orders.where('tenant_id').equals(currentTenant.id)
      .and(o => {
        const br = o.branch_id;
        const matchBranch = selectedBranchId === 'ALL' || !br || br === selectedBranchId || br === 'all' || br.includes('hq');
        return matchBranch && o.timestamp >= fromTs && o.timestamp <= toTs;
      }).toArray()
  , [currentTenant.id, selectedBranchId, fromTs, toTs]) || [];

  const products = useLiveQuery(() =>
    db.products.where('tenant_id').equals(currentTenant.id)
      .and(p => {
        if (p.deletedAt || (p as any).deleted_at || p.status === 'Inactive') return false;
        const pMod = (p.module || 'Retail').toLowerCase();
        const aMod = (activeModule || 'Retail').toLowerCase();
        const matchMod = pMod === aMod || pMod === 'all' || !p.module;
        const br = p.branch_id || p.branchId;
        const matchBranch = selectedBranchId === 'ALL' || !br || br === selectedBranchId || br === 'all' || br.includes('hq');
        return matchMod && matchBranch;
      }).toArray()
  , [currentTenant.id, selectedBranchId, activeModule]) || [];

  const productVariants = useLiveQuery(() =>
    db.productVariants.where('tenant_id').equals(currentTenant.id)
      .and(v => {
        if (v.status === 'Inactive') return false;
        const br = v.branch_id || (v as any).branchId;
        return selectedBranchId === 'ALL' || !br || br === selectedBranchId || br === 'all' || br.includes('hq');
      }).toArray()
  , [currentTenant.id, selectedBranchId]) || [];

  const expenses = useLiveQuery(() =>
    db.expenses.where('tenant_id').equals(currentTenant.id)
      .and(e => {
        const br = (e as any).branch_id;
        return Boolean(selectedBranchId === 'ALL' || !br || br === selectedBranchId || br === 'all' || (e.is_hq && selectedBranchId === 'HQ'));
      }).toArray()
  , [currentTenant.id, selectedBranchId]) || [];

  const customers = useLiveQuery(() =>
    db.customers.where('tenant_id').equals(currentTenant.id)
      .and(c => selectedBranchId === 'ALL' || !c.branch_id || c.branch_id === selectedBranchId || c.branch_id === 'all').toArray()
  , [currentTenant.id, selectedBranchId]) || [];

  const stockLedger = useLiveQuery(() =>
    db.stockLedger.where('tenant_id').equals(currentTenant.id)
      .and(e => selectedBranchId === 'ALL' || e.branch_id === selectedBranchId || e.branch_id === 'all').toArray()
  , [currentTenant.id, selectedBranchId]) || [];

  const purchaseOrders = useLiveQuery(() =>
    db.purchaseOrders.where('tenant_id').equals(currentTenant.id)
      .and(po => selectedBranchId === 'ALL' || po.branch_id === selectedBranchId || po.branch_id === 'all').toArray()
  , [currentTenant.id, selectedBranchId]) || [];

  const goodsReceipts = useLiveQuery(() =>
    db.goodsReceipts.where('tenant_id').equals(currentTenant.id)
      .and(gr => selectedBranchId === 'ALL' || gr.branch_id === selectedBranchId || gr.branch_id === 'all').toArray()
  , [currentTenant.id, selectedBranchId]) || [];

  const branches = useLiveQuery(() =>
    db.branches.where('tenant_id').equals(currentTenant.id).toArray()
  , [currentTenant.id]) || [];

  // ── Shared prop bundle ─────────────────────────────────────────────────────
  const reportProps = {
    receipts,
    orders,
    products,
    productVariants,
    expenses,
    customers,
    stockLedger,
    purchaseOrders,
    goodsReceipts,
    branches,
    searchTerm,
    fmtCcy,
    dateFilter,
    startDate,
    endDate,
  };

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!canViewReports) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center gap-4">
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20">
          <Printer className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-xs">You do not have permission to view financial reports. Contact your administrator.</p>
      </div>
    );
  }

  const activeTabDef = TABS.find(t => t.key === activeTab)!;
  const DATE_LABEL: Record<DateFilter, string> = {
    today: 'Today', '7days': 'Last 7 Days', '30days': 'Last 30 Days', month: 'This Month', custom: `${startDate || '—'} → ${endDate || '—'}`
  };

  // ── Export handler ─────────────────────────────────────────────────────────
  const handleExport = () => {
    if (activeTab === 'sales') {
      exportCSV('sales_report.csv', receipts.filter(r => r.status === 'Completed').map(r => ({
        receipt_number: r.receipt_number, date: new Date(r.created_at).toLocaleDateString(),
        cashier: r.cashier_name, customer: r.customer_name || '', payment: r.payment_method,
        total: r.total, tax: r.tax_amount, discount: r.discount_amount
      })));
    } else if (activeTab === 'expenses') {
      exportCSV('expenses_report.csv', expenses.map((e: any) => ({
        date: e.date, category: e.category, description: e.description || '',
        payment: e.paymentMethod, status: e.status, amount: e.amount
      })));
    } else if (activeTab === 'customers') {
      exportCSV('customers_report.csv', customers.map(c => ({
        name: c.name, phone: c.phone, email: c.email, type: c.type,
        loyalty_points: c.loyaltyPoints, outstanding_balance: c.outstandingBalance
      })));
    } else if (activeTab === 'purchasing') {
      exportCSV('purchasing_report.csv', purchaseOrders.map(po => ({
        po_number: po.po_number, supplier: po.supplier_name, status: po.status,
        payment: po.payment_status, total: po.total
      })));
    } else if (activeTab === 'stock-movement') {
      exportCSV('stock_movement_report.csv', stockLedger.slice(0, 500).map(e => ({
        date: new Date(e.created_at).toLocaleDateString(), product_id: e.product_id,
        movement_type: e.movement_type, before: e.quantity_before,
        change: e.quantity_change, after: e.quantity_after, unit_cost: e.unit_cost
      })));
    } else {
      window.print();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-darkbg overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 bg-white dark:bg-darkbg-card border-b border-slate-200 dark:border-darkbg-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Reports & Analytics</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">{activeTabDef?.label} · {DATE_LABEL[dateFilter]}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Multi-Branch Scope Switcher */}
            {isMultiBranchAuthorized && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border">
                <Building2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value={currentBranch.id}>Current ({currentBranch.name})</option>
                  <option value="ALL">🌐 All Branches Consolidated</option>
                  {branches.filter(b => b.id !== currentBranch.id).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Filter */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border hover:bg-slate-200 dark:hover:bg-slate-700/30 transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{DATE_LABEL[dateFilter]}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-2xl shadow-2xl p-3 min-w-[220px]">
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {(['today', '7days', '30days', 'month'] as DateFilter[]).map(f => (
                      <button
                        key={f}
                        onClick={() => { setDateFilter(f); setShowDatePicker(false); }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors ${dateFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-darkbg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/30'}`}
                      >
                        {DATE_LABEL[f]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Custom Range</p>
                  <div className="space-y-1.5">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border text-xs text-slate-700 dark:text-slate-300" />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border text-xs text-slate-700 dark:text-slate-300" />
                    <button
                      onClick={() => { setDateFilter('custom'); setShowDatePicker(false); }}
                      className="w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Apply Range
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Export */}
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={`Search in ${activeTabDef?.label || 'reports'}…`}
            className="w-full pl-8 pr-4 py-2 rounded-xl bg-slate-100 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition"
          />
        </div>
      </div>

      {/* ── Tab Bar (horizontally scrollable) ── */}
      <div className="shrink-0 bg-white dark:bg-darkbg-card border-b border-slate-200 dark:border-darkbg-border">
        <div className="overflow-x-auto scrollbar-none flex gap-0 px-2">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-[11px] font-bold whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.phase > 1 && (
                  <span className={`text-[8px] font-black px-1 rounded ${tab.phase === 2 ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'text-violet-500 bg-violet-50 dark:bg-violet-950/20'}`}>
                    P{tab.phase}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {activeTab === 'sales'          && <SalesReport          {...reportProps} />}
        {activeTab === 'profit'         && <ProfitReport         {...reportProps} />}
        {activeTab === 'inventory'      && <InventoryReport      {...reportProps} />}
        {activeTab === 'tax'            && <TaxReport            {...reportProps} />}
        {activeTab === 'customers'      && <CustomerReport       {...reportProps} />}
        {activeTab === 'expenses'       && <ExpenseReport        {...reportProps} />}
        {activeTab === 'payments'       && <PaymentMethodsReport {...reportProps} />}
        {activeTab === 'stock-movement' && <StockMovementReport  {...reportProps} />}
        {activeTab === 'purchasing'     && <PurchasingReport     {...reportProps} />}
        {activeTab === 'discounts'      && <DiscountReport       {...reportProps} />}
        {activeTab === 'returns'        && <ReturnsReport        {...reportProps} />}
        {activeTab === 'branches'       && <BranchReport         {...reportProps} />}
        {activeTab === 'cashiers'       && <CashierReport        {...reportProps} />}
        {activeTab === 'aging'          && <AgingReport          {...reportProps} />}
      </div>

      {/* Close date picker backdrop */}
      {showDatePicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDatePicker(false)} />
      )}
    </div>
  );
};
