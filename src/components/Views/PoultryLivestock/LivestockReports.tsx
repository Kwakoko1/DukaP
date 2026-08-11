import React, { useState } from 'react';
import { Download, Printer, TrendingUp, Egg, HeartPulse } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const LivestockReports: React.FC = () => {
  const [activeReport, setActiveReport] = useState<'production' | 'mortality' | 'fcr'>('production');

  const chartData = [
    { name: 'Flock #1', Eggs: 14500, FCR: 1.62 },
    { name: 'Flock #2', Eggs: 12800, FCR: 1.68 },
    { name: 'Flock #3', Eggs: 16200, FCR: 1.58 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Farm Operational & Financial Reports</h2>
          <p className="text-xs text-slate-500">Generate printable PDF/Excel reports for mortality, egg/milk yields, FCR feed efficiency, and ROI.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card hover:bg-slate-50 text-xs font-bold text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 shadow-xs"
          >
            <Printer className="h-4 w-4" /> Print Report
          </button>
          <button
            onClick={() => alert('Exporting Farm Operational Ledger (CSV)...')}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Download className="h-4 w-4" /> Export CSV / Excel
          </button>
        </div>
      </div>

      {/* Reports Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveReport('production')}
          className={`p-4 rounded-2xl border text-left transition ${activeReport === 'production' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 ring-2 ring-emerald-500/20' : 'bg-white dark:bg-darkbg-card border-slate-200 dark:border-darkbg-border'}`}
        >
          <Egg className="h-5 w-5 text-emerald-600 mb-2" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Production & Yield Report</h3>
          <p className="text-[10px] text-slate-400 mt-1">Daily egg tray counts, milk sessions & grade ratios.</p>
        </button>

        <button
          onClick={() => setActiveReport('mortality')}
          className={`p-4 rounded-2xl border text-left transition ${activeReport === 'mortality' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500 ring-2 ring-rose-500/20' : 'bg-white dark:bg-darkbg-card border-slate-200 dark:border-darkbg-border'}`}
        >
          <HeartPulse className="h-5 w-5 text-rose-600 mb-2" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Flock Mortality Audit</h3>
          <p className="text-[10px] text-slate-400 mt-1">Accumulated mortality % per batch vs standard targets.</p>
        </button>

        <button
          onClick={() => setActiveReport('fcr')}
          className={`p-4 rounded-2xl border text-left transition ${activeReport === 'fcr' ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20' : 'bg-white dark:bg-darkbg-card border-slate-200 dark:border-darkbg-border'}`}
        >
          <TrendingUp className="h-5 w-5 text-indigo-600 mb-2" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">FCR & Feed Efficiency</h3>
          <p className="text-[10px] text-slate-400 mt-1">Feed Conversion Ratio (`Total Feed / Weight Gain`).</p>
        </button>
      </div>

      {/* Report Chart & Summary */}
      <div className="p-5 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Flock Performance Summary</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="name" fontSize={11} stroke="#94A3B8" />
            <YAxis fontSize={11} stroke="#94A3B8" />
            <Tooltip />
            <Bar dataKey="Eggs" fill="#10b981" radius={[4, 4, 0, 0]} name="Total Eggs Output" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
