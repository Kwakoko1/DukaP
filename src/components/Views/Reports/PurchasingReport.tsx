import React, { useMemo } from 'react';
import { ShoppingBag, Clock, Building2, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, CHART_COLORS } from './types';
import type { ReportProps } from './types';

export const PurchasingReport: React.FC<ReportProps> = ({ purchaseOrders, searchTerm, fmtCcy }) => {
  const totalPOValue = useMemo(() => purchaseOrders.reduce((s, p) => s + (p.total || 0), 0), [purchaseOrders]);
  const unpaidPOs = useMemo(() => purchaseOrders.filter(p => p.payment_status !== 'Paid'), [purchaseOrders]);
  const unpaidValue = useMemo(() => unpaidPOs.reduce((s, p) => s + (p.total || 0), 0), [unpaidPOs]);
  const completedPOs = useMemo(() => purchaseOrders.filter(p => p.status === 'Completed').length, [purchaseOrders]);

  const bySupplier = useMemo(() => {
    const map: Record<string, number> = {};
    purchaseOrders.filter(p => p.status !== 'Cancelled').forEach(p => {
      map[p.supplier_name] = (map[p.supplier_name] || 0) + (p.total || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name: name.split(' ').slice(0, 2).join(' '), value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [purchaseOrders]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return purchaseOrders;
    const q = searchTerm.toLowerCase();
    return purchaseOrders.filter(p => p.supplier_name?.toLowerCase().includes(q) || p.po_number?.toLowerCase().includes(q));
  }, [purchaseOrders, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total PO Value" value={fmtCcy(totalPOValue)} icon={<ShoppingBag className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" sub={`${purchaseOrders.length} orders`} />
        <KpiCard label="Unpaid / Pending AP" value={fmtCcy(unpaidValue)} icon={<Clock className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" sub={`${unpaidPOs.length} POs`} />
        <KpiCard label="Top Supplier" value={bySupplier[0]?.name || 'N/A'} icon={<Building2 className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" sub={bySupplier[0] ? fmtCcy(bySupplier[0].value) : ''} />
        <KpiCard label="Completed POs" value={`${completedPOs} of ${purchaseOrders.length}`} icon={<CheckCircle className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" />
      </div>

      <SectionCard title="Spend by Supplier" description="Total purchase value per supplier (top 8)">
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bySupplier} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={9} stroke="#94A3B8" />
              <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill={CHART_COLORS.emerald} radius={[4, 4, 0, 0]} name="Spend" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Purchase Orders Ledger" description="All purchase orders with payment status">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">PO Number</th><th className="p-3.5">Supplier</th>
                <th className="p-3.5">Date</th><th className="p-3.5">Status</th>
                <th className="p-3.5">Payment</th><th className="p-3.5 pr-6">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={6} message="No purchase orders found." /> :
                filtered.map((po, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 font-mono font-bold text-slate-700 dark:text-slate-300">{po.po_number}</td>
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">{po.supplier_name}</td>
                    <td className="p-3.5 text-slate-500">{new Date(po.created_at).toLocaleDateString()}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        po.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                        po.status === 'Cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                      }`}>{po.status}</span>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        po.payment_status === 'Paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                        po.payment_status === 'Partial' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' :
                        'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                      }`}>{po.payment_status}</span>
                    </td>
                    <td className="p-3.5 pr-6 font-extrabold text-slate-800 dark:text-white">{fmtCcy(po.total || 0)}</td>
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
