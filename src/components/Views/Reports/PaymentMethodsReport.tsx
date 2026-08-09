import React, { useMemo } from 'react';
import { CreditCard, Smartphone, Banknote, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, getLast6Months, CHART_COLORS } from './types';
import type { ReportProps } from './types';

export const PaymentMethodsReport: React.FC<ReportProps> = ({ receipts, fmtCcy }) => {
  const completed = useMemo(() => receipts.filter(r => r.status === 'Completed'), [receipts]);

  const byMethod = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    completed.forEach(r => {
      const m = (r.payment_method || 'Unknown').replace(/_/g, ' ');
      if (!map[m]) map[m] = { count: 0, total: 0 };
      map[m].count += 1;
      map[m].total += (r.total || 0);
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [completed]);

  const totalRevenue = byMethod.reduce((s, m) => s + m.total, 0);
  const cash = byMethod.find(m => m.name.toLowerCase().includes('cash'));
  const mobile = byMethod.filter(m => ['mpesa', 'tigopesa', 'airtel', 'mobile'].some(k => m.name.toLowerCase().includes(k)));
  const mobileTotal = mobile.reduce((s, m) => s + m.total, 0);
  const dominantMethod = byMethod[0]?.name || 'N/A';

  const methodColors = [CHART_COLORS.indigo, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.sky, CHART_COLORS.rose, CHART_COLORS.violet, CHART_COLORS.orange, CHART_COLORS.teal];

  const monthlyTrend = useMemo(() => {
    return getLast6Months().map(({ label, year, month }) => {
      const monthR = completed.filter(r => { const d = new Date(r.created_at); return d.getFullYear() === year && d.getMonth() === month; });
      const result: any = { name: label };
      byMethod.slice(0, 4).forEach(m => {
        result[m.name] = monthR.filter(r => (r.payment_method || '').replace(/_/g, ' ') === m.name).reduce((s, r) => s + (r.total || 0), 0);
      });
      return result;
    });
  }, [completed, byMethod]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Dominant Method" value={dominantMethod} icon={<CreditCard className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" sub={byMethod[0] ? fmtCcy(byMethod[0].total) : ''} />
        <KpiCard label="Cash Revenue" value={fmtCcy(cash?.total || 0)} icon={<Banknote className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" sub={`${cash?.count || 0} transactions`} />
        <KpiCard label="Mobile Money" value={fmtCcy(mobileTotal)} icon={<Smartphone className="h-4 w-4" />} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/20" sub={`${mobile.length} methods`} />
        <KpiCard label="Payment Methods Used" value={`${byMethod.length} Methods`} icon={<Activity className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Revenue by Payment Method" description="Total value processed per method">
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMethod} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" fontSize={9} stroke="#94A3B8" />
                <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Revenue" radius={[4, 4, 0, 0]} fill={CHART_COLORS.indigo} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Monthly Payment Trend" description="Top payment methods over 6 months">
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" fontSize={10} stroke="#94A3B8" />
                <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {byMethod.slice(0, 4).map((m, i) => <Bar key={m.name} dataKey={m.name} fill={methodColors[i % methodColors.length]} radius={[2, 2, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Payment Method Breakdown" description="Transaction count and revenue per payment method">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Payment Method</th><th className="p-3.5 text-center">Transactions</th>
                <th className="p-3.5">Total Revenue</th><th className="p-3.5 pr-6">% of Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {byMethod.length === 0 ? <EmptyRows cols={4} message="No payment data found." /> :
                byMethod.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 font-bold text-slate-800 dark:text-white flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: methodColors[idx % methodColors.length] }} />{m.name}</td>
                    <td className="p-3.5 text-center font-bold">{m.count}</td>
                    <td className="p-3.5 font-bold text-indigo-600">{fmtCcy(m.total)}</td>
                    <td className="p-3.5 pr-6">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-darkbg rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${totalRevenue > 0 ? ((m.total/totalRevenue)*100).toFixed(1) : 0}%`, backgroundColor: methodColors[idx % methodColors.length] }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 w-10 text-right">{totalRevenue > 0 ? ((m.total/totalRevenue)*100).toFixed(1) : '0.0'}%</span>
                      </div>
                    </td>
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
