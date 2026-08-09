import React, { useMemo } from 'react';
import { DollarSign, Calculator, Percent, FileText } from 'lucide-react';
import { KpiCard, SectionCard, EmptyRows } from './types';
import type { ReportProps } from './types';

export const TaxReport: React.FC<ReportProps> = ({ receipts, searchTerm, fmtCcy }) => {
  const taxReceipts = useMemo(() => receipts.filter(r => r.status === 'Completed'), [receipts]);
  const totalSales = useMemo(() => taxReceipts.reduce((s, r) => s + (r.total || 0), 0), [taxReceipts]);
  const totalTax = useMemo(() => taxReceipts.reduce((s, r) => s + (r.tax_amount || 0), 0), [taxReceipts]);
  const preTax = Math.max(0, totalSales - totalTax);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return taxReceipts;
    const q = searchTerm.toLowerCase();
    return taxReceipts.filter(r => r.id?.toLowerCase().includes(q) || r.receipt_number?.toLowerCase().includes(q) || r.payment_method?.toLowerCase().includes(q));
  }, [taxReceipts, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Taxable Sales" value={fmtCcy(totalSales)} icon={<DollarSign className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" />
        <KpiCard label="Pre-Tax Sales Value" value={fmtCcy(preTax)} icon={<Calculator className="h-4 w-4" />} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/20" />
        <KpiCard label="VAT Collected (18%)" value={fmtCcy(totalTax)} icon={<Percent className="h-4 w-4" />} color="text-red-600" bg="bg-red-50 dark:bg-red-950/20" />
        <KpiCard label="Tax Invoices" value={`${taxReceipts.length} Receipts`} icon={<FileText className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/20" />
      </div>
      <SectionCard title="VAT Tax & Invoices Ledger" description="Detailed VAT registration table for all completed transactions">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Receipt #</th><th className="p-3.5">Date & Time</th>
                <th className="p-3.5">Cashier</th><th className="p-3.5">Payment Method</th>
                <th className="p-3.5">Gross Total</th><th className="p-3.5 text-red-500">VAT</th><th className="p-3.5 pr-6">Pre-Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={7} message="No taxable receipts found for this period." /> :
                filtered.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3.5 pl-6 font-mono font-bold text-slate-700 dark:text-slate-300">{r.receipt_number || r.id}</td>
                    <td className="p-3.5 text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">{r.cashier_name || '—'}</td>
                    <td className="p-3.5 font-bold uppercase">{(r.payment_method || '').replace(/_/g, ' ')}</td>
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">{fmtCcy(r.total || 0)}</td>
                    <td className="p-3.5 font-bold text-red-500">{fmtCcy(r.tax_amount || 0)}</td>
                    <td className="p-3.5 pr-6 font-bold text-emerald-600">{fmtCcy(Math.max(0, (r.total || 0) - (r.tax_amount || 0)))}</td>
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
