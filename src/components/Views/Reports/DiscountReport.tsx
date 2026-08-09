import React, { useMemo } from 'react';
import { Tag, DollarSign, ShoppingCart, Percent } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, getLast6Months } from './types';
import type { ReportProps } from './types';

export const DiscountReport: React.FC<ReportProps> = ({ receipts, searchTerm, fmtCcy }) => {
  const completed = useMemo(() => receipts.filter(r => r.status === 'Completed'), [receipts]);
  const discounted = useMemo(() => completed.filter(r => (r.discount_amount || 0) > 0), [completed]);
  const totalDiscount = useMemo(() => discounted.reduce((s, r) => s + (r.discount_amount || 0), 0), [discounted]);
  const totalRevenue = useMemo(() => completed.reduce((s, r) => s + (r.total || 0), 0), [completed]);
  const discountRate = totalRevenue > 0 ? ((totalDiscount / totalRevenue) * 100).toFixed(1) : '0.0';
  const avgDiscount = discounted.length > 0 ? Math.round(totalDiscount / discounted.length) : 0;

  const monthlyTrend = useMemo(() => {
    return getLast6Months().map(({ label, year, month }) => {
      const monthR = discounted.filter(r => { const d = new Date(r.created_at); return d.getFullYear() === year && d.getMonth() === month; });
      return { name: label, Discounts: monthR.reduce((s, r) => s + (r.discount_amount || 0), 0) };
    });
  }, [discounted]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return discounted;
    const q = searchTerm.toLowerCase();
    return discounted.filter(r => r.receipt_number?.toLowerCase().includes(q) || r.cashier_name?.toLowerCase().includes(q) || r.customer_name?.toLowerCase().includes(q));
  }, [discounted, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Discounts Given" value={fmtCcy(totalDiscount)} icon={<Tag className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" />
        <KpiCard label="Discount as % of Revenue" value={`${discountRate}%`} icon={<Percent className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" />
        <KpiCard label="Avg Discount Per Receipt" value={fmtCcy(avgDiscount)} icon={<DollarSign className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" />
        <KpiCard label="Receipts with Discount" value={`${discounted.length} of ${completed.length}`} icon={<ShoppingCart className="h-4 w-4" />} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/20" />
      </div>

      <SectionCard title="Monthly Discount Trend" description="Total discount value given per month">
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={11} stroke="#94A3B8" />
              <YAxis fontSize={11} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Discounts" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 4 }} name="Discounts" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Discounted Transactions" description="All receipts where a discount was applied">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Receipt #</th><th className="p-3.5">Date</th>
                <th className="p-3.5">Cashier</th><th className="p-3.5">Customer</th>
                <th className="p-3.5">Gross Total</th><th className="p-3.5 text-red-500 pr-6">Discount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={6} message="No discounted receipts found." /> :
                filtered.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 font-mono font-bold text-slate-700 dark:text-slate-300">{r.receipt_number || r.id}</td>
                    <td className="p-3.5 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">{r.cashier_name || '—'}</td>
                    <td className="p-3.5 text-slate-500">{r.customer_name || '—'}</td>
                    <td className="p-3.5 font-bold text-slate-800 dark:text-white">{fmtCcy(r.total || 0)}</td>
                    <td className="p-3.5 pr-6 font-black text-red-500">{fmtCcy(r.discount_amount || 0)}</td>
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
