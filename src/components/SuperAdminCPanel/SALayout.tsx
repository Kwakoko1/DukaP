import React from 'react';
import {
  LayoutDashboard, Building2, Users, CreditCard, ShoppingBag,
  DollarSign, Activity, ShieldCheck, Code2, PackageCheck,
  Rocket, Settings, ChevronRight, Menu, X, Sun, Moon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type SATab =
  | 'Overview'
  | 'Tenant Management'
  | 'Users & Roles'
  | 'Subscription Tiers'
  | 'Billing & Finance'
  | 'Business Categories'
  | 'Platform Monitoring'
  | 'Security Center'
  | 'Developer Center'
  | 'Production Readiness'
  | 'Release Center';

interface NavItem {
  id: SATab;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeVariant?: 'danger' | 'warning' | 'success';
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  // Platform
  { id: 'Overview',             icon: <LayoutDashboard className="h-4 w-4" />, label: 'Overview',             group: 'Platform' },
  { id: 'Tenant Management',    icon: <Building2 className="h-4 w-4" />,       label: 'Tenant Management',    group: 'Platform' },
  { id: 'Users & Roles',        icon: <Users className="h-4 w-4" />,           label: 'Users & Roles',        group: 'Platform' },
  // Commerce
  { id: 'Subscription Tiers',  icon: <CreditCard className="h-4 w-4" />,      label: 'Subscription Tiers',   group: 'Commerce' },
  { id: 'Billing & Finance',   icon: <DollarSign className="h-4 w-4" />,      label: 'Billing & Finance',    group: 'Commerce' },
  { id: 'Business Categories', icon: <ShoppingBag className="h-4 w-4" />,     label: 'Marketplace',          group: 'Commerce' },
  // Operations
  { id: 'Platform Monitoring', icon: <Activity className="h-4 w-4" />,        label: 'Platform Monitoring',  group: 'Operations' },
  { id: 'Security Center',     icon: <ShieldCheck className="h-4 w-4" />,     label: 'Security Center',      group: 'Operations' },
  { id: 'Developer Center',    icon: <Code2 className="h-4 w-4" />,           label: 'Developer Center',     group: 'Operations' },
  // Deployment
  { id: 'Production Readiness', icon: <PackageCheck className="h-4 w-4" />,  label: 'Production Readiness', group: 'Deployment' },
  { id: 'Release Center',      icon: <Rocket className="h-4 w-4" />,          label: 'Release Center',       group: 'Deployment' },
];

const GROUPS = ['Platform', 'Commerce', 'Operations', 'Deployment'];

interface SALayoutProps {
  active: SATab;
  onNavigate: (tab: SATab) => void;
  children: React.ReactNode;
  tenantCount?: number;
}

export const SALayout: React.FC<SALayoutProps> = ({ active, onNavigate, children, tenantCount }) => {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const { theme, toggleTheme } = useAuth();

  const NavContent = () => (
    <nav className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-200/80 dark:border-white/8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/30">
            <Settings className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-[11px] font-black tracking-widest text-slate-900 dark:text-white uppercase">DukaPos</div>
            <div className="text-[9px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Super Admin Console</div>
          </div>
        </div>
        {tenantCount !== undefined && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">Active Tenants</div>
            <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{tenantCount}</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5 scrollbar-thin">
        {GROUPS.map(group => {
          const items = NAV_ITEMS.filter(i => i.group === group);
          return (
            <div key={group}>
              <div className="text-[9px] font-black tracking-widest text-slate-400 dark:text-slate-500 uppercase px-2 mb-1.5">{group}</div>
              <div className="space-y-0.5">
                {items.map(item => {
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); setMobileNavOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group ${
                        isActive
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30 shadow-sm shadow-blue-500/10 font-bold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/6 border border-transparent'
                      }`}
                    >
                      <span className={`shrink-0 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`}>
                        {item.icon}
                      </span>
                      <span className="text-[11px] font-bold flex-1 truncate">{item.label}</span>
                      {isActive && <ChevronRight className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" />}
                      {item.badge && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                          item.badgeVariant === 'danger' ? 'bg-red-500/20 text-red-600 dark:text-red-300' :
                          item.badgeVariant === 'warning' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300' :
                          'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                        }`}>{item.badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-200/80 dark:border-white/8">
        <div className="text-[9px] font-mono text-slate-500 dark:text-slate-600 text-center">
          DukaPos Platform © {new Date().getFullYear()}
        </div>
      </div>
    </nav>
  );

  const currentItem = NAV_ITEMS.find(i => i.id === active);

  return (
    <div className="flex h-full min-h-screen bg-slate-50 dark:bg-[#0c1117] text-slate-900 dark:text-white -m-4 sm:-m-6 font-sans">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-slate-200/80 dark:border-white/8 bg-white dark:bg-slate-900/80 backdrop-blur-xl">
        <NavContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/8 shadow-2xl">
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-5 py-3 border-b border-slate-200/80 dark:border-white/8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/8 transition"
            onClick={() => setMobileNavOpen(v => !v)}
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[10px]">Super Admin</span>
            <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-600" />
            <span className="font-bold text-slate-900 dark:text-white">{currentItem?.label || active}</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme Selector Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition shadow-sm"
            title="Toggle Light / Dark Theme"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden sm:inline">Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-indigo-500" />
                <span className="hidden sm:inline">Dark Mode</span>
              </>
            )}
          </button>

          {/* Status badge */}
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute animate-ping inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            PostgreSQL Connected
          </div>

          {/* SA badge */}
          <div className="px-2.5 py-1 rounded-full bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 text-[10px] font-black tracking-widest text-red-600 dark:text-red-300 uppercase">
            SUPER ADMIN
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-5 sm:p-6 pb-24 lg:pb-6 scrollbar-thin">
          <div className="animate-page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
