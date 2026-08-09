import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

export type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'checking';

export interface ServiceInfo {
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
  uptime?: string;
}

const STATUS_META: Record<ServiceStatus, {
  icon: React.ReactNode; label: string; dot: string; text: string;
}> = {
  operational: {
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    label: 'Operational',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  degraded: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    label: 'Degraded',
    dot: 'bg-amber-500 dark:bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
  },
  outage: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    label: 'Outage',
    dot: 'bg-red-500 dark:bg-red-400',
    text: 'text-red-600 dark:text-red-400',
  },
  checking: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    label: 'Checking…',
    dot: 'bg-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
  },
};

interface SystemHealthBarProps {
  services: ServiceInfo[];
}

export const SystemHealthBar: React.FC<SystemHealthBarProps> = ({ services }) => {
  const allOk = services.every(s => s.status === 'operational');
  const hasOutage = services.some(s => s.status === 'outage');
  const hasDegraded = services.some(s => s.status === 'degraded');

  const overallLabel = allOk ? 'All Systems Operational' : hasOutage ? 'Service Outage Detected' : hasDegraded ? 'Some Services Degraded' : 'Checking Services…';
  const overallColor = allOk ? 'text-emerald-600 dark:text-emerald-400' : hasOutage ? 'text-red-600 dark:text-red-400' : hasDegraded ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400';

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-white/8 bg-white dark:bg-slate-800/60 p-5 shadow-sm dark:shadow-none backdrop-blur-sm">
      {/* Overall status strip */}
      <div className={`flex items-center gap-2 mb-4 ${overallColor}`}>
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full rounded-full ${allOk ? 'bg-emerald-500' : hasOutage ? 'bg-red-500' : 'bg-amber-500'} opacity-75 animate-ping`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${allOk ? 'bg-emerald-500' : hasOutage ? 'bg-red-500' : 'bg-amber-500'}`} />
        </span>
        <span className="text-xs font-black tracking-wide">{overallLabel}</span>
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {services.map((svc) => {
          const meta = STATUS_META[svc.status];
          return (
            <div
              key={svc.name}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-white/5"
            >
              <div className="flex items-center gap-2.5">
                <span className={`relative flex h-2 w-2 shrink-0`}>
                  {svc.status === 'operational' && (
                    <span className={`absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-60 animate-ping`} />
                  )}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
                </span>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{svc.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {svc.latencyMs !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{svc.latencyMs}ms</span>
                )}
                {svc.uptime !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{svc.uptime}</span>
                )}
                <span className={`flex items-center gap-1 text-[10px] font-bold ${meta.text}`}>
                  {meta.icon}
                  {meta.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
