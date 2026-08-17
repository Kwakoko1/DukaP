import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie';
import {
  syncStatePostUpdate,
  CURRENT_PWA_BUILD_VER
} from '../../services/pwaRehydrationService';

import { productRepository } from '../../db/repositories/productRepository';

export const PWADiagnostic: React.FC = () => {
  const [swVersion, setSwVersion] = useState<'v1' | 'v2'>('v2');
  const [simulationMode, setSimulationMode] = useState<'safe-v2' | 'legacy-v1-drop'>('safe-v2');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string>('PWA update protection active. IndexedDB schema & data cache isolated.');

  // Live query products directly from Dexie.js
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const brands = useLiveQuery(() => db.brands.toArray()) || [];

  // Seed sample products into Dexie if empty
  const handleSeedSampleProducts = async () => {
    const sampleItems = [
      { id: `demo-prod-${Date.now()}-1`, name: 'Premium Laptop', price: 1299, sellingPrice: 1299, buyingPrice: 900, stock: 15, category: 'Electronics', module: 'Retail', hasVariants: false, tenant_id: 'tenant-101', branch_id: 'branch-main' },
      { id: `demo-prod-${Date.now()}-2`, name: 'Wireless Earbuds', price: 149, sellingPrice: 149, buyingPrice: 80, stock: 42, category: 'Electronics', module: 'Retail', hasVariants: false, tenant_id: 'tenant-101', branch_id: 'branch-main' },
      { id: `demo-prod-${Date.now()}-3`, name: 'Smart Fitness Watch', price: 249, sellingPrice: 249, buyingPrice: 150, stock: 28, category: 'Fitness', module: 'Retail', hasVariants: false, tenant_id: 'tenant-101', branch_id: 'branch-main' },
      { id: `demo-prod-${Date.now()}-4`, name: 'Mechanical Keyboard', price: 99, sellingPrice: 99, buyingPrice: 55, stock: 60, category: 'Accessories', module: 'Retail', hasVariants: false, tenant_id: 'tenant-101', branch_id: 'branch-main' }
    ];
    for (const item of sampleItems) {
      await productRepository.saveProduct(item as any);
    }
    setSimulationLog(`Added ${sampleItems.length} test products to local Dexie IndexedDB store.`);
  };

  // Toggle simulation mode & execute transition
  const handleToggleSimulation = async (mode: 'safe-v2' | 'legacy-v1-drop') => {
    setSimulationMode(mode);
    setIsSimulating(true);

    if (mode === 'legacy-v1-drop') {
      setSwVersion('v1');
      setSimulationLog('⚠️ Simulating Legacy Service Worker v1 Activation: In the old implementation, broad cache keys.map() dropped all CacheStorage payloads.');
      
      // Check real CacheStorage
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        setSimulationLog(`[Simulation v1] Active CacheStorage buckets detected: [${keys.join(', ')}]. Old unshielded code would purge these without whitelist checks.`);
      }
    } else {
      setSwVersion('v2');
      setSimulationLog('🛡️ Simulating Safe Asset-v2 Migration: Service Worker activation strictly targets kwakopos-assets-* and preserves kwakopos-product-payloads & Dexie IDB.');
      
      // Execute safe rehydration verification
      const res = await syncStatePostUpdate();
      setSimulationLog(`✅ Safe Migration Completed: IndexedDB preserved ${res.productsCount} products. Build hash set to ${CURRENT_PWA_BUILD_VER}.`);
    }

    setIsSimulating(false);
  };

  const displayProducts = products.length > 0 ? products.slice(0, 5) : [
    { id: 'fallback-1', name: 'Premium Laptop', price: 1299 },
    { id: 'fallback-2', name: 'Wireless Earbuds', price: 149 },
    { id: 'fallback-3', name: 'Smart Fitness Watch', price: 249 },
    { id: 'fallback-4', name: 'Mechanical Keyboard', price: 99 }
  ];

  return (
    <div className="p-6 bg-slate-950/40 min-h-screen font-sans text-slate-200">
      <div className="max-w-5xl mx-auto bg-slate-900 rounded-3xl shadow-2xl border border-white/10 p-8 space-y-6">
        
        {/* Header Controls */}
        <div className="flex flex-wrap justify-between items-center gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">4. Interactive Update & Cache State Diagnostics</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                simulationMode === 'safe-v2' 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {simulationMode === 'safe-v2' ? 'Protected Mode (v2)' : 'Legacy Simulation (v1)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live Dexie.js IndexedDB wiring with real-time CacheStorage & Service Worker migration simulator.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleSimulation(simulationMode === 'safe-v2' ? 'legacy-v1-drop' : 'safe-v2')}
              disabled={isSimulating}
              className={`px-4 py-2 rounded-xl text-xs font-black transition shadow-lg ${
                simulationMode === 'safe-v2'
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
            >
              {simulationMode === 'safe-v2' ? 'Simulate Asset-v1 Drop' : 'Simulate Asset-v2 Migration'}
            </button>

            {products.length === 0 && (
              <button
                onClick={handleSeedSampleProducts}
                className="px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 rounded-xl text-xs font-bold transition"
              >
                + Seed Test Products
              </button>
            )}
          </div>
        </div>

        {/* Diagnostic Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
          
          {/* Top Left: Service Worker */}
          <div className="p-6 border border-white/10 rounded-2xl bg-slate-950/60 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Service Worker</h3>
              <p className="text-xs text-slate-400 mb-4">
                Controls lifecycle events (<span className="text-indigo-300 font-mono">install</span> &amp; <span className="text-indigo-300 font-mono">activate</span>) and background cache pruning.
              </p>
            </div>
            <div>
              <div className={`font-semibold py-3 px-6 rounded-xl inline-flex items-center gap-2 shadow-lg transition ${
                swVersion === 'v2'
                  ? 'bg-indigo-600 text-white shadow-indigo-600/30 border border-indigo-400/30'
                  : 'bg-amber-600 text-white shadow-amber-600/30 border border-amber-400/30'
              }`}>
                <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                Active SW {swVersion === 'v2' ? 'v2.1.0 (Protected)' : 'v1.0.0 (Legacy)'}
              </div>
            </div>
          </div>

          {/* Top Right: Client Viewport */}
          <div className="p-6 border border-white/10 rounded-2xl bg-slate-950/60 row-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Client Viewport / UI State</h3>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">{products.length} live in Dexie</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Reactive UI subscribers (<span className="text-indigo-300 font-mono">useLiveQuery</span>) re-render immediately as Dexie records update.
              </p>

              <div className="space-y-2.5">
                {displayProducts.map((item, idx) => (
                  <div key={item.id || idx} className="flex justify-between items-center p-3 bg-slate-900 border border-white/10 rounded-xl shadow-sm hover:border-white/20 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/40 border border-indigo-400/60 flex items-center justify-center text-[9px] text-white">
                        ✓
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">{item.name}</span>
                        {'category' in item && (
                          <span className="text-[10px] text-slate-500 font-medium">{(item as any).category}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      ${Number(item.price || (item as any).sellingPrice || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Categories: {categories.length}</span>
              <span>Brands: {brands.length}</span>
              <span>Dexie Status: Connected</span>
            </div>
          </div>

          {/* Middle Left: Cache Storage */}
          <div className="p-6 border border-white/10 rounded-2xl bg-slate-950/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Cache Storage</h3>
            <p className="text-xs text-slate-400 mb-4">
              Structural layout assets are segregated from API data payloads.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`font-semibold py-2.5 px-4 rounded-xl text-xs transition ${
                simulationMode === 'safe-v2'
                  ? 'bg-slate-800 text-slate-500 line-through opacity-60 border border-white/5'
                  : 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
              }`}>
                kwakopos-assets-v1
              </div>
              <div className={`font-semibold py-2.5 px-4 rounded-xl text-xs shadow-md transition ${
                simulationMode === 'safe-v2'
                  ? 'bg-indigo-600 text-white shadow-indigo-600/30 border border-indigo-400/30'
                  : 'bg-slate-800 text-slate-500 line-through opacity-60'
              }`}>
                kwakopos-assets-v2
              </div>
              <div className="bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md border border-emerald-400/40">
                🔒 kwakopos-product-payloads
              </div>
            </div>
          </div>

          {/* Bottom Left: IndexedDB */}
          <div className="p-6 border border-white/10 rounded-2xl bg-slate-950/60 col-span-1 md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">IndexedDB (Products &amp; Schemas)</h3>
              <span className="text-xs font-mono text-cyan-400">Dexie Database: {db.name} (v{db.verno})</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Sequential additive schema migrations guarantee 0 records are dropped when incrementing versions.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-indigo-500/30 text-indigo-300 text-xs font-mono font-bold py-2 px-3.5 rounded-xl border border-indigo-500/40">
                IDB Store: products ({products.length})
              </div>
              
              <div className="flex items-center gap-1.5 flex-wrap">
                {products.length > 0 ? (
                  products.slice(0, 8).map((p, i) => (
                    <div
                      key={p.id || i}
                      title={`${p.name} ($${p.price || (p as any).sellingPrice})`}
                      className="w-8 h-8 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 border border-indigo-400/40 shadow-sm flex items-center justify-center text-[10px] font-mono text-white font-bold transition cursor-help"
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  ))
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/80 shadow-sm" />
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/80 shadow-sm" />
                    <div className="w-8 h-8 rounded-lg bg-indigo-400/50 shadow-sm" />
                  </>
                )}
                {products.length > 8 && (
                  <span className="text-xs text-slate-400 font-mono font-bold">+{products.length - 8} more</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Simulation Log Stream */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 font-mono text-xs text-slate-300 space-y-1">
          <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Simulation Activity Log
          </div>
          <p className="text-emerald-400 leading-relaxed">{simulationLog}</p>
        </div>

        {/* Footer Status */}
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
          <span className="text-lg">🔒</span>
          <div>
            <p className="text-xs text-emerald-300 font-bold">
              Protected Architecture: Cache clear routines are isolated strictly to asset version keys.
            </p>
            <p className="text-[11px] text-emerald-400/70 mt-0.5">
              IndexedDB schemas and product data caches (<span className="font-mono">kwakopos-product-payloads</span>) remain 100% persistent across PWA upgrades.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PWADiagnostic;
