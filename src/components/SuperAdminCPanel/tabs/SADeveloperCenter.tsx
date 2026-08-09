import React, { useState } from 'react';
import { PersistenceTest } from '../../Views/PersistenceTest';
import { KPICard } from '../components/KPICard';
import { Code2, Key, Webhook, TestTube, Copy, Eye, EyeOff, Plus } from 'lucide-react';
import { useToast } from '../../UI/Toast';

type DeveloperSubTab = 'api-keys' | 'webhooks' | 'persistence-audit';

// Static API key display (would come from a real secrets store in production)
const API_KEYS = [
  { id: 'key-001', name: 'Production API Key',   prefix: 'dpk_live_', masked: '••••••••••••••••••••••••3f9a', created: '2025-01-15', scope: 'Full Access', active: true },
  { id: 'key-002', name: 'Reporting Read Key',   prefix: 'dpk_read_', masked: '••••••••••••••••••••••••7b2c', created: '2025-03-10', scope: 'Read Only',   active: true },
  { id: 'key-003', name: 'Webhook Signing Key',  prefix: 'dpk_wh_',  masked: '••••••••••••••••••••••••1e4d', created: '2025-04-22', scope: 'Webhooks',   active: true },
  { id: 'key-004', name: 'Legacy Integration',   prefix: 'dpk_leg_', masked: '••••••••••••••••••••••••0a11', created: '2024-11-01', scope: 'Limited',    active: false },
];

const WEBHOOKS = [
  { id: 'wh-001', url: 'https://erp.client-a.co.tz/hooks/dukapos', events: ['tenant.created', 'subscription.renewed'], active: true,  lastDelivery: 'Success' },
  { id: 'wh-002', url: 'https://bi.analytics.io/webhook/dukapos',  events: ['billing.invoice', 'tenant.suspended'],    active: true,  lastDelivery: 'Success' },
  { id: 'wh-003', url: 'https://legacy.app/notify',               events: ['tenant.deleted'],                         active: false, lastDelivery: 'Failed' },
];

export const SADeveloperCenter: React.FC = () => {
  const [subTab, setSubTab] = useState<DeveloperSubTab>('api-keys');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const toast = useToast();

  const toggleReveal = (id: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied', `${label} copied to clipboard.`);
    } catch {
      toast.error('Copy failed', 'Could not access clipboard.');
    }
  };

  const SUB_TABS: { id: DeveloperSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'api-keys',          label: 'API Keys',         icon: <Key className="h-3.5 w-3.5" /> },
    { id: 'webhooks',          label: 'Webhooks',          icon: <Webhook className="h-3.5 w-3.5" /> },
    { id: 'persistence-audit', label: 'Persistence Audit', icon: <TestTube className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-white">Developer Center</h1>
        <p className="text-xs text-slate-400 mt-0.5">API credentials, webhook configuration, and database persistence audit tooling</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Active API Keys" value={API_KEYS.filter(k => k.active).length} sub="Production credentials" icon={<Key className="h-4 w-4" />} accent="blue" />
        <KPICard label="Active Webhooks" value={WEBHOOKS.filter(w => w.active).length} sub="Delivery endpoints" icon={<Webhook className="h-4 w-4" />} accent="violet" />
        <KPICard label="API Version" value="v2.1" sub="Current stable" icon={<Code2 className="h-4 w-4" />} accent="emerald" />
        <KPICard label="Webhook Success Rate" value="98.7%" sub="Last 7 days" icon={<Code2 className="h-4 w-4" />} accent="cyan" />
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-white/8 w-fit">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              subTab === t.id
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/6'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* API Keys Tab */}
      {subTab === 'api-keys' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Manage API keys for platform integrations. Never expose keys in client-side code.</p>
            <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-xs font-bold text-blue-300 hover:bg-blue-500/30 transition">
              <Plus className="h-3.5 w-3.5" /> New Key
            </button>
          </div>
          <div className="space-y-3">
            {API_KEYS.map(key => (
              <div key={key.id} className={`rounded-2xl border p-4 transition ${key.active ? 'border-white/8 bg-slate-800/60' : 'border-white/5 bg-slate-900/40 opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs font-black text-white">{key.name}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${key.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                        {key.active ? 'Active' : 'Revoked'}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300">{key.scope}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-slate-500">{key.prefix}</span>
                      <span className="text-slate-300">{revealedKeys.has(key.id) ? '(reveal not supported — use secrets manager)' : key.masked}</span>
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">Created: {key.created}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleReveal(key.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition"
                      title={revealedKeys.has(key.id) ? 'Hide' : 'Reveal key ID'}
                    >
                      {revealedKeys.has(key.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(`${key.prefix}${key.masked}`, key.name)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition"
                      title="Copy key prefix"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {subTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Configure HTTP endpoints to receive real-time platform event notifications.</p>
            <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-xs font-bold text-violet-300 hover:bg-violet-500/30 transition">
              <Plus className="h-3.5 w-3.5" /> Add Endpoint
            </button>
          </div>
          <div className="space-y-3">
            {WEBHOOKS.map(wh => (
              <div key={wh.id} className={`rounded-2xl border p-4 ${wh.active ? 'border-white/8 bg-slate-800/60' : 'border-white/5 bg-slate-900/40 opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${wh.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                        {wh.active ? 'Active' : 'Disabled'}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${wh.lastDelivery === 'Success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                        Last: {wh.lastDelivery}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-blue-300 break-all mb-2">{wh.url}</div>
                    <div className="flex flex-wrap gap-1">
                      {wh.events.map(ev => (
                        <span key={ev} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 border border-white/5">{ev}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(wh.url, 'Webhook URL')}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persistence Audit Tab */}
      {subTab === 'persistence-audit' && (
        <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
          <PersistenceTest />
        </div>
      )}
    </div>
  );
};
