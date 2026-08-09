import React from 'react';

// ─── Base Skeleton ────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  style?: React.CSSProperties;
}


export const Skeleton: React.FC<SkeletonProps> = ({ className = '', rounded = 'md', style }) => {
  const r = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' }[rounded];
  return (
    <div className={`animate-shimmer bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 dark:from-darkbg-border dark:via-slate-700 dark:to-darkbg-border bg-[length:400%_100%] ${r} ${className}`} style={style} />
  );
};


// ─── KPI Card Skeleton ────────────────────────────────────────────────────────

export const SkeletonKPI: React.FC = () => (
  <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-5 space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-8" rounded="xl" />
    </div>
    <Skeleton className="h-7 w-32" rounded="lg" />
    <Skeleton className="h-2.5 w-20" />
  </div>
);

// ─── Table Row Skeleton ───────────────────────────────────────────────────────

export const SkeletonTableRow: React.FC<{ cols?: number }> = ({ cols = 6 }) => (
  <tr className="border-b border-slate-100 dark:border-darkbg-border/40">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="p-3.5">
        <Skeleton className="h-3.5" style={{ width: `${60 + Math.random() * 40}%` } as React.CSSProperties} />
      </td>
    ))}
  </tr>
);

// ─── Full Table Skeleton ──────────────────────────────────────────────────────

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({ rows = 6, cols = 6 }) => (
  <div className="rounded-xl border border-slate-100 dark:border-darkbg-border overflow-hidden">
    {/* Header */}
    <div className="bg-slate-50 dark:bg-darkbg border-b border-slate-200 dark:border-darkbg-border p-3.5 flex gap-6">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-2.5 flex-1" />
      ))}
    </div>
    {/* Body rows */}
    <table className="w-full">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Card Grid Skeleton ───────────────────────────────────────────────────────

export const SkeletonCard: React.FC = () => (
  <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-5 space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10" rounded="xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
    <Skeleton className="h-2.5 w-full" />
    <Skeleton className="h-2.5 w-5/6" />
    <div className="flex gap-2 pt-1">
      <Skeleton className="h-6 w-16" rounded="full" />
      <Skeleton className="h-6 w-12" rounded="full" />
    </div>
  </div>
);

// ─── Dashboard KPI Grid Skeleton ──────────────────────────────────────────────

export const SkeletonDashboard: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-5 space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full" rounded="xl" />
      </div>
      <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8" rounded="lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-2 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
