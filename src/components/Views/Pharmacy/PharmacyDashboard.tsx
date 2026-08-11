import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Pill, ShoppingCart, FileText, Users, AlertTriangle,
  TrendingUp, Package, DollarSign, Activity, Shield,
  Clock, ChevronRight, RefreshCw, Star, Zap
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface PharmacyDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const PharmacyDashboard: React.FC<PharmacyDashboardProps> = ({ onNavigateTab }) => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id || '';

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayEnd = todayStart + 86400000;
  const now = Date.now();
  const in30Days = now + 30 * 86400000;

  // Live queries
  const allOrders = useLiveQuery(() =>
    db.orders.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const todayOrders = useMemo(() =>
    (allOrders || []).filter(o => {
      const ts = (o as any).created_at || (o as any).createdAt || 0;
      return ts >= todayStart && ts < todayEnd;
    }),
    [allOrders, todayStart, todayEnd]
  );

  const prescriptions = useLiveQuery(() =>
    db.prescriptions.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const patients = useLiveQuery(() =>
    db.pharmacyPatients.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const batches = useLiveQuery(() =>
    db.medicineBatches.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const insuranceClaims = useLiveQuery(() =>
    db.insuranceClaims.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const products = useLiveQuery(() =>
    db.products.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );

  // KPI calculations
  const todayRevenue = useMemo(() =>
    todayOrders.reduce((s, o) => s + (o.total || (o as any).totalAmount || 0), 0), [todayOrders]
  );

  const pendingPrescriptions = useMemo(() =>
    (prescriptions || []).filter(p => p.status === 'Pending' || p.status === 'Verified').length,
    [prescriptions]
  );

  const expiryAlerts = useMemo(() => {
    const bs = batches || [];
    const expiringStr = new Date(in30Days).toISOString().split('T')[0];
    const todayStr = new Date(todayStart).toISOString().split('T')[0];
    return {
      expired: bs.filter(b => b.expiry_date < todayStr && b.status !== 'Disposed'),
      expiring30: bs.filter(b => b.expiry_date >= todayStr && b.expiry_date <= expiringStr && b.status === 'Active'),
    };
  }, [batches, in30Days, todayStart]);

  const lowStockProducts = useMemo(() =>
    (products || []).filter(p => p.module === 'Pharmacy' && (p.stock || 0) <= (p.reorderLevel || 10) && (p.stock || 0) > 0),
    [products]
  );

  const outOfStockProducts = useMemo(() =>
    (products || []).filter(p => p.module === 'Pharmacy' && (p.stock || 0) === 0),
    [products]
  );

  const pendingClaims = useMemo(() =>
    (insuranceClaims || []).filter(c => c.status === 'Submitted').length,
    [insuranceClaims]
  );

  const activePatients = useMemo(() => (patients || []).filter(p => p.status === 'Active').length, [patients]);

  // Chart data — last 7 days revenue
  const salesTrendData = useMemo(() => {
    const days = 7;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const dayOrders = (allOrders || []).filter(o => {
        const ts = (o as any).created_at || (o as any).createdAt || 0;
        return ts >= dayStart && ts < dayEnd;
      });
      const revenue = dayOrders.reduce((s, o) => s + (o.total || (o as any).totalAmount || 0), 0);
      return {
        day: d.toLocaleDateString('en', { weekday: 'short' }),
        revenue,
        count: dayOrders.length,
      };
    });
  }, [allOrders]);

  const fmt = (n: number) => `TZS ${n.toLocaleString()}`;

  const kpiCards = [
    {
      label: "Today's Revenue", value: fmt(todayRevenue), icon: DollarSign,
      color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20',
      sub: `${todayOrders.length} sales today`, tab: 'Pharmacy POS'
    },
    {
      label: 'Pending Prescriptions', value: pendingPrescriptions.toString(), icon: FileText,
      color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20',
      sub: 'Awaiting dispensing', tab: 'Prescriptions'
    },
    {
      label: 'Expiring (30 days)', value: expiryAlerts.expiring30.length.toString(), icon: Clock,
      color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20',
      sub: `${expiryAlerts.expired.length} already expired`, tab: 'Batch & Expiry'
    },
    {
      label: 'Low Stock Items', value: lowStockProducts.length.toString(), icon: Package,
      color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',
      sub: `${outOfStockProducts.length} out of stock`, tab: 'Pharmacy Inventory'
    },
    {
      label: 'Active Patients', value: activePatients.toString(), icon: Users,
      color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20',
      sub: 'Registered patients', tab: 'Patients'
    },
    {
      label: 'NHIF Claims Pending', value: pendingClaims.toString(), icon: Shield,
      color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20',
      sub: 'Awaiting approval', tab: 'Insurance & NHIF'
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 p-6 rounded-2xl border border-emerald-900/40 text-white shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
              <Pill className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Pharmacy Dashboard</h1>
              <p className="text-emerald-300/80 text-sm mt-0.5">Real-time pharmacy operations overview</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onNavigateTab('Pharmacy POS')}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
            >
              <ShoppingCart className="h-4 w-4" /> Open POS
            </button>
            <button
              onClick={() => onNavigateTab('Prescriptions')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-white/20"
            >
              <FileText className="h-4 w-4" /> New Prescription
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpiCards.map(({ label, value, icon: Icon, color, bg, sub, tab }) => (
          <button
            key={label}
            onClick={() => onNavigateTab(tab)}
            className={`${bg} border rounded-2xl p-4 text-left hover:scale-[1.02] transition-all group`}
          >
            <div className="flex items-center justify-between mb-2">
              <Icon className={`h-5 w-5 ${color}`} />
              <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
            </div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-300 font-medium mt-0.5">{label}</div>
            <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
          </button>
        ))}
      </div>

      {/* Expiry Alerts Banner */}
      {(expiryAlerts.expired.length > 0 || expiryAlerts.expiring30.length > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-semibold text-sm">Batch Expiry Alerts</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {expiryAlerts.expired.length} expired batches must be disposed •{' '}
              {expiryAlerts.expiring30.length} batches expiring within 30 days
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('Batch & Expiry')}
            className="ml-auto text-xs text-amber-400 hover:text-amber-300 font-semibold whitespace-nowrap"
          >
            View Batches →
          </button>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Sales Trend */}
        <div className="xl:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-slate-200 font-semibold">Sales Trend — Last 7 Days</h3>
              <p className="text-slate-500 text-xs mt-0.5">Daily revenue in TZS</p>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={salesTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: '#f8fafc' }}
                formatter={(v: any) => [`TZS ${Number(v || 0).toLocaleString()}`, 'Revenue']}
              />
              <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Stats */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-slate-200 font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" /> Quick Stats
          </h3>
          {[
            { label: 'Total Medicines', value: (products || []).filter(p => p.module === 'Pharmacy').length, icon: Pill, color: 'text-teal-400' },
            { label: 'Active Batches', value: (batches || []).filter(b => b.status === 'Active').length, icon: Package, color: 'text-sky-400' },
            { label: 'Prescriptions Today', value: (prescriptions || []).filter(p => p.created_at >= todayStart).length, icon: FileText, color: 'text-indigo-400' },
            { label: 'Insurance Providers', value: 0, icon: Shield, color: 'text-violet-400' },
            { label: 'Registered Doctors', value: 0, icon: Activity, color: 'text-rose-400' },
            { label: 'Recalls Active', value: 0, icon: RefreshCw, color: 'text-orange-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-slate-400 text-sm">{label}</span>
              </div>
              <span className={`font-bold text-sm ${color}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Prescriptions + Expiry List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Recent Prescriptions */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-200 font-semibold">Recent Prescriptions</h3>
            <button onClick={() => onNavigateTab('Prescriptions')} className="text-xs text-indigo-400 hover:text-indigo-300">
              View All →
            </button>
          </div>
          {(prescriptions || []).length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No prescriptions yet
            </div>
          ) : (
            <div className="space-y-2">
              {(prescriptions || []).slice(-5).reverse().map(rx => (
                <div key={rx.id} className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl">
                  <div>
                    <p className="text-slate-200 text-sm font-medium">{rx.prescription_number}</p>
                    <p className="text-slate-500 text-xs">{rx.patient_name || 'Walk-in'} • {rx.doctor_name || 'No Doctor'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    rx.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400' :
                    rx.status === 'Pending' ? 'bg-amber-500/20 text-amber-400' :
                    rx.status === 'Dispensing' ? 'bg-sky-500/20 text-sky-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>{rx.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expiring Batches */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-200 font-semibold">Near-Expiry Batches</h3>
            <button onClick={() => onNavigateTab('Batch & Expiry')} className="text-xs text-amber-400 hover:text-amber-300">
              Manage →
            </button>
          </div>
          {expiryAlerts.expiring30.length === 0 && expiryAlerts.expired.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
              All batches are in good standing
            </div>
          ) : (
            <div className="space-y-2">
              {[...expiryAlerts.expired.slice(0, 3), ...expiryAlerts.expiring30.slice(0, 4)].map(b => {
                const isExpired = b.expiry_date < new Date(todayStart).toISOString().split('T')[0];
                return (
                  <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl ${isExpired ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                    <div>
                      <p className="text-slate-200 text-sm font-medium">{b.product_name || b.product_id}</p>
                      <p className="text-slate-500 text-xs">Batch {b.batch_number} • Qty: {b.quantity_remaining}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold ${isExpired ? 'text-red-400' : 'text-amber-400'}`}>
                        {isExpired ? '⚠ EXPIRED' : b.expiry_date}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
