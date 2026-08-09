import React, { useMemo } from 'react';
import { DollarSign, BarChart2, Percent, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, CustomTooltip, getLast6Months, EXPENSE_COLORS, FALLBACK_COLOR } from './types';
import type { ReportProps } from './types';

export const ProfitReport: React.FC<ReportProps> = ({
  receipts, expenses, fmtCcy
}) => {
  const completedReceipts = useMemo(() => receipts.filter(r => r.status === 'Completed'), [receipts]);
  const totalSales = useMemo(() => completedReceipts.reduce((s, r) => s + (r.total || 0), 0), [completedReceipts]);
  const totalExpenses = useMemo(() => expenses.filter((e: any) => e.status === 'Paid').reduce((s, e) => s + (e.amount || 0), 0), [expenses]);
  const grossProfit = totalSales - totalExpenses;
  const margin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0.0';

  const profitHistory = useMemo(() => {
    return getLast6Months().map(({ label, year, month }) => {
      const monthReceipts = receipts.filter(r => {
        const d = new Date(r.created_at);
        return d.getFullYear() === year && d.getMonth() === month && r.status === 'Completed';
      });
      const monthExpenses = expenses.filter((e: any) => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month && e.status === 'Paid';
      });
      const Sales = monthReceipts.reduce((s, r) => s + (r.total || 0), 0);
      const Expenses = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      return { name: label, Sales, Expenses, NetProfit: Sales - Expenses };
    });
  }, [receipts, expenses]);

  const expenseAllocation = useMemo(() => {
    const buckets: Record<string, number> = {};
    expenses.forEach((e: any) => { if (e.status === 'Paid') buckets[e.category] = (buckets[e.category] || 0) + e.amount; });
    return Object.entries(buckets).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const expenseTotal = expenseAllocation.reduce((s, e) => s + e.value, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue" value={fmtCcy(totalSales)} icon={<DollarSign className="h-4 w-4" />} color="text-primary" bg="bg-primary/10" />
        <KpiCard label="Operating Expenses" value={fmtCcy(totalExpenses)} icon={<BarChart2 className="h-4 w-4" />} color="text-red-500" bg="bg-red-500/10" />
        <KpiCard label="Gross Profit" value={fmtCcy(Math.max(grossProfit, 0))} icon={<Percent className="h-4 w-4" />} color="text-emerald-500" bg="bg-emerald-500/10" sub={`${margin}% margin`} />
        <KpiCard label="Net Status" value={grossProfit >= 0 ? 'Profitable' : 'Loss'} icon={grossProfit >= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} color={grossProfit >= 0 ? 'text-emerald-500' : 'text-red-500'} bg={grossProfit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'} sub={`By ${fmtCcy(Math.abs(grossProfit))}`} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <SectionCard title="Net Profit Trend" description="Monthly profit curves — last 6 months">
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profitHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" fontSize={11} stroke="#94A3B8" />
                <YAxis fontSize={11} stroke="#94A3B8" tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="NetProfit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} name="Net Profit" />
                <Line type="monotone" dataKey="Sales" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 3 }} name="Sales" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <div className="md:col-span-2">
          <SectionCard title="Operating Expenses Breakdown" description="All paid outflows by category">
            <div className="p-4 space-y-3 h-72 overflow-y-auto">
              {expenseAllocation.length === 0 ? <p className="text-center text-slate-400 italic text-xs pt-10">No paid expenses recorded.</p> :
                expenseAllocation.map((entry, idx) => {
                  const pct = expenseTotal > 0 ? ((entry.value / expenseTotal) * 100).toFixed(1) : '0.0';
                  const color = EXPENSE_COLORS[entry.name] || FALLBACK_COLOR;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{entry.name}</span>
                        <span>{fmtCcy(entry.value)} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-darkbg rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
