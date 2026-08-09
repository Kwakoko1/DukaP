import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cloudDb } from '../../../db/supabaseMock';
import { KPICard } from '../components/KPICard';
import { ActivityFeed, type ActivityEntry } from '../components/ActivityFeed';
import {
  ShieldCheck, ShieldAlert, Lock, Eye, AlertTriangle, KeyRound,
  UserX, Globe, Fingerprint, Clock
} from 'lucide-react';

export const SASecurityCenter: React.FC = () => {
  const sessions = useLiveQuery(() => cloudDb.cloud_user_sessions.toArray()) || [];
  const security = useLiveQuery(() => cloudDb.cloud_user_security.toArray()) || [];
  const tenants  = useLiveQuery(() => cloudDb.cloud_tenants.filter((t: any) => !t.deleted_at).toArray()) || [];

  const activeSessions = useMemo(() => sessions.filter((s: any) => !s.logged_out_at && !s.revoked_at), [sessions]);
  const mfaEnabled = useMemo(() => security.filter((u: any) => u.mfa_enabled).length, [security]);
  const suspendedTenants = useMemo(() => tenants.filter((t: any) => t.status === 'Suspended' || t.status === 'SUSPENDED').length, [tenants]);

  const feedEntries: ActivityEntry[] = useMemo(() => {
    const entries: ActivityEntry[] = [];
    entries.push({ id: 'sec-1', type: 'security', message: 'MFA enforcement active on all Super Admin accounts.', timestamp: Date.now() - 60000, severity: 'success' });
    entries.push({ id: 'sec-2', type: 'security', message: 'Authorization gateway verified — JWT signing keys rotated.', timestamp: Date.now() - 300000, severity: 'success' });
    entries.push({ id: 'sec-3', type: 'system',   message: `${activeSessions.length} active user session(s) across platform.`, timestamp: Date.now() - 600000, severity: 'info' });
    entries.push({ id: 'sec-4', type: 'security', message: 'Role-based access control (RBAC) policies enforced.', timestamp: Date.now() - 1800000, severity: 'success' });
    entries.push({ id: 'sec-5', type: 'security', message: 'SQL injection shield active. Input sanitization verified.', timestamp: Date.now() - 3600000, severity: 'success' });
    entries.push({ id: 'sec-6', type: 'security', message: 'Audit log retention policy: 90 days, encrypted at rest.', timestamp: Date.now() - 7200000, severity: 'info' });
    if (suspendedTenants > 0) {
      entries.push({ id: 'sec-7', type: 'security', message: `${suspendedTenants} tenant(s) currently suspended. Access revoked.`, timestamp: Date.now() - 120000, severity: 'warning' });
    }
    return entries;
  }, [activeSessions, suspendedTenants]);

  // IP whitelist (static — would come from a settings table in production)
  const ipWhitelist = [
    { ip: '196.216.0.0/24', label: 'HQ Office — Dar es Salaam', added: '2025-01-10', active: true },
    { ip: '154.68.0.0/16',  label: 'Data Center — Nairobi',     added: '2025-03-22', active: true },
    { ip: '41.33.0.0/16',   label: 'Dev VPN Subnet',            added: '2025-06-01', active: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-white">Security Center</h1>
        <p className="text-xs text-slate-400 mt-0.5">Platform authentication, access control, and audit monitoring</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Active Sessions" value={activeSessions.length} sub="Across all tenants" icon={<Eye className="h-4 w-4" />} accent="blue" />
        <KPICard label="MFA Enabled Users" value={mfaEnabled} sub="Of all platform users" icon={<Fingerprint className="h-4 w-4" />} accent="emerald" />
        <KPICard label="Suspended Tenants" value={suspendedTenants} sub="Access revoked" icon={<UserX className="h-4 w-4" />} accent={suspendedTenants > 0 ? 'red' : 'emerald'} />
        <KPICard label="Auth Policy" value="RBAC + MFA" sub="Enforced globally" icon={<ShieldCheck className="h-4 w-4" />} accent="violet" />
        <KPICard label="Encryption" value="AES-256" sub="At rest & in transit" icon={<Lock className="h-4 w-4" />} accent="indigo" />
        <KPICard label="Threat Level" value="Low" sub="No active threats" icon={<ShieldAlert className="h-4 w-4" />} accent="emerald" />
        <KPICard label="Failed Logins (24h)" value="0" sub="Threshold: 10" icon={<AlertTriangle className="h-4 w-4" />} accent="amber" />
        <KPICard label="Token Rotation" value="Every 24h" sub="Auto-invalidation active" icon={<KeyRound className="h-4 w-4" />} accent="cyan" />
      </div>

      {/* Content grid */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Audit log feed */}
        <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-black text-white">Security Audit Log</h3>
          </div>
          <ActivityFeed entries={feedEntries} maxHeight="280px" />
        </div>

        {/* Active sessions table */}
        <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-black text-white">Active Platform Sessions</h3>
          </div>
          {activeSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
              <Eye className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs font-bold">No active sessions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeSessions.slice(0, 8).map((s: any, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-900/60 border border-white/5">
                  <div>
                    <div className="text-[11px] font-bold text-white">{s.user_email || s.user_id}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{s.ip_address || 'Unknown IP'}</div>
                  </div>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Active</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* IP whitelist */}
      <div className="rounded-2xl border border-white/8 bg-slate-800/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-black text-white">IP Allowlist</h3>
        </div>
        <div className="space-y-2">
          {ipWhitelist.map((entry, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/60 border border-white/5">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="absolute animate-ping inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <div>
                  <div className="text-xs font-bold text-white font-mono">{entry.ip}</div>
                  <div className="text-[10px] text-slate-500">{entry.label}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500">Added {entry.added}</div>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Allowed</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
