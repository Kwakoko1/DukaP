import React from 'react';

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  delta?: { value: string; positive: boolean };
  icon: React.ReactNode;
  accent?: 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'cyan' | 'rose' | 'indigo';
  loading?: boolean;
  onClick?: () => void;
}

const ACCENT: Record<string, { bg: string; icon: string; badge: string; glow: string }> = {
  blue:    { bg: 'from-blue-500/10 to-blue-600/5',    icon: 'bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',    badge: 'bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',    glow: 'group-hover:shadow-blue-500/20' },
  emerald: { bg: 'from-emerald-500/10 to-emerald-600/5', icon: 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', glow: 'group-hover:shadow-emerald-500/20' },
  amber:   { bg: 'from-amber-500/10 to-amber-600/5',  icon: 'bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',  badge: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',  glow: 'group-hover:shadow-amber-500/20' },
  red:     { bg: 'from-red-500/10 to-red-600/5',      icon: 'bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400',      badge: 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300',      glow: 'group-hover:shadow-red-500/20' },
  violet:  { bg: 'from-violet-500/10 to-violet-600/5', icon: 'bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400', badge: 'bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300', glow: 'group-hover:shadow-violet-500/20' },
  cyan:    { bg: 'from-cyan-500/10 to-cyan-600/5',    icon: 'bg-cyan-500/15 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400',    badge: 'bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',    glow: 'group-hover:shadow-cyan-500/20' },
  rose:    { bg: 'from-rose-500/10 to-rose-600/5',    icon: 'bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400',    badge: 'bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',    glow: 'group-hover:shadow-rose-500/20' },
  indigo:  { bg: 'from-indigo-500/10 to-indigo-600/5', icon: 'bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400', badge: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300', glow: 'group-hover:shadow-indigo-500/20' },
};

export const KPICard: React.FC<KPICardProps> = ({
  label, value, sub, delta, icon, accent = 'blue', loading, onClick
}) => {
  const a = ACCENT[accent];

  if (loading) return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/60 p-5 animate-pulse shadow-sm dark:shadow-none">
      <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
      <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
      <div className="h-2.5 w-20 bg-slate-100 dark:bg-slate-700/60 rounded" />
    </div>
  );

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-2xl border border-slate-200/80 dark:border-white/8 bg-white dark:bg-gradient-to-br dark:${a.bg} shadow-sm dark:shadow-none backdrop-blur-sm p-5 transition-all duration-200 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md ${a.glow} ${onClick ? 'cursor-pointer' : ''} overflow-hidden`}
    >
      {/* Glass sheen */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-100/50 dark:from-white/5 to-transparent" />

      <div className="relative flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${a.icon}`}>
          {icon}
        </div>
        {delta && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${delta.positive ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300'}`}>
            {delta.positive ? '↑' : '↓'} {delta.value}
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">{label}</div>
        <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{value}</div>
        {sub && <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">{sub}</div>}
      </div>
    </div>
  );
};
