import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth, type UserRole } from '../../context/AuthContext';
import { useModule, type IndustryModule, MODULE_MANIFESTS } from '../../context/ModuleContext';
import { useSyncState } from '../../context/SyncContext';
import { 
  Search, Sun, Moon, Wifi, WifiOff, RefreshCw, 
  ChevronDown, Layers, MapPin, X, LogOut, Lock,
  Bell, AlertTriangle, PackageX, Clock, CheckCircle2, Zap, Menu,
  ArrowUpDown, SlidersHorizontal
} from 'lucide-react';
import { db, safeGet } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  getShortModuleName, 
  getShortBranchName,
  INDUSTRY_SECTORS,
  MODULE_SECTOR_MAP,
  MODULE_POPULARITY_RANK,
  type IndustrySector,
  type IndustrySortOption
} from '../../utils/mobileFormatters';

interface TopBarProps {
  onOpenSearch: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSearch }) => {
  const { 
    role, 
    currentBranch, 
    toggleTheme, 
    currentTenant, 
    impersonatedTenant, 
    setImpersonatedTenant, 
    isSuperAdminView, 
    setIsSuperAdminView,
    user,
    logout,
    currentIndustry,
    switchContext
  } = useAuth();
  const { manifest, activeModule, setActiveModule, isMobileSidebarOpen, setIsMobileSidebarOpen, isDevSuperuser } = useModule();
  const { isOnline, isSyncing, syncProgress, pendingCount, toggleOfflineSimulation, syncLogs, syncData } = useSyncState();

  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showModuleDropdown, setShowModuleDropdown] = useState(false);
  const [showSyncDropdown, setShowSyncDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Industry Modules Filter & Sort State
  const [moduleSearchText, setModuleSearchText] = useState('');
  const [selectedSector, setSelectedSector] = useState<IndustrySector>('ALL');
  const [moduleSortOption, setModuleSortOption] = useState<IndustrySortOption>('SUBSCRIBED');

  // Refs for click-outside detection
  const profileContainerRef = useRef<HTMLDivElement>(null);
  const moduleContainerRef = useRef<HTMLDivElement>(null);
  const branchContainerRef = useRef<HTMLDivElement>(null);
  const syncContainerRef = useRef<HTMLDivElement>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileContainerRef.current && !profileContainerRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (moduleContainerRef.current && !moduleContainerRef.current.contains(event.target as Node)) {
        setShowModuleDropdown(false);
      }
      if (branchContainerRef.current && !branchContainerRef.current.contains(event.target as Node)) {
        setShowBranchDropdown(false);
      }
      if (syncContainerRef.current && !syncContainerRef.current.contains(event.target as Node)) {
        setShowSyncDropdown(false);
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const userInitials = useMemo(() => {
    if (!user?.name) return 'U';
    return user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }, [user]);

  // Live query to fetch all branch contexts resolved for this user
  const userContexts = useLiveQuery(async () => {
    if (!user) return [];
    const roles = await db.userBranchRoles.where('user_id').equals(user.id).toArray();
    const list: Array<{
      id: string;
      tenant_id: string;
      tenantName: string;
      branch_id: string;
      branchName: string;
      branchLocation: string;
      industry_id: string;
      industryName: string;
      role: UserRole;
    }> = [];
    for (const r of roles) {
      const br = r.branch_id ? await safeGet(db.branches, r.branch_id) : null;
      const ind = r.industry_id ? await safeGet(db.industries, r.industry_id) : null;
      const t = r.tenant_id ? await safeGet(db.tenants, r.tenant_id) : null;
      list.push({
        id: r.id || '',
        tenant_id: r.tenant_id,
        tenantName: t?.name || 'Unknown Business',
        branch_id: r.branch_id,
        branchName: br?.name || r.branch_id,
        branchLocation: br?.location || 'Unknown Location',
        industry_id: r.industry_id,
        industryName: ind?.name || 'Retail',
        role: r.role_id as UserRole
      });
    }
    return list;
  }, [user]) || [];

  const uniqueBranchesCount = useMemo(() => {
    const branchIds = new Set(userContexts.map(ctx => ctx.branch_id));
    return branchIds.size;
  }, [userContexts]);

  // Live query to fetch enabled (subscribed) modules for this tenant
  const tenantModules = useLiveQuery(() => 
    db.tenantModules.where('tenant_id').equals(currentTenant?.id || '').and(m => m.enabled).toArray()
  , [currentTenant?.id]);



  // ─── Real-time Notification Queries ───
  // All queries are SCOPED to the current tenant's branch.
  // They are completely suppressed in Super Admin view to avoid cross-tenant data leakage.
  // 1. Low stock alerts (checking both simple products and product variants)
  const lowStockStatus = useLiveQuery(async () => {
    // GUARD: Never show tenant notifications in Super Admin workspace
    if (isSuperAdminView || !currentBranch?.id || !currentTenant?.id) return { variants: [], products: [], totalCount: 0 };

    // Fetch all active (non-deleted) products for this tenant/branch — used to
    // cross-check variants so deleted products don't pollute stock alerts.
    const activeProducts = await db.products
      .where('tenant_id').equals(currentTenant.id)
      .and(p => p.branch_id === currentBranch.id && !p.deletedAt && p.status !== 'Inactive')
      .toArray();
    const activeProductIds = new Set(activeProducts.map(p => p.id));

    // Low stock variants (stock < reorderLevel) — only for active parent products
    const variants = await db.productVariants
      .where('tenant_id').equals(currentTenant.id)
      .and(v => v.branch_id === currentBranch.id && activeProductIds.has(v.productId))
      .toArray();
    const lowVariantsRaw = variants.filter(v => v.stock < (v.reorderLevel ?? 5));

    const lowVariantsWithNames = await Promise.all(lowVariantsRaw.map(async v => {
      const parent = v.productId ? await safeGet(db.products, v.productId) : null;
      const attrLabel = v.attributes ? Object.values(v.attributes).join(' / ') : '';
      const displayName = parent ? `${parent.name}${attrLabel ? ` (${attrLabel})` : ''}` : v.sku;
      return { ...v, displayName };
    }));

    // Low stock simple products without variants (stock < 10) — active only
    const lowProducts = activeProducts.filter(p => !p.hasVariants && p.stock < 10);

    return {
      variants: lowVariantsWithNames,
      products: lowProducts,
      totalCount: lowVariantsWithNames.length + lowProducts.length
    };
  }, [currentTenant?.id, currentBranch?.id, isSuperAdminView]) || { variants: [], products: [], totalCount: 0 };

  // 2. Pending (unpaid) expenses — suppressed in Super Admin view
  const pendingExpenses = useLiveQuery(async () => {
    if (isSuperAdminView || !currentBranch?.id || !currentTenant?.id) return [];
    return db.expenses
      .where('tenant_id').equals(currentTenant.id)
      .and(e => e.branch_id === currentBranch.id && e.status === 'Pending')
      .toArray();
  }, [currentTenant?.id, currentBranch?.id, isSuperAdminView]) || [];

  // 3. Reorder rule violations — suppressed in Super Admin view
  const reorderAlertCount = useLiveQuery(async () => {
    if (isSuperAdminView || !currentBranch?.id || !currentTenant?.id) return 0;
    const rules = await db.reorderRules
      .where('tenant_id').equals(currentTenant.id)
      .and(r => r.branch_id === currentBranch.id && r.is_active)
      .toArray();
    let count = 0;
    for (const rule of rules) {
      const prod = rule.product_id ? await safeGet(db.products, rule.product_id) : null;
      if (!prod) continue;
      const stock = rule.variant_id
        ? (await safeGet(db.productVariants, rule.variant_id))?.stock ?? 0
        : prod.stock;
      if (stock < rule.min_quantity) {
        count++;
      }
    }
    return count;
  }, [currentTenant?.id, currentBranch?.id, isSuperAdminView]) || 0;

  // 4. Negative stock balances — suppressed in Super Admin view
  const negativeStockCount = useLiveQuery(async () => {
    if (isSuperAdminView || !currentBranch?.id) return 0;
    const variants = await db.productVariants
      .where('tenant_id').equals(currentTenant.id)
      .and(v => v.branch_id === currentBranch.id)
      .toArray();
    const negVariants = variants.filter(v => v.stock < 0).length;

    const products = await db.products
      .where('tenant_id').equals(currentTenant.id)
      .and(p => p.branch_id === currentBranch.id && !p.hasVariants)
      .toArray();
    const negProducts = products.filter(p => p.stock < 0).length;

    return negVariants + negProducts;
  }, [currentTenant.id, currentBranch?.id, isSuperAdminView]) || 0;

  // 5a. Read subscription records reactively (read-only — no writes allowed in liveQuery)
  const rawSubs = useLiveQuery<any[]>(
    async () => {
      if (isSuperAdminView) return [];
      return db.tenantSubscriptions.where('tenant_id').equals(currentTenant.id).toArray();
    },
    [currentTenant.id, isSuperAdminView]
  ) || [];

  // 5b. Auto-heal missing subscription — runs as a side-effect (write is safe here)
  useEffect(() => {
    if (isSuperAdminView || rawSubs === undefined) return; // undefined = still loading
    if (!Array.isArray(rawSubs) || rawSubs.length > 0) return; // already has subs, skip

    const healSubscription = async () => {
      try {
        const plans = await db.subscriptionPlans.toArray();
        const tenantPlanStr = (currentTenant.plan || 'basic').toLowerCase();
        const matchedPlan = plans.find(p => p.name.toLowerCase().includes(tenantPlanStr) || p.code.toLowerCase() === tenantPlanStr) || plans[0];
        const planId = matchedPlan?.id || 'plan-basic';
        const isTrial = (currentTenant.status === 'Trial' || currentTenant.status === 'TRIAL' || !currentTenant.status);
        const durationDays = isTrial ? 14 : 30;
        const createdTs = currentTenant.created_at || Date.now();
        const endTs = createdTs + durationDays * 24 * 60 * 60 * 1000;
        await db.tenantSubscriptions.put({
          id: `sub-${currentTenant.id}`,
          tenant_id: currentTenant.id,
          plan_id: planId,
          status: isTrial ? 'TRIAL' : 'ACTIVE',
          start_date: createdTs,
          end_date: endTs,
          auto_renew: true,
          created_at: createdTs,
          updated_at: Date.now()
        } as any);
      } catch (e) {
        console.warn('[TopBar] Auto-heal subscription failed:', e);
      }
    };

    healSubscription();
  }, [rawSubs, currentTenant.id, currentTenant.plan, currentTenant.status, currentTenant.created_at, isSuperAdminView]);

  // 5c. Derive alert state from the raw reactive subscription list (pure computation, no writes)
  const subscriptionAlerts = useMemo(() => {
    if (isSuperAdminView || !Array.isArray(rawSubs) || rawSubs.length === 0) return null;
    const activeSub: any = rawSubs.find((s: any) =>
      (s.status as string) === 'ACTIVE' || (s.status as string) === 'Active' ||
      (s.status as string) === 'TRIAL' || (s.status as string) === 'Trial'
    );
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
    if (activeSub) {
      if (activeSub.end_date && activeSub.end_date < now) {
        return { expired: true, daysLeft: 0 };
      }
      if (activeSub.end_date && activeSub.end_date < sevenDaysFromNow) {
        const daysLeft = Math.ceil((activeSub.end_date - now) / (1000 * 60 * 60 * 24));
        return { expired: false, daysLeft };
      }
    } else {
      const tStatus = (currentTenant.status || '').toUpperCase();
      if (tStatus === 'TRIAL' || tStatus === 'ACTIVE') return null;
      return { expired: true, daysLeft: 0 };
    }
    return null;
  }, [rawSubs, currentTenant.status, isSuperAdminView]);


  // Build notification list
  const notifications = useMemo(() => {
    const items: Array<{ id: string; type: 'warning' | 'danger' | 'info'; icon: React.ReactNode; title: string; description: string }> = [];

    // Low stock warnings
    if (lowStockStatus.totalCount > 0) {
      const namesList = [
        ...lowStockStatus.products.slice(0, 2).map(p => p.name),
        ...lowStockStatus.variants.slice(0, 2).map(v => (v as any).displayName || v.sku)
      ];
      const desc = `${namesList.join(', ')}${lowStockStatus.totalCount > namesList.length ? ` +${lowStockStatus.totalCount - namesList.length} more` : ''} below reorder level.`;
      items.push({
        id: 'low-stock',
        type: 'warning',
        icon: <PackageX className="h-4 w-4" />,
        title: `${lowStockStatus.totalCount} Low Stock Item${lowStockStatus.totalCount > 1 ? 's' : ''}`,
        description: desc
      });
    }

    // Unpaid expense alerts
    if (pendingExpenses.length > 0) {
      const total = pendingExpenses.reduce((s, e) => s + e.amount, 0);
      items.push({
        id: 'pending-expenses',
        type: 'danger',
        icon: <AlertTriangle className="h-4 w-4" />,
        title: `${pendingExpenses.length} Unpaid Expense${pendingExpenses.length > 1 ? 's' : ''}`,
        description: `Tsh. ${total.toLocaleString()} in pending operational costs awaiting payment.`
      });
    }

    // Reorder triggers
    if (reorderAlertCount > 0) {
      items.push({
        id: 'reorder-alerts',
        type: 'warning',
        icon: <Zap className="h-4 w-4" />,
        title: `${reorderAlertCount} Reorder Alert${reorderAlertCount > 1 ? 's' : ''} Triggered`,
        description: `Items have dropped below their minimum target quantities and require restocking.`
      });
    }

    // Negative stock warnings
    if (negativeStockCount > 0) {
      items.push({
        id: 'negative-stock',
        type: 'danger',
        icon: <AlertTriangle className="h-4 w-4" />,
        title: 'Negative Stock Detected',
        description: `${negativeStockCount} item(s) have negative stock balances. Audit POS sales and adjust stock.`
      });
    }

    // Subscription status
    if (subscriptionAlerts) {
      if (subscriptionAlerts.expired) {
        items.push({
          id: 'sub-expired',
          type: 'danger',
          icon: <Clock className="h-4 w-4" />,
          title: 'Subscription Expired',
          description: 'Your business subscription has expired. Renew your plan to restore full operations.'
        });
      } else {
        items.push({
          id: 'sub-expiry',
          type: 'info',
          icon: <Clock className="h-4 w-4" />,
          title: 'Subscription Expiring Soon',
          description: `Your plan expires in ${subscriptionAlerts.daysLeft} day${subscriptionAlerts.daysLeft !== 1 ? 's' : ''}. Renew now to avoid service interruption.`
        });
      }
    }

    return items;
  }, [lowStockStatus, pendingExpenses, reorderAlertCount, negativeStockCount, subscriptionAlerts]);

  const totalNotificationCount = notifications.length;

  const subscribedModuleKeys = useMemo(() => (tenantModules || []).map(m => m.module_key), [tenantModules]);

  const displayedModules = useMemo(() => {
    const allKeys = Object.keys(MODULE_MANIFESTS) as IndustryModule[];
    // Dev superuser and Super Admin get all modules regardless of tenant subscription
    if (isSuperAdminView || isDevSuperuser) return allKeys;
    if (!tenantModules || tenantModules.length === 0) return [(currentIndustry?.name as IndustryModule) || activeModule];
    return allKeys.filter(mod => subscribedModuleKeys.includes(mod));
  }, [tenantModules, subscribedModuleKeys, activeModule, isSuperAdminView, isDevSuperuser, currentIndustry?.name]);

  // Keep activeModule in sync with the tenant's subscribed modules
  useEffect(() => {
    // Dev superuser: never auto-reset the module — let their last selection persist
    if (isSuperAdminView || isDevSuperuser) return;
    if (tenantModules === undefined || tenantModules.length === 0) return;
    
    const isSubscribed = displayedModules.includes(activeModule);
    if (!isSubscribed && displayedModules.length > 0) {
      setActiveModule(displayedModules[0]);
    }
  }, [activeModule, displayedModules, tenantModules, isSuperAdminView, isDevSuperuser, setActiveModule]);

  return (
    <>
      {/* Impersonation Banner Warning */}
      {impersonatedTenant && (
        <div className="bg-red-600 text-white font-bold text-xs py-2 px-4 text-center select-none flex items-center justify-between z-50 shrink-0 sticky top-0 animate-in slide-in-from-top duration-200">
          <div className="flex items-center space-x-2">
            <span className="animate-pulse">⚠️</span>
            <span>Platform Impersonation Session: Managing <strong>{currentTenant.name}</strong> workspace</span>
          </div>
          <button 
            onClick={() => {
              setImpersonatedTenant(null);
              setIsSuperAdminView(true);
              window.location.reload(); // Refresh to clean state
            }}
            className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded text-[10px] uppercase font-black transition active:scale-95 ml-3"
          >
            Exit Impersonation
          </button>
        </div>
      )}
      


      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-4 sm:px-6 backdrop-blur-md dark:border-darkbg-border dark:bg-darkbg-card/85">
        {/* Top Left Brand Logo & Mobile Hamburger Sidebar Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 transition border border-slate-200/80 dark:border-darkbg-border shadow-xs active:scale-95 cursor-pointer shrink-0"
            title="Toggle Navigation Menu"
            aria-label="Toggle Navigation Menu"
          >
            <Menu className="h-5 w-5 stroke-[2.5]" />
          </button>

          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-white p-0.5 shadow-md border border-slate-200/80 dark:border-darkbg-border overflow-hidden shrink-0">
            <img src={(currentTenant as any)?.logo_url || (currentTenant as any)?.logoUrl || "/kwakopos-logo.png"} alt={currentTenant.name || "Tenant Logo"} className="h-full w-full object-contain" />
          </div>
          <div className="truncate max-w-[150px] sm:max-w-[240px]">
            <h2 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate leading-tight">
              {getShortModuleName(manifest.name) || currentTenant.name || 'KwakoPos'}
            </h2>
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 truncate hidden sm:block">
              {currentTenant.name ? `${currentTenant.name} • ${role}` : role}
            </p>
          </div>
        </div>

        {/* Center Search Everything Trigger (Ctrl+K) */}
        <div className="mx-2 sm:mx-4 flex-1 max-w-md">
          <button
            onClick={onOpenSearch}
            className="flex h-9 sm:h-10 w-full items-center space-x-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs sm:text-sm text-slate-400 hover:bg-slate-100 dark:border-darkbg-border dark:bg-darkbg/50 dark:hover:bg-darkbg"
          >
            <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="flex-1 text-left truncate">
              {isSuperAdminView ? 'Search platform tenants, subscriptions...' : 'Search products, customers, transactions...'}
            </span>
            <span className="hidden sm:inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-darkbg-border dark:text-slate-400">Ctrl+K</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
          {/* DESKTOP ONLY: Industry Module Selector (Tenant View Only) */}
          {!isSuperAdminView && displayedModules.length > 0 && (
            <div className="relative hidden lg:block" ref={moduleContainerRef}>
              <button
                onClick={() => setShowModuleDropdown(!showModuleDropdown)}
                className="flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-darkbg-border dark:bg-darkbg/50 dark:text-slate-200"
              >
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="max-w-[120px] truncate font-semibold text-left">{getShortModuleName(activeModule)}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {showModuleDropdown && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 max-h-[calc(100vh-90px)] sm:max-h-[520px] overflow-hidden flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-darkbg-border dark:bg-darkbg-card z-50 animate-in fade-in zoom-in-95 duration-100">
                  {/* Sticky Top Header & Search */}
                  <div className="p-3 border-b border-slate-100 dark:border-darkbg-border bg-slate-50/60 dark:bg-darkbg/40 space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                          Industry Modules
                        </span>
                      </div>
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[9px] font-black">
                        {displayedModules.length} Active
                      </span>
                    </div>

                    {/* Live Search Input */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={moduleSearchText}
                        onChange={(e) => setModuleSearchText(e.target.value)}
                        placeholder="Search 30+ industry verticals..."
                        className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary font-medium text-slate-800 dark:text-slate-100"
                      />
                      {moduleSearchText && (
                        <button
                          onClick={() => setModuleSearchText('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Sort Order Selector & Filter Bar */}
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center space-x-1 text-slate-400 font-bold">
                        <ArrowUpDown className="h-3 w-3" />
                        <span>Order:</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => setModuleSortOption('SUBSCRIBED')}
                          className={`px-2 py-0.5 rounded-md font-extrabold transition ${
                            moduleSortOption === 'SUBSCRIBED'
                              ? 'bg-primary text-white shadow-2xs'
                              : 'bg-slate-200/60 dark:bg-darkbg text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                          title="Show subscribed active modules first"
                        >
                          Subscribed
                        </button>
                        <button
                          onClick={() => setModuleSortOption('ALPHABETICAL')}
                          className={`px-2 py-0.5 rounded-md font-extrabold transition ${
                            moduleSortOption === 'ALPHABETICAL'
                              ? 'bg-primary text-white shadow-2xs'
                              : 'bg-slate-200/60 dark:bg-darkbg text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                          title="Sort alphabetically (A-Z)"
                        >
                          A - Z
                        </button>
                        <button
                          onClick={() => setModuleSortOption('POPULAR')}
                          className={`px-2 py-0.5 rounded-md font-extrabold transition ${
                            moduleSortOption === 'POPULAR'
                              ? 'bg-primary text-white shadow-2xs'
                              : 'bg-slate-200/60 dark:bg-darkbg text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                          title="Sort by market popularity rank"
                        >
                          Popular
                        </button>
                      </div>
                    </div>

                    {/* Sector Filter Pills */}
                    <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 no-scrollbar">
                      {INDUSTRY_SECTORS.map((sec) => (
                        <button
                          key={sec.id}
                          onClick={() => setSelectedSector(sec.id)}
                          className={`px-2 py-0.5 rounded-lg text-[9px] font-extrabold whitespace-nowrap transition ${
                            selectedSector === sec.id
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                              : 'bg-slate-100 dark:bg-darkbg text-slate-500 hover:text-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {sec.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable Modules List */}
                  <div className="overflow-y-auto flex-1 space-y-0.5 p-1.5 custom-scrollbar">
                    {(() => {
                      const allKeys = Object.keys(MODULE_MANIFESTS) as IndustryModule[];

                      // 1. Sector Filter
                      let list = allKeys.filter((key) => {
                        if (selectedSector !== 'ALL') {
                          const sec = MODULE_SECTOR_MAP[key] || 'TRADES';
                          if (sec !== selectedSector) return false;
                        }
                        // 2. Search Text Filter
                        if (moduleSearchText.trim()) {
                          const q = moduleSearchText.toLowerCase();
                          const rawName = (MODULE_MANIFESTS[key]?.name || key).toLowerCase();
                          const shortName = getShortModuleName(MODULE_MANIFESTS[key]?.name || key).toLowerCase();
                          return rawName.includes(q) || shortName.includes(q) || key.toLowerCase().includes(q);
                        }
                        return true;
                      });

                      // 3. Apply Sorting Option
                      if (moduleSortOption === 'ALPHABETICAL') {
                        list.sort((a, b) => {
                          const nameA = getShortModuleName(MODULE_MANIFESTS[a]?.name || a);
                          const nameB = getShortModuleName(MODULE_MANIFESTS[b]?.name || b);
                          return nameA.localeCompare(nameB);
                        });
                      } else if (moduleSortOption === 'POPULAR') {
                        list.sort((a, b) => (MODULE_POPULARITY_RANK[a] || 99) - (MODULE_POPULARITY_RANK[b] || 99));
                      } else {
                        // SUBSCRIBED option: Subscribed first, then locked
                        list.sort((a, b) => {
                          const isSubA = displayedModules.includes(a);
                          const isSubB = displayedModules.includes(b);
                          if (isSubA && !isSubB) return -1;
                          if (!isSubA && isSubB) return 1;
                          return (MODULE_POPULARITY_RANK[a] || 99) - (MODULE_POPULARITY_RANK[b] || 99);
                        });
                      }

                      if (list.length === 0) {
                        return (
                          <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-xs">
                            <SlidersHorizontal className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                            <p className="font-semibold">No modules match your filter</p>
                            <button
                              onClick={() => {
                                setModuleSearchText('');
                                setSelectedSector('ALL');
                              }}
                              className="mt-2 text-[10px] font-bold text-primary hover:underline"
                            >
                              Clear Search & Filters
                            </button>
                          </div>
                        );
                      }

                      return list.map((modKey) => {
                        const isAccessible = displayedModules.includes(modKey);
                        const isActive = activeModule === modKey;
                        const shortName = getShortModuleName(MODULE_MANIFESTS[modKey]?.name || modKey);
                        const sectorId = MODULE_SECTOR_MAP[modKey] || 'TRADES';
                        const sectorDef = INDUSTRY_SECTORS.find(s => s.id === sectorId);

                        if (isAccessible) {
                          return (
                            <button
                              key={modKey}
                              onClick={() => {
                                setActiveModule(modKey);
                                setShowModuleDropdown(false);
                              }}
                              className={`w-full flex items-center justify-between text-left rounded-xl px-3 py-2 text-xs transition-all ${
                                isActive
                                  ? 'bg-primary/10 text-primary font-bold dark:bg-primary/20'
                                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-darkbg/80 font-medium'
                              }`}
                            >
                              <div className="flex items-center space-x-2 min-w-0 flex-1 text-left">
                                <span className="truncate text-left font-semibold text-xs">{shortName}</span>
                                {selectedSector === 'ALL' && (
                                  <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-darkbg text-slate-400 shrink-0">
                                    {sectorDef?.shortLabel}
                                  </span>
                                )}
                              </div>
                              {isActive && <span className="h-2 w-2 rounded-full bg-primary shrink-0 ml-2" />}
                            </button>
                          );
                        }

                        return (
                          <div
                            key={modKey}
                            title="Module not included in current workspace subscription plan."
                            className="w-full flex items-center justify-between text-left rounded-xl px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 opacity-60 bg-slate-50/40 dark:bg-darkbg/20 select-none cursor-not-allowed"
                          >
                            <div className="flex items-center space-x-2 min-w-0 flex-1 text-left">
                              <span className="truncate text-left font-medium text-xs">{shortName}</span>
                              {selectedSector === 'ALL' && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-100/50 dark:bg-darkbg/50 text-slate-400 shrink-0">
                                  {sectorDef?.shortLabel}
                                </span>
                              )}
                            </div>
                            <Lock className="h-3 w-3 text-slate-400 dark:text-slate-600 shrink-0 ml-2" />
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DESKTOP ONLY: Branch Context Selector (Tenant View Only) */}
          {!isSuperAdminView && (uniqueBranchesCount > 0 || currentBranch) && (
            <div className="relative hidden md:block" ref={branchContainerRef}>
              <button
                onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                className="flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-darkbg-border dark:bg-darkbg/50 dark:text-slate-200"
              >
                <MapPin className="h-3.5 w-3.5 text-amber-500" />
                <span className="max-w-[100px] truncate">{getShortBranchName(currentBranch?.name || 'Main Branch')}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {showBranchDropdown && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-darkbg-border dark:bg-darkbg-card z-50">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Switch Branch</div>
                  {userContexts.map((ctx) => (
                    <button
                      key={ctx.id}
                      onClick={() => {
                        switchContext(ctx.tenant_id, ctx.branch_id, ctx.industry_id, ctx.role);
                        setShowBranchDropdown(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition ${
                        currentBranch?.id === ctx.branch_id
                          ? 'bg-amber-50 text-amber-700 font-bold dark:bg-amber-950/40 dark:text-amber-300'
                          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-darkbg'
                      }`}
                    >
                      <div className="text-left">
                        <div className="font-semibold">{ctx.branchName}</div>
                        <div className="text-[10px] text-slate-400">{ctx.tenantName}</div>
                      </div>
                      {currentBranch?.id === ctx.branch_id && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DESKTOP ONLY: Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="hidden md:flex rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
            title="Toggle Theme"
          >
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </button>
          {/* Offline Status & Sync Queue Indicator */}
          <div className="relative" ref={syncContainerRef}>
            <button
              onClick={() => {
                setShowSyncDropdown(!showSyncDropdown);
                setShowNotifications(false);
              }}
              className={`flex items-center space-x-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                isOnline 
                  ? 'bg-success/10 text-success dark:bg-success/20' 
                  : 'bg-danger/10 text-danger dark:bg-danger/20'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Online</span>
                  {isSyncing && <RefreshCw className="h-3.5 w-3.5 animate-spin ml-1" />}
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 animate-pulse" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
              {pendingCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white animate-bounce">
                  {pendingCount}
                </span>
              )}
            </button>

            {showSyncDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowSyncDropdown(false)} />}
            {showSyncDropdown && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-darkbg-border dark:bg-darkbg-card z-50">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-darkbg-border">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">Offline Sync Monitor</span>
                  <button
                    onClick={toggleOfflineSimulation}
                    className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-darkbg-border dark:text-slate-300"
                  >
                    Switch to {isOnline ? 'Offline' : 'Online'}
                  </button>
                </div>
                
                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Sync Status:</span>
                  <span className={`font-semibold ${isOnline ? 'text-success' : 'text-danger'}`}>
                    {isOnline ? 'Online - Auto Syncing' : 'Offline Mode Active'}
                  </span>
                </div>
                
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Queued Operations:</span>
                  <span className="font-semibold text-slate-800 dark:text-white">{pendingCount} pending</span>
                </div>

                {isSyncing && syncProgress ? (
                  <div className="mt-3 space-y-1 bg-slate-50 dark:bg-darkbg/40 p-2.5 rounded-lg border dark:border-darkbg-border/30">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Syncing Records</span>
                      <span>{syncProgress.current} / {syncProgress.total} ({syncProgress.percentage}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 dark:bg-darkbg rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${syncProgress.percentage}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  isOnline && (
                    <button
                      onClick={() => syncData(true)}
                      disabled={isSyncing}
                      className="mt-3 flex w-full items-center justify-center space-x-1.5 rounded-lg bg-primary py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-primary/90 transition shadow-sm"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>
                        {isSyncing
                          ? 'Synchronizing Cloud...'
                          : pendingCount > 0
                          ? `Push ${pendingCount} Pending & Sync`
                          : 'Trigger Manual Sync Probe'}
                      </span>
                    </button>
                  )
                )}

                {/* Live Sync Logs */}
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sync Activity Log</div>
                  <div className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 font-mono text-[9px] text-slate-600 dark:border-darkbg-border dark:bg-darkbg dark:text-slate-400">
                    {syncLogs.length === 0 ? (
                      <div className="text-slate-400 italic">No sync logs recorded yet.</div>
                    ) : (
                      syncLogs.map((log, idx) => <div key={idx} className="truncate">{log}</div>)
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Real-time Notification Bell ─── */}
          <div className="relative" ref={notifContainerRef}>
            <button
              id="notification-bell-btn"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowSyncDropdown(false);
              }}
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
              title="Notifications"
            >
              <Bell className={`h-5 w-5 ${totalNotificationCount > 0 ? 'animate-[wiggle_1.5s_ease-in-out_infinite]' : ''}`} />
              {totalNotificationCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white shadow-md border border-white dark:border-darkbg-card">
                  {totalNotificationCount}
                </span>
              )}
            </button>

            {showNotifications && <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-darkbg-border dark:bg-darkbg-card z-50 animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg/20">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-800 dark:text-white">Notifications</span>
                    {totalNotificationCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black">{totalNotificationCount}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Notification Items */}
                <div className="divide-y divide-slate-100 dark:divide-darkbg-border/30 max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 mb-3">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">All Clear!</p>
                      <p className="text-[10px] text-slate-400 mt-1">No alerts or issues detected across your workspace.</p>
                    </div>
                  ) : (
                    notifications.map(notif => {
                      const colorMap = {
                        warning: { bg: 'bg-amber-50 dark:bg-amber-950/15', icon: 'text-amber-600 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-900/25', border: 'border-l-amber-400' },
                        danger:  { bg: 'bg-red-50 dark:bg-red-950/15',    icon: 'text-red-600 dark:text-red-400 bg-red-100/60 dark:bg-red-900/25',    border: 'border-l-red-400' },
                        info:    { bg: 'bg-blue-50 dark:bg-blue-950/15',  icon: 'text-blue-600 dark:text-blue-400 bg-blue-100/60 dark:bg-blue-900/25',  border: 'border-l-blue-400' },
                      };
                      const c = colorMap[notif.type];
                      return (
                        <div
                          key={notif.id}
                          className={`flex items-start gap-3 px-4 py-3 ${c.bg} border-l-2 ${c.border} transition-colors`}
                        >
                          <div className={`mt-0.5 rounded-lg p-1.5 shrink-0 ${c.icon}`}>
                            {notif.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 dark:text-white leading-snug">{notif.title}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{notif.description}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg/20">
                  <p className="text-[10px] text-center text-slate-400">Alerts update live via IndexedDB sync</p>
                </div>
              </div>
            )}
          </div>

          {/* DESKTOP ONLY: Profile Menu */}
          <div className="relative hidden md:block" ref={profileContainerRef}>
            <button
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="flex items-center space-x-2 rounded-xl p-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white shadow-sm">
                {userInitials}
              </div>
              <div className="hidden text-left xl:block">
                <div className="text-xs font-bold text-slate-800 dark:text-white truncate max-w-[100px]">{user?.name || 'User'}</div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">{role}</div>
              </div>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {showProfileDropdown && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-darkbg-border dark:bg-darkbg-card z-50">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-darkbg-border">
                  <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{user?.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="flex w-full items-center space-x-2 rounded-lg px-2.5 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition mt-1 font-semibold"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>




    </>
  );
};
