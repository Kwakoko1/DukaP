import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Package, Search, TrendingDown, ArrowRightLeft,
  ClipboardList, AlertTriangle, RefreshCw
} from 'lucide-react';

type InventoryTab = 'overview' | 'transfers' | 'count' | 'dead_stock' | 'reorder';

export const PharmacyInventory: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id || '';

  const [tab, setTab]       = useState<InventoryTab>('overview');
  const [search, setSearch] = useState('');

  const products = useLiveQuery(() =>
    db.products.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const batches = useLiveQuery(() =>
    db.medicineBatches.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );

  const pharmacyProducts = useMemo(() =>
    (products || []).filter(p => (p as any).module === 'Pharmacy' || (p as any).category === 'Medicine'),
    [products]
  );

  const productStockMap = useMemo(() => {
    const map: Record<string, { totalQty: number; batches: typeof batches; lowestExpiry: string | null; value: number }> = {};
    (batches || []).filter(b => b.status !== 'Disposed' && b.status !== 'Recalled').forEach(b => {
      if (!map[b.product_id]) map[b.product_id] = { totalQty: 0, batches: [], lowestExpiry: null, value: 0 };
      map[b.product_id].totalQty += b.quantity_remaining;
      map[b.product_id].value += b.quantity_remaining * b.cost_price;
      if (!map[b.product_id].batches) map[b.product_id].batches = [];
      (map[b.product_id].batches as any[]).push(b);
      if (!map[b.product_id].lowestExpiry || b.expiry_date < (map[b.product_id].lowestExpiry || '')) {
        map[b.product_id].lowestExpiry = b.expiry_date;
      }
    });
    return map;
  }, [batches]);

  const filtered = useMemo(() => {
    let list = pharmacyProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
    }
    return list;
  }, [pharmacyProducts, search]);

  const lowStock = useMemo(() =>
    pharmacyProducts.filter(p => {
      const qty = productStockMap[p.id]?.totalQty || 0;
      return qty > 0 && qty <= (p.reorderLevel || 10);
    }), [pharmacyProducts, productStockMap]
  );

  const outOfStock = useMemo(() =>
    pharmacyProducts.filter(p => !(productStockMap[p.id]?.totalQty)),
    [pharmacyProducts, productStockMap]
  );

  const deadStock = useMemo(() => {
    const ninetyDaysAgo = Date.now() - 90 * 86400000;
    return pharmacyProducts.filter(p => {
      const qty = productStockMap[p.id]?.totalQty || 0;
      return qty > 0 && (!p.updatedAt || p.updatedAt < ninetyDaysAgo);
    });
  }, [pharmacyProducts, productStockMap]);

  const totalStockValue = useMemo(() =>
    Object.values(productStockMap).reduce((s, v) => s + v.value, 0), [productStockMap]
  );

  const reorderCandidates = useMemo(() =>
    pharmacyProducts.filter(p => {
      const qty = productStockMap[p.id]?.totalQty || 0;
      return qty <= (p.reorderLevel || 10);
    }).sort((a, b) => {
      const qa = productStockMap[a.id]?.totalQty || 0;
      const qb = productStockMap[b.id]?.totalQty || 0;
      return qa - qb;
    }),
    [pharmacyProducts, productStockMap]
  );

  const TABS = [
    { id: 'overview',   label: 'Stock Overview', icon: Package },
    { id: 'transfers',  label: 'Transfers',       icon: ArrowRightLeft },
    { id: 'count',      label: 'Stock Count',     icon: ClipboardList },
    { id: 'dead_stock', label: 'Dead Stock',      icon: TrendingDown },
    { id: 'reorder',    label: 'Auto-Reorder',    icon: RefreshCw },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Package className="h-5 w-5 text-teal-400" /> Pharmacy Inventory
        </h2>
        <p className="text-slate-500 text-sm mt-0.5">Batch-aware stock management with FEFO enforcement</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Products', value: pharmacyProducts.length, color: 'text-teal-400', bg: 'bg-teal-500/10' },
          { label: 'Low Stock Items', value: lowStock.length, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Out of Stock', value: outOfStock.length, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Stock Value (TZS)', value: `${(totalStockValue / 1000).toFixed(0)}K`, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-slate-800 rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id as InventoryTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
              tab === id ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search medicine…"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500" />
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {['Medicine', 'SKU', 'Total Qty (Batches)', 'Nearest Expiry', 'Reorder Level', 'Stock Value', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-500">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No pharmacy products found. Add medicines in the Medicines Master section.
                    </td></tr>
                  ) : filtered.map(p => {
                    const info = productStockMap[p.id] || { totalQty: 0, value: 0, lowestExpiry: null };
                    const isLow = info.totalQty > 0 && info.totalQty <= (p.reorderLevel || 10);
                    const isOut = info.totalQty === 0;
                    const isNearExpiry = info.lowestExpiry && info.lowestExpiry <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
                    return (
                      <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-200 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-slate-200'}`}>
                            {info.totalQty.toLocaleString()}
                          </span>
                          <span className="text-slate-500 text-xs ml-1">
                            ({((p as any).batches || (batches || []).filter(b => b.product_id === p.id && b.status === 'Active')).length} batches)
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-xs ${isNearExpiry ? 'text-orange-400 font-semibold' : 'text-slate-400'}`}>
                          {info.lowestExpiry || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{p.reorderLevel || 10}</td>
                        <td className="px-4 py-3 text-slate-300">TZS {info.value.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isOut ? 'bg-red-500/20 text-red-400' :
                            isLow ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>{isOut ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'IN STOCK'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'dead_stock' && (
        <div className="space-y-3">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-sm">Dead Stock: products with on-hand quantity but no movement in 90+ days. Review for markdown, return to supplier, or disposal.</p>
          </div>
          {deadStock.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">No dead stock detected</p>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {['Medicine', 'Qty on Hand', 'Days Inactive', 'Stock Value'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deadStock.map(p => {
                    const info = productStockMap[p.id] || { totalQty: 0, value: 0 };
                    const daysInactive = p.updatedAt ? Math.floor((Date.now() - p.updatedAt) / 86400000) : 90;
                    return (
                      <tr key={p.id} className="border-b border-slate-800/50">
                        <td className="px-4 py-3 text-slate-200 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-amber-400 font-bold">{info.totalQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400">{daysInactive}+ days</td>
                        <td className="px-4 py-3 text-slate-300">TZS {info.value.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'reorder' && (
        <div className="space-y-3">
          <p className="text-slate-500 text-sm">Products at or below reorder level — generate purchase orders to restock.</p>
          {reorderCandidates.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
              <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
              All pharmacy products are adequately stocked.
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {['Medicine', 'Current Qty', 'Reorder Level', 'Suggested Order', 'Priority'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reorderCandidates.map(p => {
                    const qty = productStockMap[p.id]?.totalQty || 0;
                    const rl = p.reorderLevel || 10;
                    const suggested = Math.max(rl * 3 - qty, rl);
                    const priority = qty === 0 ? 'CRITICAL' : qty <= rl / 2 ? 'HIGH' : 'MEDIUM';
                    return (
                      <tr key={p.id} className="border-b border-slate-800/50">
                        <td className="px-4 py-3 text-slate-200 font-medium">{p.name}</td>
                        <td className={`px-4 py-3 font-bold ${qty === 0 ? 'text-red-400' : 'text-amber-400'}`}>{qty}</td>
                        <td className="px-4 py-3 text-slate-400">{rl}</td>
                        <td className="px-4 py-3 text-teal-400 font-semibold">{suggested}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            priority === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                            priority === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>{priority}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'transfers' && (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
          <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Stock Transfer Between Branches</p>
          <p className="text-xs mt-1">Select source branch, destination branch, batch, and quantity to initiate a transfer</p>
        </div>
      )}

      {tab === 'count' && (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Physical Stock Count</p>
          <p className="text-xs mt-1">Initiate a cycle count session to reconcile system quantities with physical quantities</p>
        </div>
      )}
    </div>
  );
};
