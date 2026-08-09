import React, { useMemo } from 'react';
import { GitBranch, DollarSign, TrendingUp, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, CHART_COLORS } from './types';
import type { ReportProps } from './types';

export const BranchReport: React.FC<ReportProps> = ({ receipts, expenses, branches, searchTerm, fmtCcy }) => {
  const branchMap = useMemo(() => {
    const m: Record<string, string> = {};
    branches.forEach(b => { m[b.id] = b.name || b.id; });
    return m;
  }, [branches]);

  const byBranch = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; refunds: number; expenses: number; count: number }> = {};
    receipts.forEach(r => {
      const bid = r.branch_id;
      if (!map[bid]) map[bid] = { name: branchMap[bid] || bid, revenue: 0, refunds: 0, expenses: 0, count: 0 };
      if (r.status === 'Completed') { map[bid].revenue += (r.total || 0); map[bid].count += 1; }
      if (r.status === 'Cancelled' || r.status === 'Refunded') map[bid].refunds += (r.total || 0);
    });
    expenses.forEach((e: any) => {
      if (e.status === 'Paid' && e.branch_id && map[e.branch_id]) map[e.branch_id].expenses += (e.amount || 0);
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [receipts, expenses, branchMap]);

  const chartData = byBranch.map(b => ({ name: b.name, Revenue: b.revenue, Expenses: b.expenses }));
  const topBranch = byBranch[0];

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return byBranch;
    const q = searchTerm.toLowerCase();
    return byBranch.filter(b => b.name.toLowerCase().includes(q));
  }, [byBranch, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Branches" value={`${byBranch.length} Branches`} icon={<GitBranch className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" />
        <KpiCard label="Top Branch" value={topBranch?.name || 'N/A'} icon={<TrendingUp className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" sub={topBranch ? fmtCcy(topBranch.revenue) : ''} />
        <KpiCard label="Total Network Revenue" value={fmtCcy(byBranch.reduce((s, b) => s + b.revenue, 0))} icon={<DollarSign className="h-4 w-4" />} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/20" />
        <KpiCard label="Total Transactions" value={`${byBranch.reduce((s, b) => s + b.count, 0)}`} icon={<ShoppingCart className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" />
      </div>

      <SectionCard title="Branch Revenue vs Expenses" description="Side-by-side comparison of revenue and expenses per branch">
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={10} stroke="#94A3B8" />
              <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Revenue" fill={CHART_COLORS.indigo} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill={CHART_COLORS.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Branch Performance Comparison" description="Key metrics per branch">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Branch</th><th className="p-3.5 text-center">Transactions</th>
                <th className="p-3.5">Revenue</th><th className="p-3.5">Expenses</th>
                <th className="p-3.5">Refunds</th><th className="p-3.5 pr-6">Net Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={6} message="No branch data found." /> :
                filtered.map((b, idx) => {
                  const net = b.revenue - b.expenses;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-slate-900 dark:text-white">{b.name}</td>
                      <td className="p-3.5 text-center font-bold">{b.count}</td>
                      <td className="p-3.5 font-bold text-indigo-600">{fmtCcy(b.revenue)}</td>
                      <td className="p-3.5 font-bold text-red-500">{fmtCcy(b.expenses)}</td>
                      <td className="p-3.5 font-bold text-amber-500">{fmtCcy(b.refunds)}</td>
                      <td className={`p-3.5 pr-6 font-black ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtCcy(net)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};
