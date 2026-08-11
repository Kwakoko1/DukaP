import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { FeedItem } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Plus, X } from 'lucide-react';

export const FeedWaterManagement: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    feed_name: '',
    category: 'Starter' as FeedItem['category'],
    protein_percent: 20,
    unit_of_measure: 'KG' as FeedItem['unit_of_measure'],
    stock_quantity: 500,
    reorder_level: 100,
    cost_per_unit: 1200,
  });

  const feedItems = useLiveQuery(() => db.feedItems.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.feed_name) return;

    const newFeed: FeedItem = {
      id: `feed-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      feed_name: form.feed_name,
      category: form.category,
      protein_percent: Number(form.protein_percent),
      unit_of_measure: form.unit_of_measure,
      stock_quantity: Number(form.stock_quantity),
      reorder_level: Number(form.reorder_level),
      cost_per_unit: Number(form.cost_per_unit),
      created_at: Date.now(),
    };

    await db.feedItems.put(newFeed);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Feed & Water Management</h2>
          <p className="text-xs text-slate-500">Manage feed inventory, crude protein (CP %) formulations, water meter logs, and feed cost per unit.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Add Feed Stock
        </button>
      </div>

      <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50 dark:bg-darkbg/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="p-3.5 pl-6">Feed Name</th>
              <th className="p-3.5">Category</th>
              <th className="p-3.5 text-center">Protein (CP %)</th>
              <th className="p-3.5 text-center">Stock Level</th>
              <th className="p-3.5 text-center">Reorder Level</th>
              <th className="p-3.5 pr-6 text-right">Cost / Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
            {feedItems.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">No feed items configured. Click "+ Add Feed Stock" to set up starter, grower, or layer mash inventory.</td></tr>
            ) : (
              feedItems.map((feed) => (
                <tr key={feed.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                  <td className="p-3.5 pl-6 font-bold text-slate-900 dark:text-white">{feed.feed_name}</td>
                  <td className="p-3.5 font-semibold text-slate-500">{feed.category}</td>
                  <td className="p-3.5 text-center font-mono font-bold text-emerald-600">{feed.protein_percent || '—'}% CP</td>
                  <td className="p-3.5 text-center font-extrabold text-slate-900 dark:text-white">{feed.stock_quantity.toLocaleString()} {feed.unit_of_measure}</td>
                  <td className="p-3.5 text-center text-slate-400">{feed.reorder_level} {feed.unit_of_measure}</td>
                  <td className="p-3.5 pr-6 text-right font-mono font-bold text-slate-800 dark:text-white">Tsh {feed.cost_per_unit.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Feed Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateFeed} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Add Feed Item to Stock</h3>
              <button type="button" onClick={() => setShowModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Feed Item Name *</label>
              <input
                required
                className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={form.feed_name}
                onChange={e => setForm({ ...form, feed_name: e.target.value })}
                placeholder="e.g. Chick Starter Mash"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Category</label>
                <select
                  className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value as any })}
                >
                  <option value="Starter">Starter</option>
                  <option value="Grower">Grower</option>
                  <option value="Finisher">Finisher</option>
                  <option value="Layer Mash">Layer Mash</option>
                  <option value="Dairy Meal">Dairy Meal</option>
                  <option value="Concentrate">Concentrate</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Crude Protein (CP %)</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={form.protein_percent}
                  onChange={e => setForm({ ...form, protein_percent: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Feed</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
