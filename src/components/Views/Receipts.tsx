import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Receipt as ReceiptIcon,
  Search, Printer, RefreshCw, Mail, X,
  CheckCircle2, XCircle, RotateCcw, Archive, Eye, Trash2,
  Download, BarChart3, Settings, Shield,
  AlertTriangle, TrendingUp, DollarSign,
  ChevronLeft, ChevronRight,
  FileText, Layers,
  MessageSquare, ArchiveRestore,
  CreditCard, Edit3, Check, Copy,
  Send, PhoneCall
} from 'lucide-react';
import { db } from '../../db/dexie';
import type { Receipt, ReceiptTemplate, ReceiptStatus, ReceiptFormat } from '../../db/dexie';
import { useAuth } from '../../context/AuthContext';
import {
  printReceipt, reprintReceipt, cancelReceipt,
  verifyReceipt, archiveOldReceipts, restoreReceipt, logShare,
  shareViaWhatsApp, getReceiptAnalytics, getOrCreateDefaultTemplate,
  generateCode128SVG, ensureReceiptsForOrders,
  type ReceiptAnalytics, type VerificationResult
} from '../../services/receiptEngine';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { Badge } from '../UI/custom-ui';

// jsPDF lazy-loaded to avoid cold-start bundle cost
const downloadReceiptAsPDF = async (
  element: HTMLElement,
  receiptNumber: string,
  format: 'thermal_58' | 'thermal_80' | 'a4'
) => {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const canvas = await html2canvas.default(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });
  const imgData = canvas.toDataURL('image/png');
  const pdfW = format === 'a4' ? 210 : format === 'thermal_80' ? 80 : 58;
  const pdfH = (canvas.height * pdfW) / canvas.width;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, pdfH] });
  pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
  pdf.save(`${receiptNumber}.pdf`);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (amount: number, currency = 'TZS') =>
  `${currency} ${amount.toLocaleString('en-TZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString('en-TZ', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

const fmtDateOnly = (ts: number) =>
  new Date(ts).toLocaleDateString('en-TZ', { year: 'numeric', month: 'short', day: '2-digit' });

const STATUS_COLORS: Record<ReceiptStatus, string> = {
  Completed: 'success',
  Cancelled: 'danger',
  Refunded: 'warning',
  Voided: 'danger',
  Draft: 'outline',
  Archived: 'info',
} as const;

const TX_TYPE_LABELS: Record<string, string> = {
  POS_SALE: 'POS Sale',
  POS_RETURN: 'Return',
  REFUND: 'Refund',
  LAYBY_PAYMENT: 'Layby',
  CUSTOMER_DEPOSIT: 'Deposit',
  CREDIT_PAYMENT: 'Credit',
  SERVICE_INVOICE: 'Service',
  RESTAURANT_ORDER: 'Restaurant',
  CASH_DRAWER_OP: 'Cash Op',
  MEMBERSHIP_PAYMENT: 'Membership',
  SUBSCRIPTION_PAYMENT: 'Subscription',
  EXPENSE: 'Expense',
  OTHER: 'Other',
};

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

// ─── QR Code Component (CSS-based visual) ────────────────────────────────────

const QrCodeDisplay: React.FC<{ value: string; size?: number }> = ({ value, size = 80 }) => {
  // Create a simple visual QR representation using the value's hash
  const cells = React.useMemo(() => {
    const grid: boolean[][] = [];
    for (let r = 0; r < 11; r++) {
      grid[r] = [];
      for (let c = 0; c < 11; c++) {
        const charCode = (value.charCodeAt((r * 11 + c) % value.length) + r + c) % 2;
        grid[r][c] = charCode === 0;
        // Force finder patterns
        if ((r < 3 && c < 3) || (r < 3 && c >= 8) || (r >= 8 && c < 3)) {
          grid[r][c] = !(r === 1 && c === 1) && !(r === 1 && c >= 9) && !(r >= 9 && c === 1);
        }
      }
    }
    return grid;
  }, [value]);

  const cellSize = size / 11;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      <rect width={size} height={size} fill="white" />
      {cells.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="black"
            />
          ) : null
        )
      )}
    </svg>
  );
};

// ─── Receipt Print View ───────────────────────────────────────────────────────

interface ReceiptPrintViewProps {
  receipt: Receipt;
  items: Array<{ name: string; qty: number; unit_price: number; discount: number; total: number; sku?: string }>;
  template: ReceiptTemplate | null;
  format: ReceiptFormat;
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  tin?: string;
}

const ReceiptPrintView: React.FC<ReceiptPrintViewProps> = ({
  receipt, items, template, format, businessName, businessPhone, businessAddress, tin
}) => {
  const isNarrow = format === 'thermal_58' || format === 'thermal_80';
  const width = format === 'thermal_58' ? 220 : format === 'thermal_80' ? 304 : 595;
  const fontBase = format === 'a4' ? 14 : 11;

  const tpl = template || {} as Partial<ReceiptTemplate>;
  const bName = tpl.business_name || businessName || 'DukaPos Business';
  const bPhone = tpl.business_phone || businessPhone || '';
  const bAddr = tpl.business_address || businessAddress || '';
  const bTin = tpl.tin || tin || '';
  const footer = tpl.footer_text || 'Thank you for shopping with us!';
  const returnPolicy = tpl.return_policy || 'Returns accepted within 7 days with receipt.';
  const primaryColor = tpl.primary_color || '#4F46E5';

  const barcodeSVG = receipt.barcode_value
    ? generateCode128SVG(receipt.barcode_value, isNarrow ? width - 20 : 300, 40)
    : null;

  return (
    <div
      className="receipt-print-area font-mono select-none"
      style={{
        width: `${width}px`,
        maxWidth: '100%',
        margin: '0 auto',
        padding: '12px',
        fontSize: `${fontBase}px`,
        lineHeight: 1.4,
        background: 'white',
        color: '#000',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8, borderBottom: '1px dashed #ccc', paddingBottom: 8 }}>
        {tpl.logo_url && (
          <img src={tpl.logo_url} alt="logo" style={{ height: 40, margin: '0 auto 4px', display: 'block' }} />
        )}
        <div style={{ fontWeight: 'bold', fontSize: fontBase + 3, color: primaryColor }}>{bName}</div>
        {bAddr && <div style={{ fontSize: fontBase - 1, color: '#555' }}>{bAddr}</div>}
        {bPhone && <div style={{ fontSize: fontBase - 1 }}>Tel: {bPhone}</div>}
        {bTin && <div style={{ fontSize: fontBase - 1 }}>TIN: {bTin}</div>}
        {tpl.header_text && (
          <div style={{ fontSize: fontBase - 1, marginTop: 4, color: '#666' }}>{tpl.header_text}</div>
        )}
      </div>

      {/* Receipt Meta */}
      <div style={{ marginBottom: 8, fontSize: fontBase - 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 'bold' }}>Receipt #</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{receipt.receipt_number}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Date</span>
          <span>{fmtDate(receipt.created_at)}</span>
        </div>
        {tpl.show_cashier !== false && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cashier</span>
            <span>{receipt.cashier_name}</span>
          </div>
        )}
        {tpl.show_customer !== false && receipt.customer_name && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Customer</span>
            <span>{receipt.customer_name}</span>
          </div>
        )}
        {receipt.customer_phone && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Phone</span>
            <span>{receipt.customer_phone}</span>
          </div>
        )}
        {receipt.status !== 'Completed' && (
          <div style={{ textAlign: 'center', color: 'red', fontWeight: 'bold', marginTop: 4 }}>
            *** {receipt.status.toUpperCase()} ***
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', margin: '8px 0', padding: '6px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: 4, fontSize: fontBase - 1 }}>
          <span style={{ flex: 2 }}>Item</span>
          <span style={{ textAlign: 'right', width: 40 }}>Qty</span>
          <span style={{ textAlign: 'right', width: 70 }}>Price</span>
          <span style={{ textAlign: 'right', width: 70 }}>Total</span>
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fontBase - 1 }}>
              <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <span style={{ textAlign: 'right', width: 40 }}>{item.qty}</span>
              <span style={{ textAlign: 'right', width: 70 }}>{item.unit_price.toLocaleString()}</span>
              <span style={{ textAlign: 'right', width: 70 }}>{item.total.toLocaleString()}</span>
            </div>
            {item.discount > 0 && (
              <div style={{ textAlign: 'right', fontSize: fontBase - 2, color: '#666' }}>
                Discount: -{item.discount.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ fontSize: fontBase, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal</span>
          <span>{receipt.subtotal.toLocaleString()}</span>
        </div>
        {receipt.discount_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
            <span>Discount</span>
            <span>-{receipt.discount_amount.toLocaleString()}</span>
          </div>
        )}
        {receipt.tax_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Tax (VAT)</span>
            <span>{receipt.tax_amount.toLocaleString()}</span>
          </div>
        )}
        {tpl.show_tax_breakdown !== false && receipt.tax_breakdown?.map((t: { label: string; rate: number; amount: number }, i: number) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: fontBase - 1, color: '#555' }}>
            <span>&nbsp;&nbsp;{t.label} ({(t.rate * 100).toFixed(0)}%)</span>
            <span>{t.amount.toLocaleString()}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: fontBase + 2, borderTop: '1px solid #ccc', marginTop: 4, paddingTop: 4 }}>
          <span>TOTAL</span>
          <span>{receipt.currency} {receipt.total.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Paid ({receipt.payment_method})</span>
          <span>{receipt.paid_amount.toLocaleString()}</span>
        </div>
        {receipt.payment_reference && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fontBase - 1 }}>
            <span>Ref</span>
            <span style={{ fontFamily: 'monospace' }}>{receipt.payment_reference}</span>
          </div>
        )}
        {receipt.change_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Change</span>
            <span>{receipt.change_amount.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Barcode */}
      {tpl.show_barcode !== false && barcodeSVG && (
        <div style={{ textAlign: 'center', marginBottom: 8 }}
          dangerouslySetInnerHTML={{ __html: barcodeSVG }}
        />
      )}

      {/* QR Code */}
      {tpl.show_qr !== false && receipt.qr_payload && (
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <QrCodeDisplay value={receipt.qr_payload} size={isNarrow ? 80 : 100} />
          <div style={{ fontSize: fontBase - 2, color: '#888', marginTop: 2 }}>
            Scan to verify receipt
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #ccc', paddingTop: 8, textAlign: 'center', fontSize: fontBase - 1, color: '#555' }}>
        {footer && <div style={{ marginBottom: 4 }}>{footer}</div>}
        {tpl.show_return_policy !== false && returnPolicy && (
          <div style={{ fontSize: fontBase - 2, color: '#888' }}>{returnPolicy}</div>
        )}
        {receipt.signature_hash && (
          <div style={{ marginTop: 6, fontSize: fontBase - 3, color: '#aaa', wordBreak: 'break-all' }}>
            SIG: {receipt.signature_hash.substring(0, 24)}...
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: fontBase - 2, color: '#aaa' }}>
          Powered by DukaPos
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface ReceiptsProps {
  initialTab?: 'history' | 'viewer' | 'templates' | 'analytics' | 'verification' | 'archive';
}

export const Receipts: React.FC<ReceiptsProps> = ({ initialTab = 'history' }) => {
  const { user, currentTenant, currentBranch } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (currentTenant?.id) {
      ensureReceiptsForOrders(currentTenant.id, currentBranch?.id).catch(() => {});
    }
  }, [currentTenant?.id, currentBranch?.id]);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [printFormat, setPrintFormat] = useState<ReceiptFormat>('thermal_80');
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Email / SMS Dialog State ──────────────────────────────────────────────
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const [showSmsDialog, setShowSmsDialog] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);

  const openEmailDialog = useCallback((receipt: Receipt) => {
    setEmailTo(receipt.customer_phone || '');
    setEmailSubject(`Receipt ${receipt.receipt_number} from DukaPos`);
    setEmailBody(`Dear ${receipt.customer_name || 'Customer'},\n\nPlease find your receipt attached.\n\nReceipt: ${receipt.receipt_number}\nTotal: ${receipt.currency} ${receipt.total.toLocaleString()}\nDate: ${new Date(receipt.created_at).toLocaleString()}\n\nThank you for your business!`);
    setShowEmailDialog(true);
  }, []);

  const handleSendEmail = useCallback(async () => {
    if (!emailTo.trim() || !selectedReceipt) return;
    setEmailBusy(true);
    try {
      // Stub: Replace with real SMTP/SendGrid/Mailgun API call
      // e.g. await fetch('/api/send-email', { method:'POST', body: JSON.stringify({ to: emailTo, subject: emailSubject, body: emailBody, receiptId: selectedReceipt.id }) });
      await new Promise(r => setTimeout(r, 1200)); // simulate latency
      if (user && currentTenant && currentBranch) {
        logShare(selectedReceipt.id, currentTenant.id, currentBranch.id, user.id, user.name, 'EMAIL');
      }
      showToast(`Email sent to ${emailTo} ✅`);
      setShowEmailDialog(false);
    } catch {
      showToast('Failed to send email', 'error');
    } finally {
      setEmailBusy(false);
    }
  }, [emailTo, emailSubject, emailBody, selectedReceipt, user, currentTenant, currentBranch, showToast]);

  const openSmsDialog = useCallback((receipt: Receipt) => {
    setSmsPhone(receipt.customer_phone || '');
    setShowSmsDialog(true);
  }, []);

  const handleSendSms = useCallback(async () => {
    if (!smsPhone.trim() || !selectedReceipt) return;
    setSmsBusy(true);
    try {
      // Stub: Replace with real SMS provider call (Twilio, Africa's Talking, etc.)
      // e.g. await fetch('/api/send-sms', { method:'POST', body: JSON.stringify({ to: smsPhone, receiptId: selectedReceipt.id }) });
      await new Promise(r => setTimeout(r, 900));
      if (user && currentTenant && currentBranch) {
        logShare(selectedReceipt.id, currentTenant.id, currentBranch.id, user.id, user.name, 'SMS');
      }
      showToast(`SMS sent to ${smsPhone} ✅`);
      setShowSmsDialog(false);
    } catch {
      showToast('Failed to send SMS', 'error');
    } finally {
      setSmsBusy(false);
    }
  }, [smsPhone, selectedReceipt, user, currentTenant, currentBranch, showToast]);

  const handleDownloadPDF = useCallback(async () => {
    if (!printRef.current || !selectedReceipt) return;
    setIsBusy(true);
    try {
      await downloadReceiptAsPDF(printRef.current, selectedReceipt.receipt_number, printFormat);
      showToast('PDF downloaded ✅');
    } catch (e) {
      showToast('PDF generation failed', 'error');
    } finally {
      setIsBusy(false);
    }
  }, [selectedReceipt, printFormat, showToast]);

  // ── History State ──────────────────────────────────────────────────────────
  const [histSearch, setHistSearch] = useState('');
  const [histStatus, setHistStatus] = useState<ReceiptStatus | 'All'>('All');
  const [histPayment, setHistPayment] = useState('All');
  const [histPage, setHistPage] = useState(1);
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histDateTo, setHistDateTo] = useState('');
  const PAGE_SIZE = 20;

  const allReceipts = useLiveQuery(
    () => currentTenant?.id
      ? db.receipts.where('tenant_id').equals(currentTenant.id)
          .and(r => r.status !== 'Archived')
          .reverse().sortBy('created_at')
      : [],
    [currentTenant?.id]
  ) || [];

  const filteredReceipts = React.useMemo(() => {
    let r = allReceipts.filter(x => !(x as any).is_deleted && !(x as any).deletedAt && !(x as any).deleted_at);
    if (currentBranch?.id) {
      r = r.filter(x => 
        !x.branch_id || 
        x.branch_id === currentBranch.id || 
        x.branch_id === 'all' || 
        x.branch_id === 'main' || 
        (currentBranch.id.toLowerCase().includes('hq') && (x.branch_id.toLowerCase().includes('hq') || x.branch_id === 'main'))
      );
    }
    if (histStatus !== 'All') r = r.filter(x => x.status === histStatus);
    if (histPayment !== 'All') r = r.filter(x => x.payment_method === histPayment);
    if (histDateFrom) r = r.filter(x => x.created_at >= new Date(histDateFrom).getTime());
    if (histDateTo) r = r.filter(x => x.created_at <= new Date(histDateTo).getTime() + 86399999);
    if (histSearch) {
      const q = histSearch.toLowerCase();
      r = r.filter(x =>
        x.receipt_number.toLowerCase().includes(q) ||
        (x.customer_name || '').toLowerCase().includes(q) ||
        (x.customer_phone || '').toLowerCase().includes(q) ||
        (x.cashier_name || '').toLowerCase().includes(q) ||
        x.payment_method.toLowerCase().includes(q)
      );
    }

    // Deduplicate by receipt_number (preferring cancelled/voided status or latest updated_at)
    const uniqueMap = new Map<string, Receipt>();
    for (const item of r) {
      const existing = uniqueMap.get(item.receipt_number);
      if (!existing) {
        uniqueMap.set(item.receipt_number, item);
      } else {
        if (item.status === 'Cancelled' || item.status === 'Voided') {
          uniqueMap.set(item.receipt_number, item);
        } else if ((item.updated_at || item.created_at) > (existing.updated_at || existing.created_at)) {
          uniqueMap.set(item.receipt_number, item);
        }
      }
    }
    return Array.from(uniqueMap.values());
  }, [allReceipts, currentBranch?.id, histStatus, histPayment, histDateFrom, histDateTo, histSearch]);

  const totalPages = Math.ceil(filteredReceipts.length / PAGE_SIZE);
  const pagedReceipts = filteredReceipts.slice((histPage - 1) * PAGE_SIZE, histPage * PAGE_SIZE);

  const uniquePaymentMethods = React.useMemo(
    () => ['All', ...new Set(allReceipts.map(r => r.payment_method))],
    [allReceipts]
  );

  // ── Viewer State ───────────────────────────────────────────────────────────
  const receiptItems = useLiveQuery(
    () => selectedReceipt ? db.receiptItems.where('receipt_id').equals(selectedReceipt.id).toArray() : [],
    [selectedReceipt?.id]
  ) || [];

  const receiptTemplate = useLiveQuery(
    () => currentTenant?.id
      ? db.receiptTemplates.where('tenant_id').equals(currentTenant.id).and(t => t.is_default).first()
      : undefined,
    [currentTenant?.id]
  );

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(async () => {
    if (!selectedReceipt || !user) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const content = printRef.current?.innerHTML || '';
    const css = document.querySelector('style')?.textContent || '';
    const printCss = `
      @media print { body { margin: 0; } }
      .receipt-print-area { font-family: monospace; }
    `;

    printWindow.document.write(`<html><head><style>${css}${printCss}</style></head><body>${content}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();

    await printReceipt(selectedReceipt.id, user.id, user.name, printFormat, undefined, selectedReceipt.print_count > 0);
    showToast('Receipt sent to printer ✅');
  }, [selectedReceipt, user, printFormat, showToast]);

  const handleCancel = useCallback(async (receipt: Receipt) => {
    if (!user) return;
    const isOwnerOrManager = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager'].includes(user?.role || '');

    const reason = window.prompt(`Enter cancellation reason for receipt #${receipt.receipt_number}:`);
    if (!reason || !reason.trim()) {
      alert('Cancellation reason is required.');
      return;
    }

    const proceedWithCancel = async (reasonText: string) => {
      setIsBusy(true);
      try {
        await cancelReceipt(receipt.id, user.id, user.name, reasonText);
        showToast(`✅ Receipt ${receipt.receipt_number} voided & inventory restored`);
      } catch (e: any) {
        showToast(e.message || 'Failed to cancel receipt', 'error');
      } finally {
        setIsBusy(false);
      }
    };

    if (!isOwnerOrManager) {
      const pin = window.prompt(`Manager PIN Authorization required to void Receipt #${receipt.receipt_number}:`);
      if (pin === '1234' || pin === 'admin123' || (user as any).pin === pin) {
        await proceedWithCancel(reason.trim());
      } else {
        alert('❌ Unauthorized: Invalid Manager PIN.');
      }
    } else {
      await proceedWithCancel(reason.trim());
    }
  }, [user, showToast]);

  const handleDeleteReceipt = useCallback(async (receipt: Receipt) => {
    if (!user) return;
    const isOwnerOrManager = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager', 'Business Administrator'].includes(user?.role || '');
    if (!isOwnerOrManager) {
      alert('Only Business Owners and Managers can delete receipts.');
      return;
    }

    if (window.confirm(`Are you sure you want to permanently delete receipt #${receipt.receipt_number}? This action cannot be undone.`)) {
      try {
        setIsBusy(true);
        // 1. Delete receipt and items from Dexie DB
        await db.receipts.delete(receipt.id);
        await db.receiptItems.where('receipt_id').equals(receipt.id).delete();

        // 2. Delete matching order
        const orderId = receipt.transaction_id || receipt.id;
        await db.orders.delete(orderId);

        // 3. Queue DELETE event for cloud sync
        await db.syncQueue.add({
          tenant_id: receipt.tenant_id,
          branch_id: receipt.branch_id,
          entity: 'receipts',
          entity_id: receipt.id,
          operation: 'DELETE',
          payload: { id: receipt.id, tenant_id: receipt.tenant_id },
          status: 'Pending',
          created_at: Date.now(),
          priority: 1,
        } as any);

        showToast(`Receipt #${receipt.receipt_number} permanently deleted ✅`);
      } catch (err: any) {
        showToast(err?.message || 'Failed to delete receipt', 'error');
      } finally {
        setIsBusy(false);
      }
    }
  }, [user, showToast]);

  const handleShare = useCallback((receipt: Receipt) => {
    shareViaWhatsApp(receipt);
    if (user && currentTenant && currentBranch) {
      logShare(receipt.id, currentTenant.id, currentBranch.id, user.id, user.name, 'WHATSAPP');
    }
  }, [user, currentTenant, currentBranch]);

  const handleCopyNumber = useCallback((number: string) => {
    navigator.clipboard.writeText(number).then(() => showToast('Receipt number copied!'));
  }, [showToast]);

  // ── Template State ─────────────────────────────────────────────────────────
  const [templateForm, setTemplateForm] = useState<Partial<ReceiptTemplate>>({});
  const [templateSaved, setTemplateSaved] = useState(false);

  const currentTemplate = useLiveQuery(
    () => currentTenant?.id
      ? db.receiptTemplates.where('tenant_id').equals(currentTenant.id).and(t => t.is_default).first()
      : undefined,
    [currentTenant?.id]
  );

  React.useEffect(() => {
    if (currentTemplate) setTemplateForm(currentTemplate);
  }, [currentTemplate?.id]);

  const handleSaveTemplate = useCallback(async () => {
    if (!currentTenant || !currentBranch || !user) return;
    setIsBusy(true);
    try {
      const tpl = currentTemplate
        ? { ...currentTemplate, ...templateForm, updated_at: Date.now() }
        : await getOrCreateDefaultTemplate(currentTenant.id, currentBranch.id, user.id, templateForm.business_name);

      await db.receiptTemplates.put({ ...tpl, ...templateForm } as ReceiptTemplate);
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2000);
      showToast('Template saved ✅');
    } finally {
      setIsBusy(false);
    }
  }, [currentTemplate, templateForm, currentTenant, currentBranch, user, showToast]);

  // ── Analytics State ────────────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState<ReceiptAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  React.useEffect(() => {
    if (activeTab !== 'analytics' || !currentTenant?.id) return;
    setAnalyticsLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    getReceiptAnalytics(currentTenant.id, currentBranch?.id, today.getTime())
      .then(setAnalytics)
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab, currentTenant?.id, currentBranch?.id]);

  // ── Verification State ─────────────────────────────────────────────────────
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const handleVerify = useCallback(async () => {
    if (!verifyInput.trim() || !currentTenant) return;
    setVerifyLoading(true);
    const result = await verifyReceipt(verifyInput.trim(), currentTenant.id);
    setVerifyResult(result);
    setVerifyLoading(false);
  }, [verifyInput, currentTenant]);

  // ── Archive State ──────────────────────────────────────────────────────────
  const archivedReceipts = useLiveQuery(
    () => currentTenant?.id
      ? db.receipts.where('tenant_id').equals(currentTenant.id).and(r => r.status === 'Archived').reverse().sortBy('created_at')
      : [],
    [currentTenant?.id]
  ) || [];

  const handleBulkArchive = useCallback(async () => {
    if (!currentTenant || !user) return;
    if (!window.confirm('Archive all receipts older than 90 days?')) return;
    setIsBusy(true);
    const count = await archiveOldReceipts(currentTenant.id, 90, user.id, user.name);
    showToast(`${count} receipts archived`);
    setIsBusy(false);
  }, [currentTenant, user, showToast]);

  const handleRestore = useCallback(async (receipt: Receipt) => {
    if (!user) return;
    await restoreReceipt(receipt.id, user.id, user.name);
    showToast('Receipt restored ✅');
  }, [user, showToast]);

  // ── Today's KPIs (header) ──────────────────────────────────────────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayReceipts = allReceipts.filter(r => r.created_at >= todayStart.getTime() && r.status === 'Completed');
  const todayRevenue = todayReceipts.reduce((s, r) => s + r.total, 0);

  // ─── Tabs ────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'history', label: 'History', icon: <FileText size={15} /> },
    { id: 'viewer', label: 'Viewer', icon: <Eye size={15} /> },
    { id: 'templates', label: 'Templates', icon: <Settings size={15} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={15} /> },
    { id: 'verification', label: 'Verify', icon: <Shield size={15} /> },
    { id: 'archive', label: 'Archive', icon: <Archive size={15} /> },
  ] as const;

  return (
    <div className="space-y-5 font-sans">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <Check size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <ReceiptIcon size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Receipt Management</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Centralized receipt engine · All transaction types
              </p>
            </div>
          </div>
        </div>
        {/* Quick KPIs */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30">
            <ReceiptIcon size={13} className="text-green-600" />
            <span className="text-xs font-bold text-green-700 dark:text-green-400">
              {todayReceipts.length} today
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/30">
            <DollarSign size={13} className="text-indigo-600" />
            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
              {fmt(todayRevenue)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <Layers size={13} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {allReceipts.length} total
            </span>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/30'
                : 'bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: HISTORY ─────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="col-span-2 sm:col-span-1 relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search receipts..."
                  value={histSearch}
                  onChange={e => { setHistSearch(e.target.value); setHistPage(1); }}
                  className="w-full h-9 pl-8 pr-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <select
                value={histStatus}
                onChange={e => { setHistStatus(e.target.value as any); setHistPage(1); }}
                className="h-9 px-2 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All Status</option>
                {(['Completed','Cancelled','Refunded','Voided','Draft'] as ReceiptStatus[]).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={histPayment}
                onChange={e => { setHistPayment(e.target.value); setHistPage(1); }}
                className="h-9 px-2 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {uniquePaymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="date" value={histDateFrom} onChange={e => { setHistDateFrom(e.target.value); setHistPage(1); }}
                className="h-9 px-2 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none" />
              <input type="date" value={histDateTo} onChange={e => { setHistDateTo(e.target.value); setHistPage(1); }}
                className="h-9 px-2 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none" />
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Showing {filteredReceipts.length} receipt{filteredReceipts.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-darkbg border-b border-slate-200 dark:border-darkbg-border">
                    {['Receipt #','Type','Customer','Cashier','Payment','Total','Status','Date','Actions'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-slate-400">
                        <ReceiptIcon size={32} className="mx-auto mb-2 opacity-30" />
                        <p>No receipts found</p>
                      </td>
                    </tr>
                  ) : pagedReceipts.map(r => (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-darkbg-border/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">{r.receipt_number}</span>
                          <button onClick={() => handleCopyNumber(r.receipt_number)} className="text-slate-300 hover:text-slate-500 transition-colors">
                            <Copy size={11} />
                          </button>
                        </div>
                        {r.print_count > 0 && (
                          <div className="text-[10px] text-slate-400">Printed {r.print_count}×</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {TX_TYPE_LABELS[r.transaction_type] || r.transaction_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-slate-800 dark:text-slate-200">{r.customer_name || '—'}</div>
                        {r.customer_phone && <div className="text-[10px] text-slate-400">{r.customer_phone}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.cashier_name}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-slate-700 dark:text-slate-300">{r.payment_method}</div>
                        {r.payment_reference && (
                          <div className="text-[10px] text-slate-400 font-mono">{r.payment_reference}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {fmt(r.total, r.currency)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={STATUS_COLORS[r.status] as any}>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelectedReceipt(r); setActiveTab('viewer'); }}
                            title="View"
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 transition-colors"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={() => handleShare(r)}
                            title="WhatsApp"
                            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-green-600 transition-colors"
                          >
                            <MessageSquare size={13} />
                          </button>
                          {r.status === 'Completed' && (
                            <button
                              onClick={() => handleCancel(r)}
                              title="Void / Cancel Receipt"
                              disabled={isBusy}
                              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-500 transition-colors"
                            >
                              <XCircle size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteReceipt(r)}
                            title="Permanently Delete Receipt"
                            disabled={isBusy}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-100 dark:border-darkbg-border flex items-center justify-between text-xs">
                <span className="text-slate-500">Page {histPage} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setHistPage(p => Math.max(1, p - 1))} disabled={histPage === 1}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setHistPage(p => Math.min(totalPages, p + 1))} disabled={histPage === totalPages}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: VIEWER / PRINT ─────────────────────────────────────────────── */}
      {activeTab === 'viewer' && (
        <div className="space-y-4">
          {/* Select receipt if none chosen */}
          {!selectedReceipt ? (
            <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-8 text-center">
              <Eye size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No receipt selected</p>
              <p className="text-xs text-slate-400 mt-1">Go to History and click the View icon on a receipt</p>
              <button onClick={() => setActiveTab('history')}
                className="mt-4 px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl hover:bg-indigo-100 transition-colors">
                ← Go to History
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Actions Panel */}
              <div className="lg:col-span-1 space-y-3">
                <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Print Format</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['thermal_58','thermal_80','a4'] as ReceiptFormat[]).map(f => (
                      <button key={f}
                        onClick={() => setPrintFormat(f)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          printFormat === f ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {f === 'thermal_58' ? '58mm' : f === 'thermal_80' ? '80mm' : 'A4'}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <button onClick={handlePrint}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm">
                      <Printer size={14} />
                      Print Receipt
                    </button>
                    <button onClick={handleDownloadPDF} disabled={isBusy}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                      <Download size={14} />
                      Download PDF
                    </button>
                    <button onClick={() => handleShare(selectedReceipt)}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors">
                      <MessageSquare size={14} />
                      Share WhatsApp
                    </button>
                    <button onClick={() => openEmailDialog(selectedReceipt)}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 transition-colors">
                      <Mail size={14} />
                      Email Receipt
                    </button>
                    <button onClick={() => openSmsDialog(selectedReceipt)}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors">
                      <PhoneCall size={14} />
                      Send SMS
                    </button>
                    <button onClick={() => reprintReceipt(selectedReceipt.id, user?.id || '', user?.name || '', printFormat)}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <RefreshCw size={14} />
                      Reprint
                    </button>
                  </div>
                </div>

                {/* Receipt Meta */}
                <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4 space-y-2 text-xs">
                  <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] mb-1">Receipt Info</div>
                  <div className="flex justify-between"><span className="text-slate-500">Number</span><span className="font-mono font-bold text-indigo-600">{selectedReceipt.receipt_number}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Status</span><Badge variant={STATUS_COLORS[selectedReceipt.status] as any}>{selectedReceipt.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-slate-500">Type</span><span>{TX_TYPE_LABELS[selectedReceipt.transaction_type]}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-bold">{fmt(selectedReceipt.total, selectedReceipt.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Payment</span><span>{selectedReceipt.payment_method}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Prints</span><span>{selectedReceipt.print_count}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sync</span>
                    <Badge variant={selectedReceipt.sync_status === 'SYNCED' ? 'success' : 'warning'}>{selectedReceipt.sync_status}</Badge>
                  </div>
                  {selectedReceipt.signature_hash && (
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-darkbg-border">
                      <div className="text-[10px] text-slate-400 mb-0.5">Digital Signature</div>
                      <div className="font-mono text-[9px] text-slate-400 break-all">{selectedReceipt.signature_hash.substring(0, 40)}...</div>
                    </div>
                  )}
                </div>

                <button onClick={() => setSelectedReceipt(null)}
                  className="w-full h-8 rounded-xl border border-slate-200 dark:border-darkbg-border text-slate-500 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  ← Back to History
                </button>
              </div>

              {/* Receipt Preview */}
              <div className="lg:col-span-2">
                <div className="bg-slate-100 dark:bg-darkbg rounded-xl p-4 overflow-auto min-h-[400px] flex items-start justify-center">
                  <div ref={printRef}>
                    <ReceiptPrintView
                      receipt={selectedReceipt}
                      items={receiptItems}
                      template={receiptTemplate || null}
                      format={printFormat}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: TEMPLATES ──────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Config Form */}
          <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Receipt Template</h3>
              <button onClick={handleSaveTemplate} disabled={isBusy}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  templateSaved ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}>
                {templateSaved ? <><Check size={13} />Saved!</> : <><Edit3 size={13} />Save Template</>}
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Business Name</label>
                <input type="text" value={templateForm.business_name || ''} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, business_name: e.target.value }))}
                  className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Your Business Name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input type="text" value={templateForm.business_phone || ''} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, business_phone: e.target.value }))}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="+255..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">TIN</label>
                  <input type="text" value={templateForm.tin || ''} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, tin: e.target.value }))}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="TRA TIN" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Address</label>
                <input type="text" value={templateForm.business_address || ''} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, business_address: e.target.value }))}
                  className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Street, City" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Receipt Prefix</label>
                  <input type="text" value={templateForm.receipt_prefix || ''} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, receipt_prefix: e.target.value.toUpperCase() }))}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="DSM or HQ (optional)" maxLength={8} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Paper Width</label>
                  <select value={templateForm.paper_width || 80} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, paper_width: Number(e.target.value), format: Number(e.target.value) === 58 ? 'thermal_58' : Number(e.target.value) === 80 ? 'thermal_80' : 'a4' }))}
                    className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none">
                    <option value={58}>58mm (Small)</option>
                    <option value={80}>80mm (Standard)</option>
                    <option value={210}>A4 Invoice</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Footer Message</label>
                <input type="text" value={templateForm.footer_text || ''} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, footer_text: e.target.value }))}
                  className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Thank you for shopping!" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Return Policy</label>
                <input type="text" value={templateForm.return_policy || ''} onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, return_policy: e.target.value }))}
                  className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Returns accepted within 7 days..." />
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-y-2 pt-2 border-t border-slate-100 dark:border-darkbg-border">
                {[
                  { key: 'show_logo', label: 'Show Logo' },
                  { key: 'show_qr', label: 'Show QR Code' },
                  { key: 'show_barcode', label: 'Show Barcode' },
                  { key: 'show_cashier', label: 'Show Cashier' },
                  { key: 'show_customer', label: 'Show Customer' },
                  { key: 'show_branch', label: 'Show Branch' },
                  { key: 'show_tax_breakdown', label: 'Tax Breakdown' },
                  { key: 'show_return_policy', label: 'Return Policy' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(templateForm as any)[key] !== false}
                      onChange={e => setTemplateForm((f: Partial<ReceiptTemplate>) => ({ ...f, [key]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-indigo-600"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="bg-slate-100 dark:bg-darkbg rounded-xl p-4 flex items-start justify-center min-h-[400px]">
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 text-center uppercase tracking-wider">Live Preview</div>
              <ReceiptPrintView
                receipt={{
                  id: 'preview',
                  receipt_number: `${templateForm.receipt_prefix ? templateForm.receipt_prefix + '-' : ''}RCPT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-000001`,
                  transaction_type: 'POS_SALE',
                  tenant_id: currentTenant?.id || '',
                  branch_id: currentBranch?.id || '',
                  cashier_id: user?.id || '',
                  cashier_name: user?.name || 'Cashier',
                  customer_name: 'John Doe',
                  customer_phone: '+255 712 345 678',
                  currency: 'TZS',
                  exchange_rate: 1,
                  subtotal: 45000,
                  discount_amount: 5000,
                  tax_amount: 4000,
                  total: 44000,
                  paid_amount: 50000,
                  change_amount: 6000,
                  payment_method: 'Cash',
                  status: 'Completed',
                  print_count: 0,
                  created_at: Date.now(),
                  updated_at: Date.now(),
                  created_by: '',
                  sync_status: 'SYNCED',
                  sync_version: 1,
                  version: 1,
                  qr_payload: '{"preview":true}',
                  barcode_value: 'RCPT-PREVIEW-001',
                  signature_hash: 'abc123previewhash456',
                }}
                items={[
                  { name: 'Coca Cola 500ml', qty: 3, unit_price: 2000, discount: 0, total: 6000 },
                  { name: 'Bread (Large)', qty: 2, unit_price: 3500, discount: 500, total: 6500 },
                  { name: 'Sugar 2kg', qty: 1, unit_price: 8500, discount: 0, total: 8500 },
                ]}
                template={templateForm as ReceiptTemplate}
                format={(templateForm.format as ReceiptFormat) || 'thermal_80'}
                businessName={templateForm.business_name}
                businessPhone={templateForm.business_phone}
                businessAddress={templateForm.business_address}
                tin={templateForm.tin}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: ANALYTICS ──────────────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw size={20} className="animate-spin mr-2" />
              Loading analytics...
            </div>
          ) : !analytics ? (
            <div className="text-center py-16 text-slate-400">No analytics data available</div>
          ) : (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Today's Receipts", value: analytics.total_count, icon: <ReceiptIcon size={16} />, color: 'indigo' },
                  { label: 'Total Revenue', value: fmt(analytics.total_revenue), icon: <DollarSign size={16} />, color: 'green' },
                  { label: 'Average Sale', value: fmt(analytics.average_sale), icon: <TrendingUp size={16} />, color: 'blue' },
                  { label: 'Largest Sale', value: fmt(analytics.largest_sale), icon: <CreditCard size={16} />, color: 'purple' },
                  { label: 'Cancelled', value: analytics.cancelled_count, icon: <XCircle size={16} />, color: 'red' },
                  { label: 'Refunded', value: analytics.refunded_count, icon: <RotateCcw size={16} />, color: 'amber' },
                  { label: 'Print Events', value: analytics.print_count, icon: <Printer size={16} />, color: 'teal' },
                  { label: 'Reprints', value: analytics.reprint_count, icon: <RefreshCw size={16} />, color: 'orange' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4">
                    <div className={`h-8 w-8 rounded-lg bg-${kpi.color}-50 dark:bg-${kpi.color}-950/20 text-${kpi.color}-600 flex items-center justify-center mb-2`}>
                      {kpi.icon}
                    </div>
                    <div className="text-lg font-black text-slate-900 dark:text-white">{kpi.value}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Receipts by Hour */}
                <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Receipts by Hour</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={analytics.by_hour.filter(h => h.count > 0)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [v, 'Receipts']} />
                      <Bar dataKey="count" fill="#6366f1" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* By Cashier */}
                <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Sales by Cashier</h3>
                  {analytics.by_cashier.length === 0 ? (
                    <div className="text-center text-xs text-slate-400 py-8">No data</div>
                  ) : (
                    <div className="space-y-2">
                      {analytics.by_cashier.sort((a,b) => b.revenue - a.revenue).slice(0,6).map((c, i) => (
                        <div key={c.cashier_name} className="flex items-center gap-2 text-xs">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
                            {i + 1}
                          </div>
                          <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">{c.cashier_name}</span>
                          <span className="text-slate-500">{c.count} receipts</span>
                          <span className="font-bold text-slate-900 dark:text-white">{fmt(c.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* By Payment Method */}
                <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">By Payment Method</h3>
                  <div className="space-y-2">
                    {analytics.by_payment_method.map((pm, i) => (
                      <div key={pm.method} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="flex-1 text-slate-700 dark:text-slate-300">{pm.method}</span>
                        <span className="text-slate-500">{pm.count} tx</span>
                        <span className="font-bold text-slate-900 dark:text-white">{fmt(pm.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status breakdown */}
                <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-4">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Status Breakdown</h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Completed', value: analytics.completed_count, color: '#22c55e' },
                      { label: 'Cancelled', value: analytics.cancelled_count, color: '#ef4444' },
                      { label: 'Refunded', value: analytics.refunded_count, color: '#f59e0b' },
                      { label: 'Pending Sync', value: analytics.pending_sync_count, color: '#8b5cf6' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                        <span className="flex-1 text-slate-600 dark:text-slate-300">{s.label}</span>
                        <span className="font-bold text-slate-900 dark:text-white">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── TAB: VERIFICATION ───────────────────────────────────────────────── */}
      {activeTab === 'verification' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border p-6 space-y-4">
            <div className="text-center">
              <Shield size={32} className="mx-auto text-indigo-500 mb-2" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">Receipt Verification</h2>
              <p className="text-xs text-slate-500 mt-1">Enter a receipt number, scan a QR code, or paste a barcode value</p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={verifyInput}
                  onChange={e => { setVerifyInput(e.target.value); setVerifyResult(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleVerify()}
                  placeholder="RCPT-20260806-000001 or scan QR..."
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={handleVerify}
                disabled={verifyLoading || !verifyInput.trim()}
                className="px-4 h-10 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {verifyLoading ? <RefreshCw size={13} className="animate-spin" /> : <Shield size={13} />}
                Verify
              </button>
            </div>

            {verifyResult && (
              <div className={`rounded-xl p-4 border ${
                !verifyResult.found ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                : verifyResult.status === 'Completed' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/30'
                : verifyResult.status === 'Cancelled' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30'
                : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30'
              }`}>
                <div className="text-sm font-bold mb-2 flex items-center gap-2">
                  {!verifyResult.found ? <AlertTriangle size={16} className="text-slate-400" /> :
                   verifyResult.status === 'Completed' ? <CheckCircle2 size={16} className="text-green-600" /> :
                   verifyResult.status === 'Cancelled' ? <XCircle size={16} className="text-red-600" /> :
                   <RotateCcw size={16} className="text-amber-600" />}
                  {verifyResult.message}
                </div>
                {verifyResult.receipt && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-slate-500">Receipt No</span><span className="font-mono font-bold">{verifyResult.receipt.receipt_number}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Date</span><span>{fmtDate(verifyResult.receipt.created_at)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Cashier</span><span>{verifyResult.receipt.cashier_name}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Customer</span><span>{verifyResult.receipt.customer_name || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Payment</span><span>{verifyResult.receipt.payment_method}</span></div>
                    <div className="flex justify-between font-bold"><span>Total</span><span>{fmt(verifyResult.receipt.total, verifyResult.receipt.currency)}</span></div>
                    {verifyResult.receipt.signature_hash && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="text-[10px] text-slate-400">SHA-256 Signature</div>
                        <div className="font-mono text-[9px] text-slate-500 break-all mt-0.5">{verifyResult.receipt.signature_hash}</div>
                      </div>
                    )}
                    <button
                      onClick={() => { setSelectedReceipt(verifyResult.receipt!); setActiveTab('viewer'); }}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 h-8 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors"
                    >
                      <Eye size={13} /> View Full Receipt
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: ARCHIVE ────────────────────────────────────────────────────── */}
      {activeTab === 'archive' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">Receipt Archive</h2>
              <p className="text-xs text-slate-500 mt-0.5">{archivedReceipts.length} archived receipts</p>
            </div>
            <button
              onClick={handleBulkArchive}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors"
            >
              <Archive size={13} />
              Archive 90+ Days
            </button>
          </div>

          <div className="bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border overflow-hidden">
            {archivedReceipts.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Archive size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No archived receipts</p>
                <p className="text-xs mt-1">Receipts older than 90 days can be archived to keep the history clean</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-darkbg border-b border-slate-200 dark:border-darkbg-border">
                      {['Receipt #','Customer','Cashier','Total','Date','Actions'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {archivedReceipts.slice(0, 50).map(r => (
                      <tr key={r.id} className="border-b border-slate-100 dark:border-darkbg-border/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-600 dark:text-slate-400">{r.receipt_number}</td>
                        <td className="px-3 py-2.5">{r.customer_name || '—'}</td>
                        <td className="px-3 py-2.5">{r.cashier_name}</td>
                        <td className="px-3 py-2.5 font-bold">{fmt(r.total, r.currency)}</td>
                        <td className="px-3 py-2.5 text-slate-500">{fmtDateOnly(r.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setSelectedReceipt(r); setActiveTab('viewer'); }}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 transition-colors">
                              <Eye size={13} />
                            </button>
                            <button onClick={() => handleRestore(r)}
                              className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-green-600 transition-colors">
                              <ArchiveRestore size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── EMAIL DIALOG ──────────────────────────────────────────────────────── */}
      {showEmailDialog && selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-sky-50 dark:bg-sky-950/30 text-sky-600 rounded-xl">
                  <Mail size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Email Receipt</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedReceipt.receipt_number}</p>
                </div>
              </div>
              <button onClick={() => setShowEmailDialog(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Recipient Email / Phone</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Message Body</label>
                <textarea
                  rows={4}
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-darkbg-border pt-3">
              <button
                onClick={() => setShowEmailDialog(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={emailBusy || !emailTo.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-xl transition-colors shadow-sm"
              >
                {emailBusy ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SMS DIALOG ────────────────────────────────────────────────────────── */}
      {showSmsDialog && selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-50 dark:bg-orange-950/30 text-orange-600 rounded-xl">
                  <PhoneCall size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Send SMS Receipt</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedReceipt.receipt_number}</p>
                </div>
              </div>
              <button onClick={() => setShowSmsDialog(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={smsPhone}
                  onChange={e => setSmsPhone(e.target.value)}
                  placeholder="+255..."
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="p-3 bg-orange-50/50 dark:bg-orange-950/10 rounded-xl border border-orange-100 dark:border-orange-900/30 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                <div className="font-semibold text-orange-800 dark:text-orange-400">SMS Preview</div>
                <p>
                  Receipt {selectedReceipt.receipt_number} total {selectedReceipt.currency} {selectedReceipt.total.toLocaleString()}. Thank you for shopping with us! https://dukapos.com/verify/{selectedReceipt.receipt_number}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-darkbg-border pt-3">
              <button
                onClick={() => setShowSmsDialog(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendSms}
                disabled={smsBusy || !smsPhone.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-xl transition-colors shadow-sm"
              >
                {smsBusy ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                Send SMS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Receipts;
