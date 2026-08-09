import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../UI/Toast';
import { useModule } from '../../../context/ModuleContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { cashDrawerService } from '../../../services/cashDrawerService';
import type { DenominationCount, CashDrawerSummaryKPI } from '../../../services/cashDrawerService';
import {
  Wallet, DollarSign, ShieldAlert, Lock, Unlock, Key,
  AlertTriangle, ArrowUpRight, ArrowDownLeft, FileText,
  Layers, Sparkles, Landmark,
  Zap, Receipt, Printer, ChevronRight, Check
} from 'lucide-react';
import { Button, Dialog } from '../../UI/custom-ui';

interface CashDrawerProps {
  initialTab?: 'shift' | 'ledger' | 'reconciliation' | 'transfers' | 'events' | 'reports' | 'security' | 'ai';
}

export const CashDrawer: React.FC<CashDrawerProps> = ({ initialTab = 'shift' }) => {
  const { currentTenant, currentBranch, user } = useAuth();
  const { activeTab: moduleActiveTab } = useModule();
  const tenantId = currentTenant?.id || 'tenant-dar-hq';
  const branchId = currentBranch?.id || 'branch-main-hq';

  const [activeTab, setActiveTab] = useState<'shift' | 'ledger' | 'reconciliation' | 'transfers' | 'events' | 'reports' | 'security' | 'ai'>(initialTab);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toast = useToast();

  // Safely ensure default drawer exists in background side-effect
  useEffect(() => {
    cashDrawerService.ensureDefaultDrawerExists(tenantId, branchId).catch(err => {
      console.warn('[CashDrawer] Ensure drawer failed:', err);
    });
  }, [tenantId, branchId]);

  // Sync tab with initialTab prop or sidebar selection
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (moduleActiveTab === 'Shift & Active Register' || moduleActiveTab === 'Cash Drawer' || moduleActiveTab === 'Cash Management' || moduleActiveTab === 'Cash Shift') {
      setActiveTab('shift');
    } else if (moduleActiveTab === 'Cash Movement Ledger' || moduleActiveTab === 'Cash Ledger') {
      setActiveTab('ledger');
    } else if (moduleActiveTab === 'Reconciliation & Variances' || moduleActiveTab === 'Drawer Reconciliation') {
      setActiveTab('reconciliation');
    } else if (moduleActiveTab === 'Safe & Bank Deposits') {
      setActiveTab('transfers');
    } else if (moduleActiveTab === 'No Sale & Event Logs') {
      setActiveTab('events');
    } else if (moduleActiveTab === '15 Financial Reports') {
      setActiveTab('reports');
    } else if (moduleActiveTab === 'Security & RBAC Rules') {
      setActiveTab('security');
    } else if (moduleActiveTab === 'AI Cash Advisor') {
      setActiveTab('ai');
    }
  }, [moduleActiveTab]);

  // Active Drawer & Session Query (PURE READ ONLY)
  const drawer = useLiveQuery(async () => {
    return cashDrawerService.getDefaultDrawer(tenantId, branchId);
  }, [tenantId, branchId]);

  const activeSession = useLiveQuery(async () => {
    return cashDrawerService.getActiveSession(tenantId, branchId, drawer?.id);
  }, [tenantId, branchId, drawer?.id]);

  // Live Query for KPI Summary
  const kpis: CashDrawerSummaryKPI | undefined = useLiveQuery(async () => {
    return cashDrawerService.getDrawerSummaryKPIs(tenantId, branchId);
  }, [tenantId, branchId]);

  // Live Query for Transactions Ledger
  const transactions = useLiveQuery(async () => {
    return db.cashTransactions
      .where('tenant_id').equals(tenantId)
      .and(t => t.branch_id === branchId)
      .reverse()
      .limit(100)
      .toArray();
  }, [tenantId, branchId]) || [];

  // Live Query for Drawer Events
  const events = useLiveQuery(async () => {
    return db.cashDrawerEvents
      .where('tenant_id').equals(tenantId)
      .and(e => e.branch_id === branchId)
      .reverse()
      .limit(50)
      .toArray();
  }, [tenantId, branchId]) || [];

  // Live Query for Reconciliations
  const reconciliations = useLiveQuery(async () => {
    return db.cashReconciliations
      .where('tenant_id').equals(tenantId)
      .and(r => r.branch_id === branchId)
      .reverse()
      .limit(20)
      .toArray();
  }, [tenantId, branchId]) || [];

  // Live Query for Variances requiring approval
  const pendingVariances = useLiveQuery(async () => {
    return db.cashVariances
      .where('tenant_id').equals(tenantId)
      .and(v => v.branch_id === branchId && v.status === 'PENDING_APPROVAL')
      .toArray();
  }, [tenantId, branchId]) || [];

  // Live Query for AI Insights
  const aiInsights = useLiveQuery(async () => {
    return cashDrawerService.runAICashAdvisory(tenantId, branchId);
  }, [tenantId, branchId]) || [];

  // Toast Auto-dismiss
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  // ── Modals State ────────────────────────────────────────────────────────
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showPettyCashModal, setShowPettyCashModal] = useState(false);
  const [showSafeTransferModal, setShowSafeTransferModal] = useState(false);
  const [showBankDepositModal, setShowBankDepositModal] = useState(false);
  const [showNoSaleModal, setShowNoSaleModal] = useState(false);
  const [showHardwareTestModal, setShowHardwareTestModal] = useState(false);

  // Form Input States
  const [shiftType, setShiftType] = useState<'Morning' | 'Afternoon' | 'Night'>('Morning');
  const [openingNotes, setOpeningNotes] = useState('');
  
  // Denomination Matrix
  const [denominations, setDenominations] = useState<DenominationCount[]>([
    { value: 10000, qty: 0 },
    { value: 5000, qty: 0 },
    { value: 2000, qty: 0 },
    { value: 1000, qty: 0 },
    { value: 500, qty: 0 },
    { value: 200, qty: 0 },
    { value: 100, qty: 0 },
    { value: 50, qty: 0 },
  ]);

  const resetDenominationsToZero = () => {
    setDenominations([
      { value: 10000, qty: 0 },
      { value: 5000, qty: 0 },
      { value: 2000, qty: 0 },
      { value: 1000, qty: 0 },
      { value: 500, qty: 0 },
      { value: 200, qty: 0 },
      { value: 100, qty: 0 },
      { value: 50, qty: 0 },
    ]);
  };

  const totalDenominationSum = denominations.reduce((s, d) => s + d.value * d.qty, 0);

  // Cash In / Cash Out Forms
  const [amountInput, setAmountInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  // Petty Cash Form
  const [expenseCategory, setExpenseCategory] = useState('Utilities');
  const [recipientInput, setRecipientInput] = useState('');

  // Bank Deposit Form
  const [bankName, setBankName] = useState('CRDB Bank');
  const [accountNumber, setAccountNumber] = useState('0150244833200');
  const [depositSlipNumber, setDepositSlipNumber] = useState(`SLIP-${Math.floor(100000 + Math.random() * 900000)}`);
  const [witnessName, setWitnessName] = useState('Store Manager');

  // Hardware Command State
  const [hardwareType, setHardwareType] = useState<'USB' | 'RJ11' | 'BLUETOOTH' | 'ETHERNET' | 'MANUAL'>('RJ11');
  const [hardwareLog, setHardwareLog] = useState<string | null>(null);

  // Selected Report State
  const [selectedReport, setSelectedReport] = useState('Drawer Summary');

  // ── HANDLERS ────────────────────────────────────────────────────────────
  const handleOpenShift = async () => {
    if (!drawer?.id) return;
    setIsProcessing(true);
    try {
      await cashDrawerService.openDrawerSession(
        tenantId,
        branchId,
        drawer.id,
        'POS-TERM-01',
        user?.id || 'usr-cashier',
        user?.name || 'Authorized Cashier',
        shiftType,
        totalDenominationSum,
        denominations,
        openingNotes
      );
      setToastMsg(`✅ Shift opened with opening float TZS ${totalDenominationSum.toLocaleString()}`);
      setShowOpenShiftModal(false);
      resetDenominationsToZero();
    } catch (err: any) {
      toast.error('Shift open failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseShift = async () => {
    if (!drawer?.id || !activeSession?.id) return;
    setIsProcessing(true);
    try {
      const res = await cashDrawerService.performBlindCashClosingCount(
        tenantId,
        branchId,
        drawer.id,
        activeSession.id,
        user?.id || 'usr-cashier',
        user?.name || 'Authorized Cashier',
        denominations,
        500,
        witnessName
      );
      setToastMsg(`✅ Shift closed! Recorded count TZS ${res.reconciliation.actual_counted_cash.toLocaleString()} (Status: ${res.reconciliation.variance_status})`);
      setShowCloseShiftModal(false);
      resetDenominationsToZero();
    } catch (err: any) {
      toast.error('Shift close failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashIn = async () => {
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0 || !reasonInput.trim()) {
      alert('Valid amount and reason are required.');
      return;
    }
    if (!drawer?.id || !activeSession?.id) return;

    setIsProcessing(true);
    try {
      await cashDrawerService.recordCashIn(
        tenantId, branchId, drawer.id, activeSession.id,
        amt, user?.id || 'usr-1', user?.name || 'Cashier', 'POS-TERM-01',
        reasonInput.trim(), notesInput.trim()
      );
      setToastMsg(`✅ TZS ${amt.toLocaleString()} added to cash drawer.`);
      setShowCashInModal(false);
      setAmountInput('');
      setReasonInput('');
    } catch (err: any) {
      toast.error('Cash in failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashOut = async () => {
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0 || !reasonInput.trim()) {
      alert('Valid amount and reason are required.');
      return;
    }
    if (!drawer?.id || !activeSession?.id) return;

    setIsProcessing(true);
    try {
      await cashDrawerService.recordCashOut(
        tenantId, branchId, drawer.id, activeSession.id,
        amt, user?.id || 'usr-1', user?.name || 'Cashier', 'POS-TERM-01',
        reasonInput.trim(), notesInput.trim()
      );
      setToastMsg(` Cash Out of TZS ${amt.toLocaleString()} recorded.`);
      setShowCashOutModal(false);
      setAmountInput('');
      setReasonInput('');
    } catch (err: any) {
      toast.error('Cash out failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePettyCash = async () => {
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0 || !reasonInput.trim() || !recipientInput.trim()) {
      alert('Amount, description, and recipient name are required.');
      return;
    }
    if (!drawer?.id || !activeSession?.id) return;

    setIsProcessing(true);
    try {
      await cashDrawerService.recordPettyExpense(
        tenantId, branchId, drawer.id, activeSession.id,
        expenseCategory, reasonInput.trim(), amt, recipientInput.trim(),
        user?.name || 'Store Manager', user?.id || 'usr-1', user?.name || 'Cashier'
      );
      setToastMsg(`✅ Petty cash expense TZS ${amt.toLocaleString()} paid to ${recipientInput}.`);
      setShowPettyCashModal(false);
      setAmountInput('');
      setReasonInput('');
      setRecipientInput('');
    } catch (err: any) {
      alert(`Petty cash failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNoSaleTrigger = async (reason: any) => {
    if (!drawer?.id || !activeSession?.id) return;
    setIsProcessing(true);
    try {
      await cashDrawerService.triggerNoSaleOpen(
        tenantId, branchId, drawer.id, activeSession.id,
        user?.id || 'usr-1', user?.name || 'Cashier', reason
      );
      setToastMsg(`⚡ No Sale Triggered (${reason}). Drawer solenoid pulse sent.`);
      setShowNoSaleModal(false);
    } catch (err: any) {
      alert(`No sale failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSafeTransfer = async () => {
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0) {
      alert('Enter a valid transfer amount.');
      return;
    }
    if (!drawer?.id || !activeSession?.id) return;

    setIsProcessing(true);
    try {
      await cashDrawerService.transferCashToSafe(
        tenantId, branchId, drawer.id, activeSession.id,
        amt, user?.id || 'usr-1', user?.name || 'Cashier', witnessName
      );
      setToastMsg(`✅ TZS ${amt.toLocaleString()} transferred from Register to Branch Safe.`);
      setShowSafeTransferModal(false);
      setAmountInput('');
    } catch (err: any) {
      alert(`Safe transfer failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBankDeposit = async () => {
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0 || !depositSlipNumber.trim()) {
      alert('Amount and deposit slip number are required.');
      return;
    }

    setIsProcessing(true);
    try {
      await cashDrawerService.depositCashToBank(
        tenantId, branchId, bankName, accountNumber,
        depositSlipNumber, amt, user?.name || 'Cashier', witnessName
      );
      setToastMsg(`🏦 Bank deposit slip ${depositSlipNumber} recorded for TZS ${amt.toLocaleString()}`);
      setShowBankDepositModal(false);
      setAmountInput('');
    } catch (err: any) {
      alert(`Bank deposit failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestHardware = async (cmd: 'OPEN_DRAWER' | 'TEST_DRAWER' | 'DRAWER_STATUS' | 'RECONNECT') => {
    setIsProcessing(true);
    try {
      const res = await cashDrawerService.sendHardwareDrawerCommand(hardwareType, cmd);
      setHardwareLog(res.statusMessage);
      setToastMsg(`📟 ${res.statusMessage}`);
    } catch (err: any) {
      setHardwareLog(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveVariance = async (varianceId: string) => {
    setIsProcessing(true);
    try {
      await db.cashVariances.update(varianceId, {
        status: 'APPROVED',
        manager_action: `Approved by ${user?.name || 'Store Manager'} on ${new Date().toLocaleTimeString()}`
      });
      setToastMsg('✅ Cash variance approved.');
    } catch (err: any) {
      alert(`Failed to approve variance: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto pb-24">
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-3">
          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shrink-0">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Cash Drawer Control Center</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                drawer?.status === 'OPEN'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {drawer?.status || 'CLOSED'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Terminal: <strong className="text-slate-700 dark:text-slate-200">POS-TERM-01</strong> • Assigned Cashier: <strong className="text-slate-700 dark:text-slate-200">{activeSession?.cashier_name || 'No Shift Active'}</strong>
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowHardwareTestModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/50 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <Printer className="h-4 w-4 text-slate-400" />
            <span>ESC/POS Hardware Trigger</span>
          </button>

          {!activeSession ? (
            <button
              onClick={() => setShowOpenShiftModal(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition"
            >
              <Unlock className="h-4 w-4" />
              <span>Open Cashier Shift</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowNoSaleModal(true)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50 text-xs font-bold transition"
              >
                <Receipt className="h-4 w-4" />
                <span>No Sale Drawer Open</span>
              </button>

              <button
                onClick={() => setShowCloseShiftModal(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition"
              >
                <Lock className="h-4 w-4" />
                <span>Close Shift & Blind Count</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 14 Production Dashboard KPI Widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="bg-gradient-to-tr from-emerald-600 to-teal-600 text-white p-3.5 rounded-2xl shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-black text-emerald-100 flex items-center justify-between">
            <span>Register Balance</span>
            <Wallet className="h-4 w-4 text-emerald-200" />
          </div>
          <div className="text-lg font-black truncate">TZS {(drawer?.current_balance || 0).toLocaleString()}</div>
          <div className="text-[9px] text-emerald-100 font-semibold truncate">Active Cash in Drawer</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-3.5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-black text-slate-400 flex items-center justify-between">
            <span>Open Drawers</span>
            <Unlock className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white">{kpis?.openDrawersCount || 0}</div>
          <div className="text-[9px] text-slate-400 font-semibold truncate">Active POS Registers</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-3.5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-black text-slate-400 flex items-center justify-between">
            <span>Today Sales</span>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white">TZS {(kpis?.todayCashSales || 0).toLocaleString()}</div>
          <div className="text-[9px] text-slate-400 font-semibold truncate">Cash Invoices Paid</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-3.5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-black text-slate-400 flex items-center justify-between">
            <span>Cash Expenses</span>
            <ArrowUpRight className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white">TZS {(kpis?.todayExpenses || 0).toLocaleString()}</div>
          <div className="text-[9px] text-slate-400 font-semibold truncate">Petty Cash & Payouts</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-3.5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-black text-slate-400 flex items-center justify-between">
            <span>Expected Cash</span>
            <FileText className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white">TZS {(kpis?.expectedCashTotal || 0).toLocaleString()}</div>
          <div className="text-[9px] text-slate-400 font-semibold truncate">System Calculated</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-3.5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-black text-slate-400 flex items-center justify-between">
            <span>Cash Variance</span>
            <AlertTriangle className={`h-4 w-4 ${(kpis?.totalVariance || 0) !== 0 ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`} />
          </div>
          <div className={`text-lg font-black ${(kpis?.totalVariance || 0) < 0 ? 'text-rose-600' : (kpis?.totalVariance || 0) > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
            TZS {(kpis?.totalVariance || 0).toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-400 font-semibold truncate">Actual vs Expected</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-3.5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-black text-slate-400 flex items-center justify-between">
            <span>Bank Deposits</span>
            <Landmark className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white">TZS {(kpis?.bankDepositsTotal || 0).toLocaleString()}</div>
          <div className="text-[9px] text-slate-400 font-semibold truncate">Confirmed Bank Drops</div>
        </div>
      </div>

      {/* Navigation View Tabs */}
      <div className="flex items-center space-x-1 border-b border-slate-200 dark:border-darkbg-border overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
        {[
          { id: 'shift', label: '💵 Shift & Active Register', icon: <Wallet className="h-4 w-4" /> },
          { id: 'ledger', label: '📜 Cash Movement Ledger', icon: <FileText className="h-4 w-4" /> },
          { id: 'reconciliation', label: '⚖️ Reconciliation & Variances', icon: <ShieldAlert className="h-4 w-4" /> },
          { id: 'transfers', label: '🏦 Safe & Bank Deposits', icon: <Landmark className="h-4 w-4" /> },
          { id: 'events', label: '🔔 No Sale & Event Logs', icon: <Receipt className="h-4 w-4" /> },
          { id: 'reports', label: '📊 15 Financial Reports', icon: <Layers className="h-4 w-4" /> },
          { id: 'security', label: '🛡️ Security & RBAC', icon: <Key className="h-4 w-4" /> },
          { id: 'ai', label: '🤖 AI Cash Advisor', icon: <Sparkles className="h-4 w-4 text-indigo-500" /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl transition whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-primary text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB 1: SHIFT & ACTIVE REGISTER ────────────────────────────────── */}
      {activeTab === 'shift' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Active Register Control Card */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Active Register Overview</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Terminal: POS-TERM-01 • Drawer Code: CDR-409</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowCashInModal(true)}
                    disabled={!activeSession}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition disabled:opacity-50"
                  >
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    <span>Cash In</span>
                  </button>
                  <button
                    onClick={() => setShowCashOutModal(true)}
                    disabled={!activeSession}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition disabled:opacity-50"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    <span>Cash Out</span>
                  </button>
                  <button
                    onClick={() => setShowPettyCashModal(true)}
                    disabled={!activeSession}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 transition disabled:opacity-50"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    <span>Petty Cash</span>
                  </button>
                </div>
              </div>

              {activeSession ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                    <span className="text-slate-400 font-bold uppercase text-[9px] block">Opening Float</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                      TZS {activeSession.opening_float.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                    <span className="text-slate-400 font-bold uppercase text-[9px] block">Shift Type</span>
                    <span className="text-sm font-black text-primary mt-1 block">{activeSession.shift_type}</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                    <span className="text-slate-400 font-bold uppercase text-[9px] block">Opening Time</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                      {new Date(activeSession.opening_time).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                    <span className="text-slate-400 font-bold uppercase text-[9px] block">Cashier</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block truncate">
                      {activeSession.cashier_name}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 dark:bg-darkbg/40 rounded-2xl border border-dashed border-slate-200 dark:border-darkbg-border space-y-3">
                  <Lock className="h-8 w-8 text-slate-400 mx-auto" />
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-sm">No Active Cashier Shift</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Start a shift by entering opening float and verifying note denominations.</p>
                  </div>
                  <button
                    onClick={() => setShowOpenShiftModal(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition"
                  >
                    Open Shift Now
                  </button>
                </div>
              )}

              {/* Quick Mid-Shift Cash Transfer to Safe */}
              {activeSession && (
                <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-indigo-300 block">Drawer Security Safeguard</span>
                    <h4 className="font-extrabold text-sm mt-0.5">Transfer Excess Cash to Branch Safe</h4>
                    <p className="text-[11px] text-slate-300">Prevent high cash exposure by moving funds mid-shift.</p>
                  </div>
                  <button
                    onClick={() => setShowSafeTransferModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs transition"
                  >
                    Transfer to Safe
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Cashier & Hardware Quick Status Card */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider">Hardware Interface Status</h4>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-darkbg/40 rounded-xl">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">RJ11 Printer Solenoid</span>
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[9px] px-2 py-0.5 rounded-full">CONNECTED</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-darkbg/40 rounded-xl">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">USB Cash Drawer Cable</span>
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[9px] px-2 py-0.5 rounded-full">READY</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-darkbg/40 rounded-xl">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Bluetooth POS Drawer</span>
                  <span className="bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-bold text-[9px] px-2 py-0.5 rounded-full">STANDBY</span>
                </div>
              </div>

              <button
                onClick={() => handleTestHardware('OPEN_DRAWER')}
                disabled={isProcessing}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition"
              >
                <Zap className="h-4 w-4 text-amber-400" />
                <span>Pulse Solenoid (Open Drawer)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CASH MOVEMENT LEDGER ────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-darkbg-border flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">Immutable Cash Movement Ledger</h3>
            <span className="text-xs text-slate-400">{transactions.length} records logged</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-darkbg/60 text-slate-400 uppercase font-bold text-[9px]">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Reason / Ref</th>
                  <th className="p-3">User</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">No cash transactions logged yet.</td>
                  </tr>
                ) : (
                  transactions.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-darkbg/40">
                      <td className="p-3 font-mono text-slate-500">{new Date(t.timestamp).toLocaleTimeString()}</td>
                      <td className="p-3 font-bold">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                          t.amount > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">
                        {t.reason || 'POS Transaction'}
                        {t.reference_number && <span className="block text-[10px] text-slate-400 font-mono">Ref: {t.reference_number}</span>}
                      </td>
                      <td className="p-3 text-slate-500">{t.user_name}</td>
                      <td className={`p-3 text-right font-black ${t.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.amount > 0 ? '+' : ''}TZS {t.amount.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        TZS {t.running_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: RECONCILIATION & VARIANCES ──────────────────────────────── */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* Pending Variances Approval Alert */}
          {pendingVariances.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl dark:bg-amber-950/30 dark:border-amber-900/50 space-y-3">
              <div className="flex items-center space-x-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
                <AlertTriangle className="h-4 w-4" />
                <span>Manager Review Required: {pendingVariances.length} Pending Cash Variance(s)</span>
              </div>
              <div className="space-y-2">
                {pendingVariances.map(v => (
                  <div key={v.id} className="p-3 bg-white dark:bg-darkbg-card rounded-xl border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        Cashier Variance: <span className={v.amount < 0 ? 'text-rose-600' : 'text-blue-600'}>TZS {v.amount.toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{v.reason} • Logged {new Date(v.timestamp).toLocaleString()}</div>
                    </div>
                    <button
                      onClick={() => handleApproveVariance(v.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition"
                    >
                      Approve Variance
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reconciliations Table */}
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-darkbg-border font-bold text-xs text-slate-800 dark:text-white">
              Shift Closing Reconciliation History
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-darkbg/60 text-slate-400 uppercase font-bold text-[9px]">
                  <tr>
                    <th className="p-3">Closing Time</th>
                    <th className="p-3">Opening Float</th>
                    <th className="p-3">Cash Sales</th>
                    <th className="p-3">Expected Cash</th>
                    <th className="p-3">Actual Count</th>
                    <th className="p-3">Variance</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                  {reconciliations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic">No shift reconciliations completed yet.</td>
                    </tr>
                  ) : (
                    reconciliations.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-darkbg/40">
                        <td className="p-3 font-mono text-slate-500">{new Date(r.timestamp).toLocaleString()}</td>
                        <td className="p-3 font-bold text-slate-700 dark:text-slate-300">TZS {r.opening_float.toLocaleString()}</td>
                        <td className="p-3 font-bold text-slate-700 dark:text-slate-300">TZS {r.total_cash_sales.toLocaleString()}</td>
                        <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">TZS {r.expected_cash.toLocaleString()}</td>
                        <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">TZS {r.actual_counted_cash.toLocaleString()}</td>
                        <td className={`p-3 font-bold ${r.variance_amount < 0 ? 'text-rose-600' : r.variance_amount > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                          TZS {r.variance_amount.toLocaleString()}
                        </td>
                        <td className="p-3 font-bold">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                            r.variance_status === 'BALANCED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {r.variance_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: SAFE & BANK DEPOSITS ────────────────────────────────────── */}
      {activeTab === 'transfers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Branch Safe Management</h3>
              <button
                onClick={() => setShowSafeTransferModal(true)}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition"
              >
                Transfer to Safe
              </button>
            </div>
            <p className="text-xs text-slate-500">Safely store excess register cash during busy trading hours to minimize vulnerability.</p>
          </div>

          <div className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Bank Deposit Management</h3>
              <button
                onClick={() => setShowBankDepositModal(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition"
              >
                Record Bank Deposit
              </button>
            </div>
            <p className="text-xs text-slate-500">Record commercial bank deposit slips (CRDB, NMB, NBC, Absa) for end-of-day reconciliation.</p>
          </div>
        </div>
      )}

      {/* ── TAB 5: NO SALE & EVENT LOGS ────────────────────────────────────── */}
      {activeTab === 'events' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-darkbg-border font-bold text-xs text-slate-800 dark:text-white">
            Register Openings & Hardware Audit Events Log
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-darkbg/60 text-slate-400 uppercase font-bold text-[9px]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Event Type</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Reason / Details</th>
                  <th className="p-3">Interface</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">No hardware events logged yet.</td>
                  </tr>
                ) : (
                  events.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-darkbg/40">
                      <td className="p-3 font-mono text-slate-500">{new Date(e.timestamp).toLocaleString()}</td>
                      <td className="p-3 font-bold">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                          e.event_type === 'NO_SALE_OPEN' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {e.event_type}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300 font-semibold">{e.user_name}</td>
                      <td className="p-3 text-slate-500">{e.reason || 'General Hardware Operation'}</td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">{e.hardware_type || 'RJ11'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 6: 15 FINANCIAL REPORTS ───────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Report Selector Sidebar */}
          <div className="space-y-1 bg-white dark:bg-darkbg-card p-3 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 p-2 block">Select Report Document</span>
            {[
              'Drawer Summary', 'Cash Movement Report', 'Cash Variance Report', 'Shift Report',
              'Cashier Report', 'Branch Report', 'Daily Cash Report', 'Weekly Report',
              'Monthly Report', 'Bank Deposit Report', 'Expense Report', 'No Sale Report',
              'Drawer Opening History', 'Drawer Closing History', 'Cash Flow Report'
            ].map(rep => (
              <button
                key={rep}
                onClick={() => setSelectedReport(rep)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  selectedReport === rep ? 'bg-primary/10 text-primary font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {rep}
              </button>
            ))}
          </div>

          {/* Report Viewer */}
          <div className="lg:col-span-3 bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">{selectedReport}</h3>
              <button
                onClick={() => setToastMsg(`Exporting ${selectedReport} to PDF/CSV...`)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition"
              >
                Export Financial Report
              </button>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-200/60 dark:border-darkbg-border/40 text-center space-y-2">
              <FileText className="h-10 w-10 text-primary mx-auto" />
              <h4 className="font-bold text-slate-800 dark:text-white text-sm">System Generated Financial Audit</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Includes complete transaction ledger, shift reconciliation variances, no-sale triggers, and digital signatures for tax compliance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 7: SECURITY & RBAC ────────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-base">Cash Drawer Security & Role Permissions</h3>
          <p className="text-xs text-slate-500">Configure drawer limits, manager override PINs, and RBAC rules.</p>
        </div>
      )}

      {/* ── TAB 8: AI CASH ADVISOR ────────────────────────────────────────── */}
      {activeTab === 'ai' && (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Sparkles className="h-6 w-6 text-indigo-200" />
              <div>
                <h3 className="font-extrabold text-base">Autonomous AI Cash Advisory Engine</h3>
                <p className="text-xs text-indigo-100">Continuous pattern analysis across register shifts, shortages, and no-sale openings.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiInsights.map(insight => (
              <div key={insight.id} className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    insight.severity === 'Critical' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {insight.severity} • {insight.type}
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{insight.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">{insight.description}</p>
                <div className="p-2.5 bg-slate-50 dark:bg-darkbg/40 rounded-xl text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  💡 Recommendation: {insight.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL 1: OPEN SHIFT & FLOAT VERIFICATION ───────────────────────── */}
      <Dialog isOpen={showOpenShiftModal} onClose={() => setShowOpenShiftModal(false)} title="Open Cashier Shift & Verify Float">
        <div className="space-y-4 text-xs pt-1">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Shift Type</label>
            <select
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            >
              <option value="Morning">Morning Shift (07:00 - 15:00)</option>
              <option value="Afternoon">Afternoon Shift (15:00 - 23:00)</option>
              <option value="Night">Night Shift (23:00 - 07:00)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Opening Cash Denominations (TZS)</label>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {denominations.map((d, idx) => (
                <div key={d.value} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-200/60 dark:border-darkbg-border/40">
                  <span className="font-bold font-mono text-slate-700 dark:text-slate-300">TZS {d.value.toLocaleString()}</span>
                  <input
                    type="number"
                    min="0"
                    value={d.qty}
                    onChange={(e) => {
                      const newQty = parseInt(e.target.value) || 0;
                      const updated = [...denominations];
                      updated[idx].qty = newQty;
                      setDenominations(updated);
                    }}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-darkbg-border text-right font-mono font-bold"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Shift Opening Notes (Optional)</label>
            <input
              type="text"
              value={openingNotes}
              onChange={(e) => setOpeningNotes(e.target.value)}
              placeholder="e.g. Initial morning float pouch verified"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold mb-3"
            />
          </div>

          <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl dark:bg-emerald-950/40 dark:text-emerald-300 font-bold flex justify-between">
            <span>Calculated Opening Float:</span>
            <span className="font-mono text-sm">TZS {totalDenominationSum.toLocaleString()}</span>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-darkbg-border">
            <Button variant="outline" size="sm" onClick={() => setShowOpenShiftModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleOpenShift} disabled={isProcessing}>
              {isProcessing ? 'Opening...' : 'Confirm & Open Shift'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── MODAL 2: CLOSE SHIFT & BLIND CASH COUNT ─────────────────────────── */}
      <Dialog isOpen={showCloseShiftModal} onClose={() => setShowCloseShiftModal(false)} title="Close Shift & Perform Blind Cash Count">
        <div className="space-y-4 text-xs pt-1">
          <p className="text-slate-500 text-[11px]">
            Enter the exact cash denomination breakdown in your physical register. The system will compare this blind count against recorded sales.
          </p>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Counted Physical Cash Denominations (TZS)</label>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {denominations.map((d, idx) => (
                <div key={d.value} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-200/60 dark:border-darkbg-border/40">
                  <span className="font-bold font-mono text-slate-700 dark:text-slate-300">TZS {d.value.toLocaleString()}</span>
                  <input
                    type="number"
                    min="0"
                    value={d.qty}
                    onChange={(e) => {
                      const newQty = parseInt(e.target.value) || 0;
                      const updated = [...denominations];
                      updated[idx].qty = newQty;
                      setDenominations(updated);
                    }}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-darkbg-border text-right font-mono font-bold"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-900 text-white rounded-xl font-bold flex justify-between">
            <span>Total Blind Counted Cash:</span>
            <span className="font-mono text-sm">TZS {totalDenominationSum.toLocaleString()}</span>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-darkbg-border">
            <Button variant="outline" size="sm" onClick={() => setShowCloseShiftModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCloseShift} disabled={isProcessing}>
              {isProcessing ? 'Submitting...' : 'Submit Count & Close Shift'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── MODAL 3: CASH IN ────────────────────────────────────────────────── */}
      <Dialog isOpen={showCashInModal} onClose={() => setShowCashInModal(false)} title="Add Cash to Register (Cash In)">
        <div className="space-y-3 text-xs pt-1">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (TZS)</label>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="e.g. 50000"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reason</label>
            <input
              type="text"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="e.g. Additional Change Addition"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Additional Notes</label>
            <input
              type="text"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Optional notes"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowCashInModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCashIn} disabled={isProcessing}>Confirm Cash In</Button>
          </div>
        </div>
      </Dialog>

      {/* ── MODAL 4: CASH OUT ───────────────────────────────────────────────── */}
      <Dialog isOpen={showCashOutModal} onClose={() => setShowCashOutModal(false)} title="Remove Cash from Register (Cash Out)">
        <div className="space-y-3 text-xs pt-1">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (TZS)</label>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="e.g. 20000"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reason</label>
            <input
              type="text"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="e.g. Supplier Cash Advance"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Additional Notes</label>
            <input
              type="text"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Optional notes"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowCashOutModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCashOut} disabled={isProcessing}>Confirm Cash Out</Button>
          </div>
        </div>
      </Dialog>

      {/* ── MODAL 5: PETTY CASH ─────────────────────────────────────────────── */}
      <Dialog isOpen={showPettyCashModal} onClose={() => setShowPettyCashModal(false)} title="Pay Petty Cash Expense">
        <div className="space-y-3 text-xs pt-1">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            >
              <option>Utilities & Power</option>
              <option>Water Supply</option>
              <option>Cleaning Supplies</option>
              <option>Staff Lunch/Tea</option>
              <option>Transport / Courier</option>
              <option>Other Expense</option>
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (TZS)</label>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="e.g. 15000"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <input
              type="text"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="e.g. Purchased 20L Drinking Water Bottled"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Paid To (Recipient)</label>
            <input
              type="text"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              placeholder="e.g. Juma Water Vendor"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowPettyCashModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handlePettyCash} disabled={isProcessing}>Pay Petty Cash</Button>
          </div>
        </div>
      </Dialog>

      {/* ── MODAL 6: SAFE TRANSFER ─────────────────────────────────────────── */}
      <Dialog isOpen={showSafeTransferModal} onClose={() => setShowSafeTransferModal(false)} title="Transfer Cash to Branch Safe">
        <div className="space-y-3 text-xs pt-1">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Transfer Amount (TZS)</label>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Manager Witness Name</label>
            <input
              type="text"
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
              placeholder="e.g. Assistant Manager"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowSafeTransferModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSafeTransfer} disabled={isProcessing}>Confirm Safe Transfer</Button>
          </div>
        </div>
      </Dialog>

      {/* ── MODAL 7: BANK DEPOSIT ──────────────────────────────────────────── */}
      <Dialog isOpen={showBankDepositModal} onClose={() => setShowBankDepositModal(false)} title="Record Commercial Bank Deposit Slip">
        <div className="space-y-3 text-xs pt-1">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Commercial Bank</label>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            >
              <option>CRDB Bank Plc</option>
              <option>NMB Bank Plc</option>
              <option>NBC Bank Tanzania</option>
              <option>Absa Bank Tanzania</option>
              <option>Diamond Trust Bank (DTB)</option>
              <option>Stanbic Bank</option>
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Account Number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold font-mono"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Deposit Slip Number</label>
            <input
              type="text"
              value={depositSlipNumber}
              onChange={(e) => setDepositSlipNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold font-mono"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Deposited Amount (TZS)</label>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="e.g. 1500000"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold font-mono"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowBankDepositModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleBankDeposit} disabled={isProcessing}>Record Bank Drop</Button>
          </div>
        </div>
      </Dialog>

      {/* ── MODAL 8: NO SALE ───────────────────────────────────────────────── */}
      <Dialog isOpen={showNoSaleModal} onClose={() => setShowNoSaleModal(false)} title="Trigger No Sale Drawer Opening">
        <div className="space-y-3 text-xs pt-1">
          <p className="text-slate-500 text-[11px]">Select reason for opening the drawer without making a transaction:</p>
          {[
            'Change Request', 'Float Adjustment', 'Receipt Reprint',
            'Customer Inquiry', 'Manager Override'
          ].map(r => (
            <button
              key={r}
              onClick={() => handleNoSaleTrigger(r as any)}
              disabled={isProcessing}
              className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-darkbg-border hover:bg-slate-50 dark:hover:bg-slate-800 font-bold transition flex items-center justify-between"
            >
              <span>{r}</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>
      </Dialog>

      {/* ── MODAL 9: HARDWARE DIAGNOSTICS ──────────────────────────────────── */}
      <Dialog isOpen={showHardwareTestModal} onClose={() => setShowHardwareTestModal(false)} title="ESC/POS Hardware Trigger Test">
        <div className="space-y-4 text-xs pt-1">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Drawer Hardware Interface</label>
            <select
              value={hardwareType}
              onChange={(e) => setHardwareType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-xs font-semibold"
            >
              <option value="RJ11">RJ11 Solenoid (Connected via Thermal Printer)</option>
              <option value="USB">USB Direct Controller Cable</option>
              <option value="BLUETOOTH">Bluetooth Wireless POS Drawer</option>
              <option value="ETHERNET">Network Ethernet POS Drawer</option>
              <option value="MANUAL">Manual Security Key Switch</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleTestHardware('OPEN_DRAWER')}
              disabled={isProcessing}
              className="p-3 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition"
            >
              Pulse Solenoid (Open)
            </button>
            <button
              onClick={() => handleTestHardware('DRAWER_STATUS')}
              disabled={isProcessing}
              className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-slate-200 transition"
            >
              Check Sensor Status
            </button>
          </div>

          {hardwareLog && (
            <div className="p-3 bg-slate-950 text-emerald-400 font-mono text-[10px] rounded-xl">
              {hardwareLog}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowHardwareTestModal(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
export default CashDrawer;
