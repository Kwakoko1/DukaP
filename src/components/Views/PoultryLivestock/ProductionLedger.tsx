import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { EggProduction, MilkProduction } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Egg, Milk, Plus, X } from 'lucide-react';

export const ProductionLedger: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [mode, setMode] = useState<'eggs' | 'milk'>('eggs');
  const [showEggModal, setShowEggModal] = useState(false);
  const [showMilkModal, setShowMilkModal] = useState(false);

  const [eggForm, setEggForm] = useState({
    farm_id: '',
    grade_a_count: 1200,
    grade_b_count: 150,
    damaged_count: 12,
    collection_date: new Date().toISOString().split('T')[0],
  });

  const [milkForm, setMilkForm] = useState({
    farm_id: '',
    animal_id: 'COW-0042',
    session: 'Morning' as MilkProduction['session'],
    liters_yield: 18.5,
    session_date: new Date().toISOString().split('T')[0],
  });

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const eggLogs = useLiveQuery(() => db.eggProductions.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const milkLogs = useLiveQuery(() => db.milkProductions.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateEggLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eggForm.farm_id) return;

    const gA = Number(eggForm.grade_a_count);
    const gB = Number(eggForm.grade_b_count);
    const total = gA + gB;
    const trays = parseFloat((total / 30).toFixed(1));

    const newEgg: EggProduction = {
      id: `egg-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_id: eggForm.farm_id,
      collection_date: eggForm.collection_date,
      grade_a_count: gA,
      grade_b_count: gB,
      damaged_count: Number(eggForm.damaged_count),
      total_eggs: total,
      trays_count: trays,
      created_at: Date.now(),
    };

    await db.eggProductions.put(newEgg);
    setShowEggModal(false);
  };

  const handleCreateMilkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!milkForm.farm_id || !milkForm.animal_id) return;

    const newMilk: MilkProduction = {
      id: `milk-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_id: milkForm.farm_id,
      animal_id: milkForm.animal_id,
      session: milkForm.session,
      liters_yield: Number(milkForm.liters_yield),
      session_date: milkForm.session_date,
      created_at: Date.now(),
    };

    await db.milkProductions.put(newMilk);
    setShowMilkModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Daily Production Ledger</h2>
          <p className="text-xs text-slate-500">Record daily egg collections (trays/grades) and morning/evening dairy milking yields.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border">
            <button
              onClick={() => setMode('eggs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${mode === 'eggs' ? 'bg-white dark:bg-darkbg-card text-emerald-600 shadow-xs' : 'text-slate-500'}`}
            >
              <Egg className="h-3.5 w-3.5" /> Egg Collections ({eggLogs.length})
            </button>
            <button
              onClick={() => setMode('milk')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${mode === 'milk' ? 'bg-white dark:bg-darkbg-card text-blue-600 shadow-xs' : 'text-slate-500'}`}
            >
              <Milk className="h-3.5 w-3.5" /> Dairy Milking ({milkLogs.length})
            </button>
          </div>

          <button
            onClick={() => mode === 'eggs' ? setShowEggModal(true) : setShowMilkModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" /> {mode === 'eggs' ? 'Record Egg Collection' : 'Record Milking Session'}
          </button>
        </div>
      </div>

      {/* Egg Collections Table */}
      {mode === 'eggs' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50 dark:bg-darkbg/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="p-3.5 pl-6">Collection Date</th>
                <th className="p-3.5">Grade A (Units)</th>
                <th className="p-3.5">Grade B (Units)</th>
                <th className="p-3.5 text-center">Damaged</th>
                <th className="p-3.5 text-center">Total Eggs</th>
                <th className="p-3.5 pr-6 text-right">Trays (30s)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {eggLogs.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">No egg collections logged. Click "Record Egg Collection" to enter daily egg yield.</td></tr>
              ) : (
                eggLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                    <td className="p-3.5 pl-6 font-mono font-bold text-slate-900 dark:text-white">{log.collection_date}</td>
                    <td className="p-3.5 font-semibold text-emerald-600">{log.grade_a_count.toLocaleString()}</td>
                    <td className="p-3.5 font-semibold text-slate-500">{log.grade_b_count.toLocaleString()}</td>
                    <td className="p-3.5 text-center font-semibold text-rose-500">{log.damaged_count}</td>
                    <td className="p-3.5 text-center font-extrabold text-slate-900 dark:text-white">{log.total_eggs.toLocaleString()}</td>
                    <td className="p-3.5 pr-6 text-right font-mono font-black text-emerald-600">{log.trays_count} Trays</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Milk Sessions Table */}
      {mode === 'milk' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50 dark:bg-darkbg/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="p-3.5 pl-6">Session Date</th>
                <th className="p-3.5">Animal ID</th>
                <th className="p-3.5">Session</th>
                <th className="p-3.5 pr-6 text-right">Liters Yield</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {milkLogs.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">No milking sessions logged. Click "Record Milking Session" to enter yield.</td></tr>
              ) : (
                milkLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                    <td className="p-3.5 pl-6 font-mono font-bold text-slate-900 dark:text-white">{log.session_date}</td>
                    <td className="p-3.5 font-bold text-blue-600">{log.animal_id}</td>
                    <td className="p-3.5 text-slate-500 font-semibold">{log.session}</td>
                    <td className="p-3.5 pr-6 text-right font-mono font-black text-blue-600">{log.liters_yield} Liters</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Egg Collection Modal */}
      {showEggModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateEggLog} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Record Daily Egg Collection</h3>
              <button type="button" onClick={() => setShowEggModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm *</label>
              <select
                required
                className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={eggForm.farm_id}
                onChange={e => setEggForm({ ...eggForm, farm_id: e.target.value })}
              >
                <option value="">Select Farm...</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Grade A (Units)</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={eggForm.grade_a_count}
                  onChange={e => setEggForm({ ...eggForm, grade_a_count: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Grade B (Units)</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={eggForm.grade_b_count}
                  onChange={e => setEggForm({ ...eggForm, grade_b_count: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Damaged</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold text-rose-500"
                  value={eggForm.damaged_count}
                  onChange={e => setEggForm({ ...eggForm, damaged_count: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowEggModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Collection</button>
            </div>
          </form>
        </div>
      )}

      {/* Record Milk Session Modal */}
      {showMilkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateMilkLog} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Record Dairy Milking Session</h3>
              <button type="button" onClick={() => setShowMilkModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm *</label>
              <select
                required
                className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={milkForm.farm_id}
                onChange={e => setMilkForm({ ...milkForm, farm_id: e.target.value })}
              >
                <option value="">Select Farm...</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Animal ID *</label>
                <input
                  required
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold font-mono"
                  value={milkForm.animal_id}
                  onChange={e => setMilkForm({ ...milkForm, animal_id: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Yield (Liters)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={milkForm.liters_yield}
                  onChange={e => setMilkForm({ ...milkForm, liters_yield: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowMilkModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">Save Milking</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
