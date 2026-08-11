import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { VaccinationRecord } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Syringe, Plus, X } from 'lucide-react';

export const HealthVeterinary: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [activeSubTab, setActiveSubTab] = useState<'vaccinations' | 'treatments'>('vaccinations');
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    farm_id: '',
    vaccine_name: 'Newcastle / Gumboro Vaccine',
    dosage: '1 Drop / Bird',
    scheduled_date: new Date().toISOString().split('T')[0],
  });

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const vaccinations = useLiveQuery(() => db.vaccinationRecords.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const healthRecords = useLiveQuery(() => db.livestockHealthRecords.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateVaccination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vaccine_name || !form.farm_id) return;

    const newVac: VaccinationRecord = {
      id: `vac-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_id: form.farm_id,
      vaccine_name: form.vaccine_name,
      dosage: form.dosage,
      scheduled_date: form.scheduled_date,
      status: 'Scheduled',
      created_at: Date.now(),
    };

    await db.vaccinationRecords.put(newVac);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Health & Veterinary Portal</h2>
          <p className="text-xs text-slate-500">Vaccination calendar schedules, disease diagnosis logs, vet visit notes, and lab report documents.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border">
            <button
              onClick={() => setActiveSubTab('vaccinations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeSubTab === 'vaccinations' ? 'bg-white dark:bg-darkbg-card text-emerald-600 shadow-xs' : 'text-slate-500'}`}
            >
              Vaccinations ({vaccinations.length})
            </button>
            <button
              onClick={() => setActiveSubTab('treatments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeSubTab === 'treatments' ? 'bg-white dark:bg-darkbg-card text-emerald-600 shadow-xs' : 'text-slate-500'}`}
            >
              Disease & Treatments ({healthRecords.length})
            </button>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Schedule Vaccination
          </button>
        </div>
      </div>

      {/* Vaccinations Schedule Table */}
      {activeSubTab === 'vaccinations' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50 dark:bg-darkbg/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="p-3.5 pl-6">Vaccine Name</th>
                <th className="p-3.5">Dosage</th>
                <th className="p-3.5">Farm</th>
                <th className="p-3.5 text-center">Scheduled Date</th>
                <th className="p-3.5 pr-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {vaccinations.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No vaccination schedules logged. Click "+ Schedule Vaccination" to add Newcastle, Gumboro, or FMD vaccines.</td></tr>
              ) : (
                vaccinations.map((vac) => {
                  const farmObj = farms.find(f => f.id === vac.farm_id);
                  return (
                    <tr key={vac.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                      <td className="p-3.5 pl-6 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Syringe className="h-3.5 w-3.5 text-emerald-600" /> {vac.vaccine_name}
                      </td>
                      <td className="p-3.5 text-slate-500 font-semibold">{vac.dosage}</td>
                      <td className="p-3.5 text-slate-600 font-medium">{farmObj?.farm_name || 'Main Farm'}</td>
                      <td className="p-3.5 text-center font-mono font-bold text-slate-700 dark:text-slate-300">{vac.scheduled_date}</td>
                      <td className="p-3.5 pr-6 text-right">
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-bold">
                          {vac.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule Vaccination Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateVaccination} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Schedule Vaccination Program</h3>
              <button type="button" onClick={() => setShowModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm *</label>
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

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Vaccine Name *</label>
              <input
                required
                className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={form.vaccine_name}
                onChange={e => setForm({ ...form, vaccine_name: e.target.value })}
                placeholder="e.g. Newcastle Vaccine HB1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Dosage</label>
                <input
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={form.dosage}
                  onChange={e => setForm({ ...form, dosage: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Scheduled Date</label>
                <input
                  type="date"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={form.scheduled_date}
                  onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Schedule</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
