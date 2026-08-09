import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Expense } from '../../db/dexie';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';
import { ExpenseService, getCategoriesForModule } from '../../services/expenseService';
import { Card, CardContent, Button, Badge, Dialog, Input } from '../UI/custom-ui';
import { 
  Plus, Search, TrendingDown, Calendar, 
  CreditCard, Trash2, CheckCircle2, AlertCircle, 
  Tag, X, Download, Printer, Copy, Building2,
  Check, FileText
} from 'lucide-react';

type DateRangeType = 'month' | 'today' | '7days' | '30days' | 'quarter' | 'all' | 'custom';

export const Expenses: React.FC = () => {
  const { currentBranch, currentTenant, user, role } = useAuth();
  const { activeModule } = useModule();

  // Multi-branch permission check
  const isMultiBranchAuthorized = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Accountant', 'Read Only Auditor'].includes(role);

  // Industry-aware categories
  const categoryDefs = useMemo(() => getCategoriesForModule(activeModule), [activeModule]);

  // --- Filter States ---
  const [selectedBranchId, setSelectedBranchId] = useState<string>(currentBranch.id);
  const [dateRange, setDateRange] = useState<DateRangeType>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchVal, setSearchVal] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('All');

  // --- IndexedDB Live Queries ---
  const rawExpenses = useLiveQuery(() => 
    db.expenses.where('tenant_id').equals(currentTenant.id).toArray()
  , [currentTenant.id]) || [];

  const branches = useLiveQuery(() => 
    db.branches.where('tenant_id').equals(currentTenant.id).toArray()
  , [currentTenant.id]) || [];

  // --- Modals ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [payModalItem, setPayModalItem] = useState<Expense | null>(null);
  const [payMethod, setPayMethod] = useState('M-Pesa');
  const [payRef, setPayRef] = useState('');

  // --- Form state for New Expense ---
  const [newCategory, setNewCategory] = useState(categoryDefs[0]?.name || 'Utilities');
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newDescription, setNewDescription] = useState('');
  const [newPayee, setNewPayee] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<string>('M-Pesa');
  const [newPaymentRef, setNewPaymentRef] = useState('');
  const [newStatus, setNewStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [newTaxDeductible, setNewTaxDeductible] = useState(true);
  const [newIsHq, setNewIsHq] = useState(false);
  const [formError, setFormError] = useState('');

  // --- Date Range Bounds ---
  const { fromTs, toTs } = useMemo(() => {
    const now = new Date();
    let from = 0;
    let to = Date.now();

    if (dateRange === 'today') {
      const d = new Date(); d.setHours(0,0,0,0); from = d.getTime();
    } else if (dateRange === '7days') {
      const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); from = d.getTime();
    } else if (dateRange === '30days') {
      const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); from = d.getTime();
    } else if (dateRange === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (dateRange === 'quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      from = new Date(now.getFullYear(), qMonth, 1).getTime();
    } else if (dateRange === 'custom') {
      if (startDate) from = new Date(startDate).getTime();
      if (endDate) to = new Date(endDate).getTime() + 86399999;
    }

    return { fromTs: from, toTs: to };
  }, [dateRange, startDate, endDate]);

  // --- Filtered Expenses ---
  const filteredExpenses = useMemo(() => {
    return rawExpenses.filter(e => {
      // Branch filter
      if (selectedBranchId !== 'ALL') {
        const matchesBranch = e.branch_id === selectedBranchId || (e.is_hq && selectedBranchId === 'HQ');
        if (!matchesBranch) return false;
      }

      // Date range filter
      const itemTs = new Date(e.date).getTime();
      if (dateRange !== 'all' && (itemTs < fromTs || itemTs > toTs)) return false;

      // Category filter
      if (filterCategory !== 'All' && e.category !== filterCategory) return false;

      // Status filter
      if (filterStatus !== 'All' && e.status !== filterStatus) return false;

      // Payment method filter
      if (filterPaymentMethod !== 'All' && e.paymentMethod !== filterPaymentMethod) return false;

      // Search query
      if (searchVal.trim()) {
        const q = searchVal.toLowerCase();
        const matchCategory = e.category.toLowerCase().includes(q);
        const matchDesc = e.description?.toLowerCase().includes(q);
        const matchPayee = e.payee_name?.toLowerCase().includes(q);
        const matchRef = e.payment_reference?.toLowerCase().includes(q);
        if (!matchCategory && !matchDesc && !matchPayee && !matchRef) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rawExpenses, selectedBranchId, dateRange, fromTs, toTs, filterCategory, filterStatus, filterPaymentMethod, searchVal]);

  // --- Metrics ---
  const metrics = useMemo(() => {
    let total = 0;
    let paid = 0;
    let pending = 0;
    let taxDeductible = 0;
    let hqOverhead = 0;

    filteredExpenses.forEach(e => {
      total += e.amount;
      if (e.status === 'Paid' || e.status === 'Approved') paid += e.amount;
      else pending += e.amount;
      if (e.tax_deductible) taxDeductible += e.amount;
      if (e.is_hq) hqOverhead += e.amount;
    });

    return { total, paid, pending, taxDeductible, hqOverhead, count: filteredExpenses.length };
  }, [filteredExpenses]);

  // --- Category Weights ---
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // --- Actions ---
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const amt = parseFloat(newAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid expense amount in Tanzanian Shillings.');
      return;
    }

    if (!newDescription.trim()) {
      setFormError('Please provide a short description.');
      return;
    }

    try {
      await ExpenseService.createExpense({
        tenant_id: currentTenant.id,
        branch_id: newIsHq ? 'HQ' : currentBranch.id,
        category: newCategory,
        amount: amt,
        description: newDescription.trim(),
        payee_name: newPayee.trim() || undefined,
        date: newDate,
        paymentMethod: newPaymentMethod,
        payment_reference: newPaymentRef.trim() || undefined,
        status: newStatus,
        tax_deductible: newTaxDeductible,
        is_hq: newIsHq,
        created_by: user?.id || 'system'
      });

      // Dispatch alert notification
      window.dispatchEvent(new CustomEvent('dukapos:notification', {
        detail: {
          id: `notif-exp-${Date.now()}`,
          title: 'Expense Logged Successfully',
          message: `Logged ${newCategory} expense of Tsh. ${amt.toLocaleString()} (${newDescription})`,
          type: 'success',
          timestamp: Date.now()
        }
      }));

      // Reset form
      setNewAmount('');
      setNewDescription('');
      setNewPayee('');
      setNewPaymentRef('');
      setNewCategory(categoryDefs[0]?.name || 'Utilities');
      setNewPaymentMethod('M-Pesa');
      setNewStatus('Paid');
      setNewDate(new Date().toISOString().split('T')[0]);
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save expense.');
    }
  };

  const handleExecutePay = async () => {
    if (!payModalItem) return;
    try {
      await ExpenseService.markAsPaid(payModalItem.id, payMethod, payRef);
      setPayModalItem(null);
      setPayRef('');

      window.dispatchEvent(new CustomEvent('dukapos:notification', {
        detail: {
          id: `notif-paid-${Date.now()}`,
          title: 'Bill Settled',
          message: `Marked Tsh. ${payModalItem.amount.toLocaleString()} bill as PAID via ${payMethod}.`,
          type: 'info',
          timestamp: Date.now()
        }
      }));
    } catch (err: any) {
      alert(`Error updating expense: ${err.message}`);
    }
  };

  const handleDuplicate = async (exp: Expense) => {
    try {
      await ExpenseService.duplicateExpense(exp.id);
      window.dispatchEvent(new CustomEvent('dukapos:notification', {
        detail: {
          id: `notif-dup-${Date.now()}`,
          title: 'Expense Re-logged',
          message: `Duplicated ${exp.category} expense of Tsh. ${exp.amount.toLocaleString()} for today.`,
          type: 'success',
          timestamp: Date.now()
        }
      }));
    } catch (err: any) {
      alert(`Error duplicating expense: ${err.message}`);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to void/delete this expense record?')) return;
    try {
      await ExpenseService.deleteExpense(id);
    } catch (err: any) {
      alert(`Error deleting expense: ${err.message}`);
    }
  };

  const handleExportCSV = () => {
    ExpenseService.exportToCSV(filteredExpenses, `expenses_${selectedBranchId}_${dateRange}.csv`);
  };

  return (
    <div className="space-y-6 font-sans">

      {/* Header section */}
      <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Operating Expenses Ledger</h2>
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
              {activeModule || 'Retail'} Taxonomy
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Log, track, and audit operational overhead, staff salaries, rent, and TRA tax-deductible expenses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.print()}
            className="flex items-center space-x-1.5"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print Ledger</span>
          </Button>

          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-1.5 shadow-md shadow-primary/20"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Log Expense</span>
          </Button>
        </div>
      </div>

      {/* Scope Controls Bar (Multi-Branch & Date Range) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-darkbg-card p-3 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        
        {/* Multi-Branch Switcher */}
        {isMultiBranchAuthorized ? (
          <div className="flex items-center space-x-2">
            <Building2 className="h-4 w-4 text-indigo-500 shrink-0" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Branch Scope:</span>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-slate-100 dark:bg-darkbg text-xs font-bold text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border outline-none cursor-pointer"
            >
              <option value={currentBranch.id}>Current ({currentBranch.name})</option>
              <option value="ALL">🌐 All Branches Consolidated</option>
              <option value="HQ">🏢 Corporate HQ Overhead Only</option>
              {branches.filter(b => b.id !== currentBranch.id).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="text-xs text-slate-500">Branch: <strong className="text-slate-800 dark:text-white">{currentBranch.name}</strong></span>
          </div>
        )}

        {/* Date Range Selector */}
        <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
          {(['month', 'today', '7days', '30days', 'quarter', 'all', 'custom'] as DateRangeType[]).map(r => {
            const labels: Record<DateRangeType, string> = {
              month: 'This Month', today: 'Today', '7days': '7 Days', '30days': '30 Days', quarter: 'Quarter', all: 'All Time', custom: 'Custom'
            };
            return (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all ${dateRange === r ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-darkbg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/40'}`}
              >
                {labels[r]}
              </button>
            );
          })}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-1 ml-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-darkbg text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-darkbg-border" />
              <span className="text-[10px] text-slate-400">→</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-darkbg text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-darkbg-border" />
            </div>
          )}
        </div>
      </div>

      {/* Category Weight Breakdown Strip */}
      {categoryBreakdown.length > 0 && (
        <Card className="border border-slate-200 dark:border-darkbg-border rounded-xl p-3 bg-white dark:bg-darkbg-card">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Expense Category Distribution</p>
          <div className="space-y-1.5">
            <div className="h-2 w-full bg-slate-100 dark:bg-darkbg rounded-full overflow-hidden flex">
              {categoryBreakdown.map((cat, idx) => {
                const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#F43F5E', '#14B8A6'];
                const pct = metrics.total > 0 ? (cat.value / metrics.total) * 100 : 0;
                return (
                  <div key={cat.name} style={{ width: `${pct}%`, backgroundColor: colors[idx % colors.length] }} className="h-full" title={`${cat.name}: Tsh. ${cat.value.toLocaleString()} (${pct.toFixed(1)}%)`} />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 font-semibold pt-1">
              {categoryBreakdown.slice(0, 5).map((cat, idx) => {
                const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#F43F5E', '#14B8A6'];
                const pct = metrics.total > 0 ? ((cat.value / metrics.total) * 100).toFixed(1) : '0.0';
                return (
                  <div key={cat.name} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                    <span>{cat.name}: <strong className="text-slate-800 dark:text-white">Tsh. {cat.value.toLocaleString()} ({pct}%)</strong></span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* KPI summaries card deck */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Total Expenses */}
        <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 to-indigo-500"></div>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Overhead</p>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white leading-tight truncate">
                Tsh. {metrics.total.toLocaleString()}
              </h3>
              <p className="text-[9px] text-slate-400">{metrics.count} expenses logged</p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-500 flex items-center justify-center shrink-0">
              <TrendingDown className="h-4 w-4 stroke-[2.5]" />
            </div>
          </CardContent>
        </Card>

        {/* Paid Bills */}
        <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500"></div>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Paid / Settled</p>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white leading-tight truncate">
                Tsh. {metrics.paid.toLocaleString()}
              </h3>
              <p className="text-[9px] text-emerald-600 font-medium">Settled operational bills</p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        {/* Pending Bills */}
        <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 inset-x-0 h-1 bg-amber-500"></div>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Bills</p>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white leading-tight truncate">
                Tsh. {metrics.pending.toLocaleString()}
              </h3>
              <p className="text-[9px] text-amber-600 font-medium">Awaiting accounts payout</p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-500 flex items-center justify-center shrink-0">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        {/* Tax Deductible / TRA Weight */}
        <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 inset-x-0 h-1 bg-indigo-500"></div>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TRA Tax Deductible</p>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white leading-tight truncate">
                Tsh. {metrics.taxDeductible.toLocaleString()}
              </h3>
              <p className="text-[9px] text-indigo-600 font-medium">Qualifies for TRA tax deduction</p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar & Filter Bar */}
      <Card className="border border-slate-200 dark:border-darkbg-border rounded-xl">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search by category, payee, description, M-Pesa ref..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              className="pl-9 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
            />
            {searchVal && (
              <button onClick={() => setSearchVal('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Category Filter */}
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-darkbg px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border">
              <Tag className="h-3 w-3 text-slate-400" />
              <select 
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value="All">All Categories</option>
                {categoryDefs.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-darkbg px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border">
              <CheckCircle2 className="h-3 w-3 text-slate-400" />
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
              </select>
            </div>

            {/* Payment Method Filter */}
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-darkbg px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border">
              <CreditCard className="h-3 w-3 text-slate-400" />
              <select 
                value={filterPaymentMethod}
                onChange={(e) => setFilterPaymentMethod(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value="All">All Payments</option>
                <option value="M-Pesa">M-Pesa</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank Transfer</option>
                <option value="TigoPesa">TigoPesa</option>
                <option value="Airtel">Airtel Money</option>
                <option value="Cheque">Cheque</option>
                <option value="Petty Cash">Petty Cash</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Ledger data table */}
      <Card className="border border-slate-200 dark:border-darkbg-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-darkbg-border/30 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Date</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Payee / Recipient</th>
                <th className="p-3.5">Description</th>
                <th className="p-3.5">Payment Method / Ref</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Amount</th>
                <th className="p-3.5 pr-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <p className="italic">No expense records found matching selected filters.</p>
                    <p className="text-[10px] text-slate-400 mt-1">Log a new expense above or change the scope.</p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 font-semibold text-slate-600 dark:text-slate-400">
                      <div className="flex items-center space-x-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{exp.date}</span>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-800 dark:text-white block">{exp.category}</span>
                        {exp.is_hq && (
                          <span className="text-[9px] font-extrabold text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded">HQ Overhead</span>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{exp.payee_name || '—'}</span>
                    </td>

                    <td className="p-3.5">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{exp.description}</p>
                    </td>

                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-800 dark:text-white uppercase text-[11px]">{exp.paymentMethod}</span>
                        {exp.payment_reference && (
                          <span className="block font-mono text-[10px] text-slate-400 font-bold">Ref: {exp.payment_reference}</span>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <Badge variant={exp.status === 'Paid' || exp.status === 'Approved' ? 'success' : 'warning'}>
                        {exp.status}
                      </Badge>
                    </td>

                    <td className="p-3.5 text-right font-black text-slate-900 dark:text-white">
                      Tsh. {exp.amount.toLocaleString()}
                    </td>

                    <td className="p-3.5 pr-6 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        {exp.status === 'Pending' && (
                          <button
                            onClick={() => { setPayModalItem(exp); setPayMethod(exp.paymentMethod); setPayRef(exp.payment_reference || ''); }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2.5 py-1 text-[10px] font-bold uppercase transition active:scale-95 flex items-center gap-1 shadow-sm"
                            title="Settle/Pay bill"
                          >
                            <Check className="h-3 w-3" />
                            <span>Pay</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDuplicate(exp)}
                          className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/20 dark:hover:text-indigo-400 rounded-lg transition text-slate-400"
                          title="Re-log / Duplicate for today"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400 rounded-lg transition text-slate-400"
                          title="Void / Delete record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Log Expense Dialog modal popover */}
      <Dialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Log Operational Expense"
        description="Record operational overhead, salaries, or permits. Scoped to current branch or HQ."
      >
        <form onSubmit={handleAddExpense} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-semibold">
              ⚠️ {formError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none dark:border-darkbg-border dark:bg-darkbg-card dark:text-white"
              >
                {categoryDefs.map(c => (
                  <option key={c.name} value={c.name}>{c.name} — {c.description}</option>
                ))}
                <option value="CUSTOM">+ Custom / New Category...</option>
              </select>
              {newCategory === 'CUSTOM' && (
                <input
                  type="text"
                  placeholder="Type custom category name..."
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="mt-2 flex h-9 w-full rounded-xl border border-indigo-300 bg-white px-3 py-1 text-xs focus:outline-none dark:border-indigo-800 dark:bg-darkbg-card dark:text-white"
                  required
                />
              )}
            </div>

            <Input 
              label="Amount (Tsh.)"
              placeholder="e.g. 250000"
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input 
              label="Payee / Recipient Name"
              placeholder="e.g. TANESCO, Landlord, Vodacom, Staff Name"
              value={newPayee}
              onChange={(e) => setNewPayee(e.target.value)}
            />

            <Input 
              label="Expense Date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Payment Method</label>
              <select
                value={newPaymentMethod}
                onChange={(e) => setNewPaymentMethod(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none dark:border-darkbg-border dark:bg-darkbg-card dark:text-white"
              >
                <option value="M-Pesa">M-Pesa</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank Transfer</option>
                <option value="TigoPesa">TigoPesa</option>
                <option value="Airtel">Airtel Money</option>
                <option value="Cheque">Cheque</option>
                <option value="Petty Cash">Petty Cash</option>
              </select>
            </div>

            <Input 
              label="M-Pesa / Ref Code (Optional)"
              placeholder="e.g. QGH7892X12 or Cheque #104"
              value={newPaymentRef}
              onChange={(e) => setNewPaymentRef(e.target.value)}
            />
          </div>

          <Input 
            label="Description / Purpose"
            placeholder="e.g. Office electricity tokens for August or staff salary payout"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-darkbg-border/30">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Payment Status</label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input 
                    type="radio" 
                    name="newStatus" 
                    value="Paid"
                    checked={newStatus === 'Paid'}
                    onChange={() => setNewStatus('Paid')}
                    className="accent-primary"
                  />
                  <span>Paid (Settled)</span>
                </label>
                <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input 
                    type="radio" 
                    name="newStatus" 
                    value="Pending"
                    checked={newStatus === 'Pending'}
                    onChange={() => setNewStatus('Pending')}
                    className="accent-primary"
                  />
                  <span>Pending Bill</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={newTaxDeductible}
                  onChange={(e) => setNewTaxDeductible(e.target.checked)}
                  className="accent-primary rounded"
                />
                <span>TRA Tax Deductible Expense</span>
              </label>

              {isMultiBranchAuthorized && (
                <label className="flex items-center space-x-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={newIsHq}
                    onChange={(e) => setNewIsHq(e.target.checked)}
                    className="accent-indigo-600 rounded"
                  />
                  <span>Corporate HQ Overhead (Company-wide)</span>
                </label>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100 dark:border-darkbg-border/30">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save Expense Record
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Pay Pending Bill Modal */}
      {payModalItem && (
        <Dialog
          isOpen={Boolean(payModalItem)}
          onClose={() => setPayModalItem(null)}
          title="Settle Pending Expense Bill"
          description={`Record payout of Tsh. ${payModalItem.amount.toLocaleString()} for ${payModalItem.description}`}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none dark:border-darkbg-border dark:bg-darkbg-card dark:text-white"
              >
                <option value="M-Pesa">M-Pesa</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank Transfer</option>
                <option value="TigoPesa">TigoPesa</option>
                <option value="Airtel">Airtel Money</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <Input 
              label="M-Pesa / Reference Code"
              placeholder="e.g. QGH7892X12 or Bank Slip #4092"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
            />

            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100 dark:border-darkbg-border/30">
              <Button type="button" variant="outline" size="sm" onClick={() => setPayModalItem(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={handleExecutePay}>
                Confirm Payout
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
