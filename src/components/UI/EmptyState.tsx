import React from 'react';
import { Search, Package, Users, WifiOff, Lock, FolderOpen, ShoppingCart, BarChart3 } from 'lucide-react';


// ─── Types ────────────────────────────────────────────────────────────────────

type EmptyVariant =
  | 'no-data'
  | 'no-results'
  | 'offline'
  | 'locked'
  | 'no-products'
  | 'no-customers'
  | 'no-orders'
  | 'no-reports'
  | 'no-tenants';

interface EmptyStateProps {
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

// ─── Variant Config ───────────────────────────────────────────────────────────

const VARIANTS: Record<EmptyVariant, {
  icon: React.ReactNode;
  iconBg: string;
  defaultTitle: string;
  defaultDescription: string;
}> = {
  'no-data': {
    icon: <FolderOpen className="h-7 w-7 text-slate-400" />,
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    defaultTitle: 'Nothing here yet',
    defaultDescription: 'Add your first record to get started.',
  },
  'no-results': {
    icon: <Search className="h-7 w-7 text-slate-400" />,
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    defaultTitle: 'No results found',
    defaultDescription: 'Try adjusting your search or filters to find what you\'re looking for.',
  },
  'offline': {
    icon: <WifiOff className="h-7 w-7 text-amber-500" />,
    iconBg: 'bg-amber-50 dark:bg-amber-950/30',
    defaultTitle: 'You\'re offline',
    defaultDescription: 'Some data may be unavailable. Changes will sync when you reconnect.',
  },
  'locked': {
    icon: <Lock className="h-7 w-7 text-red-500" />,
    iconBg: 'bg-red-50 dark:bg-red-950/20',
    defaultTitle: 'Access restricted',
    defaultDescription: 'You don\'t have permission to view this content.',
  },
  'no-products': {
    icon: <Package className="h-7 w-7 text-indigo-500" />,
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/30',
    defaultTitle: 'No products yet',
    defaultDescription: 'Start building your inventory by adding your first product.',
  },
  'no-customers': {
    icon: <Users className="h-7 w-7 text-sky-500" />,
    iconBg: 'bg-sky-50 dark:bg-sky-950/30',
    defaultTitle: 'No customers yet',
    defaultDescription: 'Customer profiles will appear here once you process your first sale.',
  },
  'no-orders': {
    icon: <ShoppingCart className="h-7 w-7 text-emerald-500" />,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    defaultTitle: 'No orders yet',
    defaultDescription: 'Start a sale from the POS screen to see orders appear here.',
  },
  'no-reports': {
    icon: <BarChart3 className="h-7 w-7 text-violet-500" />,
    iconBg: 'bg-violet-50 dark:bg-violet-950/30',
    defaultTitle: 'No data to report',
    defaultDescription: 'Reports will generate automatically once transactions are recorded.',
  },
  'no-tenants': {
    icon: <Users className="h-7 w-7 text-primary" />,
    iconBg: 'bg-primary/10 dark:bg-primary/5',
    defaultTitle: 'No tenants registered',
    defaultDescription: 'Tenants who register online will appear here automatically.',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'no-data',
  title,
  description,
  action,
  secondaryAction,
  className = '',
}) => {
  const cfg = VARIANTS[variant];

  return (
    <div className={`flex flex-col items-center justify-center py-14 px-6 text-center ${className}`}>
      {/* Icon */}
      <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-5 ${cfg.iconBg}`}>
        {cfg.icon}
      </div>

      {/* Text */}
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
        {title || cfg.defaultTitle}
      </h3>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
        {description || cfg.defaultDescription}
      </p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-hover transition shadow-sm shadow-primary/20 active:scale-95"
            >
              {action.icon}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-darkbg-border text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Inline variant for use inside tables ─────────────────────────────────────

export const EmptyTableRow: React.FC<{
  colSpan: number;
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  action?: EmptyStateProps['action'];
}> = ({ colSpan, ...rest }) => (
  <tr>
    <td colSpan={colSpan} className="p-0">
      <EmptyState {...rest} />
    </td>
  </tr>
);
