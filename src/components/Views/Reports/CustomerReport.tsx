import React, { useMemo } from 'react';
import { Users, AlertCircle, Star, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip } from './types';
import type { ReportProps } from './types';

export const CustomerReport: React.FC<ReportProps> = ({ customers, receipts, searchTerm, fmtCcy }) => {
  const customerSpend = useMemo(() => {
    const spendMap: Record<string, number> = {};
    receipts.filter(r => r.status === 'Completed' && r.customer_id).forEach(r => {
      spendMap[r.customer_id] = (spendMap[r.customer_id] || 0) + (r.total || 0);
    });
    return spendMap;
  }, [receipts]);

  const enrichedCustomers = useMemo(() => {
    return customers.map(c => ({
      ...c,
      totalSpend: customerSpend[c.id] || 0
    })).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [customers, customerSpend]);

  const totalOutstanding = useMemo(() => customers.reduce((s, c) => s + (c.outstandingBalance || 0), 0), [customers]);
  const totalLoyalty = useMemo(() => customers.reduce((s, c) => s + (c.loyaltyPoints || 0), 0), [customers]);
  const customersWithDebt = customers.filter(c => (c.outstandingBalance || 0) > 0).length;

  const top10Chart = enrichedCustomers.slice(0, 10).map(c => ({ name: c.name?.split(' ')[0] || 'Unknown', Spend: c.totalSpend }));

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return enrichedCustomers;
    const q = searchTerm.toLowerCase();
    return enrichedCustomers.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }, [enrichedCustomers, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Customers" value={`${customers.length} Registered`} icon={<Users className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" />
        <KpiCard label="Outstanding Balances" value={fmtCcy(totalOutstanding)} icon={<AlertCircle className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" sub={`${customersWithDebt} customers with debt`} />
        <KpiCard label="Total Loyalty Points" value={`${totalLoyalty.toLocaleString()} pts`} icon={<Star className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" />
        <KpiCard label="Customers w/ Purchases" value={`${Object.keys(customerSpend).length} Active`} icon={<TrendingUp className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" />
      </div>

      <SectionCard title="Top 10 Customers by Spend" description="Ranked by total completed receipt value">
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10Chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={10} stroke="#94A3B8" />
              <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Spend" fill="#6366f1" radius={[4, 4, 0, 0]} name="Total Spend" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Customer Ledger" description="All customers with spend, loyalty points and outstanding balance">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">#</th><th className="p-3.5">Name</th><th className="p-3.5">Phone</th>
                <th className="p-3.5">Type</th><th className="p-3.5">Total Spend</th>
                <th className="p-3.5 text-amber-500">Loyalty Pts</th><th className="p-3.5 text-red-500 pr-6">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={7} message="No customers found." /> :
                filtered.map((c, idx) => (
                  <tr key={c.id} className={`hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors ${(c.outstandingBalance || 0) > 0 ? 'bg-red-50/20 dark:bg-red-950/5' : ''}`}>
                    <td className="p-3.5 pl-6 text-slate-400">{idx + 1}</td>
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                    <td className="p-3.5 text-slate-500 font-mono">{c.phone || '—'}</td>
                    <td className="p-3.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-darkbg text-slate-600 dark:text-slate-300 text-[10px] font-bold">{c.type || 'Customer'}</span></td>
                    <td className="p-3.5 font-bold text-slate-800 dark:text-white">{fmtCcy(c.totalSpend)}</td>
                    <td className="p-3.5 font-bold text-amber-500">{(c.loyaltyPoints || 0).toLocaleString()}</td>
                    <td className={`p-3.5 pr-6 font-bold ${(c.outstandingBalance || 0) > 0 ? 'text-red-500' : 'text-slate-400'}`}>{fmtCcy(c.outstandingBalance || 0)}</td>
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
