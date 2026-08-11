import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  BarChart2, Download, DollarSign,
  Pill, FileText, AlertTriangle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

type ReportTab = 'Sales Report' | 'Prescription Report' | 'Expiry Report' | 'Batch History' | 'Insurance Claims Report' | 'Controlled Drugs Report' | 'Supplier Performance' | 'Patient History Report';

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export const PharmacyReports: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id || '';

  const [activeTab, setActiveTab] = useState<ReportTab>('Sales Report');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | '90d' | 'year'>('30d');

  const now = Date.now();
  const rangeMs: Record<typeof dateRange, number> = {
    today: 86400000,
    '7d': 7 * 86400000,
    '30d': 30 * 86400000,
    '90d': 90 * 86400000,
    year: 365 * 86400000,
  };
  const fromTs = now - rangeMs[dateRange];

  const fmtCcy = (n: number) => `Tsh ${n.toLocaleString()}`;

  // Sales data from receipts
  const receipts = useLiveQuery(async () => {
    if (!tenantId) return [];
    return db.receipts
      .where('tenant_id').equals(tenantId)
      .and(r => r.created_at >= fromTs && r.status === 'Completed')
      .toArray();
  }, [tenantId, fromTs]) || [];

  // Prescriptions
  const prescriptions = useLiveQuery(async () => {
    if (!tenantId) return [];
    try {
      return (await (db as any).prescriptions?.where('tenant_id').equals(tenantId)
        .and((p: any) => p.created_at >= fromTs).toArray()) || [];
    } catch { return []; }
  }, [tenantId, fromTs]) || [];

  // Medicines inventory
  const medicines = useLiveQuery(async () => {
    if (!tenantId) return [];
    return db.products.where('tenant_id').equals(tenantId).and(p => !p.deletedAt && !!(p as any).is_medicine).toArray();
  }, [tenantId]) || [];

  // Batch data
  const batches = useLiveQuery(async () => {
    if (!tenantId) return [];
    try {
      return (await (db as any).medicineBatches?.where('tenant_id').equals(tenantId).toArray()) || [];
    } catch { return []; }
  }, [tenantId]) || [];

  // Suppliers
  const suppliers = useLiveQuery(async () => {
    if (!tenantId) return [];
    return db.suppliers?.where('tenant_id').equals(tenantId).toArray() || [];
  }, [tenantId]) || [];

  // Purchase orders
  const purchaseOrders = useLiveQuery(async () => {
    if (!tenantId) return [];
    try { return await db.purchaseOrders.where('tenant_id').equals(tenantId).and(po => po.created_at >= fromTs).toArray(); }
    catch { return []; }
  }, [tenantId, fromTs]) || [];

  // KPIs
  const totalRevenue = useMemo(() => receipts.reduce((s, r) => s + (r.total || 0), 0), [receipts]);
  const totalRx = prescriptions.length;
  const nearExpiry = useMemo(() => batches.filter((b: any) => b.expiry_date && b.expiry_date < now + 90 * 86400000 && b.expiry_date > now).length, [batches, now]);

  // Monthly sales trend
  const salesTrend = useMemo(() => {
    const months: { name: string; Revenue: number; Prescriptions: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setMonth(end.getMonth() + 1);
      const mRevenue = receipts.filter(r => r.created_at >= d.getTime() && r.created_at < end.getTime())
        .reduce((s, r) => s + (r.total || 0), 0);
      const mRx = prescriptions.filter((p: any) => p.created_at >= d.getTime() && p.created_at < end.getTime()).length;
      months.push({
        name: d.toLocaleString('default', { month: 'short' }),
        Revenue: Math.round(mRevenue),
        Prescriptions: mRx
      });
    }
    return months;
  }, [receipts, prescriptions]);

  // Top selling medicines from receipt items
  const topMedicines = useMemo(() => {
    const stats: Record<string, { name: string; qty: number; revenue: number }> = {};
    receipts.forEach(r => {
      ((r as any).items || []).forEach((item: any) => {
        const k = item.name || item.product_name || 'Unknown';
        if (!stats[k]) stats[k] = { name: k, qty: 0, revenue: 0 };
        stats[k].qty += item.qty || item.quantity || 0;
        stats[k].revenue += item.total || item.subtotal || 0;
      });
    });
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [receipts]);

  // Payment method breakdown
  const paymentBreakdown = useMemo(() => {
    const methods: Record<string, number> = {};
    receipts.forEach(r => {
      const m = (r.payment_method || 'Cash').replace(/_/g, ' ');
      methods[m] = (methods[m] || 0) + (r.total || 0);
    });
    return Object.entries(methods).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [receipts]);

  // Expiry categories for chart
  const expiryBreakdown = useMemo(() => [
    { name: 'Expired', value: batches.filter((b: any) => b.expiry_date && b.expiry_date < now).length, color: '#ef4444' },
    { name: 'Near (< 30d)', value: batches.filter((b: any) => b.expiry_date && b.expiry_date >= now && b.expiry_date < now + 30 * 86400000).length, color: '#f97316' },
    { name: 'Near (30–90d)', value: batches.filter((b: any) => b.expiry_date && b.expiry_date >= now + 30 * 86400000 && b.expiry_date < now + 90 * 86400000).length, color: '#f59e0b' },
    { name: 'Good (> 90d)', value: batches.filter((b: any) => b.expiry_date && b.expiry_date >= now + 90 * 86400000).length, color: '#10b981' },
  ], [batches, now]);

  const tabs: ReportTab[] = ['Sales Report', 'Prescription Report', 'Expiry Report', 'Batch History', 'Insurance Claims Report', 'Controlled Drugs Report', 'Supplier Performance', 'Patient History Report'];

  const DateRangeBar = () => (
    <div className="flex items-center gap-1 border border-slate-200 dark:border-darkbg-border rounded-xl p-1">
      {(['today', '7d', '30d', '90d', 'year'] as typeof dateRange[]).map(r => (
        <button key={r} onClick={() => setDateRange(r)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${dateRange === r ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-darkbg'}`}>
          {r === 'today' ? 'Today' : r === 'year' ? 'This Year' : r.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-emerald-500" />
            Pharmacy Reports
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Analytics and regulatory reports for your pharmacy.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeBar />
          <button className="flex items-center gap-1.5 text-xs border border-slate-200 dark:border-darkbg-border px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-darkbg transition">
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: fmtCcy(totalRevenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Prescriptions', value: totalRx, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Near Expiry Batches', value: nearExpiry, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Total Medicines', value: medicines.length, icon: Pill, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-2xl border border-slate-200 dark:border-darkbg-border p-4 ${kpi.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</span>
            </div>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-darkbg-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === t ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Sales Report */}
      {activeTab === 'Sales Report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue Trend */}
            <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white mb-3">Monthly Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-slate-200, #e2e8f0)" strokeOpacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmtCcy(v)} />
                  <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Payment Breakdown */}
            <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white mb-3">Payment Method Breakdown</h3>
              {paymentBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={((entry: any) => `${entry.name || ''} ${(((entry.percent as number) || 0) * 100).toFixed(0)}%`) as any} labelLine={false}>
                      {paymentBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtCcy(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-slate-300 text-sm">No sales data</div>
              )}
            </div>
          </div>

          {/* Top Selling Medicines */}
          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-darkbg-border">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white">Top Selling Medicines</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-darkbg-border/40 text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Medicine</th>
                    <th className="text-right px-4 py-3 font-semibold">Units Sold</th>
                    <th className="text-right px-4 py-3 font-semibold">Revenue</th>
                    <th className="text-right px-4 py-3 font-semibold">% of Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/50">
                  {topMedicines.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">No sales data available.</td></tr>
                  ) : topMedicines.map((med, i) => (
                    <tr key={med.name} className="hover:bg-slate-50 dark:hover:bg-darkbg/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <span className="font-medium text-slate-800 dark:text-white">{med.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{med.qty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{fmtCcy(med.revenue)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-emerald-600 font-semibold">
                          {totalRevenue > 0 ? ((med.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Prescription Report */}
      {activeTab === 'Prescription Report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white mb-3">Prescriptions by Month</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Prescriptions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-5 flex flex-col gap-4">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white">Prescription Summary</h3>
              {[
                { label: 'Total Prescriptions', value: prescriptions.length, color: 'text-blue-600' },
                { label: 'Pending', value: prescriptions.filter((p: any) => p.status === 'Pending').length, color: 'text-amber-600' },
                { label: 'Dispensed', value: prescriptions.filter((p: any) => p.status === 'Dispensed').length, color: 'text-emerald-600' },
                { label: 'Partially Dispensed', value: prescriptions.filter((p: any) => p.status === 'Partial').length, color: 'text-orange-600' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Expiry Report */}
      {activeTab === 'Expiry Report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white mb-3">Batch Expiry Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={expiryBreakdown.filter(e => e.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                    {expiryBreakdown.filter(e => e.value > 0).map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-5">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white mb-3">Expiry Summary</h3>
              <div className="space-y-3">
                {expiryBreakdown.map(e => (
                  <div key={e.name} className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: e.color }} />
                    <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{e.name}</span>
                    <span className="text-sm font-bold" style={{ color: e.color }}>{e.value} batches</span>
                  </div>
                ))}
                {batches.length === 0 && <p className="text-xs text-slate-400">No batch data available.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch History */}
      {activeTab === 'Batch History' && (
        <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-darkbg-border flex justify-between">
            <h3 className="font-bold text-sm text-slate-700 dark:text-white">Full Batch History</h3>
            <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-darkbg-border/40 text-slate-500">
                  <th className="text-left px-4 py-3 font-semibold">Batch No.</th>
                  <th className="text-left px-4 py-3 font-semibold">Medicine</th>
                  <th className="text-right px-4 py-3 font-semibold">Qty</th>
                  <th className="text-left px-4 py-3 font-semibold">Manufacture Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Expiry Date</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/50">
                {batches.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400">No batch records available.</td></tr>
                ) : (batches as any[]).map((b, i) => {
                  const isExpired = b.expiry_date < now;
                  const isNear = !isExpired && b.expiry_date < now + 90 * 86400000;
                  return (
                    <tr key={b.id || i} className="hover:bg-slate-50 dark:hover:bg-darkbg/50">
                      <td className="px-4 py-3 font-mono text-slate-600">{b.batch_number || '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{b.medicine_name || b.product_name || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{b.quantity || b.qty || 0}</td>
                      <td className="px-4 py-3 text-slate-500">{b.manufacture_date ? new Date(b.manufacture_date).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isExpired ? 'bg-red-100 text-red-600' : isNear ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          {isExpired ? 'Expired' : isNear ? 'Near Expiry' : 'Good'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Other tabs — placeholder cards */}
      {(activeTab === 'Insurance Claims Report' || activeTab === 'Controlled Drugs Report' || activeTab === 'Supplier Performance' || activeTab === 'Patient History Report') && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeTab === 'Supplier Performance' ? (
              suppliers.map((sup: any) => {
                const orders = purchaseOrders.filter((po: any) => po.supplier_id === sup.id);
                return (
                  <div key={sup.id} className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{sup.name}</p>
                        <p className="text-xs text-slate-400">{sup.phone || sup.email || '—'}</p>
                      </div>
                      <span className="text-xs text-emerald-600 font-semibold">{orders.length} orders</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 dark:bg-darkbg rounded-xl p-2">
                        <p className="text-slate-400">Total Ordered</p>
                        <p className="font-bold text-slate-800 dark:text-white">{fmtCcy(orders.reduce((s: number, o: any) => s + (o.total || o.total_amount || 0), 0))}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-darkbg rounded-xl p-2">
                        <p className="text-slate-400">Orders</p>
                        <p className="font-bold text-slate-800 dark:text-white">{orders.length}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 rounded-2xl border border-dashed border-slate-300 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-10 text-center">
                <BarChart2 className="h-12 w-12 mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                <p className="text-sm font-semibold text-slate-400">{activeTab} coming soon</p>
                <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">This report will be available in the next release.</p>
              </div>
            )}
            {activeTab === 'Supplier Performance' && suppliers.length === 0 && (
              <div className="col-span-2 text-center py-10 text-slate-400 text-sm">No supplier data available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
