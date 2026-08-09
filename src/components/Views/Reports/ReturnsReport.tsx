import React, { useMemo } from 'react';
import { RotateCcw, DollarSign, Percent, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, getLast6Months } from './types';
import type { ReportProps } from './types';

export const ReturnsReport: React.FC<ReportProps> = ({ receipts, searchTerm, fmtCcy }) => {
  const cancelled = useMemo(() => receipts.filter(r => r.status === 'Cancelled' || r.status === 'Refunded'), [receipts]);
  const totalRefundValue = useMemo(() => cancelled.reduce((s, r) => s + (r.total || 0), 0), [cancelled]);
  const allReceipts = useMemo(() => receipts.filter(r => r.status === 'Completed'), [receipts]);
  const refundRate = (allReceipts.length + cancelled.length) > 0
    ? ((cancelled.length / (allReceipts.length + cancelled.length)) * 100).toFixed(1) : '0.0';
  const avgRefund = cancelled.length > 0 ? Math.round(totalRefundValue / cancelled.length) : 0;

  const monthlyTrend = useMemo(() => {
    return getLast6Months().map(({ label, year, month }) => {
      const monthC = cancelled.filter(r => { const d = new Date(r.created_at); return d.getFullYear() === year && d.getMonth() === month; });
      return { name: label, Refunds: monthC.reduce((s, r) => s + (r.total || 0), 0), Count: monthC.length };
    });
  }, [cancelled]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return cancelled;
    const q = searchTerm.toLowerCase();
    return cancelled.filter(r => r.receipt_number?.toLowerCase().includes(q) || r.cashier_name?.toLowerCase().includes(q) || r.cancellation_reason?.toLowerCase().includes(q));
  }, [cancelled, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Refund Value" value={fmtCcy(totalRefundValue)} icon={<DollarSign className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" />
        <KpiCard label="Refund Count" value={`${cancelled.length} Receipts`} icon={<RotateCcw className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" />
        <KpiCard label="Refund Rate" value={`${refundRate}%`} icon={<Percent className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" sub="of all receipts" />
        <KpiCard label="Avg Refund Value" value={fmtCcy(avgRefund)} icon={<AlertTriangle className="h-4 w-4" />} color="text-slate-600" bg="bg-slate-100 dark:bg-slate-800/20" />
      </div>

      <SectionCard title="Monthly Refund Trend" description="Refund value and count over last 6 months">
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={11} stroke="#94A3B8" />
              <YAxis fontSize={11} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Refunds" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 4 }} name="Refund Value" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Cancelled & Refunded Receipts" description="All cancelled and refunded transaction records">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Receipt #</th><th className="p-3.5">Date</th><th className="p-3.5">Cashier</th>
                <th className="p-3.5">Status</th><th className="p-3.5">Reason</th><th className="p-3.5 pr-6">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={6} message="No cancelled or refunded receipts found." /> :
                filtered.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 font-mono font-bold text-slate-700 dark:text-slate-300">{r.receipt_number || r.id}</td>
                    <td className="p-3.5 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">{r.cashier_name || '—'}</td>
                    <td className="p-3.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400">{r.status}</span></td>
                    <td className="p-3.5 text-slate-400 italic">{r.cancellation_reason || r.refund_reason || '—'}</td>
                    <td className="p-3.5 pr-6 font-black text-red-500">{fmtCcy(r.total || 0)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};
