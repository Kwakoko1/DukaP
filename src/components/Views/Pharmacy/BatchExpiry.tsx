import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { MedicineBatch } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Plus, Search, Lock,
  Package, Clock, X, Trash2, Eye
} from 'lucide-react';

type BatchFilter = 'All' | 'Active' | 'Low' | 'Expired' | 'Recalled' | 'Disposed' | 'Locked';
type SortBy = 'expiry_asc' | 'expiry_desc' | 'product' | 'qty';

const TODAY_STR = new Date().toISOString().split('T')[0];
const IN_30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
const IN_60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
const IN_90 = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];

function getExpiryLevel(expiry: string): { label: string; color: string; ring: string } {
  if (expiry < TODAY_STR) return { label: 'EXPIRED', color: 'text-red-400', ring: 'bg-red-500/20 border-red-500/40' };
  if (expiry <= IN_30)    return { label: '≤ 30 days', color: 'text-orange-400', ring: 'bg-orange-500/20 border-orange-500/40' };
  if (expiry <= IN_60)    return { label: '≤ 60 days', color: 'text-amber-400', ring: 'bg-amber-500/20 border-amber-500/40' };
  if (expiry <= IN_90)    return { label: '≤ 90 days', color: 'text-yellow-400', ring: 'bg-yellow-500/20 border-yellow-500/40' };
  return { label: 'Good', color: 'text-emerald-400', ring: 'bg-emerald-500/10 border-emerald-500/20' };
}

const STATUS_OPTS: BatchFilter[] = ['All', 'Active', 'Low', 'Expired', 'Recalled', 'Disposed', 'Locked'];

export const BatchExpiry: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId  = currentBranch?.id || '';

  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<BatchFilter>('All');
  const [sortBy, setSortBy]         = useState<SortBy>('expiry_asc');
  const [showForm, setShowForm]     = useState(false);
  const [selected, setSelected]     = useState<MedicineBatch | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const [form, setForm] = useState({
    product_id: '', product_name: '', batch_number: '', manufacturing_date: '',
    expiry_date: '', quantity_received: '', cost_price: '', selling_price: '',
    supplier_id: '', supplier_name: '', warehouse_name: '',
  });

  const batches = useLiveQuery(() =>
    db.medicineBatches.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );

  const products = useLiveQuery(() =>
    db.products.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );

  const pharmacyProducts = useMemo(() =>
    (products || []).filter(p => (p as any).module === 'Pharmacy' || (p as any).category === 'Medicine'),
    [products]
  );

  const filtered = useMemo(() => {
    let bs = batches || [];
    if (filter !== 'All') bs = bs.filter(b => b.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      bs = bs.filter(b =>
        (b.product_name || '').toLowerCase().includes(q) ||
        b.batch_number.toLowerCase().includes(q) ||
        (b.supplier_name || '').toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case 'expiry_asc':  return [...bs].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      case 'expiry_desc': return [...bs].sort((a, b) => b.expiry_date.localeCompare(a.expiry_date));
      case 'product':     return [...bs].sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''));
      case 'qty':         return [...bs].sort((a, b) => b.quantity_remaining - a.quantity_remaining);
      default:            return bs;
    }
  }, [batches, filter, search, sortBy]);

  // KPIs
  const kpis = useMemo(() => {
    const bs = batches || [];
    return {
      total:    bs.length,
      expired:  bs.filter(b => b.expiry_date < TODAY_STR).length,
      exp30:    bs.filter(b => b.expiry_date >= TODAY_STR && b.expiry_date <= IN_30).length,
      exp60:    bs.filter(b => b.expiry_date > IN_30 && b.expiry_date <= IN_60).length,
      locked:   bs.filter(b => b.status === 'Locked').length,
      recalled: bs.filter(b => b.status === 'Recalled').length,
    };
  }, [batches]);

  const handleSaveBatch = async () => {
    if (!form.product_id || !form.batch_number || !form.expiry_date) return;
    const now = Date.now();
    const isExpired = form.expiry_date < TODAY_STR;
    await db.medicineBatches.add({
      id: `batch-${now}`,
      tenant_id: tenantId,
      branch_id: branchId,
      product_id: form.product_id,
      product_name: form.product_name,
      batch_number: form.batch_number,
      manufacturing_date: form.manufacturing_date || undefined,
      expiry_date: form.expiry_date,
      supplier_name: form.supplier_name || undefined,
      quantity_received: Number(form.quantity_received) || 0,
      quantity_remaining: Number(form.quantity_received) || 0,
      cost_price: Number(form.cost_price) || 0,
      selling_price: Number(form.selling_price) || undefined,
      warehouse_name: form.warehouse_name || undefined,
      status: isExpired ? 'Expired' : 'Active',
      created_at: now,
      updated_at: now,
    });
    setShowForm(false);
    setForm({ product_id: '', product_name: '', batch_number: '', manufacturing_date: '',
      expiry_date: '', quantity_received: '', cost_price: '', selling_price: '',
      supplier_id: '', supplier_name: '', warehouse_name: '' });
  };

  const handleLockBatch = async (b: MedicineBatch) => {
    await db.medicineBatches.update(b.id, { status: 'Locked', is_locked: true, lock_reason: 'Manually locked', updated_at: Date.now() });
  };

  const handleDispose = async (b: MedicineBatch) => {
    await db.medicineBatches.update(b.id, { status: 'Disposed', quantity_remaining: 0, updated_at: Date.now() });
    await db.pharmacyAuditLogs.add({ id: `pal-${Date.now()}`, tenant_id: tenantId,
      user_id: user?.id || '', user_name: user?.name, action: 'BATCH_DISPOSED',
      entity_type: 'MedicineBatch', entity_id: b.id, created_at: Date.now() });
  };

  const inp = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500';
  const lbl = 'block text-xs text-slate-400 mb-1 font-medium';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" /> Batch & Expiry Management
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">FEFO-ordered batch tracking with expiry lifecycle control</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" /> Record Batch
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Total Batches',  value: kpis.total,    color: 'text-slate-300', bg: 'bg-slate-800' },
          { label: 'Expired',        value: kpis.expired,  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
          { label: 'Exp ≤ 30 days',  value: kpis.exp30,    color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
          { label: 'Exp ≤ 60 days',  value: kpis.exp60,    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
          { label: 'Locked',         value: kpis.locked,   color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
          { label: 'Recalled',       value: kpis.recalled, color: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-slate-800 rounded-2xl p-3 text-center`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by medicine, batch #, supplier…"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as BatchFilter)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
          {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
          <option value="expiry_asc">Expiry ↑ (FEFO)</option>
          <option value="expiry_desc">Expiry ↓</option>
          <option value="product">Medicine A-Z</option>
          <option value="qty">Quantity ↓</option>
        </select>
      </div>

      {/* Batch Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Medicine', 'Batch #', 'Expiry', 'Expiry Status', 'Qty Remaining', 'Cost Price', 'Supplier', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-slate-500">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No batches found. Record your first batch to start FEFO tracking.
                </td></tr>
              ) : filtered.map(b => {
                const lvl = getExpiryLevel(b.expiry_date);
                return (
                  <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-medium">{b.product_name || b.product_id}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{b.batch_number}</td>
                    <td className="px-4 py-3 text-slate-300">{b.expiry_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${lvl.ring} ${lvl.color}`}>
                        {lvl.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-semibold">{b.quantity_remaining.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-400">TZS {b.cost_price.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-400">{b.supplier_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        b.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' :
                        b.status === 'Expired' ? 'bg-red-500/20 text-red-400' :
                        b.status === 'Locked' ? 'bg-violet-500/20 text-violet-400' :
                        b.status === 'Recalled' ? 'bg-rose-500/20 text-rose-400' :
                        b.status === 'Disposed' ? 'bg-slate-600 text-slate-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setSelected(b); setShowDetail(true); }}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200" title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {b.status === 'Active' && (
                          <button onClick={() => handleLockBatch(b)}
                            className="p-1.5 rounded-lg hover:bg-violet-900/40 text-slate-400 hover:text-violet-400" title="Lock">
                            <Lock className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(b.status === 'Expired' || b.status === 'Locked') && (
                          <button onClick={() => handleDispose(b)}
                            className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400" title="Dispose">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Batch Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-400" /> Record New Batch
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={lbl}>Medicine *</label>
                <select value={form.product_id} onChange={e => {
                  const p = pharmacyProducts.find(x => x.id === e.target.value);
                  setForm(f => ({ ...f, product_id: e.target.value, product_name: p?.name || '' }));
                }} className={inp}>
                  <option value="">Select Medicine</option>
                  {pharmacyProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Batch Number *</label>
                  <input value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} className={inp} placeholder="e.g. BT-2024-001" />
                </div>
                <div>
                  <label className={lbl}>Quantity Received *</label>
                  <input type="number" value={form.quantity_received} onChange={e => setForm(f => ({ ...f, quantity_received: e.target.value }))} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Manufacturing Date</label>
                  <input type="date" value={form.manufacturing_date} onChange={e => setForm(f => ({ ...f, manufacturing_date: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Expiry Date *</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Cost Price (TZS)</label>
                  <input type="number" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Selling Price (TZS)</label>
                  <input type="number" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} className={inp} placeholder="0" />
                </div>
              </div>
              <div>
                <label className={lbl}>Supplier Name</label>
                <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} className={inp} placeholder="Supplier / Distributor" />
              </div>
              <div>
                <label className={lbl}>Warehouse / Storage Location</label>
                <input value={form.warehouse_name} onChange={e => setForm(f => ({ ...f, warehouse_name: e.target.value }))} className={inp} placeholder="e.g. Cold Storage A" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveBatch}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm">
                  Save Batch
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold">Batch Detail</h3>
              <button onClick={() => setShowDetail(false)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              {[
                ['Medicine', selected.product_name || selected.product_id],
                ['Batch Number', selected.batch_number],
                ['Manufacturing Date', selected.manufacturing_date || '—'],
                ['Expiry Date', selected.expiry_date],
                ['Status', selected.status],
                ['Qty Received', selected.quantity_received.toLocaleString()],
                ['Qty Remaining', selected.quantity_remaining.toLocaleString()],
                ['Cost Price', `TZS ${selected.cost_price.toLocaleString()}`],
                ['Selling Price', selected.selling_price ? `TZS ${selected.selling_price.toLocaleString()}` : '—'],
                ['Supplier', selected.supplier_name || '—'],
                ['Warehouse', selected.warehouse_name || '—'],
                ['Controlled Drug', selected.is_controlled ? 'Yes' : 'No'],
                ['Lock Reason', selected.lock_reason || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-200 font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
