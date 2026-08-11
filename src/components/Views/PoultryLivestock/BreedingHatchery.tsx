import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { HatchCycle } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Plus, X } from 'lucide-react';

export const BreedingHatchery: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    farm_id: '',
    batch_number: 'INC-2026-001',
    total_eggs_set: 5000,
    set_date: new Date().toISOString().split('T')[0],
  });

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const hatchCycles = useLiveQuery(() => db.hatchCycles.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateHatchCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.batch_number || !form.farm_id) return;

    // Calculate expected hatch date (21 days for chicken eggs)
    const setDt = new Date(form.set_date);
    setDt.setDate(setDt.getDate() + 21);
    const expectedHatch = setDt.toISOString().split('T')[0];

    const newCycle: HatchCycle = {
      id: `hatch-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_id: form.farm_id,
      incubator_id: 'inc-01',
      batch_number: form.batch_number,
      total_eggs_set: Number(form.total_eggs_set),
      set_date: form.set_date,
      expected_hatch_date: expectedHatch,
      status: 'Incubating',
      created_at: Date.now(),
    };

    await db.hatchCycles.put(newCycle);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Breeding & Hatchery Management</h2>
          <p className="text-xs text-slate-500">Manage natural/AI mating records, incubator settings, candling fertility %, and chick hatchability %.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Start Incubator Setting
        </button>
      </div>

      {/* Hatch Cycles Table */}
      <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50 dark:bg-darkbg/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="p-3.5 pl-6">Incubator Batch #</th>
              <th className="p-3.5 text-center">Total Eggs Set</th>
              <th className="p-3.5 text-center">Set Date</th>
              <th className="p-3.5 text-center">Expected Hatch Date</th>
              <th className="p-3.5 text-center">Fertility %</th>
              <th className="p-3.5 pr-6 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
            {hatchCycles.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">No incubator hatch cycles active. Click "Start Incubator Setting" to set eggs.</td></tr>
            ) : (
              hatchCycles.map((cycle) => (
                <tr key={cycle.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                  <td className="p-3.5 pl-6 font-mono font-bold text-emerald-600">{cycle.batch_number}</td>
                  <td className="p-3.5 text-center font-extrabold text-slate-900 dark:text-white">{cycle.total_eggs_set.toLocaleString()}</td>
                  <td className="p-3.5 text-center font-mono text-slate-400">{cycle.set_date}</td>
                  <td className="p-3.5 text-center font-mono font-bold text-amber-600">{cycle.expected_hatch_date}</td>
                  <td className="p-3.5 text-center font-bold text-indigo-600">{cycle.fertility_percent || '88'}%</td>
                  <td className="p-3.5 pr-6 text-right">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">
                      {cycle.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Start Incubator Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateHatchCycle} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Start Incubator Hatch Cycle</h3>
              <button type="button" onClick={() => setShowModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm / Hatchery *</label>
              <select
                required
                className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={form.farm_id}
                onChange={e => setForm({ ...form, farm_id: e.target.value })}
              >
                <option value="">Select Farm...</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Batch Number *</label>
                <input
                  required
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold font-mono"
                  value={form.batch_number}
                  onChange={e => setForm({ ...form, batch_number: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Total Eggs Set</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={form.total_eggs_set}
                  onChange={e => setForm({ ...form, total_eggs_set: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Set Eggs</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
