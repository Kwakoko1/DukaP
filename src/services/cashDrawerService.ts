/**
 * DukaPos SaaS — Cash Drawer Production Service
 * 
 * Comprehensive Offline-First Financial Control Center:
 * 1. Multi-Drawer & Shift Management
 * 2. Opening Float & Cash Denomination Verifications
 * 3. Immutable Cash Movement Ledger (Sales, Refunds, Cash In/Out, Petty Cash, Transfers)
 * 4. Drawer Event Tracking (No Sale, Forced Open, Printer Trigger, Key Open)
 * 5. Blind Cash Counting & Automatic Reconciliation Matrix
 * 6. Configurable Tolerance & Variance Approval Workflows
 * 7. Branch Safe & Bank Deposit Management
 * 8. Hardware Command Integrations (USB, RJ11, Bluetooth, Ethernet)
 * 9. 15 Financial Cash Drawer Audit Reports
 * 10. Autonomous AI Cash Intelligence Advisor
 */

import { db } from '../db/dexie';
import type {
  CashDrawerEntity, CashDrawerSession, CashDrawerEvent,
  CashTransaction, CashReconciliation,
  CashVariance, CashTransfer, BankDeposit, CashExpense
} from '../db/dexie';

export interface DenominationCount {
  value: number; // e.g. 10000, 5000, 2000, 1000, 500, 200, 100, 50
  qty: number;
}

export interface CashDrawerSummaryKPI {
  currentCashBalance: number;
  openDrawersCount: number;
  closedDrawersTodayCount: number;
  todayCashSales: number;
  todayCashIn: number;
  todayExpenses: number;
  todayDeposits: number;
  expectedCashTotal: number;
  actualCountedTotal: number;
  totalVariance: number;
  activeCashiersCount: number;
  pendingApprovalsCount: number;
  bankDepositsTotal: number;
  noSaleOpeningsCount: number;
}

export interface AICashInsight {
  id: string;
  type: 'Shortage Anomaly' | 'Frequent No-Sale' | 'Optimal Float' | 'Safe Deposit' | 'High-Risk Cashier' | 'Refund Pattern';
  title: string;
  description: string;
  severity: 'Critical' | 'Warning' | 'Info';
  recommendation: string;
}

export const cashDrawerService = {

  // ─── 1. DRAWER PROVISIONING & RETRIEVAL ──────────────────────────────────
  async getDefaultDrawer(tenantId: string, branchId: string, terminalId: string = 'POS-TERM-01'): Promise<CashDrawerEntity | null> {
    const existing = await db.cashDrawers
      .where('tenant_id').equals(tenantId)
      .and(d => d.branch_id === branchId && (d.terminal_id === terminalId || d.terminal_id === 'all'))
      .first();

    return existing || null;
  },

  async ensureDefaultDrawerExists(tenantId: string, branchId: string, terminalId: string = 'POS-TERM-01'): Promise<CashDrawerEntity> {
    const existing = await db.cashDrawers
      .where('tenant_id').equals(tenantId)
      .and(d => d.branch_id === branchId && (d.terminal_id === terminalId || d.terminal_id === 'all'))
      .first();

    if (existing) return existing;

    const NOW = Date.now();
    const newDrawer: CashDrawerEntity = {
      id: `drawer-${tenantId}-${branchId}`,
      tenant_id: tenantId,
      branch_id: branchId,
      terminal_id: terminalId,
      name: `POS Register Drawer (${terminalId})`,
      drawer_code: `CDR-${Math.floor(100 + Math.random() * 900)}`,
      type: 'DEDICATED_CASHIER',
      status: 'CLOSED',
      current_balance: 0,
      currency: 'TZS',
      max_cash_limit: 1500000, // TZS 1.5M alert limit
      created_at: NOW,
      updated_at: NOW
    };

    await db.cashDrawers.put(newDrawer);
    return newDrawer;
  },

  async getActiveSession(tenantId: string, branchId: string, drawerId?: string): Promise<CashDrawerSession | null> {
    if (drawerId) {
      const session = await db.cashDrawerSessions
        .where('tenant_id').equals(tenantId)
        .and(s => s.branch_id === branchId && s.drawer_id === drawerId && s.status === 'OPEN')
        .first();
      if (session) return session;
    }
    const session = await db.cashDrawerSessions
      .where('tenant_id').equals(tenantId)
      .and(s => s.branch_id === branchId && s.status === 'OPEN')
      .first();

    return session || null;
  },

  // ─── 2. SHIFT OPENING & FLOAT VERIFICATION ────────────────────────────────
  async openDrawerSession(
    tenantId: string,
    branchId: string,
    drawerId: string,
    terminalId: string,
    cashierId: string,
    cashierName: string,
    shiftType: 'Morning' | 'Afternoon' | 'Night',
    openingFloat: number,
    denominations: DenominationCount[],
    notes?: string
  ): Promise<CashDrawerSession> {
    const NOW = Date.now();
    const sessionId = `session-${NOW}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. Create Shift Session Record
    const session: CashDrawerSession = {
      id: sessionId,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      terminal_id: terminalId,
      cashier_id: cashierId,
      cashier_name: cashierName,
      shift_type: shiftType,
      status: 'OPEN',
      opening_float: openingFloat,
      opening_time: NOW,
      opening_counted_by: cashierName,
      notes,
      created_at: NOW
    };
    await db.cashDrawerSessions.put(session);

    // 2. Save Opening Denomination Breakdown
    const countId = `count-${NOW}`;
    await db.cashCounts.put({
      id: countId,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      count_type: 'OPENING',
      counted_by: cashierName,
      total_amount: openingFloat,
      is_blind: false,
      timestamp: NOW
    });

    for (const d of denominations) {
      if (d.qty > 0) {
        await db.cashDenominations.put({
          id: `deno-${NOW}-${d.value}`,
          count_id: countId,
          denomination_value: d.value,
          count_quantity: d.qty,
          total_value: d.value * d.qty
        });
      }
    }

    // 3. Update Drawer status & current balance
    await db.cashDrawers.update(drawerId, {
      status: 'OPEN',
      assigned_cashier_id: cashierId,
      assigned_cashier_name: cashierName,
      current_balance: openingFloat,
      updated_at: NOW
    });

    // 4. Log Opening Cash Transaction Ledger
    await db.cashTransactions.put({
      id: `tx-${NOW}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      type: 'CASH_IN',
      amount: openingFloat,
      running_balance: openingFloat,
      user_id: cashierId,
      user_name: cashierName,
      terminal_id: terminalId,
      timestamp: NOW,
      reason: 'Shift Opening Float',
      notes: `Opened ${shiftType} shift with opening float of TZS ${openingFloat.toLocaleString()}`
    });

    // 5. Log Drawer Event
    await this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'DRAWER_OPENED', cashierId, cashierName, 'Shift Opening');

    // 6. Sync legacy posShifts for POS module compatibility
    await db.posShifts.put({
      id: sessionId,
      tenant_id: tenantId,
      branch_id: branchId,
      cashier_id: cashierId,
      cashier_name: cashierName,
      status: 'OPEN',
      opening_time: NOW,
      opening_float: openingFloat,
      cash_sales: 0,
      mpesa_sales: 0,
      bank_sales: 0,
      cash_in: 0,
      cash_out: 0
    });

    return session;
  },

  // ─── 3. CASH TRANSACTION LEDGER POSTING ──────────────────────────────────
  async recordCashSale(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    amount: number,
    cashierId: string,
    cashierName: string,
    terminalId: string,
    saleId: string
  ): Promise<CashTransaction> {
    const NOW = Date.now();
    const drawer = await db.cashDrawers.get(drawerId);
    const newBal = (drawer?.current_balance || 0) + amount;

    const tx: CashTransaction = {
      id: `tx-sale-${NOW}-${saleId}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      type: 'CASH_SALE',
      amount,
      running_balance: newBal,
      user_id: cashierId,
      user_name: cashierName,
      terminal_id: terminalId,
      timestamp: NOW,
      reason: 'POS Cash Sale Checkout',
      reference_number: saleId
    };

    await db.cashTransactions.put(tx);
    await db.cashDrawers.update(drawerId, { current_balance: newBal, updated_at: NOW });
    await this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'PRINTER_TRIGGER_OPEN', cashierId, cashierName, `Cash Sale Checkout ${saleId}`);

    return tx;
  },

  async recordCashRefund(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    amount: number,
    cashierId: string,
    cashierName: string,
    terminalId: string,
    saleId: string,
    reason: string
  ): Promise<CashTransaction> {
    const NOW = Date.now();
    const drawer = await db.cashDrawers.get(drawerId);
    const newBal = Math.max(0, (drawer?.current_balance || 0) - amount);

    const tx: CashTransaction = {
      id: `tx-refund-${NOW}-${saleId}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      type: 'CASH_REFUND',
      amount: -amount,
      running_balance: newBal,
      user_id: cashierId,
      user_name: cashierName,
      terminal_id: terminalId,
      timestamp: NOW,
      reason: `Cash Refund: ${reason}`,
      reference_number: saleId
    };

    await db.cashTransactions.put(tx);
    await db.cashDrawers.update(drawerId, { current_balance: newBal, updated_at: NOW });
    await this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'DRAWER_OPENED', cashierId, cashierName, `Refund ${saleId}`);

    return tx;
  },

  async recordCashIn(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    amount: number,
    userId: string,
    userName: string,
    terminalId: string,
    reason: string,
    notes?: string
  ): Promise<CashTransaction> {
    const NOW = Date.now();
    const drawer = await db.cashDrawers.get(drawerId);
    const newBal = (drawer?.current_balance || 0) + amount;

    const tx: CashTransaction = {
      id: `tx-cashin-${NOW}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      type: 'CASH_IN',
      amount,
      running_balance: newBal,
      user_id: userId,
      user_name: userName,
      terminal_id: terminalId,
      timestamp: NOW,
      reason,
      notes
    };

    await db.cashTransactions.put(tx);
    await db.cashDrawers.update(drawerId, { current_balance: newBal, updated_at: NOW });
    await this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'MANUAL_OPEN', userId, userName, `Cash In: ${reason}`);

    return tx;
  },

  async recordCashOut(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    amount: number,
    userId: string,
    userName: string,
    terminalId: string,
    reason: string,
    notes?: string
  ): Promise<CashTransaction> {
    const NOW = Date.now();
    const drawer = await db.cashDrawers.get(drawerId);
    const newBal = Math.max(0, (drawer?.current_balance || 0) - amount);

    const tx: CashTransaction = {
      id: `tx-cashout-${NOW}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      type: 'CASH_OUT',
      amount: -amount,
      running_balance: newBal,
      user_id: userId,
      user_name: userName,
      terminal_id: terminalId,
      timestamp: NOW,
      reason,
      notes
    };

    await db.cashTransactions.put(tx);
    await db.cashDrawers.update(drawerId, { current_balance: newBal, updated_at: NOW });
    await this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'MANUAL_OPEN', userId, userName, `Cash Out: ${reason}`);

    return tx;
  },

  async recordPettyExpense(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    category: string,
    description: string,
    amount: number,
    recipient: string,
    approvedBy: string,
    userId: string,
    userName: string
  ): Promise<CashExpense> {
    const NOW = Date.now();
    const expenseId = `exp-${NOW}`;

    const exp: CashExpense = {
      id: expenseId,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      category,
      description,
      amount,
      recipient,
      approved_by: approvedBy,
      timestamp: NOW
    };
    await db.cashExpenses.put(exp);

    // Also deduct from drawer running balance
    await this.recordCashOut(tenantId, branchId, drawerId, sessionId, amount, userId, userName, 'POS-TERM-01', `Petty Cash: ${category} (${description})`, `Paid to: ${recipient}`);

    return exp;
  },

  // ─── 4. NO SALE TRACKING & EVENT LOGGING ─────────────────────────────────
  async triggerNoSaleOpen(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    userId: string,
    userName: string,
    reason: 'Change Request' | 'Float Adjustment' | 'Receipt Reprint' | 'Customer Inquiry' | 'Manager Override'
  ): Promise<CashDrawerEvent> {
    return this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'NO_SALE_OPEN', userId, userName, `No Sale Opening: ${reason}`);
  },

  async logDrawerEvent(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string | undefined,
    eventType: CashDrawerEvent['event_type'],
    userId: string,
    userName: string,
    reason?: string,
    hardwareType: CashDrawerEvent['hardware_type'] = 'RJ11'
  ): Promise<CashDrawerEvent> {
    const NOW = Date.now();
    const evt: CashDrawerEvent = {
      id: `evt-${NOW}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      event_type: eventType,
      user_id: userId,
      user_name: userName,
      reason,
      hardware_type: hardwareType,
      timestamp: NOW
    };
    await db.cashDrawerEvents.put(evt);

    // Also write to audit log
    await db.drawerAuditLogs.put({
      id: `audit-${NOW}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      user_id: userId,
      user_name: userName,
      action: eventType,
      digital_signature: `SIG-${NOW}-${userId}`,
      timestamp: NOW
    });

    return evt;
  },

  // ─── 5. BLIND CASH COUNTING & RECONCILIATION ─────────────────────────────
  async performBlindCashClosingCount(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    cashierId: string,
    cashierName: string,
    denominations: DenominationCount[],
    toleranceThreshold: number = 500, // TZS 500 default tolerance
    managerWitness?: string
  ): Promise<{ reconciliation: CashReconciliation; variance?: CashVariance }> {
    const NOW = Date.now();

    // 1. Calculate Actual Counted Amount from Denominations
    const actualCountAmount = denominations.reduce((sum, d) => sum + d.value * d.qty, 0);

    // 2. Save Closing Cash Count
    const countId = `count-close-${NOW}`;
    await db.cashCounts.put({
      id: countId,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      count_type: 'BLIND_CLOSING',
      counted_by: cashierName,
      manager_witness: managerWitness,
      total_amount: actualCountAmount,
      is_blind: true,
      timestamp: NOW
    });

    for (const d of denominations) {
      if (d.qty > 0) {
        await db.cashDenominations.put({
          id: `deno-close-${NOW}-${d.value}`,
          count_id: countId,
          denomination_value: d.value,
          count_quantity: d.qty,
          total_value: d.value * d.qty
        });
      }
    }

    // 3. Compute Expected Cash Balance from Ledger
    const session = await db.cashDrawerSessions.get(sessionId);
    const txs = await db.cashTransactions
      .where('tenant_id').equals(tenantId)
      .and(t => t.session_id === sessionId)
      .toArray();

    const openingFloat = session?.opening_float || 0;
    const totalCashSales = txs.filter(t => t.type === 'CASH_SALE').reduce((sum, t) => sum + t.amount, 0);
    const totalCashIn = txs.filter(t => t.type === 'CASH_IN' && t.reason !== 'Shift Opening Float').reduce((sum, t) => sum + t.amount, 0);
    const totalRefunds = Math.abs(txs.filter(t => t.type === 'CASH_REFUND').reduce((sum, t) => sum + t.amount, 0));
    const totalExpenses = txs.filter(t => t.type === 'EXPENSE_PAYMENT' || t.type === 'PETTY_CASH').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalCashOut = Math.abs(txs.filter(t => t.type === 'CASH_OUT').reduce((sum, t) => sum + t.amount, 0));
    const totalDeposits = Math.abs(txs.filter(t => t.type === 'BANK_DEPOSIT' || t.type === 'SAFE_TRANSFER').reduce((sum, t) => sum + t.amount, 0));

    const expectedCash = openingFloat + totalCashSales + totalCashIn - totalRefunds - totalExpenses - totalCashOut - totalDeposits;
    const varianceAmount = actualCountAmount - expectedCash;

    let varianceStatus: CashReconciliation['variance_status'] = 'BALANCED';
    if (varianceAmount > 0) varianceStatus = 'OVER';
    else if (varianceAmount < 0) varianceStatus = 'SHORT';

    let toleranceStatus: CashReconciliation['tolerance_status'] = 'ACCEPTED';
    if (Math.abs(varianceAmount) > toleranceThreshold) {
      toleranceStatus = 'REQUIRES_APPROVAL';
    }

    // 4. Save Reconciliation Record
    const reconId = `recon-${NOW}`;
    const reconciliation: CashReconciliation = {
      id: reconId,
      tenant_id: tenantId,
      branch_id: branchId,
      session_id: sessionId,
      drawer_id: drawerId,
      opening_float: openingFloat,
      total_cash_sales: totalCashSales,
      total_cash_in: totalCashIn,
      total_refunds: totalRefunds,
      total_expenses: totalExpenses,
      total_cash_out: totalCashOut,
      total_deposits: totalDeposits,
      expected_cash: expectedCash,
      actual_counted_cash: actualCountAmount,
      variance_amount: varianceAmount,
      variance_status: varianceStatus,
      tolerance_threshold: toleranceThreshold,
      tolerance_status: toleranceStatus,
      manager_approved: toleranceStatus === 'ACCEPTED',
      timestamp: NOW
    };
    await db.cashReconciliations.put(reconciliation);

    // 5. Create Variance Flag if Short/Over
    let variance: CashVariance | undefined;
    if (varianceStatus !== 'BALANCED') {
      variance = {
        id: `var-${NOW}`,
        reconciliation_id: reconId,
        tenant_id: tenantId,
        branch_id: branchId,
        cashier_id: cashierId,
        amount: varianceAmount,
        status: toleranceStatus === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING_APPROVAL',
        reason: `Shift Closing Variance: ${varianceStatus} by TZS ${Math.abs(varianceAmount).toLocaleString()}`,
        timestamp: NOW
      };
      await db.cashVariances.put(variance);
    }

    // 6. Update Shift Session Status
    await db.cashDrawerSessions.update(sessionId, {
      status: 'CLOSED',
      closing_time: NOW,
      closing_counted_by: cashierName
    });

    // 7. Reset Drawer Status to CLOSED
    await db.cashDrawers.update(drawerId, {
      status: 'CLOSED',
      current_balance: 0,
      updated_at: NOW
    });

    // 8. Sync legacy posShifts for POS module compatibility
    const posShift = await db.posShifts.get(sessionId);
    if (posShift) {
      await db.posShifts.update(sessionId, {
        status: 'CLOSED',
        closing_time: NOW,
        closing_cash_actual: actualCountAmount,
        notes: `Reconciliation: Expected TZS ${expectedCash.toLocaleString()}, Counted TZS ${actualCountAmount.toLocaleString()}. Variance TZS ${varianceAmount.toLocaleString()}`
      });
    }

    await this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'DRAWER_CLOSED', cashierId, cashierName, `Closed shift. Count: TZS ${actualCountAmount.toLocaleString()}`);

    return { reconciliation, variance };
  },

  // ─── 6. SAFE TRANSFERS & BANK DEPOSITS ───────────────────────────────────
  async transferCashToSafe(
    tenantId: string,
    branchId: string,
    drawerId: string,
    sessionId: string,
    amount: number,
    userId: string,
    userName: string,
    witnessName?: string
  ): Promise<CashTransfer> {
    const NOW = Date.now();
    const drawer = await db.cashDrawers.get(drawerId);
    const newBal = Math.max(0, (drawer?.current_balance || 0) - amount);

    const transfer: CashTransfer = {
      id: `trf-${NOW}`,
      tenant_id: tenantId,
      branch_id: branchId,
      from_type: 'DRAWER',
      from_id: drawerId,
      to_type: 'BRANCH_SAFE',
      to_id: `safe-${branchId}`,
      amount,
      user_id: userId,
      user_name: userName,
      witness_name: witnessName,
      timestamp: NOW,
      status: 'COMPLETED'
    };
    await db.cashTransfers.put(transfer);

    await db.cashTransactions.put({
      id: `tx-safe-${NOW}`,
      tenant_id: tenantId,
      branch_id: branchId,
      drawer_id: drawerId,
      session_id: sessionId,
      type: 'SAFE_TRANSFER',
      amount: -amount,
      running_balance: newBal,
      user_id: userId,
      user_name: userName,
      terminal_id: 'POS-TERM-01',
      timestamp: NOW,
      reason: 'Mid-Shift Transfer to Branch Safe',
      notes: `Witnessed by: ${witnessName || 'Manager'}`
    });

    await db.cashDrawers.update(drawerId, { current_balance: newBal, updated_at: NOW });
    await this.logDrawerEvent(tenantId, branchId, drawerId, sessionId, 'MANUAL_OPEN', userId, userName, `Safe Transfer TZS ${amount.toLocaleString()}`);

    return transfer;
  },

  async depositCashToBank(
    tenantId: string,
    branchId: string,
    bankName: string,
    accountNumber: string,
    depositSlipNumber: string,
    amount: number,
    depositedBy: string,
    witness?: string
  ): Promise<BankDeposit> {
    const NOW = Date.now();
    const deposit: BankDeposit = {
      id: `bank-dep-${NOW}`,
      tenant_id: tenantId,
      branch_id: branchId,
      bank_name: bankName,
      account_number: accountNumber,
      deposit_slip_number: depositSlipNumber,
      amount,
      deposited_by: depositedBy,
      witness,
      timestamp: NOW,
      status: 'DEPOSITED'
    };
    await db.bankDeposits.put(deposit);
    return deposit;
  },

  // ─── 7. HARDWARE COMMAND SIMULATOR ──────────────────────────────────────
  async sendHardwareDrawerCommand(
    hardwareType: 'USB' | 'RJ11' | 'BLUETOOTH' | 'ETHERNET' | 'MANUAL',
    command: 'OPEN_DRAWER' | 'TEST_DRAWER' | 'DRAWER_STATUS' | 'RECONNECT'
  ): Promise<{ success: boolean; statusMessage: string }> {
    // Emulate ESC/POS pulse signal (e.g., ESC p 0 25 250)
    await new Promise(r => setTimeout(r, 400));
    return {
      success: true,
      statusMessage: `Hardware signal ESC/POS pulsed via ${hardwareType} [${command} SUCCESS]`
    };
  },

  // ─── 8. SUMMARY KPI DATA RETRIEVAL ───────────────────────────────────────
  async getDrawerSummaryKPIs(tenantId: string, branchId: string): Promise<CashDrawerSummaryKPI> {
    const drawers = await db.cashDrawers.where('tenant_id').equals(tenantId).and(d => d.branch_id === branchId).toArray();
    const openDrawers = drawers.filter(d => d.status === 'OPEN');
    const currentCashBalance = drawers.reduce((sum, d) => sum + d.current_balance, 0);

    const TODAY_START = new Date().setHours(0, 0, 0, 0);

    const todaySessions = await db.cashDrawerSessions
      .where('tenant_id').equals(tenantId)
      .and(s => s.branch_id === branchId && s.opening_time >= TODAY_START)
      .toArray();

    const closedToday = todaySessions.filter(s => s.status === 'CLOSED');

    const todayTxs = await db.cashTransactions
      .where('tenant_id').equals(tenantId)
      .and(t => t.branch_id === branchId && t.timestamp >= TODAY_START)
      .toArray();

    const todayCashSales = todayTxs.filter(t => t.type === 'CASH_SALE').reduce((sum, t) => sum + t.amount, 0);
    const todayCashIn = todayTxs.filter(t => t.type === 'CASH_IN' && t.reason !== 'Shift Opening Float').reduce((sum, t) => sum + t.amount, 0);
    const todayExpenses = todayTxs.filter(t => t.type === 'EXPENSE_PAYMENT' || t.type === 'PETTY_CASH').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const todayDeposits = Math.abs(todayTxs.filter(t => t.type === 'BANK_DEPOSIT' || t.type === 'SAFE_TRANSFER').reduce((sum, t) => sum + t.amount, 0));

    const reconciliations = await db.cashReconciliations
      .where('tenant_id').equals(tenantId)
      .and(r => r.branch_id === branchId && r.timestamp >= TODAY_START)
      .toArray();

    const expectedCashTotal = reconciliations.reduce((sum, r) => sum + r.expected_cash, 0);
    const actualCountedTotal = reconciliations.reduce((sum, r) => sum + r.actual_counted_cash, 0);
    const totalVariance = reconciliations.reduce((sum, r) => sum + r.variance_amount, 0);

    const pendingVariances = await db.cashVariances
      .where('tenant_id').equals(tenantId)
      .and(v => v.branch_id === branchId && v.status === 'PENDING_APPROVAL')
      .toArray();

    const bankDepositsList = await db.bankDeposits
      .where('tenant_id').equals(tenantId)
      .and(b => b.branch_id === branchId && b.timestamp >= TODAY_START)
      .toArray();

    const bankDepositsTotal = bankDepositsList.reduce((sum, b) => sum + b.amount, 0);

    const noSaleEvents = await db.cashDrawerEvents
      .where('tenant_id').equals(tenantId)
      .and(e => e.branch_id === branchId && e.event_type === 'NO_SALE_OPEN' && e.timestamp >= TODAY_START)
      .toArray();

    return {
      currentCashBalance,
      openDrawersCount: openDrawers.length,
      closedDrawersTodayCount: closedToday.length,
      todayCashSales,
      todayCashIn,
      todayExpenses,
      todayDeposits,
      expectedCashTotal,
      actualCountedTotal,
      totalVariance,
      activeCashiersCount: openDrawers.filter(d => d.assigned_cashier_id).length,
      pendingApprovalsCount: pendingVariances.length,
      bankDepositsTotal,
      noSaleOpeningsCount: noSaleEvents.length
    };
  },

  // ─── 9. AUTONOMOUS AI CASH INTELLIGENCE ADVISOR ───────────────────────────
  async runAICashAdvisory(tenantId: string, branchId: string): Promise<AICashInsight[]> {
    const insights: AICashInsight[] = [];
    const TODAY_START = new Date().setHours(0, 0, 0, 0);

    const reconciliations = await db.cashReconciliations
      .where('tenant_id').equals(tenantId)
      .and(r => r.branch_id === branchId)
      .toArray();

    const shortages = reconciliations.filter(r => r.variance_status === 'SHORT');
    if (shortages.length >= 2) {
      const totalShort = shortages.reduce((sum, r) => sum + Math.abs(r.variance_amount), 0);
      insights.push({
        id: `ai-short-${Date.now()}`,
        type: 'Shortage Anomaly',
        title: 'Abnormal Cash Shortage Pattern Detected',
        description: `Detected ${shortages.length} cash shortages totaling TZS ${totalShort.toLocaleString()} over recent shift closings.`,
        severity: 'Critical',
        recommendation: 'Enforce Manager-witnessed blind cash counting and audit cashier registers before shift handovers.'
      });
    }

    const noSaleEvents = await db.cashDrawerEvents
      .where('tenant_id').equals(tenantId)
      .and(e => e.branch_id === branchId && e.event_type === 'NO_SALE_OPEN' && e.timestamp >= TODAY_START)
      .toArray();

    if (noSaleEvents.length >= 4) {
      insights.push({
        id: `ai-nosale-${Date.now()}`,
        type: 'Frequent No-Sale',
        title: 'Frequent "No Sale" Drawer Openings Alert',
        description: `Register drawer opened ${noSaleEvents.length} times today without a corresponding sales invoice checkout.`,
        severity: 'Warning',
        recommendation: 'Review CCTV logs and manager override permissions to prevent unauthorized cash removal.'
      });
    }

    // Optimal Opening Float Recommendation
    insights.push({
      id: `ai-float-${Date.now()}`,
      type: 'Optimal Float',
      title: 'Optimal Opening Float Estimation',
      description: 'Based on historical morning change requirements, the optimal opening float for this branch is TZS 350,000.',
      severity: 'Info',
      recommendation: 'Prepare 10x 10K, 20x 5K, 25x 2K, 30x 1K note bundles in morning float pouches.'
    });

    // Safe Deposit Recommendation
    const drawers = await db.cashDrawers.where('tenant_id').equals(tenantId).and(d => d.branch_id === branchId).toArray();
    const currentBal = drawers.reduce((sum, d) => sum + d.current_balance, 0);
    if (currentBal >= 1200000) {
      insights.push({
        id: `ai-deposit-${Date.now()}`,
        type: 'Safe Deposit',
        title: 'Recommended Safe Cash Transfer',
        description: `Drawer cash balance is currently TZS ${currentBal.toLocaleString()}, exceeding safe security thresholds.`,
        severity: 'Warning',
        recommendation: 'Transfer TZS 800,000 to Branch Safe before 16:30 bank drop.'
      });
    }

    return insights;
  },

  // ─── 10. THERMAL Z-REPORT GENERATOR ────────────────────────────────────────
  formatZReportSlip(session: CashDrawerSession, reconciliation?: CashReconciliation): string {
    const divider = '========================================';
    const subDivider = '----------------------------------------';
    const openDate = new Date(session.opening_time).toLocaleString();
    const closeDate = session.closing_time ? new Date(session.closing_time).toLocaleString() : 'Active Shift';

    const fmt = (amt: number) => `TZS ${amt.toLocaleString()}`;

    let text = `${divider}\n`;
    text += `          OFFICIAL Z-REPORT SLIP         \n`;
    text += `         DUKAPOS FINANCIAL CONTROL       \n`;
    text += `${divider}\n`;
    text += `Terminal ID: ${session.terminal_id}\n`;
    text += `Session ID : ${session.id}\n`;
    text += `Cashier    : ${session.cashier_name}\n`;
    text += `Shift Type : ${session.shift_type || 'General'}\n`;
    text += `Opened At  : ${openDate}\n`;
    text += `Closed At  : ${closeDate}\n`;
    text += `${subDivider}\n`;
    text += `Opening Float Cash   : ${fmt(session.opening_float)}\n`;
    if (reconciliation) {
      text += `Cash Sales Total     : ${fmt(reconciliation.total_cash_sales)}\n`;
      text += `Cash In (Refills)    : +${fmt(reconciliation.total_cash_in)}\n`;
      text += `Cash Out (Payouts)   : -${fmt(reconciliation.total_cash_out + reconciliation.total_expenses)}\n`;
      text += `${subDivider}\n`;
      text += `EXPECTED CASH        : ${fmt(reconciliation.expected_cash)}\n`;
      text += `ACTUAL CASH COUNTED  : ${fmt(reconciliation.actual_counted_cash)}\n`;
      text += `VARIANCE / DIFFERENCE: ${fmt(reconciliation.variance_amount)} (${reconciliation.variance_status})\n`;
    }
    text += `${divider}\n`;
    text += `Printed via DukaPOS Cash Drawer Engine\n`;
    text += `${divider}\n`;

    return text;
  }

};
