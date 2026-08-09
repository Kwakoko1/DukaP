import React, { useMemo } from 'react';
import { DollarSign, ShoppingCart, Activity, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, getLast6Months } from './types';
import type { ReportProps } from './types';

export const SalesReport: React.FC<ReportProps> = ({
  receipts, products, productVariants,
  searchTerm, fmtCcy
}) => {
  // kpis from receipts (completed only)
  const completedReceipts = useMemo(() => receipts.filter(r => r.status === 'Completed'), [receipts]);
  const totalSales = useMemo(() => completedReceipts.reduce((s, r) => s + (r.total || 0), 0), [completedReceipts]);
  const orderCount = completedReceipts.length;
  const avgOrderValue = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;

  // Sales history from receipts
  const salesHistory = useMemo(() => {
    return getLast6Months().map(({ label, year, month }) => {
      const monthReceipts = receipts.filter(r => {
        const d = new Date(r.created_at);
        return d.getFullYear() === year && d.getMonth() === month && r.status === 'Completed';
      });
      return { name: label, Sales: monthReceipts.reduce((s, r) => s + (r.total || 0), 0) };
    });
  }, [receipts]);

  // Product contribution from receipt items
  const receiptItems = useMemo(() => {
    const stats: Record<string, { name: string; qty: number; revenue: number }> = {};
    completedReceipts.forEach(r => {
      (r.items || []).forEach((item: any) => {
        const key = item.product_id || item.name;
        if (!stats[key]) stats[key] = { name: item.name, qty: 0, revenue: 0 };
        stats[key].qty += (item.qty || item.quantity || 0);
        stats[key].revenue += (item.total || item.subtotal || 0);
      });
    });
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue);
  }, [completedReceipts]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return receiptItems;
    const q = searchTerm.toLowerCase();
    return receiptItems.filter(i => i.name.toLowerCase().includes(q));
  }, [receiptItems, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Gross Sales Revenue" value={fmtCcy(totalSales)} icon={<DollarSign className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" />
        <KpiCard label="Completed Receipts" value={`${orderCount} Receipts`} icon={<ShoppingCart className="h-4 w-4" />} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/20" />
        <KpiCard label="Avg Order Value (AOV)" value={fmtCcy(avgOrderValue)} icon={<Activity className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" />
        <KpiCard label="Product Lines (SKUs)" value={`${products.length + productVariants.length} SKUs`} icon={<Layers className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" />
      </div>

      <SectionCard title="Operating Sales Revenue" description="Monthly gross invoice values — last 6 months">
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={salesHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={11} stroke="#94A3B8" />
              <YAxis fontSize={11} stroke="#94A3B8" tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Sales" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Product Sales Contribution" description="Sorted by total revenue contribution from completed receipts">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">#</th>
                <th className="p-3.5">Product Name</th>
                <th className="p-3.5 text-center">Qty Sold</th>
                <th className="p-3.5 pr-6">Gross Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={4} message="No sales transactions found for the selected period." /> :
                filtered.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 text-slate-400 font-bold">{idx + 1}</td>
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">{s.name}</td>
                    <td className="p-3.5 text-center font-bold">{s.qty} units</td>
                    <td className="p-3.5 pr-6 font-extrabold text-slate-800 dark:text-white">{fmtCcy(s.revenue)}</td>
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
