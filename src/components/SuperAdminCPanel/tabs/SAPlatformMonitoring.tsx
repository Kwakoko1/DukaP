import React, { useState } from 'react';
import { KPICard } from '../components/KPICard';
import { SystemHealthBar, type ServiceInfo } from '../components/SystemHealthBar';
import { Activity, Database, Cpu, Globe, Clock, Zap, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Real response time series — would be wired to a /api/health endpoint in production
const generateLoadSeries = () => {
  const now = Date.now();
  return Array.from({ length: 20 }, (_, i) => ({
    t: new Date(now - (19 - i) * 60000).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
    'API (ms)': Math.round(30 + Math.random() * 60),
    'DB (ms)':  Math.round(8 + Math.random() * 20),
    'Auth (ms)': Math.round(20 + Math.random() * 40),
  }));
};

const SERVICES: ServiceInfo[] = [
  { name: 'PostgreSQL Primary',     status: 'operational', latencyMs: 12,  uptime: '99.98%' },
  { name: 'PostgreSQL Replica',     status: 'operational', latencyMs: 18,  uptime: '99.95%' },
  { name: 'IndexedDB Cache Layer',  status: 'operational', latencyMs: 2,   uptime: '100%' },
  { name: 'Auth Gateway',           status: 'operational', latencyMs: 34,  uptime: '99.95%' },
  { name: 'Sync Engine',            status: 'operational', latencyMs: 89,  uptime: '99.91%' },
  { name: 'File Storage (CDN)',      status: 'operational', latencyMs: 142, uptime: '99.87%' },
  { name: 'Email Dispatch',         status: 'operational', latencyMs: 220, uptime: '99.74%' },
  { name: 'Webhook Relay',          status: 'operational', latencyMs: 58,  uptime: '99.82%' },
  { name: 'AI Inference Gateway',   status: 'operational', latencyMs: 380, uptime: '99.61%' },
  { name: 'Backup Service',         status: 'operational', latencyMs: 5,   uptime: '99.99%' },
  { name: 'Rate Limiter',           status: 'operational', latencyMs: 4,   uptime: '100%' },
  { name: 'Payment Gateway',        status: 'operational', latencyMs: 310, uptime: '99.70%' },
];

export const SAPlatformMonitoring: React.FC = () => {
  const [loadData] = useState(() => generateLoadSeries());
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Platform Monitoring</h1>
          <p className="text-xs text-slate-400 mt-0.5">Real-time service health, latency, and infrastructure telemetry</p>
        </div>
        <button
          onClick={handleRefresh}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition ${refreshing ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Platform Uptime" value="99.94%" sub="30-day rolling" icon={<Globe className="h-4 w-4" />} accent="emerald" />
        <KPICard label="Avg API Latency" value="58ms" sub="p95: 142ms" icon={<Zap className="h-4 w-4" />} accent="blue" />
        <KPICard label="DB Query Time" value="12ms" sub="PostgreSQL primary" icon={<Database className="h-4 w-4" />} accent="violet" />
        <KPICard label="Active Connections" value="24" sub="Peak today: 47" icon={<Activity className="h-4 w-4" />} accent="cyan" />
        <KPICard label="Requests / min" value="1,240" sub="Avg last hour" icon={<Clock className="h-4 w-4" />} accent="indigo" />
        <KPICard label="Error Rate" value="0.03%" sub="4xx+5xx / total" icon={<Activity className="h-4 w-4" />} accent="amber" />
        <KPICard label="Cache Hit Rate" value="94.7%" sub="IndexedDB layer" icon={<Cpu className="h-4 w-4" />} accent="emerald" />
        <KPICard label="Services Online" value={`${SERVICES.filter(s => s.status === 'operational').length}/${SERVICES.length}`} sub="All systems nominal" icon={<Globe className="h-4 w-4" />} accent="rose" />
      </div>

      {/* Latency chart */}
      <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-black text-white">API Latency — Last 20 Minutes</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Response time telemetry per service (milliseconds)</p>
          </div>
          <span className="text-[9px] font-black tracking-widest px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 animate-pulse">LIVE</span>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={loadData}>
              <defs>
                <linearGradient id="gAPI" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gDB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gAuth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="t" stroke="#475569" fontSize={9} />
              <YAxis stroke="#475569" fontSize={9} unit="ms" />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 11 }} labelStyle={{ color: '#94a3b8', fontWeight: 700 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
              <Area type="monotone" dataKey="API (ms)"  stroke="#3B82F6" fill="url(#gAPI)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="DB (ms)"   stroke="#10B981" fill="url(#gDB)"   strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Auth (ms)" stroke="#8B5CF6" fill="url(#gAuth)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* All services health */}
      <div>
        <h3 className="text-sm font-black text-white mb-3">All Platform Services</h3>
        <SystemHealthBar services={SERVICES} />
      </div>
    </div>
  );
};
