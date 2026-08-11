import React, { useState } from 'react';
import { Save, Check } from 'lucide-react';

export const LivestockSettings: React.FC = () => {
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState({
    mortality_alert_threshold_percent: 5,
    near_expiry_feed_days: 14,
    fcr_target: 1.65,
    enable_auto_vaccination_reminders: true,
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Farm & Livestock Settings</h2>
          <p className="text-xs text-slate-500">Configure alert thresholds for mortality rate %, target FCR, feed reorder limits, and automated reminders.</p>
        </div>

        {saved && (
          <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Settings Saved
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="p-6 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs space-y-5">
        <div>
          <label className="text-xs font-bold text-slate-800 dark:text-white">Flock Mortality Warning Threshold (%)</label>
          <p className="text-[11px] text-slate-400 mb-1.5">Trigger urgent warning badges when cumulative flock mortality exceeds this percentage.</p>
          <input
            type="number"
            className="w-full max-w-xs h-9 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-bold"
            value={settings.mortality_alert_threshold_percent}
            onChange={e => setSettings({ ...settings, mortality_alert_threshold_percent: Number(e.target.value) })}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-800 dark:text-white">Target Feed Conversion Ratio (FCR)</label>
          <p className="text-[11px] text-slate-400 mb-1.5">Standard FCR benchmark target for broilers/flocks (e.g. 1.65 kg feed per kg weight gain).</p>
          <input
            type="number"
            step="0.01"
            className="w-full max-w-xs h-9 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-bold"
            value={settings.fcr_target}
            onChange={e => setSettings({ ...settings, fcr_target: Number(e.target.value) })}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Save className="h-4 w-4" /> Save Farm Configuration
          </button>
        </div>
      </form>
    </div>
  );
};
