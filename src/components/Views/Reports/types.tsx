import React from 'react';

// Shared types and utilities for the Reports module

export type MainReportTab =
  | 'sales'
  | 'profit'
  | 'inventory'
  | 'tax'
  | 'customers'
  | 'expenses'
  | 'payments'
  | 'stock-movement'
  | 'purchasing'
  | 'discounts'
  | 'returns'
  | 'branches'
  | 'cashiers'
  | 'aging';

export type DateFilter = 'today' | '7days' | '30days' | 'month' | 'custom';

export interface ReportProps {
  receipts: any[];
  orders: any[];
  products: any[];
  productVariants: any[];
  expenses: any[];
  customers: any[];
  stockLedger: any[];
  purchaseOrders: any[];
  goodsReceipts: any[];
  branches: any[];
  searchTerm: string;
  fmtCcy: (n: number) => string;
  dateFilter: DateFilter;
  startDate: string;
  endDate: string;
}

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getLast6Months(): { label: string; year: number; month: number }[] {
  const now = new Date();
  const months: { label: string; year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return months;
}

export const CHART_COLORS = {
  indigo: '#6366F1',
  blue: '#3B82F6',
  emerald: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  violet: '#8B5CF6',
  sky: '#0EA5E9',
  rose: '#F43F5E',
  teal: '#14B8A6',
  orange: '#F97316',
};

export const EXPENSE_COLORS: Record<string, string> = {
  Rent: '#6366F1',
  Salaries: '#0EA5E9',
  Utilities: '#F59E0B',
  Other: '#8B5CF6',
  'Licensing & Permits': '#10B981',
  'Damaged/Broken Stock': '#EF4444',
};
export const FALLBACK_COLOR = '#94A3B8';

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(15,23,42,0.97)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        fontSize: 11,
        minWidth: 160,
      }}>
        <p style={{ fontWeight: 700, color: '#fff', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#CBD5E1', marginBottom: 3 }}>
            <span style={{ height: 8, width: 8, borderRadius: '50%', backgroundColor: entry.color || entry.fill, display: 'inline-block' }} />
            <span style={{ fontWeight: 500 }}>{entry.name}:</span>
            <span style={{ fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
              Tsh {Number(entry.value).toLocaleString('en-TZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// KPI Card component
export const KpiCard = ({ label, value, icon, color, bg, sub }: {
  label: string; value: string; icon: React.ReactNode;
  color: string; bg: string; sub?: string;
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 flex items-center gap-3 shadow-sm">
    <div className={`p-2.5 rounded-xl ${bg} ${color} shrink-0`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</p>
      <p className="text-sm font-black text-slate-800 dark:text-white mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// Empty state
export const EmptyRows = ({ cols, message }: { cols: number; message: string }) => (
  <tr>
    <td colSpan={cols} className="p-10 text-center text-slate-400 text-xs italic">{message}</td>
  </tr>
);

// Section header
export const SectionCard = ({ title, description, children, action }: {
  title: string; description?: string; children: React.ReactNode; action?: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card overflow-hidden shadow-sm">
    <div className="px-5 py-4 border-b border-slate-100 dark:border-darkbg-border/50 bg-slate-50/50 dark:bg-darkbg/20 flex items-start justify-between">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h3>
        {description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);
