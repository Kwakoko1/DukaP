import React, { useMemo } from 'react';
import { Clock, AlertCircle, Users, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CHART_COLORS } from './types';
import type { ReportProps } from './types';

const AGING_BUCKETS = [
  { label: '0–30 days', key: 'current', color: CHART_COLORS.emerald },
  { label: '31–60 days', key: 'days30', color: CHART_COLORS.amber },
  { label: '61–90 days', key: 'days60', color: CHART_COLORS.orange },
  { label: '90+ days', key: 'days90', color: CHART_COLORS.red },
];

export const AgingReport: React.FC<ReportProps> = ({ customers, receipts, searchTerm, fmtCcy }) => {
  const now = Date.now();

  const debtors = useMemo(() => customers.filter(c => (c.outstandingBalance || 0) > 0), [customers]);
  const totalReceivable = useMemo(() => debtors.reduce((s, c) => s + (c.outstandingBalance || 0), 0), [debtors]);

  // Calculate last receipt date per customer to estimate debt age
  const lastReceiptDate = useMemo(() => {
    const map: Record<string, number> = {};
    receipts.forEach(r => {
      if (r.customer_id) {
        if (!map[r.customer_id] || r.created_at > map[r.customer_id]) map[r.customer_id] = r.created_at;
      }
    });
    return map;
  }, [receipts]);

  const enriched = useMemo(() => {
    return debtors.map(c => {
      const lastDate = lastReceiptDate[c.id] || now;
      const daysOld = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      let bucket = 'current';
      if (daysOld > 90) bucket = 'days90';
      else if (daysOld > 60) bucket = 'days60';
      else if (daysOld > 30) bucket = 'days30';
      return { ...c, daysOld, bucket };
    }).sort((a, b) => b.outstandingBalance - a.outstandingBalance);
  }, [debtors, lastReceiptDate, now]);

  const bucketSummary = useMemo(() => {
    return AGING_BUCKETS.map(b => ({
      name: b.label, color: b.color,
      count: enriched.filter(c => c.bucket === b.key).length,
      value: enriched.filter(c => c.bucket === b.key).reduce((s, c) => s + (c.outstandingBalance || 0), 0)
    }));
  }, [enriched]);

  const overdue60Plus = enriched.filter(c => c.daysOld > 60).reduce((s, c) => s + (c.outstandingBalance || 0), 0);
  const overdue90Plus = enriched.filter(c => c.daysOld > 90).reduce((s, c) => s + (c.outstandingBalance || 0), 0);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return enriched;
    const q = searchTerm.toLowerCase();
    return enriched.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q));
  }, [enriched, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Receivables" value={fmtCcy(totalReceivable)} icon={<DollarSign className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" sub={`${debtors.length} debtors`} />
        <KpiCard label="Overdue > 60 Days" value={fmtCcy(overdue60Plus)} icon={<AlertCircle className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" />
        <KpiCard label="Critical > 90 Days" value={fmtCcy(overdue90Plus)} icon={<Clock className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" />
        <KpiCard label="Customers with Debt" value={`${debtors.length} Customers`} icon={<Users className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" />
      </div>

      <SectionCard title="Aging Buckets" description="Outstanding balance grouped by age of debt">
        <div className="p-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bucketSummary} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={10} stroke="#94A3B8" />
              <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip formatter={(v: any) => [`Tsh ${Number(v).toLocaleString()}`, 'Amount']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Amount">
                {bucketSummary.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 pt-0">
          {bucketSummary.map(b => (
            <div key={b.name} className="rounded-xl border border-slate-100 dark:border-darkbg-border/30 p-3 text-center">
              <div className="h-2 w-2 rounded-full mx-auto mb-2" style={{ backgroundColor: b.color }} />
              <p className="text-[10px] font-bold text-slate-400">{b.name}</p>
              <p className="text-xs font-black text-slate-800 dark:text-white mt-0.5">{fmtCcy(b.value)}</p>
              <p className="text-[10px] text-slate-400">{b.count} customers</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Accounts Receivable Ledger" description="All customers with outstanding balances, aged by last transaction date">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Customer</th><th className="p-3.5">Phone</th>
                <th className="p-3.5 text-center">Days Old</th><th className="p-3.5">Bucket</th>
                <th className="p-3.5">Credit Limit</th><th className="p-3.5 pr-6 text-red-500">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={6} message="No outstanding customer balances found. Great job!" /> :
                filtered.map((c: any, idx) => {
                  const bucket = AGING_BUCKETS.find(b => b.key === c.bucket);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="p-3.5 pl-6 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                      <td className="p-3.5 text-slate-500 font-mono">{c.phone || '—'}</td>
                      <td className="p-3.5 text-center font-bold">{c.daysOld}d</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: (bucket?.color || '#94A3B8') + '22', color: bucket?.color || '#94A3B8' }}>{bucket?.label || '—'}</span>
                      </td>
                      <td className="p-3.5 text-slate-500">{fmtCcy(c.creditLimit || 0)}</td>
                      <td className="p-3.5 pr-6 font-black text-red-500">{fmtCcy(c.outstandingBalance || 0)}</td>
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
