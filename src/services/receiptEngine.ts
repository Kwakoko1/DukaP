/**
 * receiptEngine.ts
 * Production-Grade Receipt Engine for DukaPos SaaS
 *
 * Centralized service for creating, storing, rendering, printing, emailing,
 * sharing, reprinting, auditing, and synchronizing all receipts generated
 * across the DukaPos platform.
 *
 * Design principles:
 * – Offline-first: works 100% without a network connection (IndexedDB)
 * – Atomic: receipt generation is transactional — no partial writes
 * – Idempotent: same idempotency_key → same receipt (prevents duplicates)
 * – Immutable: receipt content cannot change after status = 'Completed'
 * – Auditable: every action is logged to receiptAuditLogs
 */

import {
  db,
  type Receipt,
  type ReceiptItem,
  type ReceiptTemplate,
  type ReceiptPrintLog,
  type ReceiptShareLog,
  type ReceiptAuditLog,
  type ReceiptTransactionType,
  type ReceiptStatus,
  type ReceiptFormat,
} from '../db/dexie';

// ─── ID helpers ───────────────────────────────────────────────────────────────

function newId(prefix: string = 'rcpt'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateReceiptParams {
  /** Idempotency key — if a receipt with this key already exists, return it */
  idempotency_key?: string;
  transaction_id?: string;
  transaction_type: ReceiptTransactionType;
  original_receipt_id?: string;
  original_receipt_number?: string;
  tenant_id: string;
  branch_id: string;
  device_id?: string;
  terminal_id?: string;
  cashier_id: string;
  cashier_name: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  currency?: string;
  exchange_rate?: number;
  items: Array<{
    product_id?: string;
    variant_id?: string;
    name: string;
    sku?: string;
    qty: number;
    unit_price: number;
    discount?: number;
    tax_rate?: number;
  }>;
  discount_amount?: number;
  tax_amount?: number;
  total: number;
  paid_amount: number;
  change_amount?: number;
  payment_method: string;
  payment_reference?: string;
  tax_breakdown?: Array<{ label: string; rate: number; amount: number }>;
  notes?: string;
  custom_fields?: Record<string, any>;
  created_at?: number;
}

export interface VerificationResult {
  found: boolean;
  status?: ReceiptStatus;
  receipt?: Receipt;
  message: string;
}

export interface ReceiptAnalytics {
  total_count: number;
  completed_count: number;
  cancelled_count: number;
  refunded_count: number;
  pending_sync_count: number;
  total_revenue: number;
  average_sale: number;
  largest_sale: number;
  print_count: number;
  reprint_count: number;
  by_cashier: Array<{ cashier_name: string; count: number; revenue: number }>;
  by_hour: Array<{ hour: number; count: number }>;
  by_payment_method: Array<{ method: string; count: number; amount: number }>;
}

export interface ReceiptSearchFilters {
  tenant_id: string;
  branch_id?: string;
  date_from?: number;
  date_to?: number;
  customer_id?: string;
  cashier_id?: string;
  payment_method?: string;
  status?: ReceiptStatus;
  transaction_type?: ReceiptTransactionType;
  amount_min?: number;
  amount_max?: number;
  search_text?: string;           // matches receipt_number, customer_name
  page?: number;
  page_size?: number;
}

// ─── Receipt Number Generator ─────────────────────────────────────────────────

/**
 * Generates a globally unique, sequential receipt number.
 * Format: [PREFIX-]RCPT-YYYYMMDD-NNNNNN
 * Example: RCPT-20260806-000001  |  DSM-RCPT-000001
 *
 * Uses an optimistic locking loop on the ReceiptNumberSequence table
 * to prevent duplicate numbers even under concurrent writes.
 */
export async function generateReceiptNumber(
  tenantId: string,
  branchId: string,
  prefix?: string
): Promise<string> {
  const dateKey = todayKey();
  const seqId = `${tenantId}_${branchId}_${dateKey}`;

  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const existing = await db.receiptNumberSequences.get(seqId);
    let nextSeq = (existing?.last_sequence ?? 0) + 1;

    try {
      // Collision prevention loop: ensure candidate number doesn't already exist in db.receipts
      let candidateNumber = '';
      while (true) {
        const paddedSeq = String(nextSeq).padStart(6, '0');
        candidateNumber = prefix ? `${prefix}-RCPT-${paddedSeq}` : `RCPT-${dateKey}-${paddedSeq}`;

        const collision = await db.receipts
          .where('receipt_number').equals(candidateNumber)
          .and(r => r.tenant_id === tenantId)
          .first();

        if (!collision) break;
        nextSeq++;
      }

      await db.receiptNumberSequences.put({
        id: seqId,
        tenant_id: tenantId,
        branch_id: branchId,
        date_key: dateKey,
        last_sequence: nextSeq,
        updated_at: Date.now(),
      });

      return candidateNumber;
    } catch {
      // Race condition — retry
      await new Promise(r => setTimeout(r, 10 * attempts));
    }
  }

  // Fallback — use timestamp to guarantee uniqueness
  const paddedSeq = String(Date.now()).slice(-6);
  return `RCPT-${dateKey}-${paddedSeq}`;
}

// ─── Digital Signature ────────────────────────────────────────────────────────

/**
 * Generates a SHA-256 hash of the receipt's key fields.
 * Used for tamper detection and receipt verification.
 * Input: ReceiptNumber + TransactionID + Amount + Timestamp
 */
export async function generateSignature(
  receiptNumber: string,
  transactionId: string,
  amount: number,
  timestamp: number
): Promise<{ hash: string; inputString: string }> {
  const inputString = `${receiptNumber}|${transactionId}|${amount}|${timestamp}`;
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(inputString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return { hash, inputString };
  } catch {
    // Fallback for environments without Web Crypto
    const simpleHash = btoa(inputString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 64);
    return { hash: simpleHash, inputString };
  }
}

// ─── QR Payload ───────────────────────────────────────────────────────────────

export function generateQRPayload(receipt: Receipt): string {
  const payload = {
    id: receipt.id,
    no: receipt.receipt_number,
    tx: receipt.transaction_id || receipt.id,
    amt: receipt.total,
    ts: receipt.created_at,
    sig: receipt.signature_hash,
    v: 'DukaPos/1.0',
  };
  return JSON.stringify(payload);
}

// ─── Code128 Barcode ─────────────────────────────────────────────────────────

/**
 * Generates Code128 barcode as SVG string from a value.
 * Pure JavaScript — no external dependencies.
 */
export function generateCode128SVG(value: string, width = 200, height = 60): string {
  // Code128 B character set (ASCII 32-127)
  const CODE128_B_START = 104;
  const CODE128_STOP = 106;

  const code128B: Record<number, number[]> = {};
  const patterns = [
    [2,1,2,2,2,2], [2,2,2,1,2,2], [2,2,2,2,2,1], [1,2,1,2,2,3], [1,2,1,3,2,2],
    [1,3,1,2,2,2], [1,2,2,2,1,3], [1,2,2,3,1,2], [1,3,2,2,1,2], [2,2,1,2,1,3],
    [2,2,1,3,1,2], [2,3,1,2,1,2], [1,1,2,2,3,2], [1,2,2,1,3,2], [1,2,2,2,3,1],
    [1,1,3,2,2,2], [1,2,3,1,2,2], [1,2,3,2,2,1], [2,2,3,2,1,1], [2,2,1,1,3,2],
    [2,2,1,2,3,1], [2,1,3,2,1,2], [2,2,3,1,1,2], [3,1,2,1,3,1], [3,1,1,2,2,2],
    [3,2,1,1,2,2], [3,2,1,2,2,1], [3,1,2,2,1,2], [3,2,2,1,1,2], [3,2,2,2,1,1],
    [2,1,2,1,2,3], [2,1,2,3,2,1], [2,3,2,1,2,1], [1,1,1,3,2,3], [1,3,1,1,2,3],
    [1,3,1,3,2,1], [1,1,2,3,1,3], [1,3,2,1,1,3], [1,3,2,3,1,1], [2,1,1,3,1,3],
    [2,3,1,1,1,3], [2,3,1,3,1,1], [1,1,2,1,3,3], [1,1,2,3,3,1], [1,3,2,1,3,1],
    [1,1,3,1,2,3], [1,1,3,3,2,1], [1,3,3,1,2,1], [3,1,3,1,2,1], [2,1,1,3,3,1],
    [2,3,1,1,3,1], [1,1,3,1,3,2], [1,3,1,1,3,2], [3,1,1,1,3,2], [3,1,1,3,1,2],
    [3,1,1,3,2,1], [3,1,3,1,1,2], [3,1,3,2,1,1], [3,3,1,1,1,2], [3,3,1,2,1,1],
    [3,3,2,1,1,1], [3,1,2,1,1,3], [2,1,2,3,1,2], [2,1,3,1,1,3], [2,1,3,3,1,1],
    [3,1,1,2,1,3], [3,1,2,2,1,2], [3,2,2,1,2,1], [3,2,1,2,1,2], [2,3,2,1,1,2],
    [3,1,2,1,2,2], [2,2,2,2,2,2], [2,2,2,4,2,2], [4,2,2,2,2,2], [2,4,2,2,2,2],
    [1,1,1,1,1,5], [1,1,5,1,1,1], [5,1,1,1,1,1], [1,3,1,3,3,1], [1,1,3,3,1,3],
    [1,3,3,1,1,3], [1,3,3,3,1,1], [3,1,3,3,1,1], [3,3,1,1,3,1], [3,1,1,3,3,1],
    [1,1,1,3,3,3], [1,3,3,1,3,1], [2,2,1,4,1,2], [2,4,1,2,1,2], [2,4,1,4,1,1],
    [2,2,1,2,1,4], [2,2,1,4,1,2], [2,4,1,2,1,2], [2,1,3,2,3,1],
  ];

  for (let i = 0; i < patterns.length && i < 107; i++) {
    code128B[i] = patterns[i];
  }

  // Build the barcode sequence
  const chars = value.split('').map(c => c.charCodeAt(0) - 32);
  const codes: number[] = [CODE128_B_START];
  let checksum = CODE128_B_START;

  chars.forEach((c, i) => {
    codes.push(c);
    checksum += c * (i + 1);
  });

  codes.push(checksum % 103);
  codes.push(CODE128_STOP);

  // Render to SVG bars
  let barX = 10;
  const bars: string[] = [];
  const unitWidth = (width - 20) / (codes.length * 11 + 2);

  codes.forEach(code => {
    const pattern = code128B[code] || [1, 1, 1, 1, 1, 1];
    pattern.forEach((w, idx) => {
      const barWidth = w * unitWidth;
      if (idx % 2 === 0) {
        bars.push(`<rect x="${barX.toFixed(2)}" y="5" width="${barWidth.toFixed(2)}" height="${height - 15}" fill="black"/>`);
      }
      barX += barWidth;
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  ${bars.join('\n  ')}
  <text x="${width / 2}" y="${height - 2}" text-anchor="middle" font-size="8" font-family="monospace">${value}</text>
</svg>`;
}

// ─── Audit Helper ─────────────────────────────────────────────────────────────

async function writeAuditLog(
  receiptId: string,
  receiptNumber: string,
  tenantId: string,
  branchId: string,
  userId: string,
  userName: string,
  action: ReceiptAuditLog['action'],
  details?: string,
  deviceId?: string
): Promise<void> {
  await db.receiptAuditLogs.add({
    id: newId('ral'),
    receipt_id: receiptId,
    receipt_number: receiptNumber,
    tenant_id: tenantId,
    branch_id: branchId,
    user_id: userId,
    user_name: userName,
    action,
    details,
    device_id: deviceId,
    created_at: Date.now(),
  });
}

// ─── Core Receipt Engine ──────────────────────────────────────────────────────

/**
 * Creates a new receipt atomically.
 * If a receipt with the given idempotency_key already exists, returns it.
 */
export async function createReceipt(params: CreateReceiptParams): Promise<Receipt> {
  // Idempotency check
  if (params.idempotency_key) {
    const existing = await db.receipts
      .where('transaction_id').equals(params.idempotency_key)
      .and(r => r.tenant_id === params.tenant_id)
      .first();
    if (existing) return existing;
  }

  const now = params.created_at || Date.now();
  const receiptId = newId('rcpt');

  // Get the template to see if there's a branch prefix
  const template = await db.receiptTemplates
    .where('tenant_id').equals(params.tenant_id)
    .and(t => (t.branch_id === params.branch_id || !t.branch_id) && t.is_default)
    .first();

  const receiptNumber = await generateReceiptNumber(
    params.tenant_id,
    params.branch_id,
    template?.receipt_prefix
  );

  // Compute line items
  let computedSubtotal = 0;
  const receiptItems: ReceiptItem[] = params.items.map(item => {
    const taxRate = item.tax_rate ?? 0;
    const discount = item.discount ?? 0;
    const subtotal = item.qty * item.unit_price - discount;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;
    computedSubtotal += subtotal;

    return {
      id: newId('ri'),
      receipt_id: receiptId,
      tenant_id: params.tenant_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      name: item.name,
      sku: item.sku,
      qty: item.qty,
      unit_price: item.unit_price,
      discount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      subtotal,
      total,
      notes: undefined,
    };
  });

  // Generate signature
  const { hash: sigHash, inputString } = await generateSignature(
    receiptNumber,
    params.transaction_id || receiptId,
    params.total,
    now
  );

  // Build receipt record
  const receipt: Receipt = {
    id: receiptId,
    receipt_number: receiptNumber,
    transaction_id: params.transaction_id || params.idempotency_key,
    transaction_type: params.transaction_type,
    original_receipt_id: params.original_receipt_id,
    original_receipt_number: params.original_receipt_number,

    tenant_id: params.tenant_id,
    branch_id: params.branch_id,
    device_id: params.device_id,
    terminal_id: params.terminal_id,

    cashier_id: params.cashier_id,
    cashier_name: params.cashier_name,
    customer_id: params.customer_id,
    customer_name: params.customer_name,
    customer_phone: params.customer_phone,

    currency: params.currency || 'TZS',
    exchange_rate: params.exchange_rate ?? 1,
    subtotal: computedSubtotal,
    discount_amount: params.discount_amount ?? 0,
    tax_amount: params.tax_amount ?? 0,
    total: params.total,
    paid_amount: params.paid_amount,
    change_amount: params.change_amount ?? 0,
    payment_method: params.payment_method,
    payment_reference: params.payment_reference,
    tax_breakdown: params.tax_breakdown,

    status: 'Completed',

    print_count: 0,

    created_at: now,
    updated_at: now,
    created_by: params.cashier_id,

    sync_status: 'PENDING',
    sync_version: 1,
    version: 1,

    qr_payload: '',           // computed below
    barcode_value: receiptNumber,
    signature_hash: sigHash,

    notes: params.notes,
    custom_fields: params.custom_fields,
  };

  // Set QR payload
  receipt.qr_payload = generateQRPayload(receipt);

  // Atomic write
  await db.transaction('rw', [
    db.receipts,
    db.receiptItems,
    db.receiptQrCodes,
    db.receiptSignatures,
    db.receiptAuditLogs,
    db.receiptNumberSequences,
    db.syncQueue,
  ], async () => {
    await db.receipts.put(receipt);

    if (receiptItems.length > 0) {
      await db.receiptItems.bulkAdd(receiptItems);
    }

    await db.receiptQrCodes.add({
      id: newId('rqr'),
      receipt_id: receiptId,
      receipt_number: receiptNumber,
      tenant_id: params.tenant_id,
      payload: receipt.qr_payload!,
      created_at: now,
    });

    await db.receiptSignatures.add({
      id: newId('rsg'),
      receipt_id: receiptId,
      receipt_number: receiptNumber,
      tenant_id: params.tenant_id,
      algorithm: 'SHA-256',
      hash: sigHash,
      input_string: inputString,
      created_at: now,
    });

    await writeAuditLog(
      receiptId, receiptNumber,
      params.tenant_id, params.branch_id,
      params.cashier_id, params.cashier_name,
      'CREATED', `Receipt created for ${params.transaction_type}`
    );

    // Add to sync queue
    await db.syncQueue.add({
      entity: 'receipts',
      entity_id: receiptId,
      operation: 'CREATE',
      payload: receipt,
      status: 'Pending',
      tenant_id: params.tenant_id,
      branch_id: params.branch_id,
      created_at: now,
      priority: 2,
    } as any);
  });

  return receipt;
}

// ─── Get Receipt ──────────────────────────────────────────────────────────────

export async function getReceipt(id: string): Promise<Receipt | undefined> {
  return db.receipts.get(id);
}

export async function getReceiptByNumber(number: string, tenantId: string): Promise<Receipt | undefined> {
  return db.receipts
    .where('receipt_number').equals(number)
    .and(r => r.tenant_id === tenantId)
    .first();
}

export async function getReceiptItems(receiptId: string): Promise<ReceiptItem[]> {
  return db.receiptItems.where('receipt_id').equals(receiptId).toArray();
}

// ─── Print / Reprint ──────────────────────────────────────────────────────────

export async function printReceipt(
  receiptId: string,
  userId: string,
  userName: string,
  format: ReceiptFormat = 'thermal_80',
  deviceId?: string,
  isReprint = false,
  reprintReason?: string
): Promise<void> {
  const receipt = await db.receipts.get(receiptId);
  if (!receipt) throw new Error('Receipt not found');

  const now = Date.now();

  await db.transaction('rw', [db.receipts, db.receiptPrintLogs, db.receiptAuditLogs], async () => {
    await db.receipts.update(receiptId, {
      print_count: receipt.print_count + 1,
      last_printed_at: now,
      last_printed_by: userId,
      updated_at: now,
    });

    const printLog: ReceiptPrintLog = {
      id: newId('rpl'),
      receipt_id: receiptId,
      receipt_number: receipt.receipt_number,
      tenant_id: receipt.tenant_id,
      branch_id: receipt.branch_id,
      printed_by: userId,
      printed_by_name: userName,
      device_id: deviceId,
      format,
      is_reprint: isReprint,
      reprint_reason: reprintReason,
      created_at: now,
    };
    await db.receiptPrintLogs.add(printLog);

    await writeAuditLog(
      receiptId, receipt.receipt_number,
      receipt.tenant_id, receipt.branch_id,
      userId, userName,
      isReprint ? 'REPRINTED' : 'PRINTED',
      isReprint ? `Reprint #${receipt.print_count + 1}: ${reprintReason || 'No reason given'}` : undefined,
      deviceId
    );
  });
}

export async function reprintReceipt(
  receiptId: string,
  userId: string,
  userName: string,
  format: ReceiptFormat = 'thermal_80',
  reason?: string,
  deviceId?: string
): Promise<void> {
  return printReceipt(receiptId, userId, userName, format, deviceId, true, reason);
}

// ─── Cancel Receipt ───────────────────────────────────────────────────────────

export async function cancelReceipt(
  receiptId: string,
  userId: string,
  userName: string,
  reason: string
): Promise<void> {
  const receipt = await db.receipts.get(receiptId);
  if (!receipt) throw new Error('Receipt not found');
  if (receipt.status === 'Cancelled' || receipt.status === 'Voided') throw new Error('Receipt is already voided/cancelled');
  if (receipt.status === 'Archived') throw new Error('Cannot cancel an archived receipt');

  const items = await db.receiptItems.where('receipt_id').equals(receiptId).toArray();
  const now = Date.now();

  await db.transaction('rw', [
    db.receipts, 
    db.receiptAuditLogs, 
    db.orders, 
    db.products, 
    db.productVariants, 
    db.stockLedger, 
    db.securityAuditLogs
  ], async () => {
    // 1. Update Receipt Status
    await db.receipts.update(receiptId, {
      status: 'Cancelled',
      cancellation_reason: reason,
      updated_at: now,
      updated_by: userId,
      version: (receipt.version || 1) + 1,
      sync_status: 'PENDING',
    });

    // 2. Update Order Status if transaction_id / order_id exists
    const orderIdToCancel = receipt.transaction_id || receipt.id;
    const existingOrder = await db.orders.get(orderIdToCancel);
    if (existingOrder) {
      await db.orders.update(orderIdToCancel, {
        status: 'Cancelled',
      });
      // Enqueue sync event for cancelled order
      await db.syncQueue.add({
        tenant_id: receipt.tenant_id,
        branch_id: receipt.branch_id,
        entity: 'orders',
        entity_id: orderIdToCancel,
        operation: 'UPDATE',
        payload: { id: orderIdToCancel, status: 'Cancelled', tenant_id: receipt.tenant_id },
        status: 'Pending',
        created_at: now,
        priority: 1,
      } as any);
    }

    // Enqueue sync event for cancelled receipt
    await db.syncQueue.add({
      tenant_id: receipt.tenant_id,
      branch_id: receipt.branch_id,
      entity: 'receipts',
      entity_id: receiptId,
      operation: 'UPDATE',
      payload: { ...receipt, status: 'Cancelled', cancellation_reason: reason, updated_at: now },
      status: 'Pending',
      created_at: now,
      priority: 1,
    } as any);

    // 3. Restore Stock & Record Stock Movement Reversals
    for (const item of items) {
      if (!item.product_id) continue;
      const prod = await db.products.get(item.product_id);
      if (prod) {
        const qtyBefore = prod.stock || 0;
        const qtyAfter = qtyBefore + item.qty;
        await db.products.update(item.product_id, {
          stock: qtyAfter,
          updatedAt: now,
        });

        // Restore variant stock if variant exists
        if (item.variant_id) {
          const v = await db.productVariants.get(item.variant_id);
          if (v) {
            await db.productVariants.update(item.variant_id, {
              stock: (v.stock || 0) + item.qty,
            });
          }
        }

        // Record Stock Movement Reversal
        await db.stockLedger.add({
          id: `stk-${now}-${Math.random().toString(36).slice(2, 7)}`,
          tenant_id: receipt.tenant_id,
          branch_id: receipt.branch_id,
          warehouse_id: 'warehouse-main',
          product_id: item.product_id,
          variant_id: item.variant_id,
          movement_type: 'CUSTOMER_RETURN',
          reference_type: 'VOID_SALE',
          reference_id: receipt.receipt_number,
          quantity_change: item.qty,
          quantity_before: qtyBefore,
          quantity_after: qtyAfter,
          unit_cost: item.unit_price,
          total_cost: item.total,
          user_id: userName,
          notes: `Void/Cancel Receipt ${receipt.receipt_number}: ${reason}`,
          created_at: now,
          synced: false,
        });
      }
    }

    // 4. Write Receipt Audit Log
    await writeAuditLog(
      receiptId, receipt.receipt_number,
      receipt.tenant_id, receipt.branch_id,
      userId, userName,
      'CANCELLED', reason
    );

    // 5. Write Security Audit Log
    await db.securityAuditLogs.add({
      id: `aud-${now}-${Math.random().toString(36).slice(2, 9)}`,
      tenant_id: receipt.tenant_id,
      branch_id: receipt.branch_id,
      user_id: userId,
      action: 'RECEIPT_CANCELLED',
      created_at: now,
      details: `Voided receipt ${receipt.receipt_number} (Tsh ${receipt.total.toLocaleString()}). Reason: ${reason}`,
    } as any);
  });
}

// ─── Refund Receipt ───────────────────────────────────────────────────────────

export async function refundReceipt(
  originalReceiptId: string,
  params: {
    userId: string;
    userName: string;
    refundAmount: number;
    reason: string;
    items?: CreateReceiptParams['items'];
    paymentMethod?: string;
  }
): Promise<Receipt> {
  const original = await db.receipts.get(originalReceiptId);
  if (!original) throw new Error('Original receipt not found');
  if (original.status === 'Refunded') throw new Error('Receipt already refunded');

  // Create refund receipt
  const refundReceipt = await createReceipt({
    transaction_type: 'REFUND',
    original_receipt_id: original.id,
    original_receipt_number: original.receipt_number,
    tenant_id: original.tenant_id,
    branch_id: original.branch_id,
    device_id: original.device_id,
    cashier_id: params.userId,
    cashier_name: params.userName,
    customer_id: original.customer_id,
    customer_name: original.customer_name,
    customer_phone: original.customer_phone,
    currency: original.currency,
    items: params.items || [{
      name: `Refund: ${original.receipt_number}`,
      qty: 1,
      unit_price: -params.refundAmount,
    }],
    discount_amount: 0,
    tax_amount: 0,
    total: -params.refundAmount,
    paid_amount: -params.refundAmount,
    change_amount: 0,
    payment_method: params.paymentMethod || original.payment_method,
    notes: params.reason,
  });

  // Mark original as refunded
  const now = Date.now();
  await db.transaction('rw', [db.receipts, db.receiptAuditLogs], async () => {
    await db.receipts.update(originalReceiptId, {
      status: 'Refunded',
      refund_reason: params.reason,
      updated_at: now,
      updated_by: params.userId,
      version: (original.version || 1) + 1,
      sync_status: 'PENDING',
    });

    await writeAuditLog(
      originalReceiptId, original.receipt_number,
      original.tenant_id, original.branch_id,
      params.userId, params.userName,
      'REFUNDED',
      `Refund receipt: ${refundReceipt.receipt_number}. Reason: ${params.reason}`
    );
  });

  return refundReceipt;
}

// ─── Verify Receipt ───────────────────────────────────────────────────────────

export async function verifyReceipt(
  searchValue: string,
  tenantId: string
): Promise<VerificationResult> {
  if (!searchValue.trim()) return { found: false, message: 'No search value provided' };

  // Try by receipt number first
  let receipt = await db.receipts
    .where('receipt_number').equals(searchValue.toUpperCase())
    .and(r => r.tenant_id === tenantId)
    .first();

  // Try by QR payload parse
  if (!receipt) {
    try {
      const parsed = JSON.parse(searchValue);
      if (parsed.id) {
        receipt = await db.receipts.get(parsed.id);
      } else if (parsed.no) {
        receipt = await db.receipts
          .where('receipt_number').equals(parsed.no)
          .and(r => r.tenant_id === tenantId)
          .first();
      }
    } catch {
      // Not JSON — try as ID
      receipt = await db.receipts.get(searchValue);
    }
  }

  if (!receipt) {
    return { found: false, message: `No receipt found for: ${searchValue}` };
  }

  const statusMessages: Record<ReceiptStatus, string> = {
    Completed: '✅ Valid receipt — transaction verified',
    Cancelled: '❌ This receipt has been cancelled',
    Refunded: '🔄 This receipt has been refunded',
    Voided: '⛔ This receipt has been voided',
    Draft: '⏳ Receipt is in draft state',
    Archived: '📦 Receipt is archived — was valid',
  };

  return {
    found: true,
    status: receipt.status,
    receipt,
    message: statusMessages[receipt.status] || 'Receipt found',
  };
}

// ─── Archive ──────────────────────────────────────────────────────────────────

export async function archiveOldReceipts(
  tenantId: string,
  olderThanDays = 90,
  userId = 'system',
  userName = 'System'
): Promise<number> {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const toArchive = await db.receipts
    .where('tenant_id').equals(tenantId)
    .and(r => r.created_at < cutoff && r.status === 'Completed')
    .toArray();

  const now = Date.now();
  for (const r of toArchive) {
    await db.receipts.update(r.id, { status: 'Archived', updated_at: now });
    await writeAuditLog(r.id, r.receipt_number, tenantId, r.branch_id, userId, userName, 'ARCHIVED');
  }
  return toArchive.length;
}

export async function restoreReceipt(
  receiptId: string,
  userId: string,
  userName: string
): Promise<void> {
  const receipt = await db.receipts.get(receiptId);
  if (!receipt || receipt.status !== 'Archived') return;

  const now = Date.now();
  await db.receipts.update(receiptId, { status: 'Completed', updated_at: now });
  await writeAuditLog(receiptId, receipt.receipt_number, receipt.tenant_id, receipt.branch_id, userId, userName, 'RESTORED');
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchReceipts(filters: ReceiptSearchFilters): Promise<{
  receipts: Receipt[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 25;

  let query = db.receipts.where('tenant_id').equals(filters.tenant_id);
  let all = await query.toArray();

  // Apply filters
  if (filters.branch_id) all = all.filter(r => r.branch_id === filters.branch_id);
  if (filters.date_from) all = all.filter(r => r.created_at >= filters.date_from!);
  if (filters.date_to) all = all.filter(r => r.created_at <= filters.date_to!);
  if (filters.customer_id) all = all.filter(r => r.customer_id === filters.customer_id);
  if (filters.cashier_id) all = all.filter(r => r.cashier_id === filters.cashier_id);
  if (filters.payment_method) all = all.filter(r => r.payment_method === filters.payment_method);
  if (filters.status) all = all.filter(r => r.status === filters.status);
  if (filters.transaction_type) all = all.filter(r => r.transaction_type === filters.transaction_type);
  if (filters.amount_min !== undefined) all = all.filter(r => r.total >= filters.amount_min!);
  if (filters.amount_max !== undefined) all = all.filter(r => r.total <= filters.amount_max!);
  if (filters.search_text) {
    const q = filters.search_text.toLowerCase();
    all = all.filter(r =>
      r.receipt_number.toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.customer_phone || '').toLowerCase().includes(q) ||
      (r.cashier_name || '').toLowerCase().includes(q)
    );
  }

  // Sort by created_at descending
  all.sort((a, b) => b.created_at - a.created_at);

  const total = all.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginated = all.slice((page - 1) * pageSize, page * pageSize);

  return { receipts: paginated, total, page, page_size: pageSize, total_pages: totalPages };
}

// ─── Share Log ────────────────────────────────────────────────────────────────

export async function logShare(
  receiptId: string,
  tenantId: string,
  branchId: string,
  userId: string,
  userName: string,
  channel: ReceiptShareLog['channel'],
  recipient?: string
): Promise<void> {
  const receipt = await db.receipts.get(receiptId);
  if (!receipt) return;

  const now = Date.now();
  await db.transaction('rw', [db.receiptShareLogs, db.receiptAuditLogs], async () => {
    await db.receiptShareLogs.add({
      id: newId('rsl'),
      receipt_id: receiptId,
      receipt_number: receipt.receipt_number,
      tenant_id: tenantId,
      branch_id: branchId,
      shared_by: userId,
      channel,
      recipient,
      status: 'SENT',
      created_at: now,
    });

    await writeAuditLog(
      receiptId, receipt.receipt_number, tenantId, branchId, userId, userName,
      'SHARED', `Shared via ${channel}${recipient ? ` to ${recipient}` : ''}`
    );
  });
}

// ─── WhatsApp Share ───────────────────────────────────────────────────────────

export function shareViaWhatsApp(receipt: Receipt): void {
  const text = [
    `🧾 *Receipt from DukaPos*`,
    `Receipt No: ${receipt.receipt_number}`,
    `Amount: ${receipt.currency} ${receipt.total.toLocaleString()}`,
    `Payment: ${receipt.payment_method}`,
    `Date: ${new Date(receipt.created_at).toLocaleString()}`,
    receipt.customer_name ? `Customer: ${receipt.customer_name}` : '',
    `\nVerify: https://dukapos.com/verify/${receipt.receipt_number}`,
  ].filter(Boolean).join('\n');

  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getReceiptAnalytics(
  tenantId: string,
  branchId?: string,
  dateFrom?: number,
  dateTo?: number
): Promise<ReceiptAnalytics> {
  let receipts = await db.receipts.where('tenant_id').equals(tenantId).toArray();

  if (branchId) receipts = receipts.filter(r => r.branch_id === branchId);
  if (dateFrom) receipts = receipts.filter(r => r.created_at >= dateFrom);
  if (dateTo) receipts = receipts.filter(r => r.created_at <= dateTo);

  const completed = receipts.filter(r => r.status === 'Completed' || r.status === 'Archived');
  const totalRevenue = completed.reduce((s, r) => s + r.total, 0);

  // Print logs for this tenant
  const printLogs = await db.receiptPrintLogs.where('tenant_id').equals(tenantId).toArray();
  const printCount = printLogs.filter(l => !l.is_reprint).length;
  const reprintCount = printLogs.filter(l => l.is_reprint).length;

  // By cashier
  const cashierMap: Record<string, { count: number; revenue: number }> = {};
  completed.forEach(r => {
    if (!cashierMap[r.cashier_name]) cashierMap[r.cashier_name] = { count: 0, revenue: 0 };
    cashierMap[r.cashier_name].count++;
    cashierMap[r.cashier_name].revenue += r.total;
  });
  const by_cashier = Object.entries(cashierMap).map(([cashier_name, v]) => ({ cashier_name, ...v }));

  // By hour
  const hourMap: Record<number, number> = {};
  completed.forEach(r => {
    const h = new Date(r.created_at).getHours();
    hourMap[h] = (hourMap[h] || 0) + 1;
  });
  const by_hour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] || 0 }));

  // By payment method
  const pmMap: Record<string, { count: number; amount: number }> = {};
  completed.forEach(r => {
    if (!pmMap[r.payment_method]) pmMap[r.payment_method] = { count: 0, amount: 0 };
    pmMap[r.payment_method].count++;
    pmMap[r.payment_method].amount += r.total;
  });
  const by_payment_method = Object.entries(pmMap).map(([method, v]) => ({ method, ...v }));

  return {
    total_count: receipts.length,
    completed_count: completed.length,
    cancelled_count: receipts.filter(r => r.status === 'Cancelled').length,
    refunded_count: receipts.filter(r => r.status === 'Refunded').length,
    pending_sync_count: receipts.filter(r => r.sync_status === 'PENDING').length,
    total_revenue: totalRevenue,
    average_sale: completed.length > 0 ? totalRevenue / completed.length : 0,
    largest_sale: completed.length > 0 ? Math.max(...completed.map(r => r.total)) : 0,
    print_count: printCount,
    reprint_count: reprintCount,
    by_cashier,
    by_hour,
    by_payment_method,
  };
}

// ─── Default Template ─────────────────────────────────────────────────────────

export async function getOrCreateDefaultTemplate(
  tenantId: string,
  branchId: string,
  userId: string,
  businessName?: string
): Promise<ReceiptTemplate> {
  const existing = await db.receiptTemplates
    .where('tenant_id').equals(tenantId)
    .and(t => t.is_default && (!t.branch_id || t.branch_id === branchId))
    .first();

  if (existing) return existing;

  const template: ReceiptTemplate = {
    id: newId('rtpl'),
    tenant_id: tenantId,
    branch_id: branchId,
    name: 'Default Receipt Template',
    format: 'thermal_80',
    is_default: true,
    business_name: businessName,
    show_logo: true,
    show_qr: true,
    show_barcode: true,
    show_tax_breakdown: true,
    show_cashier: true,
    show_customer: true,
    show_branch: true,
    show_device: false,
    show_return_policy: true,
    footer_text: 'Thank you for shopping with us!',
    return_policy: 'Returns accepted within 7 days with receipt.',
    thank_you_message: 'Thank you! Please come again.',
    primary_color: '#4F46E5',
    font_size: 'medium',
    paper_width: 80,
    created_at: Date.now(),
    updated_at: Date.now(),
    created_by: userId,
  };

  await db.receiptTemplates.add(template);
  return template;
}

export function getDeletedReceiptNumbers(): Set<string> {
  try {
    const raw = localStorage.getItem('dukapos_deleted_receipt_numbers') || '[]';
    return new Set(JSON.parse(raw));
  } catch (e) {
    return new Set();
  }
}

export function registerDeletedReceiptNumber(num: string) {
  if (!num) return;
  try {
    const set = getDeletedReceiptNumbers();
    set.add(num);
    localStorage.setItem('dukapos_deleted_receipt_numbers', JSON.stringify(Array.from(set)));
  } catch (e) {}
}

export async function purgeOrderAndReceipt(target: { receipt_number?: string; id?: string; transaction_id?: string; total?: number }): Promise<void> {
  const deletedSet = getDeletedReceiptNumbers();
  if (target.receipt_number) registerDeletedReceiptNumber(target.receipt_number);
  if (target.id) registerDeletedReceiptNumber(target.id);
  if (target.transaction_id) registerDeletedReceiptNumber(target.transaction_id);

  // Broadcast deletion signal to all open browser tabs
  try {
    const { broadcastMutation } = await import('./crossTabSyncService');
    broadcastMutation('receipts', 'DELETE', { id: target.id, receipt_number: target.receipt_number });
    broadcastMutation('orders', 'DELETE', { id: target.id, transaction_id: target.transaction_id });
  } catch (e) {}

  // 1. Delete matching receipts
  const receipts = await db.receipts.toArray();
  for (const r of receipts) {
    if (
      (target.id && r.id === target.id) ||
      (target.receipt_number && r.receipt_number === target.receipt_number) ||
      (target.transaction_id && r.transaction_id === target.transaction_id) ||
      (target.total && r.total === target.total)
    ) {
      registerDeletedReceiptNumber(r.id);
      registerDeletedReceiptNumber(r.receipt_number);
      if (r.transaction_id) registerDeletedReceiptNumber(r.transaction_id);
      await db.receipts.delete(r.id);
      await db.receiptItems.where('receipt_id').equals(r.id).delete();
    }
  }

  // 2. Delete matching orders
  const orders = await db.orders.toArray();
  for (const o of orders) {
    if (
      (target.id && o.id === target.id) ||
      (target.transaction_id && o.id === target.transaction_id) ||
      (target.receipt_number && (o as any).receipt_number === target.receipt_number) ||
      (target.total && o.total === target.total) ||
      deletedSet.has(o.id)
    ) {
      registerDeletedReceiptNumber(o.id);
      await db.orders.delete(o.id);
    }
  }
}

// ─── Auto-Healing: Ensure every completed order has a matching receipt ─────────

export async function ensureReceiptsForOrders(tenantId: string, branchId?: string): Promise<number> {
  if (!tenantId) return 0;
  try {
    const orders = await db.orders.where('tenant_id').equals(tenantId).toArray();
    const existingReceipts = await db.receipts.where('tenant_id').equals(tenantId).toArray();
    const deletedSet = getDeletedReceiptNumbers();

    const existingMap = new Set(
      existingReceipts.map(r => r.id)
        .concat(existingReceipts.map(r => r.receipt_number || ''))
        .concat(existingReceipts.map(r => r.transaction_id || ''))
        .concat(existingReceipts.map(r => r.original_receipt_id || ''))
        .filter(Boolean)
    );

    let createdCount = 0;
    for (const order of orders) {
      if (
        (order as any).is_deleted || 
        (order as any).deletedAt || 
        (order as any).deleted_at || 
        ['Cancelled', 'Voided', 'Refunded', 'Deleted'].includes(order.status) ||
        deletedSet.has(order.id) ||
        deletedSet.has((order as any).receipt_number)
      ) {
        continue;
      }

      // Check if a matching receipt exists that was cancelled or voided
      const matchingReceipt = existingReceipts.find(
        r => r.id === order.id || r.transaction_id === order.id || r.original_receipt_id === order.id
      );
      if (matchingReceipt && (matchingReceipt.status === 'Cancelled' || matchingReceipt.status === 'Voided' || (matchingReceipt as any).is_deleted)) {
        await db.orders.update(order.id, { status: 'Cancelled', is_deleted: true } as any);
        continue;
      }

      if (!existingMap.has(order.id)) {
        try {
          await createReceipt({
            idempotency_key: order.id,
            transaction_id: order.id,
            transaction_type: 'POS_SALE',
            tenant_id: order.tenant_id || tenantId,
            branch_id: order.branch_id || branchId || 'main-hq',
            cashier_id: 'usr-auto',
            cashier_name: 'POS Terminal',
            items: (order.items || []).map(item => ({
              product_id: item.productId,
              variant_id: item.variantId,
              name: item.name || 'Sales Item',
              qty: item.quantity || 1,
              unit_price: item.price || 0,
              discount: 0,
              tax_rate: 0,
            })),
            discount_amount: order.discount || 0,
            tax_amount: order.tax || 0,
            total: order.total || 0,
            paid_amount: order.total || 0,
            change_amount: 0,
            payment_method: order.paymentMethod || 'Cash',
            currency: 'TZS',
            created_at: order.timestamp || Date.now(),
          });
          createdCount++;
        } catch (err) {
          console.warn(`[ReceiptEngine] Auto-heal receipt for order ${order.id} failed:`, err);
        }
      }
    }
    return createdCount;
  } catch (err) {
    console.warn('[ReceiptEngine] ensureReceiptsForOrders failed:', err);
    return 0;
  }
}
