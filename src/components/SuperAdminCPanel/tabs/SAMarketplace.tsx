import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cloudDb } from '../../../db/supabaseMock';
import { useModule, MODULE_MANIFESTS, type IndustryModule } from '../../../context/ModuleContext';
import { Search, ToggleLeft, ToggleRight, Users, Boxes, ShoppingBag } from 'lucide-react';

import { isTenantDeleted } from '../../../utils/tenantSecurityBroadcast';

export const SAMarketplace: React.FC = () => {
  const { moduleStates, toggleModuleState } = useModule();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ENABLED' | 'DISABLED'>('ALL');
  const rawTenants = useLiveQuery(() => cloudDb.cloud_tenants.toArray()) || [];
  const tenants = useMemo(() => rawTenants.filter((t: any) => !isTenantDeleted(t)), [rawTenants]);

  const keys = useMemo(() => {
    return Object.keys(MODULE_MANIFESTS).filter(key => {
      const m = MODULE_MANIFESTS[key as IndustryModule];
      const state = moduleStates[key] || { enabled: true };
      if (filter === 'ENABLED' && !state.enabled) return false;
      if (filter === 'DISABLED' && state.enabled) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return m.name.toLowerCase().includes(q) || key.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    });
  }, [moduleStates, filter, searchQuery]);

  const enabledCount  = Object.values(moduleStates).filter(s => s.enabled !== false).length;
  const disabledCount = Object.keys(MODULE_MANIFESTS).length - enabledCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Business Categories Marketplace</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Control global availability of all industry modules and platform plugins</p>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <ShoppingBag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-black text-slate-900 dark:text-white">{Object.keys(MODULE_MANIFESTS).length}</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Total Modules</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <ToggleRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-black text-slate-900 dark:text-white">{enabledCount}</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Enabled</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-500/10 border border-slate-500/20">
          <ToggleLeft className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span className="text-xs font-black text-slate-900 dark:text-white">{disabledCount}</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Disabled</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search modules..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500/50 shadow-sm dark:shadow-none"
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-slate-900/60 border border-slate-200 dark:border-white/8">
          {(['ALL', 'ENABLED', 'DISABLED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wide transition ${
                filter === f
                  ? 'bg-white dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 shadow-sm border border-slate-200 dark:border-blue-500/30 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Module grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map(key => {
          const m = MODULE_MANIFESTS[key as IndustryModule];
          const state = moduleStates[key] || { enabled: true, version: 'v2.4.1' };
          const tenantCount = tenants.filter((t: any) => (t.business_type || t.industry || 'Retail') === key).length;

          return (
            <div
              key={key}
              className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                state.enabled
                  ? 'border-slate-200/80 dark:border-white/8 bg-white dark:bg-slate-800/60 shadow-sm dark:shadow-none hover:border-blue-500/30 hover:shadow-md'
                  : 'border-slate-200/40 dark:border-white/5 bg-slate-100/50 dark:bg-slate-900/30 opacity-60'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 shrink-0">
                      <Boxes className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 dark:text-white truncate">{m.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">{key}</span>
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">{state.version || 'v2.4.1'}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleModuleState(key)}
                    title={state.enabled ? 'Disable module' : 'Enable module'}
                    className="shrink-0 ml-2 transition-transform hover:scale-110"
                  >
                    {state.enabled
                      ? <ToggleRight className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
                      : <ToggleLeft className="h-8 w-8 text-slate-400 dark:text-slate-600" />
                    }
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed min-h-[2.5rem]">{m.description}</p>

                <div className="flex flex-wrap gap-1">
                  {m.widgets.slice(0, 3).map((w, i) => (
                    <span key={i} className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/5">{w}</span>
                  ))}
                  {m.widgets.length > 3 && (
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">+{m.widgets.length - 3}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Users className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">{tenantCount}</span>
                  <span className="text-slate-400 dark:text-slate-500">{tenantCount === 1 ? 'tenant' : 'tenants'}</span>
                </div>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                  state.enabled ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                }`}>
                  {state.enabled ? 'Global Active' : 'Restricted'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {keys.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
          <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-bold">No modules match your filter</p>
          <p className="text-xs mt-1">Try adjusting the search or filter.</p>
        </div>
      )}
    </div>
  );
};
