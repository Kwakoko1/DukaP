import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Egg, Milk, Activity, AlertTriangle, Syringe,
  TrendingUp, ArrowRight
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface LivestockDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const LivestockDashboard: React.FC<LivestockDashboardProps> = ({ onNavigateTab }) => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id || '';

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const batches = useLiveQuery(() => db.birdBatches.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const animals = useLiveQuery(() => db.livestockAnimals.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const vaccinations = useLiveQuery(() => db.vaccinationRecords.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const eggLogs = useLiveQuery(() => db.eggProductions.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const milkLogs = useLiveQuery(() => db.milkProductions.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const feedItems = useLiveQuery(() => db.feedItems.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const totalBirds = batches.reduce((sum, b) => sum + (b.current_quantity || 0), 0);
  const totalLivestock = animals.filter(a => a.status !== 'Sold' && a.status !== 'Deceased').length;
  const activeBatchesCount = batches.filter(b => b.status === 'Active').length;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayEggs = eggLogs.filter(e => e.collection_date === todayStr).reduce((sum, e) => sum + e.total_eggs, 0);
  const todayMilk = milkLogs.filter(m => m.session_date === todayStr).reduce((sum, m) => sum + m.liters_yield, 0);

  const pendingVaccinations = vaccinations.filter(v => v.status === 'Scheduled');
  const lowFeedItems = feedItems.filter(f => f.stock_quantity <= f.reorder_level);

  // Sample chart data
  const productionTrend = [
    { day: 'Mon', Eggs: 1420, Milk: 340 },
    { day: 'Tue', Eggs: 1510, Milk: 355 },
    { day: 'Wed', Eggs: 1480, Milk: 360 },
    { day: 'Thu', Eggs: 1600, Milk: 348 },
    { day: 'Fri', Eggs: 1650, Milk: 375 },
    { day: 'Sat', Eggs: 1590, Milk: 370 },
    { day: 'Sun', Eggs: 1720, Milk: 385 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 p-6 rounded-3xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
              Commercial Farm Suite
            </span>
            <span className="text-xs text-slate-300">· {farms.length} Registered Farms</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black">Poultry & Livestock Operations Command Center</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Real-time flock mortality tracking, FCR feed conversions, dairy milk yields, hatchery incubation, and veterinary compliance.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigateTab('Poultry Flocks')}
            className="px-4 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs transition shadow-lg flex items-center gap-1.5"
          >
            <Egg className="h-4 w-4" /> Manage Flocks
          </button>
          <button
            onClick={() => onNavigateTab('Livestock Registry')}
            className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition flex items-center gap-1.5"
          >
            <Activity className="h-4 w-4" /> Herd Registry
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Flock Population</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600"><Egg className="h-4 w-4" /></div>
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-2">{totalBirds.toLocaleString()} Birds</p>
          <p className="text-[10px] text-slate-400 mt-1">{activeBatchesCount} Active Flocks/Batches</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Livestock Herd</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600"><Milk className="h-4 w-4" /></div>
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-2">{totalLivestock.toLocaleString()} Heads</p>
          <p className="text-[10px] text-slate-400 mt-1">Cattle, Goats, Sheep, Pigs</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Today's Production</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600"><TrendingUp className="h-4 w-4" /></div>
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-2">{todayEggs.toLocaleString()} Eggs</p>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">+{todayMilk} L Milk Yield Today</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vaccinations Due</span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600"><Syringe className="h-4 w-4" /></div>
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-2">{pendingVaccinations.length} Pending</p>
          <p className="text-[10px] text-rose-500 font-bold mt-1">{lowFeedItems.length} Low Feed Alerts</p>
        </div>
      </div>

      {/* Production Trends & Alerts Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Daily Production Trends (7-Day)</h3>
              <p className="text-xs text-slate-400">Egg output (units) vs Milk production (liters)</p>
            </div>
            <button onClick={() => onNavigateTab('Production Ledger')} className="text-xs text-emerald-600 font-bold hover:underline flex items-center gap-1">
              Full Ledger <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={productionTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="day" fontSize={11} stroke="#94A3B8" />
              <YAxis fontSize={11} stroke="#94A3B8" />
              <Tooltip />
              <Line type="monotone" dataKey="Eggs" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Eggs Collected" />
              <Line type="monotone" dataKey="Milk" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Milk Yield (L)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Operational Alerts & Due Tasks */}
        <div className="p-5 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Action Required</h3>
            </div>

            <div className="space-y-3">
              {pendingVaccinations.slice(0, 3).map((v) => (
                <div key={v.id} className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white">{v.vaccine_name}</p>
                    <p className="text-[10px] text-slate-400">Scheduled: {v.scheduled_date}</p>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    Due
                  </span>
                </div>
              ))}

              {lowFeedItems.slice(0, 2).map((f) => (
                <div key={f.id} className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white">{f.feed_name}</p>
                    <p className="text-[10px] text-slate-400">Stock: {f.stock_quantity} {f.unit_of_measure} (Reorder: {f.reorder_level})</p>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                    Low
                  </span>
                </div>
              ))}

              {pendingVaccinations.length === 0 && lowFeedItems.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center italic">No pending alerts. All farm schedules operate normally.</p>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('Health & Veterinary')}
            className="w-full mt-4 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border hover:bg-slate-50 dark:hover:bg-darkbg text-xs font-bold text-slate-600 dark:text-slate-300 transition"
          >
            Open Veterinary Portal
          </button>
        </div>
      </div>
    </div>
  );
};
