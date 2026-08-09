import React from 'react';
import { useModule } from '../../context/ModuleContext';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, ShoppingCart, Package, LineChart, Settings as SettingsIcon,
  Building2, CreditCard, Users, ShieldCheck
} from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useModule();
  const { role, isSuperAdminView } = useAuth();

  const isSA = isSuperAdminView || role === 'Super Admin';

  // Super Admin Navigation Items
  const isSAOverviewActive = activeTab === 'Overview' || activeTab === 'Super Admin';
  const isSATenantsActive = activeTab === 'Tenant Directory' || activeTab === 'Tenants';
  const isSABillingActive = activeTab === 'Billing & Subscriptions' || activeTab === 'Subscriptions';
  const isSAUsersActive = activeTab === 'Users & Roles' || activeTab === 'Users';
  const isSASecurityActive = activeTab === 'Security Center' || activeTab === 'Platform Monitoring';

  const saNavItems = [
    {
      name: 'Overview',
      tabKey: 'Overview',
      icon: <LayoutDashboard className="h-5 w-5" />,
      isActive: isSAOverviewActive
    },
    {
      name: 'Tenants',
      tabKey: 'Tenant Directory',
      icon: <Building2 className="h-5 w-5" />,
      isActive: isSATenantsActive
    },
    {
      name: 'Billing',
      tabKey: 'Billing & Subscriptions',
      icon: <CreditCard className="h-5 w-5" />,
      isActive: isSABillingActive
    },
    {
      name: 'Users',
      tabKey: 'Users & Roles',
      icon: <Users className="h-5 w-5" />,
      isActive: isSAUsersActive
    },
    {
      name: 'Security',
      tabKey: 'Security Center',
      icon: <ShieldCheck className="h-5 w-5" />,
      isActive: isSASecurityActive
    }
  ];

  // Tenant Operations Navigation Items
  const isPosActive = [
    'POS', 'New Sale', 'Sales History', 'Returns', 
    'Counter POS', 'Bar Counter POS', 'Active Tables', 'Open Tabs & Bills', 'Order History'
  ].includes(activeTab);

  const isInventoryActive = [
    'Inventory', 'Products', 'Categories', 'Categories & Brands', 'Categories & brands',
    'Medicines', 'Stock Sync Engine', 'Stock Sync', 'Stock Ledger Sync',
    'Product Bundles & Kits', 'Product Bundles', 'Bundles & Kits',
    'Stock Adjustment', 'Stock Transfer', 'Stock Alerts', 'Beverage Inventory'
  ].includes(activeTab);

  const isReportsActive = [
    'Reports', 'Sales', 'Profit', 'Tax', 'Inventory Valuation', 'Stock Valuation', 'Daily Sales Summary', 
    'Fast-Moving Drinks', 'Pour Variance Report', 'Profit Margin Analysis', 'Reports & Analytics',
    'Customers Report', 'Expenses Report', 'Payment Methods', 'Stock Movement', 'Purchasing Report',
    'Discounts', 'Returns & Refunds', 'Branch Comparison', 'Cashier Performance', 'Receivables Aging'
  ].includes(activeTab);

  const isSettingsActive = [
    'Settings', 'General Settings', 'Business Profile & Identity', 'POS Configurations',
    'Inventory Rules', 'Tax & Billing', 'Security Policies', 'Terminals & Sessions',
    'Subscriptions & Billing', 'Developer Options', 'User Manual & Guide', 'User Manual',
    'Change Log', 'Plans & Pricing', 'Coupons', 'Grace Periods', 'Features',
    'Usage Meter', 'Audit Log', 'Employees'
  ].includes(activeTab);

  const isDashboardActive = activeTab === 'Dashboard';

  const tenantNavItems = [
    { 
      name: 'Dashboard', 
      tabKey: 'Dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      isActive: isDashboardActive 
    },
    { 
      name: 'POS', 
      tabKey: 'POS',
      icon: <ShoppingCart className="h-5 w-5" />,
      isActive: isPosActive 
    },
    { 
      name: 'Inventory', 
      tabKey: 'Inventory',
      icon: <Package className="h-5 w-5" />,
      isActive: isInventoryActive 
    },
    { 
      name: 'Reports', 
      tabKey: 'Reports',
      icon: <LineChart className="h-5 w-5" />,
      isActive: isReportsActive 
    },
    { 
      name: 'Settings', 
      tabKey: 'Settings',
      icon: <SettingsIcon className="h-5 w-5" />,
      isActive: isSettingsActive 
    }
  ];

  const navItems = isSA ? saNavItems : tenantNavItems;

  return (
    <nav 
      aria-label="Mobile Navigation Footer" 
      className="fixed bottom-0 inset-x-0 z-40 flex h-16 w-full items-center justify-around border-t border-slate-200/90 bg-white/95 px-2 py-1.5 shadow-2xl backdrop-blur-xl dark:border-darkbg-border dark:bg-darkbg-card/95 md:hidden transition-all"
    >
      <div className="flex w-full items-center justify-between max-w-full px-1">
        {navItems.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setActiveTab(item.tabKey)}
            aria-current={item.isActive ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center space-y-0.5 rounded-xl px-1 py-1 transition-all duration-200 active:scale-95 ${
              item.isActive
                ? 'text-primary dark:text-primary-dark font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
            }`}
          >
            {item.isActive && (
              <span className="absolute -top-1.5 h-1 w-6 rounded-full bg-primary dark:bg-primary-dark shadow-sm" />
            )}
            {item.icon}
            <span className="text-[10px] tracking-tight truncate max-w-full">{item.name}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
