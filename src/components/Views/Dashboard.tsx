import React, { useMemo } from 'react';
import { useModule } from '../../context/ModuleContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../UI/custom-ui';
import {
  TrendingUp, TrendingDown, DollarSign, Package, Users,
  AlertTriangle, Clock, PiggyBank, Briefcase,
  Sparkles, Layers, Egg, Footprints, Truck, ArrowRight, Calendar,
  ShoppingCart, BarChart2, CheckCircle, RefreshCw, Zap, Star
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, PieChart, Pie, BarChart, Bar
} from 'recharts';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fmtCcy = (n: number) =>
  n >= 1_000_000 ? `Tsh ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `Tsh ${(n / 1_000).toFixed(1)}K`
  : `Tsh ${Math.round(n).toLocaleString()}`;

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });

// Custom Recharts tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl shadow-xl p-3 text-xs min-w-[150px] space-y-1.5">
      <p className="font-black text-slate-800 dark:text-slate-100 pb-1 border-b border-slate-100 dark:border-darkbg-border">{label}</p>
      {payload.map((p: any, i: number) => {
        const isMoney = ['Revenue', 'Profit', 'Savings', 'Loans', 'Cost'].includes(p.name);
        return (
          <div key={i} className="flex items-center justify-between gap-3 font-semibold text-[11px]">
            <span style={{ color: p.color }} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-extrabold text-slate-900 dark:text-white">
              {isMoney ? fmtCcy(p.value) : p.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: string | number;
  desc: string;
  icon: React.ReactNode;
  accent: string;
  trend?: 'up' | 'down' | null;
  trendLabel?: string;
  onClick?: () => void;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, desc, icon, accent, trend, trendLabel, onClick }) => (
  <div
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl bg-white dark:bg-darkbg-card border border-slate-100 dark:border-darkbg-border p-5 shadow-sm transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
  >
    {/* Decorative accent blob */}
    <div className="absolute -top-4 -right-4 h-20 w-20 rounded-full opacity-10" style={{ background: accent }} />

    <div className="flex items-start justify-between relative">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white leading-none">{value}</p>
        {trend && (
          <span className={`mt-1.5 inline-flex items-center gap-0.5 text-[10px] font-black rounded-full px-1.5 py-0.5 ${
            trend === 'up' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
          }`}>
            {trend === 'up' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {trendLabel || (trend === 'up' ? '+Today' : '−Today')}
          </span>
        )}
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{desc}</p>
      </div>
      <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `${accent}18` }}>
        <div style={{ color: accent }}>{icon}</div>
      </div>
    </div>
  </div>
);

// ─── Main Dashboard Component ────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { activeModule, setActiveTab } = useModule();
  const { currentBranch, currentTenant, role } = useAuth();

  const tenantId = currentTenant?.id || '';
  const branchId = currentBranch?.id || '';

  // ── Live Queries ────────────────────────────────────────────────────────────
  const products = useLiveQuery(() => {
    if (!tenantId) return [];
    return db.products.where('tenant_id').equals(tenantId)
      .and(p => {
        if (p.deletedAt || (p as any).deleted_at || p.status === 'Inactive') return false;
        const pMod = (p.module || 'Retail').toLowerCase();
        const aMod = (activeModule || 'Retail').toLowerCase();
        const matchMod = pMod === aMod || pMod === 'all' || !p.module;
        const pBranch = p.branch_id || (p as any).branchId;
        const matchBranch = !pBranch || pBranch === branchId || pBranch === 'all' || pBranch.includes('hq') || pBranch === branchId;
        return matchMod && matchBranch;
      }).toArray();
  }, [tenantId, branchId, activeModule]) || [];

  const productVariants = useLiveQuery(() => {
    if (!tenantId) return [];
    return db.productVariants.where('tenant_id').equals(tenantId)
      .and(v => {
        if (v.status === 'Inactive') return false;
        const vBranch = v.branch_id || (v as any).branchId;
        return !vBranch || vBranch === branchId || vBranch === 'all' || vBranch.includes('hq') || vBranch === branchId;
      }).toArray();
  }, [tenantId, branchId]) || [];

  const orders = useLiveQuery(() => {
    if (!tenantId) return [];
    return db.orders.where('tenant_id').equals(tenantId)
      .and(o => {
        const oMod = (o.module || 'Retail').toLowerCase();
        const aMod = (activeModule || 'Retail').toLowerCase();
        const matchMod = oMod === aMod || oMod === 'all' || !o.module;
        const oBranch = o.branch_id || (o as any).branchId;
        const matchBranch = !oBranch || oBranch === branchId || oBranch === 'all' || oBranch.includes('hq') || oBranch === branchId;
        return matchMod && matchBranch;
      }).toArray();
  }, [tenantId, branchId, activeModule]) || [];

  const customers = useLiveQuery(() => {
    if (!tenantId) return [];
    const typeMap: Record<string, string> = {
      Retail: 'Customer', Restaurant: 'Customer', Pharmacy: 'Patient',
      SACCO: 'Member', Law: 'Client', RealEstate: 'Tenant', School: 'Student', Hotel: 'Guest',
    };
    const targetType = typeMap[activeModule] || 'Customer';
    return db.customers.where('tenant_id').equals(tenantId)
      .and(c => (!branchId || c.branch_id === branchId) && c.type === targetType)
      .toArray();
  }, [tenantId, branchId, activeModule]) || [];

  const suppliers = useLiveQuery(() => {
    if (!tenantId) return [];
    return db.suppliers.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  // ── Derived state ─────────────────────────────────────────────────────────

  const isCleanTenant = products.length === 0 && orders.length === 0 && customers.length === 0 && suppliers.length === 0;

  // Stable product cost lookup helper for real revenue and profit calculations
  const costLookup = useMemo(() => {
    const prodMap = new Map<string, number>();
    const varMap = new Map<string, number>();
    
    products.forEach(p => {
      prodMap.set(p.id, p.buyingPrice || 0);
    });
    productVariants.forEach(v => {
      const parentCost = prodMap.get(v.productId) || 0;
      varMap.set(v.id, v.buyingPrice !== undefined ? v.buyingPrice : parentCost);
    });

    return {
      getProductCost: (productId: string) => prodMap.get(productId) || 0,
      getVariantCost: (variantId: string | undefined, productId: string) => 
        (variantId ? varMap.get(variantId) : undefined) ?? prodMap.get(productId) ?? 0,
      getItemCOGS: (item: { productId: string; variantId?: string; price: number; quantity: number }) => {
        const unitCost = (item.variantId ? varMap.get(item.variantId) : undefined) ?? prodMap.get(item.productId) ?? 0;
        return (unitCost > 0 ? unitCost : item.price * 0.70) * item.quantity;
      }
    };
  }, [products, productVariants]);

  // ── KPI Stats ─────────────────────────────────────────────────────────────

  const validOrders = useMemo(() => {
    return orders.filter(o => o.status !== 'Cancelled' && o.status !== 'Voided' && o.status !== 'Refunded');
  }, [orders]);

  const stats = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();

    // Yesterday window
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayTs = yesterdayStart.getTime();

    const todayOrders     = validOrders.filter(o => o.timestamp >= todayTs);
    const yesterdayOrders = validOrders.filter(o => o.timestamp >= yesterdayTs && o.timestamp < todayTs);

    const totalSales     = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + o.total, 0);
    const allSales       = validOrders.reduce((sum, o) => sum + o.total, 0);

    // Real % change vs yesterday — null when no baseline exists
    const salesTrend: 'up' | 'down' | null =
      yesterdaySales === 0 ? (totalSales > 0 ? 'up' : null)
      : totalSales >= yesterdaySales ? 'up' : 'down';

    const salesTrendPct: string | undefined = (() => {
      if (yesterdaySales === 0) return totalSales > 0 ? 'New sales today' : undefined;
      const pct = Math.abs(((totalSales - yesterdaySales) / yesterdaySales) * 100).toFixed(1);
      return `${salesTrend === 'up' ? '+' : '−'}${pct}% vs yesterday`;
    })();

    const completedOrders = validOrders.filter(o => o.status === 'Completed').length;
    const pendingOrders   = validOrders.filter(o => o.status === 'Pending').length;

    // Restaurant: pending orders = kitchen queue; unique customers today = active sittings proxy
    const todayPendingOrders = todayOrders.filter(o => o.status === 'Pending').length;
    const todayUniqueCustomers = new Set(todayOrders.map(o => (o as any).customer_id || (o as any).customerId).filter(Boolean)).size;
    // Active tables proxy: count today's distinct table/order sessions (pending + recently completed)
    const activeTables = todayOrders.filter(o => o.status === 'Pending' || (now - o.timestamp) < 2 * 60 * 60 * 1000).length;

    const validProductIds = new Set(products.map(p => p.id));
    const activeProductVariants = products.length === 0 ? [] : productVariants.filter(v => validProductIds.has(v.productId));

    const inventoryVal = products.reduce((sum, p) => sum + ((p.price || p.sellingPrice || 0) * (p.stock || 0)), 0);

    const simpleLowStock  = products.filter(p => !p.hasVariants && p.stock < 10 && p.stock >= 0).length;
    const variantLowStock = activeProductVariants.filter(v => v.stock < (v.reorderLevel ?? 5) && v.stock >= 0).length;
    const lowStockCount   = products.length === 0 ? 0 : (simpleLowStock + variantLowStock);

    const outOfStockCount = products.length === 0 ? 0 : (
      products.filter(p => !p.hasVariants && p.stock <= 0).length +
      activeProductVariants.filter(v => v.stock <= 0).length
    );

    let todayCOGS = 0;
    todayOrders.forEach(o => {
      o.items.forEach(item => {
        todayCOGS += costLookup.getItemCOGS(item);
      });
    });
    const todayGrossProfit = Math.max(0, totalSales - todayCOGS);
    const todayMargin = totalSales > 0 ? ((todayGrossProfit / totalSales) * 100).toFixed(1) : '0.0';

    const nearExpiryCount = products.length === 0 ? 0 : products.filter(p => {
      if (!p.expiryDate) return false;
      return (new Date(p.expiryDate).getTime() - now) < 90 * 24 * 60 * 60 * 1000;
    }).length;

    const totalSavings  = products.filter(p => p.category === 'Savings').reduce((sum, p) => sum + (p.stock * p.price), 0) / 10;
    const totalLoans    = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const unsyncedCount = validOrders.filter(o => o.syncStatus !== 'Synced').length;

    // SACCO: member growth vs last month
    const lastMonthStart = new Date(now); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1); lastMonthStart.setDate(1); lastMonthStart.setHours(0,0,0,0);
    const thisMonthStart = new Date(now); thisMonthStart.setDate(1); thisMonthStart.setHours(0,0,0,0);
    const newCustomersThisMonth = customers.filter(c => (c as any).created_at >= thisMonthStart.getTime()).length;
    const newCustomersLastMonth = customers.filter(c => (c as any).created_at >= lastMonthStart.getTime() && (c as any).created_at < thisMonthStart.getTime()).length;
    const customerTrend: 'up' | 'down' | null = newCustomersLastMonth === 0
      ? (newCustomersThisMonth > 0 ? 'up' : null)
      : newCustomersThisMonth >= newCustomersLastMonth ? 'up' : 'down';
    const customerTrendPct = newCustomersLastMonth === 0
      ? (newCustomersThisMonth > 0 ? `+${newCustomersThisMonth} this month` : undefined)
      : `${customerTrend === 'up' ? '+' : '−'}${Math.abs(((newCustomersThisMonth - newCustomersLastMonth) / newCustomersLastMonth) * 100).toFixed(0)}% vs last month`;

    const topProduct = (() => {
      const map: Record<string, { name: string; qty: number; rev: number }> = {};
      for (const o of validOrders) {
        for (const item of o.items) {
          if (!map[item.productId]) map[item.productId] = { name: item.name, qty: 0, rev: 0 };
          map[item.productId].qty += item.quantity;
          map[item.productId].rev += item.price * item.quantity;
        }
      }
      return Object.values(map).sort((a, b) => b.rev - a.rev)[0] || null;
    })();


    return {
      totalSales, yesterdaySales, allSales,
      salesTrend, salesTrendPct,
      completedOrders, pendingOrders,
      todayPendingOrders, activeTables, todayUniqueCustomers,
      inventoryVal, lowStockCount, outOfStockCount,
      activeVariantCount: activeProductVariants.length,
      todayCOGS, todayGrossProfit, todayMargin,
      nearExpiryCount, totalSavings, totalLoans,
      customerCount: customers.length, supplierCount: suppliers.length,
      customerTrend, customerTrendPct,
      unsyncedCount, topProduct,
      todayOrderCount: todayOrders.length,
    };
  }, [products, productVariants, orders, customers, suppliers, costLookup]);

  // ── Chart Data ─────────────────────────────────────────────────────────────

  const revenueChartData = useMemo(() => {
    const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DAY_LABELS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const now = new Date();

    if (activeModule === 'SACCO') {
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const mOrders = validOrders.filter(o => {
          const od = new Date(o.timestamp);
          return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
        });
        const Savings = mOrders.reduce((s, o) => s + o.total, 0);
        return { name: MONTH_LABELS[d.getMonth()], Savings, Loans: 0, Revenue: 0, Profit: 0 };
      });
    }

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      const dayOrders = validOrders.filter(o => {
        const od = new Date(o.timestamp);
        return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth() && od.getDate() === d.getDate();
      });
      const Revenue = dayOrders.reduce((s, o) => s + o.total, 0);
      let dayCOGS = 0;
      dayOrders.forEach(o => {
        o.items.forEach(item => {
          dayCOGS += costLookup.getItemCOGS(item);
        });
      });
      const Profit = Math.max(0, Revenue - dayCOGS);
      return { name: DAY_LABELS[d.getDay()], Revenue, Profit, Savings: 0, Loans: 0 };
    });
  }, [validOrders, activeModule, costLookup]);

  const paymentData = useMemo(() => {
    const methods: Record<string, number> = {};
    validOrders.forEach(o => { const m = o.paymentMethod || 'Other'; methods[m] = (methods[m] || 0) + 1; });
    const total = Object.values(methods).reduce((s, v) => s + v, 0) || 1;
    const COLORS: Record<string, string> = {
      'M-Pesa': '#10b981', 'Cash': '#3b82f6', 'Card': '#f59e0b',
      'Bank Card / Credit': '#f59e0b', 'Mobile Money': '#10b981',
    };
    return Object.entries(methods).map(([name, count], idx) => ({
      name,
      value: Math.round((count / total) * 100),
      color: COLORS[name] || ['#6366f1','#ec4899','#14b8a6','#f59e0b','#ef4444'][idx % 5],
    }));
  }, [validOrders]);

  // Top products bar chart data
  const topProductsData = useMemo(() => {
    const map: Record<string, { name: string; Revenue: number; Units: number }> = {};
    for (const o of validOrders) {
      for (const item of o.items) {
        if (!map[item.productId]) map[item.productId] = { name: item.name.slice(0, 14), Revenue: 0, Units: 0 };
        map[item.productId].Revenue += item.price * item.quantity;
        map[item.productId].Units   += item.quantity;
      }
    }
    return Object.values(map).sort((a, b) => b.Revenue - a.Revenue).slice(0, 6);
  }, [validOrders]);

  // ── Onboarding ─────────────────────────────────────────────────────────────

  const renderOnboarding = () => (
    <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-8 shadow-sm">
      <div className="max-w-2xl mx-auto text-center py-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h3 className="text-xl font-black text-slate-800 dark:text-white">Welcome to DukaPos! 🎉</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
          Your clean workspace is ready. Follow these quick steps to set up your business and start taking sales.
        </p>
        <div className="grid gap-4 mt-8 text-left sm:grid-cols-2">
          {[
            { step: '01', title: 'Add Products', desc: 'Define your inventory items, categories & attributes.', label: 'Go to Inventory', tab: 'Inventory', Icon: Package, gradient: 'from-blue-500 to-cyan-500' },
            { step: '02', title: 'Register Suppliers', desc: 'Configure suppliers and default warehouse settings.', label: 'Go to Purchasing', tab: 'Purchasing', Icon: Truck, gradient: 'from-amber-500 to-orange-500' },
            { step: '03', title: 'Add Customers', desc: 'Register customers for CRM tracking and credit billing.', label: 'Go to Customers', tab: 'Customers', Icon: Users, gradient: 'from-emerald-500 to-teal-500' },
            { step: '04', title: 'Launch POS Checkout', desc: 'Open the sales terminal, scan items, and cash out.', label: 'Open POS Terminal', tab: 'POS', Icon: DollarSign, gradient: 'from-indigo-500 to-purple-500' },
          ].map(({ step, title, desc, label, tab, Icon, gradient }) => (
            <div
              key={step}
              className="p-5 border border-slate-100 dark:border-darkbg-border rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between bg-slate-50/50 dark:bg-darkbg/30"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 tracking-widest">STEP {step}</span>
                  <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white mt-3">{title}</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">{desc}</p>
              </div>
              <button
                onClick={() => setActiveTab(tab as any)}
                className="mt-5 flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:gap-2.5 transition-all"
              >
                <span>{label}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── KPI Grid Config ────────────────────────────────────────────────────────

  const kpiCards = useMemo((): KPICardProps[] => {
    if (activeModule === 'BusinessConsultant') return [
      { title: 'Total Clients',         value: '48 active',     desc: 'Directory portfolio',              icon: <Users className="h-5 w-5"/>,       accent: '#6366f1', trend: 'up', trendLabel: '+5 this month' },
      { title: 'Active Engagements',    value: '18 projects',   desc: 'Retainer & advisory projects',     icon: <Briefcase className="h-5 w-5"/>,    accent: '#3b82f6' },
      { title: 'Monthly Revenue',       value: 'Tsh 42.5M',     desc: 'Accrued consulting income',        icon: <DollarSign className="h-5 w-5"/>,   accent: '#f59e0b', trend: 'up' },
      { title: 'Utilization Rate',      value: '84.2%',         desc: 'Target utilization >80%',          icon: <TrendingUp className="h-5 w-5"/>,   accent: '#10b981', trend: 'up' },
      { title: 'Billable Hours',        value: '320 hrs',       desc: 'This month to date',               icon: <Clock className="h-5 w-5"/>,        accent: '#f43f5e', trend: 'up' },
      { title: 'Proposal Conversion',   value: '68.5%',         desc: 'Sent vs accepted proposals',       icon: <BarChart2 className="h-5 w-5"/>,    accent: '#10b981', trend: 'up' },
      { title: 'Upcoming Meetings',     value: '12 scheduled',  desc: 'Next 7 days',                      icon: <Calendar className="h-5 w-5"/>,     accent: '#3b82f6' },
      { title: 'Expiring Contracts',    value: '3 expiring',    desc: 'Renewals pending review',          icon: <AlertTriangle className="h-5 w-5"/>,accent: '#ef4444' },
    ];

    switch (activeModule) {
      case 'Retail':
        return [
          { title: "Today's Sales",       value: fmtCcy(stats.totalSales),            desc: `${stats.todayOrderCount} transactions · ${stats.completedOrders} completed`,   icon: <DollarSign className="h-5 w-5"/>,   accent: '#3b82f6', trend: stats.salesTrend, trendLabel: stats.salesTrendPct },
          { title: 'Gross Profit (Real)', value: fmtCcy(stats.todayGrossProfit),     desc: stats.totalSales > 0 ? `${stats.todayMargin}% real margin on today's sales` : 'No sales recorded today', icon: <TrendingUp className="h-5 w-5"/>, accent: '#10b981', trend: stats.salesTrend, trendLabel: stats.salesTrendPct },
          { title: 'Total Products',      value: products.length,                     desc: `${stats.activeVariantCount} variants · ${stats.supplierCount} suppliers`,        icon: <Package className="h-5 w-5"/>,      accent: '#f59e0b' },
          { title: 'Stock Alerts',        value: stats.lowStockCount + stats.outOfStockCount, desc: `${stats.outOfStockCount} out of stock · ${stats.lowStockCount} low`,   icon: <AlertTriangle className="h-5 w-5"/>,accent: '#ef4444' },
          { title: 'Customer Debts',      value: fmtCcy(stats.totalLoans),            desc: `${stats.customerCount} registered customers`,                                   icon: <Users className="h-5 w-5"/>,        accent: '#6366f1' },
          { title: 'Inventory Value',     value: fmtCcy(stats.inventoryVal),          desc: 'Retail value of all stocked items',                                             icon: <PiggyBank className="h-5 w-5"/>,    accent: '#8b5cf6' },
          { title: 'Pending Sync',        value: stats.unsyncedCount,                 desc: 'Orders queued for server sync',                                                 icon: <RefreshCw className="h-5 w-5"/>,    accent: '#f97316' },
          { title: 'Top Product',         value: stats.topProduct?.name || '—',       desc: stats.topProduct ? `${fmtCcy(stats.topProduct.rev)} revenue` : 'No sales yet',  icon: <Star className="h-5 w-5"/>,         accent: '#ec4899' },
        ];

      case 'Restaurant': {
        // Active tables = orders still pending or completed within last 2 hours (live service window)
        const activeTablesLabel = stats.activeTables > 0 ? `${stats.activeTables} active` : 'None active';
        const kitchenQueueLabel = stats.todayPendingOrders > 0 ? `${stats.todayPendingOrders} orders` : 'Queue clear';
        const kitchenTrend: 'up' | 'down' | null = stats.todayPendingOrders > 5 ? 'down' : stats.todayPendingOrders > 0 ? 'up' : null;
        return [
          { title: 'Sales Today',    value: fmtCcy(stats.totalSales),  desc: `${stats.todayOrderCount} orders served today`,            icon: <DollarSign className="h-5 w-5"/>,   accent: '#3b82f6', trend: stats.salesTrend, trendLabel: stats.salesTrendPct },
          { title: 'Active Service', value: activeTablesLabel,          desc: 'Live orders in service window (last 2h)',                  icon: <Layers className="h-5 w-5"/>,       accent: '#10b981' },
          { title: 'Kitchen Queue',  value: kitchenQueueLabel,          desc: stats.todayPendingOrders > 0 ? 'Pending orders in prep' : 'All orders fulfilled', icon: <Clock className="h-5 w-5"/>,  accent: '#f59e0b', trend: kitchenTrend, trendLabel: stats.todayPendingOrders > 5 ? 'High load' : undefined },
          { title: 'Low Ingredients',value: stats.lowStockCount,        desc: 'Menu items to restock now',                              icon: <AlertTriangle className="h-5 w-5"/>,accent: '#ef4444' },
        ];
      }

      case 'Pharmacy': {
        // Pending Rx = pending orders for pharmacy module
        const pendingRx = stats.pendingOrders;
        const rxTrend: 'up' | 'down' | null = pendingRx > 10 ? 'down' : pendingRx > 0 ? 'up' : null;
        return [
          { title: 'Sales Today',          value: fmtCcy(stats.totalSales),  desc: `${stats.todayOrderCount} prescriptions dispensed`,        icon: <DollarSign className="h-5 w-5"/>,   accent: '#3b82f6', trend: stats.salesTrend, trendLabel: stats.salesTrendPct },
          { title: 'Pending Rx',           value: pendingRx > 0 ? `${pendingRx} pending` : 'Queue clear', desc: 'Orders awaiting pharmacist validation', icon: <Clock className="h-5 w-5"/>, accent: '#f59e0b', trend: rxTrend, trendLabel: pendingRx > 10 ? 'High queue' : undefined },
          { title: 'Near-Expiry Alerts',   value: stats.nearExpiryCount,     desc: 'Medicines expiring within 90 days',                       icon: <AlertTriangle className="h-5 w-5"/>,accent: '#ef4444' },
          { title: 'Critically Low Drugs', value: stats.lowStockCount,       desc: 'Restock required immediately',                            icon: <Package className="h-5 w-5"/>,      accent: '#8b5cf6' },
        ];
      }

      case 'SACCO':
        return [
          { title: 'Deposits & Savings',   value: fmtCcy(stats.totalSavings),        desc: 'Member savings pool balance',     icon: <PiggyBank className="h-5 w-5"/>, accent: '#10b981', trend: 'up' },
          { title: 'Outstanding Loans',    value: fmtCcy(stats.totalLoans),           desc: 'Active lending portfolio value',  icon: <Briefcase className="h-5 w-5"/>, accent: '#3b82f6' },
          { title: 'Interest Earned YTD',  value: fmtCcy(stats.totalLoans * 0.12),   desc: 'Accrued yield from lending',      icon: <TrendingUp className="h-5 w-5"/>, accent: '#f59e0b', trend: 'up' },
          { title: 'SACCO Members',        value: stats.customerCount,                desc: 'Registered active savers',        icon: <Users className="h-5 w-5"/>,     accent: '#6366f1', trend: stats.customerTrend ?? undefined, trendLabel: stats.customerTrendPct },
        ];

      case 'Poultry':
        return [
          { title: 'Total Animals',        value: '520 animals',   desc: 'Livestock & poultry register',    icon: <Footprints className="h-5 w-5"/>, accent: '#3b82f6' },
          { title: 'Active Flocks',        value: '4 flocks',      desc: 'Egg-layer production batches',    icon: <Egg className="h-5 w-5"/>,        accent: '#10b981' },
          { title: 'Daily Production',     value: '450 eggs',      desc: '90% production yield today',      icon: <TrendingUp className="h-5 w-5"/>, accent: '#f59e0b', trend: 'up' },
          { title: 'Mortality Rate',       value: '1.2%',          desc: 'Target mortality <3.0%',          icon: <AlertTriangle className="h-5 w-5"/>, accent: '#ef4444' },
        ];

      default:
        return [
          { title: 'Sales Today',          value: fmtCcy(stats.totalSales),   desc: 'From local POS checkouts',         icon: <DollarSign className="h-5 w-5"/>, accent: '#3b82f6', trend: stats.salesTrend, trendLabel: stats.salesTrendPct },
          { title: 'Inventory Valuation',  value: fmtCcy(stats.inventoryVal), desc: 'Total stock value at retail',      icon: <Package className="h-5 w-5"/>,   accent: '#10b981' },
          { title: 'Active Contacts',      value: stats.customerCount,         desc: 'Linked partners & clients',        icon: <Users className="h-5 w-5"/>,     accent: '#6366f1' },
          { title: 'System Alerts',        value: stats.lowStockCount,         desc: 'Items on restock warning list',    icon: <AlertTriangle className="h-5 w-5"/>, accent: '#f59e0b' },
        ];
    }
  }, [activeModule, stats, products, productVariants]);


  // ── Render ─────────────────────────────────────────────────────────────────

  const hasToday = orders.some(o => o.timestamp >= new Date().setHours(0,0,0,0));

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Business Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live analytics for{' '}
            <span className="font-bold text-slate-700 dark:text-slate-300">{currentBranch?.name || 'Main Branch'}</span>
            {' · '}
            <span className="font-bold text-primary">{role}</span>
            {' · '}
            <span className="text-slate-400">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stats.unsyncedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 px-2.5 py-1 rounded-full">
              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              {stats.unsyncedCount} pending sync
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 px-2.5 py-1">
            <Zap className="h-2.5 w-2.5" />
            Offline Enabled
          </span>
          <button
            onClick={() => setActiveTab('POS')}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover shadow-sm transition-all hover:shadow-md"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Launch POS
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card, i) => (
          <KPICard key={i} {...card} />
        ))}
      </div>

      {/* ── Onboarding Banner (When workspace has no products/sales yet) ── */}
      {isCleanTenant && renderOnboarding()}

      {/* ── Charts Row ─────────────────────────────────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-3">

            {/* Main Revenue / Trend Chart */}
            <Card className="lg:col-span-2 rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-black">
                      {activeModule === 'SACCO' ? 'Savings vs Loan Trends' : 'Sales Revenue & Profit'}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {activeModule === 'SACCO' ? '6-month member activity' : 'Last 7 days performance'}
                    </CardDescription>
                  </div>
                  {hasToday && (
                    <span className="text-[10px] font-black bg-primary/10 text-primary dark:bg-primary/20 px-2.5 py-1 rounded-full">
                      Today: {fmtCcy(stats.totalSales)}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="h-64 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData} margin={{ top: 5, right: 8, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="gradPro" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-darkbg-border/30" />
                    <XAxis dataKey="name" fontSize={10} stroke="#94A3B8" tick={{ fontWeight: 600 }} />
                    <YAxis fontSize={10} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
                    {activeModule === 'SACCO' ? (
                      <>
                        <Area type="monotone" dataKey="Savings" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#gradPro)" dot={{ fill: '#10b981', r: 3 }} />
                        <Area type="monotone" dataKey="Loans"   stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#gradRev)" dot={{ fill: '#3b82f6', r: 3 }} />
                      </>
                    ) : (
                      <>
                        <Area type="monotone" dataKey="Revenue" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#gradRev)" dot={{ fill: '#3b82f6', r: 3 }} />
                        <Area type="monotone" dataKey="Profit"  stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#gradPro)" dot={{ fill: '#10b981', r: 3 }} />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Payment Methods Donut */}
            <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black">Payment Channels</CardTitle>
                <CardDescription className="text-[11px]">Breakdown by payment method</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center pb-4">
                {paymentData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-52 text-center">
                    <div className="h-16 w-16 rounded-full border-4 border-dashed border-slate-200 dark:border-darkbg-border flex items-center justify-center mb-3">
                      <span className="text-2xl">💳</span>
                    </div>
                    <p className="text-xs font-bold text-slate-400">No transactions yet</p>
                    <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">Payment channels appear after first sale</p>
                  </div>
                ) : (
                  <>
                    <div className="h-40 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={paymentData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                            {paymentData.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
                          </Pie>
                          <Tooltip formatter={(v) => `${v}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 w-full space-y-2 px-1">
                      {paymentData.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[100px]">{item.name}</span>
                          </div>
                          <span className="font-black text-slate-800 dark:text-white">{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Top Products + Recent Orders ────────────────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-5">

            {/* Top Products Bar Chart */}
            {topProductsData.length > 0 && (
              <Card className="lg:col-span-2 rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-black">Top Products</CardTitle>
                  <CardDescription className="text-[11px]">By revenue contribution</CardDescription>
                </CardHeader>
                <CardContent className="h-56 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductsData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" className="dark:stroke-darkbg-border/30" />
                      <XAxis type="number" fontSize={9} stroke="#94A3B8" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                      <YAxis type="category" dataKey="name" fontSize={9} stroke="#94A3B8" width={75} tick={{ fontWeight: 600 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Revenue" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Recent Orders Table */}
            <Card className={`${topProductsData.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'} rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm`}>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black">Recent Orders</CardTitle>
                  <CardDescription className="text-[11px]">Latest {Math.min(orders.length, 6)} transactions</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black bg-primary/10 text-primary dark:bg-primary/20 px-2.5 py-1 rounded-full">
                    {orders.length} total
                  </span>
                  <button
                    onClick={() => setActiveTab('Receipts')}
                    className="text-[10px] font-bold text-slate-400 hover:text-primary transition flex items-center gap-1"
                  >
                    View all <ArrowRight className="h-2.5 w-2.5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="p-3 pl-5">Order</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Items</th>
                        <th className="p-3">Total</th>
                        <th className="p-3">Channel</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-darkbg-border/20">
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-10 text-center text-slate-400 italic text-xs">
                            No orders logged yet. Start selling from the POS terminal.
                          </td>
                        </tr>
                      ) : (
                        orders.slice(-6).reverse().map(order => (
                          <tr key={order.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors text-xs">
                            <td className="p-3 pl-5 font-mono font-bold text-slate-600 dark:text-slate-400 text-[10px]">{order.id.slice(-8).toUpperCase()}</td>
                            <td className="p-3 text-slate-400 whitespace-nowrap">
                              <span className="block">{fmtDate(order.timestamp)}</span>
                              <span className="text-[10px] text-slate-300 dark:text-slate-600">{fmtTime(order.timestamp)}</span>
                            </td>
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">
                              {order.items.reduce((s, i) => s + i.quantity, 0)} items
                            </td>
                            <td className="p-3 font-black text-slate-900 dark:text-white">{fmtCcy(order.total)}</td>
                            <td className="p-3">
                              <span className="inline-flex rounded-lg bg-slate-100 dark:bg-darkbg-border px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                {order.paymentMethod}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${
                                order.syncStatus === 'Synced'
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                                  : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 animate-pulse'
                              }`}>
                                {order.syncStatus === 'Synced' ? <CheckCircle className="h-2.5 w-2.5" /> : <RefreshCw className="h-2.5 w-2.5" />}
                                {order.syncStatus}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
    </div>
  );
};
