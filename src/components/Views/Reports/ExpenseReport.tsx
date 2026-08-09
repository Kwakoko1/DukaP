import React, { useMemo } from 'react';
import { DollarSign, Clock, Tag, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, getLast6Months, EXPENSE_COLORS, FALLBACK_COLOR } from './types';
import type { ReportProps } from './types';

export const ExpenseReport: React.FC<ReportProps> = ({ expenses, searchTerm, fmtCcy }) => {
  const paid = useMemo(() => expenses.filter((e: any) => e.status === 'Paid'), [expenses]);
  const pending = useMemo(() => expenses.filter((e: any) => e.status === 'Pending'), [expenses]);
  const totalPaid = paid.reduce((s, e) => s + (e.amount || 0), 0);
  const totalPending = pending.reduce((s, e) => s + (e.amount || 0), 0);

  const monthlyHistory = useMemo(() => {
    return getLast6Months().map(({ label, year, month }) => {
      const monthExp = paid.filter((e: any) => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      return { name: label, Expenses: monthExp.reduce((s, e) => s + (e.amount || 0), 0) };
    });
  }, [paid]);

  const byCategory = useMemo(() => {
    const buckets: Record<string, number> = {};
    paid.forEach((e: any) => { buckets[e.category] = (buckets[e.category] || 0) + e.amount; });
    return Object.entries(buckets).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [paid]);
  const catTotal = byCategory.reduce((s, e) => s + e.value, 0);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return expenses;
    const q = searchTerm.toLowerCase();
    return expenses.filter((e: any) => e.category?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q) || e.paymentMethod?.toLowerCase().includes(q));
  }, [expenses, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Paid Expenses" value={fmtCcy(totalPaid)} icon={<DollarSign className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" />
        <KpiCard label="Pending Expenses" value={fmtCcy(totalPending)} icon={<Clock className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" sub={`${pending.length} entries`} />
        <KpiCard label="Top Category" value={byCategory[0]?.name || 'N/A'} icon={<Tag className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" sub={byCategory[0] ? fmtCcy(byCategory[0].value) : ''} />
        <KpiCard label="Total Entries" value={`${expenses.length} Records`} icon={<TrendingDown className="h-4 w-4" />} color="text-slate-600" bg="bg-slate-100 dark:bg-slate-800/20" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Monthly Expense Trend" description="Paid expenses over last 6 months">
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" fontSize={11} stroke="#94A3B8" />
                <YAxis fontSize={11} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Expenses by Category" description="Breakdown of all paid outflows">
          <div className="p-4 space-y-3 h-64 overflow-y-auto">
            {byCategory.length === 0 ? <p className="text-center text-slate-400 italic text-xs pt-10">No paid expenses.</p> :
              byCategory.map((entry, idx) => {
                const pct = catTotal > 0 ? ((entry.value / catTotal) * 100).toFixed(1) : '0.0';
                const color = EXPENSE_COLORS[entry.name] || FALLBACK_COLOR;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{entry.name}</span>
                      <span>{fmtCcy(entry.value)} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-darkbg rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })
            }
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Expense Ledger" description="All recorded expense transactions">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Date</th><th className="p-3.5">Category</th><th className="p-3.5">Description</th>
                <th className="p-3.5">Payment</th><th className="p-3.5">Status</th><th className="p-3.5 pr-6">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={6} message="No expenses found." /> :
                filtered.map((e: any, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 text-slate-500">{e.date}</td>
                    <td className="p-3.5 font-bold text-slate-800 dark:text-white">{e.category}</td>
                    <td className="p-3.5 text-slate-500">{e.description || '—'}</td>
                    <td className="p-3.5 font-bold uppercase text-xs">{e.paymentMethod}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${e.status === 'Paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'}`}>{e.status}</span>
                    </td>
                    <td className="p-3.5 pr-6 font-extrabold text-slate-800 dark:text-white">{fmtCcy(e.amount)}</td>
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
