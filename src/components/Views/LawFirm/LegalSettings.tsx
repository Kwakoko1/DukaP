import React, { useState } from 'react';
import { Sliders, Save, CheckCircle2 } from 'lucide-react';

export const LegalSettings: React.FC = () => {
  const [caseFormat, setCaseFormat] = useState('MAT-{YYYY}-{SEQ}');
  const [defaultHourlyRate, setDefaultHourlyRate] = useState(150000);
  const [defaultRetainerMin, setDefaultRetainerMin] = useState(300000);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-2xl">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <Sliders className="h-5 w-5 text-indigo-600" />
          Legal Practice Configuration
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Case numbering formats, default advocate hourly rates, and retainer threshold defaults.
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-4">
        {saved && (
          <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>Legal settings updated successfully!</span>
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Case / Matter Numbering Format</label>
          <input
            type="text"
            value={caseFormat}
            onChange={(e) => setCaseFormat(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs font-mono"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Default Advocate Hourly Rate (TZS)</label>
          <input
            type="number"
            step={10000}
            value={defaultHourlyRate}
            onChange={(e) => setDefaultHourlyRate(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs font-mono"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Default Retainer Minimum Alert Threshold (TZS)</label>
          <input
            type="number"
            step={50000}
            value={defaultRetainerMin}
            onChange={(e) => setDefaultRetainerMin(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs font-mono"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Save size={15} />
            <span>Save Configurations</span>
          </button>
        </div>
      </form>
    </div>
  );
};
