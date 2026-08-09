import React, { useMemo } from 'react';
import { User, DollarSign, Award, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, CHART_COLORS } from './types';
import type { ReportProps } from './types';

export const CashierReport: React.FC<ReportProps> = ({ receipts, searchTerm, fmtCcy }) => {
  const byCashier = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; count: number; discounts: number; refunds: number; refundCount: number }> = {};
    receipts.forEach(r => {
      const key = r.cashier_id || r.cashier_name || 'Unknown';
      const name = r.cashier_name || r.cashier_id || 'Unknown';
      if (!map[key]) map[key] = { name, revenue: 0, count: 0, discounts: 0, refunds: 0, refundCount: 0 };
      if (r.status === 'Completed') {
        map[key].revenue += (r.total || 0);
        map[key].count += 1;
        map[key].discounts += (r.discount_amount || 0);
      }
      if (r.status === 'Cancelled' || r.status === 'Refunded') {
        map[key].refunds += (r.total || 0);
        map[key].refundCount += 1;
      }
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [receipts]);

  const topCashier = byCashier[0];
  const chartData = byCashier.slice(0, 10).map(c => ({ name: c.name.split(' ')[0], Revenue: c.revenue }));

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return byCashier;
    const q = searchTerm.toLowerCase();
    return byCashier.filter(c => c.name.toLowerCase().includes(q));
  }, [byCashier, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Cashiers" value={`${byCashier.length} Staff`} icon={<User className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" />
        <KpiCard label="Top Performer" value={topCashier?.name || 'N/A'} icon={<Award className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" sub={topCashier ? fmtCcy(topCashier.revenue) : ''} />
        <KpiCard label="Total Revenue Processed" value={fmtCcy(byCashier.reduce((s, c) => s + c.revenue, 0))} icon={<DollarSign className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" />
        <KpiCard label="Total Refunds Processed" value={fmtCcy(byCashier.reduce((s, c) => s + c.refunds, 0))} icon={<AlertCircle className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" />
      </div>

      <SectionCard title="Revenue by Cashier" description="Top 10 cashiers by total receipts processed">
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={10} stroke="#94A3B8" />
              <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Revenue" fill={CHART_COLORS.violet} radius={[4, 4, 0, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Cashier Performance Table" description="Revenue, transactions, discounts and refunds per cashier">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">#</th><th className="p-3.5">Cashier Name</th>
                <th className="p-3.5 text-center">Receipts</th><th className="p-3.5">Total Revenue</th>
                <th className="p-3.5">Avg Per Receipt</th><th className="p-3.5 text-red-500">Discounts</th><th className="p-3.5 pr-6 text-amber-500">Refunds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={7} message="No cashier data found." /> :
                filtered.map((c, idx) => (
                  <tr key={idx} className={`hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors ${idx === 0 ? 'bg-amber-50/20 dark:bg-amber-950/5' : ''}`}>
                    <td className="p-3.5 pl-6">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}</td>
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                    <td className="p-3.5 text-center font-bold">{c.count}</td>
                    <td className="p-3.5 font-bold text-indigo-600">{fmtCcy(c.revenue)}</td>
                    <td className="p-3.5 text-slate-500">{fmtCcy(c.count > 0 ? Math.round(c.revenue / c.count) : 0)}</td>
                    <td className="p-3.5 font-bold text-red-500">{fmtCcy(c.discounts)}</td>
                    <td className="p-3.5 pr-6 font-bold text-amber-500">{fmtCcy(c.refunds)}</td>
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
