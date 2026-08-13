import React, { useEffect, useRef } from 'react';

export interface ActivityEntry {
  id: string;
  type: 'tenant' | 'billing' | 'security' | 'system' | 'user' | 'release';
  message: string;
  timestamp: number;
  severity?: 'info' | 'warning' | 'success' | 'danger';
}

const TYPE_META: Record<ActivityEntry['type'], { color: string; label: string }> = {
  tenant:   { color: 'bg-blue-500 dark:bg-blue-400',    label: 'TENANT' },
  billing:  { color: 'bg-emerald-500 dark:bg-emerald-400', label: 'BILLING' },
  security: { color: 'bg-red-500 dark:bg-red-400',     label: 'SECURITY' },
  system:   { color: 'bg-slate-500 dark:bg-slate-400',   label: 'SYSTEM' },
  user:     { color: 'bg-violet-500 dark:bg-violet-400',  label: 'USER' },
  release:  { color: 'bg-amber-500 dark:bg-amber-400',   label: 'RELEASE' },
};

const SEVERITY_BG: Record<string, string> = {
  info:    'bg-slate-50 dark:bg-slate-800/60 border-slate-200/60 dark:border-white/5',
  warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-500/20',
  success: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-500/20',
  danger:  'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-500/20',
};

interface ActivityFeedProps {
  entries: ActivityEntry[];
  maxHeight?: string;
  autoScroll?: boolean;
}

function fmtAge(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  entries, maxHeight = '320px', autoScroll = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length, autoScroll]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
        <div className="text-3xl mb-2">📋</div>
        <div className="text-xs font-bold">No audit events recorded</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-1.5 overflow-y-auto scrollbar-thin pr-1" style={{ maxHeight }}>
      {[...entries].reverse().map((e) => {
        const meta = TYPE_META[e.type];
        const bg = SEVERITY_BG[e.severity || 'info'];
        return (
          <div
            key={e.id}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${bg} transition-all`}
          >
            {/* Dot */}
            <div className="mt-1.5 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full ${meta.color} opacity-60 animate-ping`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.color}`} />
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded ${meta.color} bg-opacity-15 dark:bg-opacity-20 text-slate-800 dark:text-white/80`}>
                  {meta.label}
                </span>
                <span className="text-[10px] text-slate-800 dark:text-white/80 font-medium leading-snug">{e.message}</span>
              </div>
            </div>

            {/* Time */}
            <div className="shrink-0 text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 whitespace-nowrap">
              {fmtAge(e.timestamp)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
