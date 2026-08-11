import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { BirdBatch } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Plus, X } from 'lucide-react';
import { DocumentAttachmentManager } from '../../UI/DocumentAttachmentManager';

export const PoultryBatches: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BirdBatch | null>(null);

  // Form states
  const [batchForm, setBatchForm] = useState({
    farm_id: '',
    house_id: '',
    batch_number: '',
    bird_type: 'Broiler' as BirdBatch['bird_type'],
    breed: 'Cobb 500',
    supplier: 'Kenchic Hatcheries',
    initial_quantity: 1000,
    initial_cost: 1500000,
    arrival_date: new Date().toISOString().split('T')[0],
  });

  const [dailyLogForm, setDailyLogForm] = useState({
    mortality_count: 0,
    cull_count: 0,
    feed_consumed_kg: 50,
    added_weight_kg: 0,
  });

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const houses = useLiveQuery(() => db.farmHouses.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const batches = useLiveQuery(() => db.birdBatches.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchForm.batch_number || !batchForm.farm_id) return;

    const newBatch: BirdBatch = {
      id: `batch-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_id: batchForm.farm_id,
      house_id: batchForm.house_id,
      batch_number: batchForm.batch_number,
      bird_type: batchForm.bird_type,
      breed: batchForm.breed,
      supplier: batchForm.supplier,
      arrival_date: batchForm.arrival_date,
      initial_quantity: Number(batchForm.initial_quantity),
      current_quantity: Number(batchForm.initial_quantity),
      accumulated_mortality: 0,
      accumulated_culled: 0,
      initial_cost: Number(batchForm.initial_cost),
      total_feed_consumed_kg: 0,
      current_total_weight_kg: Number(batchForm.initial_quantity) * 0.04, // 40g day-old chick
      fcr: 0,
      status: 'Active',
      created_at: Date.now(),
    };

    await db.birdBatches.put(newBatch);
    setShowBatchModal(false);
  };

  const handleLogDailyActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    const mort = Number(dailyLogForm.mortality_count);
    const cull = Number(dailyLogForm.cull_count);
    const feed = Number(dailyLogForm.feed_consumed_kg);

    const updatedQty = Math.max(0, selectedBatch.current_quantity - mort - cull);
    const updatedTotalFeed = selectedBatch.total_feed_consumed_kg + feed;
    const updatedMort = selectedBatch.accumulated_mortality + mort;
    const updatedCull = selectedBatch.accumulated_culled + cull;
    const updatedWeight = selectedBatch.current_total_weight_kg + Number(dailyLogForm.added_weight_kg);

    // Compute FCR: Total Feed Consumed (kg) / Total Weight Gain (kg)
    const computedFcr = updatedWeight > 0 ? parseFloat((updatedTotalFeed / updatedWeight).toFixed(2)) : 0;

    await db.birdBatches.update(selectedBatch.id, {
      current_quantity: updatedQty,
      accumulated_mortality: updatedMort,
      accumulated_culled: updatedCull,
      total_feed_consumed_kg: updatedTotalFeed,
      current_total_weight_kg: updatedWeight,
      fcr: computedFcr,
    });

    setShowLogModal(false);
    setSelectedBatch(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Poultry Flock & Batch Management</h2>
          <p className="text-xs text-slate-500">Track day-old chick intake, mortality rates, daily feed consumption, and Feed Conversion Ratio (FCR).</p>
        </div>

        <button
          onClick={() => setShowBatchModal(true)}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Receive New Flock Batch
        </button>
      </div>

      {/* Flock Batches Table */}
      <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50 dark:bg-darkbg/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="p-3.5 pl-6">Batch #</th>
              <th className="p-3.5">Type & Breed</th>
              <th className="p-3.5">Farm / House</th>
              <th className="p-3.5 text-center">Initial Qty</th>
              <th className="p-3.5 text-center">Current Live</th>
              <th className="p-3.5 text-center">Mortality %</th>
              <th className="p-3.5 text-center">Feed (KG)</th>
              <th className="p-3.5 text-center">FCR</th>
              <th className="p-3.5 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
            {batches.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-slate-400 italic">No poultry batches recorded. Click "Receive New Flock Batch" to start tracking.</td></tr>
            ) : (
              batches.map((batch) => {
                const mortPct = batch.initial_quantity > 0 ? ((batch.accumulated_mortality / batch.initial_quantity) * 100).toFixed(1) : '0';
                const farmObj = farms.find(f => f.id === batch.farm_id);
                const houseObj = houses.find(h => h.id === batch.house_id);

                return (
                  <tr key={batch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                    <td className="p-3.5 pl-6 font-mono font-bold text-emerald-600 dark:text-emerald-400">{batch.batch_number}</td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      {batch.bird_type} <span className="text-[10px] text-slate-400 font-normal">({batch.breed})</span>
                    </td>
                    <td className="p-3.5 text-slate-500">{farmObj?.farm_name || 'Farm'} · {houseObj?.house_name || 'Main House'}</td>
                    <td className="p-3.5 text-center font-semibold">{batch.initial_quantity.toLocaleString()}</td>
                    <td className="p-3.5 text-center font-extrabold text-slate-900 dark:text-white">{batch.current_quantity.toLocaleString()}</td>
                    <td className="p-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${Number(mortPct) > 5 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                        {mortPct}% ({batch.accumulated_mortality})
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-700 dark:text-slate-300">{batch.total_feed_consumed_kg.toLocaleString()} kg</td>
                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-black">
                        {batch.fcr || '1.65'}
                      </span>
                    </td>
                    <td className="p-3.5 pr-6 text-right space-x-2">
                      <button
                        onClick={() => { setSelectedBatch(batch); setShowLogModal(true); }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 font-bold text-[11px]"
                      >
                        + Log Daily Feed & Mortality
                      </button>
                      <button
                        onClick={() => setSelectedBatch(selectedBatch?.id === batch.id ? null : batch)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-darkbg hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-[11px]"
                      >
                        Docs
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Selected Batch Document Attachments */}
      {selectedBatch && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-darkbg-border">
          <DocumentAttachmentManager
            tenantId={tenantId}
            branchId={branchId}
            module="PoultryLivestock"
            entityType="BirdBatch"
            entityId={selectedBatch.id}
            title={`Flock Certificates & Supplier Receipts — Batch #${selectedBatch.batch_number}`}
          />
        </div>
      )}

      {/* Create Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateBatch} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Receive New Flock Batch</h3>
              <button type="button" onClick={() => setShowBatchModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm *</label>
                <select
                  required
                  className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={batchForm.farm_id}
                  onChange={e => setBatchForm({ ...batchForm, farm_id: e.target.value })}
                >
                  <option value="">Select Farm...</option>
                  {farms.map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Batch Number *</label>
                <input
                  required
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold font-mono"
                  value={batchForm.batch_number}
                  onChange={e => setBatchForm({ ...batchForm, batch_number: e.target.value.toUpperCase() })}
                  placeholder="BRL-2026-08"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Bird Type</label>
                <select
                  className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={batchForm.bird_type}
                  onChange={e => setBatchForm({ ...batchForm, bird_type: e.target.value as any })}
                >
                  <option value="Broiler">Broiler</option>
                  <option value="Layer">Layer</option>
                  <option value="Breeder">Breeder</option>
                  <option value="Duck">Duck</option>
                  <option value="Turkey">Turkey</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Initial Quantity</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={batchForm.initial_quantity}
                  onChange={e => setBatchForm({ ...batchForm, initial_quantity: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowBatchModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Batch</button>
            </div>
          </form>
        </div>
      )}

      {/* Log Daily Feed & Mortality Modal */}
      {showLogModal && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleLogDailyActivity} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Daily Log — Batch #{selectedBatch.batch_number}</h3>
              <button type="button" onClick={() => setShowLogModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Mortality Count</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold text-rose-500"
                  value={dailyLogForm.mortality_count}
                  onChange={e => setDailyLogForm({ ...dailyLogForm, mortality_count: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Daily Feed Consumed (KG)</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={dailyLogForm.feed_consumed_kg}
                  onChange={e => setDailyLogForm({ ...dailyLogForm, feed_consumed_kg: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowLogModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Daily Log</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
