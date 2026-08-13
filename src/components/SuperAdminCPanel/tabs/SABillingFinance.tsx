import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cloudDb } from '../../../db/supabaseMock';
import { KPICard } from '../components/KPICard';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Receipt, Building2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

import { isTenantDeleted } from '../../../utils/tenantSecurityBroadcast';

const PLAN_RATES: Record<string, number> = {
  basic: 25000, starter: 25000,
  growth: 55000, professional: 55000,
  enterprise: 120000,
};
function getRate(planId: string): number {
  const p = (planId || '').toLowerCase();
  for (const [k, r] of Object.entries(PLAN_RATES)) if (p.includes(k)) return r;
  return 0;
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'];

export const SABillingFinance: React.FC = () => {
  const subscriptions = useLiveQuery(() => cloudDb.cloud_subscriptions.toArray()) || [];
  const rawTenants = useLiveQuery(() => cloudDb.cloud_tenants.toArray()) || [];
  const tenants = useMemo(() => rawTenants.filter((t: any) => !isTenantDeleted(t)), [rawTenants]);

  const activeSubs = useMemo(() => subscriptions.filter((s: any) => s.status === 'ACTIVE' && !isTenantDeleted(s.tenant_id || s.tenantId)), [subscriptions]);
  const trialSubs  = useMemo(() => subscriptions.filter((s: any) => s.status === 'TRIAL' && !isTenantDeleted(s.tenant_id || s.tenantId)), [subscriptions]);
  const expiredSubs = useMemo(() => subscriptions.filter((s: any) => (s.status === 'EXPIRED' || s.status === 'CANCELLED') && !isTenantDeleted(s.tenant_id || s.tenantId)), [subscriptions]);

  const mrr = useMemo(() => activeSubs.reduce((sum: number, s: any) => sum + getRate(s.plan_id || ''), 0), [activeSubs]);
  const arr = mrr * 12;

  const planGroups = useMemo(() => {
    const groups: Record<string, { count: number; revenue: number }> = {};
    for (const s of activeSubs) {
      const p = (s.plan_id || '').toLowerCase();
      const label = p.includes('enterprise') ? 'Enterprise' : p.includes('growth') || p.includes('professional') ? 'Growth' : 'Basic';
      if (!groups[label]) groups[label] = { count: 0, revenue: 0 };
      groups[label].count++;
      groups[label].revenue += getRate(s.plan_id || '');
    }
    return Object.entries(groups).map(([name, d]) => ({ name, count: d.count, revenue: d.revenue / 1000 }));
  }, [activeSubs]);

  const pieData = planGroups.map(p => ({ name: p.name, value: p.count }));

  // Top revenue tenants
  const topTenants = useMemo(() => {
    const map: Record<string, { name: string; revenue: number }> = {};
    for (const s of activeSubs) {
      const t = tenants.find((t: any) => t.id === s.tenant_id);
      if (!t) continue;
      if (!map[t.id]) map[t.id] = { name: t.name, revenue: 0 };
      map[t.id].revenue += getRate(s.plan_id || '');
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [activeSubs, tenants]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-white">Billing & Finance</h1>
        <p className="text-xs text-slate-400 mt-0.5">Revenue metrics, subscription health, and top-paying tenants</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Monthly Recurring Revenue" value={`Tsh. ${(mrr/1000).toFixed(0)}K`} sub="Active subscriptions only" icon={<DollarSign className="h-4 w-4" />} accent="emerald" />
        <KPICard label="Annual Run Rate" value={`Tsh. ${(arr/1000000).toFixed(2)}M`} sub="MRR × 12" icon={<TrendingUp className="h-4 w-4" />} accent="blue" />
        <KPICard label="Active Licenses" value={activeSubs.length} sub={`${trialSubs.length} on trial`} icon={<CreditCard className="h-4 w-4" />} accent="violet" />
        <KPICard label="Churned Accounts" value={expiredSubs.length} sub="Expired or cancelled" icon={<TrendingDown className="h-4 w-4" />} accent="red" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Revenue by plan bar chart */}
        <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
          <h3 className="text-sm font-black text-white mb-1">Revenue by Plan Tier</h3>
          <p className="text-[10px] text-slate-400 mb-4">Monthly value in TZS thousands (K)</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planGroups}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#475569" fontSize={10} />
                <YAxis stroke="#475569" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 11 }} labelStyle={{ color: '#94a3b8', fontWeight: 700 }} formatter={(v: any) => [`${v}K TZS`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#10B981" radius={[6,6,0,0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subscription distribution pie */}
        <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
          <h3 className="text-sm font-black text-white mb-1">License Distribution</h3>
          <p className="text-[10px] text-slate-400 mb-4">Active accounts per plan tier</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData.length > 0 ? pieData : [{ name: 'No Data', value: 1 }]} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={(props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {(pieData.length > 0 ? pieData : [{ name: 'No Data', value: 1 }]).map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top revenue tenants table */}
      <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-black text-white">Top Revenue Tenants</h3>
        </div>
        {topTenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <Building2 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs font-bold">No billing data available yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {topTenants.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-500 w-5 text-center">{i + 1}</span>
                  <span className="text-xs font-bold text-white">{t.name}</span>
                </div>
                <span className="text-xs font-black font-mono text-emerald-400">
                  Tsh. {t.revenue.toLocaleString()}<span className="text-slate-500 font-normal">/mo</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
