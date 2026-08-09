import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModuleProvider, useModule } from './context/ModuleContext';
import { SyncProvider, useSyncState } from './context/SyncContext';
import { initProductionDatabase, db } from './db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';

// Layout & Views
import { TopBar } from './components/Layout/TopBar';
import { Sidebar } from './components/Layout/Sidebar';
import { BottomNav } from './components/Layout/BottomNav';
import { ToastProvider } from './components/UI/Toast';
import { EmptyState } from './components/UI/EmptyState';

const Dashboard = lazy(() => import('./components/Views/Dashboard').then(m => ({ default: m.Dashboard })));
const POS = lazy(() => import('./components/Views/POS').then(m => ({ default: m.POS })));
const Inventory = lazy(() => import('./components/Views/Inventory').then(m => ({ default: m.Inventory })));
const Customers = lazy(() => import('./components/Views/Customers').then(m => ({ default: m.Customers })));
const Reports = lazy(() => import('./components/Views/Reports/index').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('./components/Views/Settings').then(m => ({ default: m.Settings })));

import { Purchasing } from './components/Views/Purchasing';
const SuperAdminCPanel = lazy(() => import('./components/SuperAdminCPanel').then(m => ({ default: m.SuperAdminCPanel })));
const AuthGateway = lazy(() => import('./components/Views/AuthGateway').then(m => ({ default: m.AuthGateway })));
const UsersRoles = lazy(() => import('./components/Views/UsersRoles').then(m => ({ default: m.UsersRoles })));
const Expenses = lazy(() => import('./components/Views/Expenses').then(m => ({ default: m.Expenses })));
const BusinessConsulting = lazy(() => import('./components/Views/BusinessConsulting').then(m => ({ default: m.BusinessConsulting })));
const TechnicalCompany = lazy(() => import('./components/Views/TechnicalCompany').then(m => ({ default: m.TechnicalCompany })));
const AIInsightsView = lazy(() => import('./components/Views/AIInsightsView').then(m => ({ default: m.AIInsightsView })));
const CashDrawer = lazy(() => import('./components/Views/CashDrawer/CashDrawer').then(m => ({ default: m.CashDrawer })));
const Receipts = lazy(() => import('./components/Views/Receipts').then(m => ({ default: m.Receipts })));
import { useSubscription } from './hooks/useSubscription';
import { Search, Lock } from 'lucide-react';
import { Dialog, Badge } from './components/UI/custom-ui';

const DukaPosAppContent: React.FC = () => {
  const { activeTab, setActiveTab, setActiveModule } = useModule();
  const { toggleTheme, role, isSuperAdminView, user, currentTenant, isInitializing } = useAuth();
  const { isOnline, syncFromServer } = useSyncState();
  const sub = useSubscription();


  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const [searchSelectedIdx, setSearchSelectedIdx] = useState(0);

  // Initialize production database on mount (idempotent — safe to call multiple times)
  useEffect(() => {
    initProductionDatabase();
  }, []);

  // Bootstrap pull: whenever a user logs in, immediately fetch their products
  // from the server. This is the key fix for Device B seeing nothing on login.
  useEffect(() => {
    if (user && user.tenant_id && user.role !== 'Super Admin') {
      syncFromServer(user.tenant_id).catch(err =>
        console.warn('[SyncBootstrap] Initial server pull failed:', err)
      );

      import('./services/offlineSyncWorker').then(({ offlineSyncWorker }) => {
        offlineSyncWorker.startWorker(user.tenant_id, user.branch_id || 'branch-main');
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Listen to keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset selection index when search results change
  useEffect(() => { setSearchSelectedIdx(0); }, [searchVal]);


  // --- IndexedDB Queries for Global Search ---
  const allProducts = useLiveQuery(() => db.products.toArray()) || [];
  const allCustomers = useLiveQuery(() => db.customers.toArray()) || [];
  const tenantModules = useLiveQuery(() => 
    db.tenantModules.where('tenant_id').equals(currentTenant?.id || '').and(m => m.enabled).toArray()
  , [currentTenant?.id]);

  // Filter products, customers and actions based on search input
  const searchResults = useMemo(() => {
    if (!searchVal.trim()) return { products: [], customers: [], commands: [] };

    const val = searchVal.toLowerCase();

    // 1. Search products
    const prods = allProducts.filter(p => 
      p.name.toLowerCase().includes(val) || 
      p.category.toLowerCase().includes(val) ||
      p.module.toLowerCase().includes(val)
    ).slice(0, 4);

    // 2. Search customers
    const custs = allCustomers.filter(c => 
      c.name.toLowerCase().includes(val) || 
      c.phone.includes(val)
    ).slice(0, 4);

    // 3. Search commands / navigation shortcuts
    const subscribedKeys = (tenantModules || []).map(m => m.module_key);
    const hasSubscribedModules = tenantModules && tenantModules.length > 0;

    const commandsList = [
      { key: 'Restaurant', name: 'Switch to Restaurant Module', action: () => { setActiveModule('Restaurant'); setIsSearchModalOpen(false); } },
      { key: 'Pharmacy', name: 'Switch to Pharmacy Module', action: () => { setActiveModule('Pharmacy'); setIsSearchModalOpen(false); } },
      { key: 'Retail', name: 'Switch to Retail Module', action: () => { setActiveModule('Retail'); setIsSearchModalOpen(false); } },
      { key: 'SACCO', name: 'Switch to SACCO Module', action: () => { setActiveModule('SACCO'); setIsSearchModalOpen(false); } },
      { key: 'Bar', name: 'Switch to Bar & Beverage Module', action: () => { setActiveModule('Bar'); setIsSearchModalOpen(false); } },
      { key: 'BusinessConsultant', name: 'Switch to Business Consultant Module', action: () => { setActiveModule('BusinessConsultant'); setIsSearchModalOpen(false); } },
      { key: 'TechnicalCompany', name: 'Switch to Technical & Engineering Module', action: () => { setActiveModule('TechnicalCompany'); setIsSearchModalOpen(false); } },
      { key: 'AlwaysShow', name: 'Toggle Dark / Light Theme', action: () => { toggleTheme(); setIsSearchModalOpen(false); } },
      { key: 'AlwaysShow', name: 'Launch POS Checkout Screen', action: () => { setActiveTab('POS'); setIsSearchModalOpen(false); } },
      { key: 'AlwaysShow', name: 'Switch to Users & Roles Settings', action: () => { setActiveTab('Users & Roles'); setIsSearchModalOpen(false); } }
    ].filter(cmd => cmd.key === 'AlwaysShow' || !hasSubscribedModules || subscribedKeys.includes(cmd.key));
    const cmds = commandsList.filter(c => c.name.toLowerCase().includes(val));

    return { products: prods, customers: custs, commands: cmds };
  }, [searchVal, allProducts, allCustomers, tenantModules, setActiveModule, setActiveTab, toggleTheme]);

  if (isInitializing) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans select-none">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-24 w-24 animate-ping rounded-full border-2 border-indigo-500/20"></div>
          <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          <div className="h-10 w-10 flex items-center justify-center font-bold text-lg bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30">DP</div>
        </div>
        <h2 className="mt-8 text-sm font-semibold tracking-wider uppercase text-slate-300">Synchronizing Workspace</h2>
        <p className="mt-2 text-[11px] text-slate-500 max-w-[280px] text-center leading-relaxed">
          Verifying tenant identity and downloading secure configurations from authoritative cloud database...
        </p>
      </div>
    );
  }

  // Render view depending on active navigation tab
  const renderActiveView = () => {
    console.log('renderActiveView called with activeTab =', activeTab);
    if (role === 'Super Admin' && isSuperAdminView && activeTab !== 'Users & Roles') {
      return <SuperAdminCPanel initialTab={activeTab} />;
    }

    // Billing middleware subscription enforcement
    const isLocked = sub.isHardLocked;
    const allowedTabs = [
      'Plans & Pricing', 'Coupons', 'Grace Periods', 'Features', 'Usage Meter', 'Audit Log',
      'Settings', 'General Settings', 'Users & Roles', 'Employees'
    ];

    if (isLocked && !isSuperAdminView && !allowedTabs.includes(activeTab)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 font-sans">
          <div className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-dashed border-red-200 dark:border-red-900/50 p-8 text-center shadow-lg relative overflow-hidden">
            {/* Ambient indicator */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500"></div>
            
            <div className="mx-auto h-14 w-14 rounded-2xl bg-red-50 dark:bg-red-950/20 text-red-500 flex items-center justify-center mb-5 shrink-0 animate-bounce">
              <Lock className="h-6 w-6 stroke-[2.5]" />
            </div>

            <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider">
              Workspace Access Suspended
            </h3>
            
            <Badge variant="danger" className="mt-2 text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-0.5">
              Hard Locked · Trial/Plan Expired
            </Badge>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 leading-relaxed">
              Your subscription plan <strong className="text-slate-700 dark:text-slate-200">&quot;{sub.planName}&quot;</strong> has expired. 
              The 7-day offline grace period has expired, disabling transaction processing (POS sales, ledger updates, stock adjustments, and reports).
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('Plans & Pricing')}
                className="w-full h-10 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/95 transition flex items-center justify-center gap-1.5 shadow-md shadow-primary/20"
              >
                💳 Renew Subscription / Add Coupon
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('General Settings')}
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-darkbg-border hover:bg-slate-50 dark:hover:bg-darkbg/50 text-slate-600 dark:text-slate-400 text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                ⚙ View Settings & Export Data
              </button>
            </div>
            
            <p className="text-[10px] text-slate-400 mt-4 font-mono">
              Workspace ID: {currentTenant?.id || 'N/A'}
            </p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'Dashboard':
        return <Dashboard />;
      case 'POS':
      case 'New Sale':
      case 'Sales History':
      case 'Returns':
        return <POS />;
      case 'Inventory':
      case 'Inventory Overview':
      case 'Inventory Dashboard':
      case 'Stock Overview':
      case 'Beverage Inventory':
      case 'Products':
      case 'Categories':
      case 'Categories & Brands':
      case 'Categories & brands':
      case 'Stock Sync Engine':
      case 'Stock Sync':
      case 'Stock Ledger Sync':
      case 'Product Bundles & Kits':
      case 'Product Bundles':
      case 'Bundles & Kits':
      case 'Recipe & Pour Control':
      case 'Stock Adjustment':
      case 'Stock Adjustments':
      case 'Stock Transfer':
      case 'Stock Transfers':
      case 'Stock Alerts':
      case 'Low Stock Alerts':
      case 'Stock Count':
      case 'Medicines':
      case 'Stock Register':
      case 'Batch Management':
      case 'Expiry Tracking':
      case 'Wastage & Spillage':
      case 'Ledger Drilldown':
      case 'Inventory Reports':
        return <Inventory />;
      case 'Customers':
      case 'Members':
      case 'Patients':
        return <Customers />;
      case 'Employees':
      case 'Users & Roles':
        return <UsersRoles />;
      case 'Reports':
      case 'Reports & Analytics':
      case 'Sales':
      case 'Profit':
      case 'Inventory Valuation':
      case 'Stock Valuation':
      case 'Tax':
      case 'Customers Report':
      case 'Expenses Report':
      case 'Payment Methods':
      case 'Stock Movement':
      case 'Purchasing Report':
      case 'Discounts':
      case 'Returns & Refunds':
      case 'Branch Comparison':
      case 'Cashier Performance':
      case 'Receivables Aging':
        return <Reports />;
      case 'Settings':
      case 'General Settings':
        return <Settings />;
      case 'Business Profile & Identity':
        return <Settings initialTab="localization" />;
      case 'POS Configurations':
        return <Settings initialTab="pos" />;
      case 'Inventory Rules':
        return <Settings initialTab="inventory" />;
      case 'Tax & Billing':
        return <Settings initialTab="tax" />;
      case 'Security Policies':
        return <Settings initialTab="security" />;
      case 'Terminals & Sessions':
        return <Settings initialTab="devices" />;
      case 'Subscriptions & Billing':
        return <Settings initialTab="subscriptions" />;
      case 'Developer Options':
        return <Settings initialTab="developer" />;
      case 'User Manual & Guide':
      case 'User Manual':
        return <Settings initialTab="manual" />;
      case 'Change Log':
        return <Settings initialTab="audit" />;
      case 'Plans & Pricing':
      case 'Coupons':
      case 'Grace Periods':
      case 'Features':
      case 'Usage Meter':
      case 'Audit Log':
        return <Settings initialTab="subscriptions" />;
      // Purchasing module routes (Suppliers, POs, Warehouses)
      case 'Suppliers':
      case 'Purchasing':
      case 'Purchasing & Supplies':
      case 'Distributors & Suppliers':
        return <Purchasing initialTab="suppliers" />;
      case 'Purchase Orders':
        return <Purchasing initialTab="purchase-orders" />;
      case 'Goods Received':
      case 'Crate/Case Received':
        return <Purchasing initialTab="goods-receiving" />;
      case 'Supplier Payments':
      case 'Supplier Ledgers':
      case 'Supplier Ledger':
        return <Purchasing initialTab="payments-ledger" />;
      case 'Warehouses':
        return <Purchasing initialTab="warehouses" />;
      // Bar & Beverage module routes
      case 'Counter POS':
      case 'Bar Counter POS':
      case 'Active Tables':
      case 'Open Tabs & Bills':
      case 'Order History':
      case 'Complimentary / Spoils':
        return <POS />;
      case 'Beverage Inventory':
      case 'Stock Register':
      case 'Liquid Volume Tracking':
      case 'Empty Bottle Return':
      case 'Stock Adjustments':
      case 'Stock Alerts':
      case 'Low Stock Alerts':
        return <Inventory />;
      case 'Cocktail Recipes':
      case 'Cost-Per-Pour Mapping':
      case 'Batch Mixing':
      case 'Spillage Logs':
      case 'Recipe & Pour Control':
        return <Inventory />;
      case 'Daily Sales Summary':
      case 'Fast-Moving Drinks':
      case 'Pour Variance Report':
      case 'Profit Margin Analysis':
      case 'Tax & Excise Duty':
      case 'Reports & Analytics':
        return <Reports />;
      case 'Bartenders & Waiters':
      case 'Waiter Sales Tracking':
      case 'Attendance Register':
      case 'Tips & Commissions':
      case 'Staff & Commissions':
        return <Customers />;
      case 'Bar Setup & Tables':
      case 'Measurement Units (Pours/Bottles)':
      case 'Happy Hour Rules':
      case 'Role Permissions':
        return <Settings />;
      case 'Cash Drawer':
      case 'Cash Management':
      case 'Cash Shift':
      case 'Shift & Active Register':
      case 'Cashier Shifts':
      case 'Counter Handover':
      case 'Float Management':
      case 'Shift & Counter Management':
        return <CashDrawer initialTab="shift" />;
      case 'Cash Movement Ledger':
      case 'Cash Ledger':
        return <CashDrawer initialTab="ledger" />;
      case 'Reconciliation & Variances':
      case 'Drawer Reconciliation':
      case 'Audit & Variance Logs':
        return <CashDrawer initialTab="reconciliation" />;
      case 'Safe & Bank Deposits':
        return <CashDrawer initialTab="transfers" />;
      case 'No Sale & Event Logs':
        return <CashDrawer initialTab="events" />;
      case '15 Financial Reports':
        return <CashDrawer initialTab="reports" />;
      case 'Security & RBAC Rules':
        return <CashDrawer initialTab="security" />;
      case 'AI Cash Advisor':
        return <CashDrawer initialTab="ai" />;
      // AI Insights Engine module routes
      case 'AI Insights Engine':
      case 'AI Insights':
      case 'Business Health Score':
        return <AIInsightsView initialTab="health" />;
      case 'Sales Intelligence':
        return <AIInsightsView initialTab="sales" />;
      case 'Inventory Intelligence':
        return <AIInsightsView initialTab="inventory" />;
      case 'Profit & Pricing':
        return <AIInsightsView initialTab="profit" />;
      case 'Customer CLV':
        return <AIInsightsView initialTab="customers" />;
      case 'Cash Flow & Burn':
        return <AIInsightsView initialTab="cashflow" />;
      case 'Fraud & Security':
        return <AIInsightsView initialTab="cashiers" />;
      case 'Branch Comparison':
        return <AIInsightsView initialTab="branches" />;
      case 'Demand Forecast':
        return <AIInsightsView initialTab="forecast" />;
      case 'Vertical Advisory':
        return <AIInsightsView initialTab="industry" />;
      // Business Consultant module routes
      case 'Clients':
      case 'Client Directory':
      case 'Organizations':
      case 'Individual Clients':
      case 'Contact Persons':
      case 'Client Notes':
      case 'Client Documents':
      case 'Client Portal Access':
        return <Customers />;
      case 'Engagements':
      case 'Active Projects':
      case 'Consulting Engagements':
      case 'Business Assessments':
      case 'Strategy Sessions':
      case 'Advisory Plans':
      case 'Deliverables':
      case 'Project Timeline':
      case 'Proposals':
      case 'Create Proposal':
      case 'Proposal Templates':
      case 'Sent Proposals':
      case 'Accepted':
      case 'Rejected':
      case 'Proposal Analytics':
      case 'Contracts':
      case 'Digital Signatures':
      case 'Renewals':
      case 'Contract Templates':
      case 'Expiring Contracts':
      case 'Services':
      case 'Service Catalog':
      case 'Pricing Packages':
      case 'Retainer Plans':
      case 'Hourly Services':
      case 'Custom Services':
      case 'Service Categories':
      case 'Time Tracking':
      case 'Timesheets':
      case 'Billable Hours':
      case 'Team Time Logs':
      case 'Productivity Report':
      case 'Approval Queue':
      case 'Meetings':
      case 'Client Meetings':
      case 'Online Meetings':
      case 'Follow-ups':
      case 'Agenda':
      case 'Meeting Minutes':
      case 'Assessments':
      case 'SWOT Analysis':
      case 'Business Health Check':
      case 'Risk Assessment':
      case 'Compliance Review':
      case 'Financial Analysis':
      case 'Assessment Templates':
      case 'Strategy':
      case 'Strategic Plans':
      case 'Roadmaps':
      case 'Action Plans':
      case 'Milestones':
      case 'Progress Tracking':
      case 'Invoicing':
      case 'Quotes':
      case 'Invoices':
      case 'Payments':
      case 'Outstanding':
      case 'Recurring Billing':
      case 'Team':
      case 'Consultants':
      case 'Skills Matrix':
      case 'Certifications':
      case 'Capacity Planning':
      case 'Performance':
      case 'Leave Calendar':
      case 'Knowledge Base':
      case 'Best Practices':
      case 'SOPs':
      case 'Research Library':
      case 'Case Studies':
      case 'Internal Documents':
      case 'AI Consultant':
      case 'SWOT Generator':
      case 'Proposal Generator':
      case 'Business Plan Generator':
      case 'Financial Recommendations':
      case 'Meeting Summary':
      case 'AI Chat':
      case 'Communications':
      case 'Email Center':
      case 'SMS':
      case 'WhatsApp':
      case 'Notifications':
      case 'Activity Feed':
      case 'Administration':
      case 'Branches':
      case 'Users & Roles':
      case 'Permissions':
      case 'Workflow Automation':
      case 'Approval Rules':
      case 'Custom Fields':
      case 'Integrations':
      case 'Audit Logs':
        return <BusinessConsulting />;
      // Technical Company module routes
      case 'Technical Company':
      case 'Projects':
      case 'Project List':
      case 'Active Projects':
      case 'Completed Projects':
      case 'Milestones':
      case 'Tasks':
      case 'Project Calendar':
      case 'Resource Allocation':
      case 'Budget Tracking':
      case 'Project Documents':
      case 'Field Service':
      case 'Service Requests':
      case 'Work Orders':
      case 'Site Visits':
      case 'Maintenance Jobs':
      case 'Installation Jobs':
      case 'Emergency Calls':
      case 'Technician Schedule':
      case 'Job Completion Reports':
      case 'Technical Services':
      case 'Repairs':
      case 'Installations':
      case 'Preventive Maintenance':
      case 'Equipment Inspection':
      case 'Testing & Commissioning':
      case 'Calibration':
      case 'Troubleshooting':
      case 'Service Checklists':
      case 'Assets & Equipment':
      case 'Company Equipment':
      case 'Customer Equipment':
      case 'Asset Register':
      case 'Equipment Maintenance':
      case 'Warranty Tracking':
      case 'Asset History':
      case 'Procurement':
      case 'Supplier Management':
      case 'RFQs':
      case 'Purchase Requests':
      case 'Supplier Performance':
      case 'Workforce':
      case 'Technicians':
      case 'Engineers':
      case 'Teams':
      case 'Timesheets':
      case 'Leave Management':
      case 'Payroll Integration':
      case 'Scheduling':
      case 'Daily Schedule':
      case 'Weekly Planner':
      case 'Technician Assignment':
      case 'Route Planning':
      case 'Job Queue':
      case 'Fleet Management':
      case 'Company Vehicles':
      case 'Driver Assignment':
      case 'Fuel Usage':
      case 'Vehicle Maintenance':
      case 'GPS Tracking':
      case 'Travel Logs':
      case 'Finance':
      case 'Income':
      case 'Project Costing':
      case 'Profit Analysis':
      case 'Cash Flow':
      case 'Accounts Receivable':
      case 'Accounts Payable':
      case 'General Ledger':
      case 'Documents':
      case 'Technical Drawings':
      case 'Blueprints':
      case 'Site Photos':
      case 'Certificates':
      case 'Compliance Documents':
      case 'File Manager':
        return <TechnicalCompany />;
      // Dedicated AI Insights Engine Hub routes
      case 'AI Insights':
      case 'AI Insights Engine':
      case 'AI Consultant':
      case 'AI Assistant':
      case 'Revenue Forecast':
      case 'Predictive Maintenance':
      case 'Inventory Forecast':
      case 'Customer Insights':
      case 'Project Risk Analysis':
      case 'Smart Recommendations':
        return <AIInsightsView />;
      // Expenses module routes
      case 'Expenses':
      case 'Feed Expenses':
      case 'Medicine Expenses':
      case 'Labor Costs':
      case 'Operational Costs':
      case 'Licensing & Permits':
      case 'Damaged/Broken Stock':
        return <Expenses />;
      // Receipt Management module routes
      case 'Receipts':
      case 'Receipt Management':
      case 'Receipt History':
      case 'Receipts History':
      case 'Receit History':
        return <Receipts initialTab="history" />;
      case 'Receipt Viewer':
      case 'Print Receipt':
        return <Receipts initialTab="viewer" />;
      case 'Receipt Templates':
      case 'Receipt Template':
      case 'Receipts Templates':
        return <Receipts initialTab="templates" />;
      case 'Receipt Analytics':
      case 'Receipt Analysis':
      case 'Receipts Analytics':
        return <Receipts initialTab="analytics" />;
      case 'Receipt Verification':
      case 'Verify Receipt':
      case 'Receipts Verification':
        return <Receipts initialTab="verification" />;
      case 'Receipt Archive':
      case 'Receipts Archive':
        return <Receipts initialTab="archive" />;
      default:
        return <Dashboard />;
    }
  };

  if (!user) {
    return <AuthGateway />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-darkbg select-none">
      {/* Offline Status Bar */}
      {!isOnline && (
        <div className="bg-slate-900 text-slate-200 border-b border-amber-500/30 py-1.5 px-4 text-xs font-medium flex items-center justify-between shadow-md z-50 transition-all">
          <div className="flex items-center space-x-2.5 mx-auto sm:mx-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="font-semibold text-amber-400 tracking-wide uppercase text-[11px]">Offline Mode Active</span>
            <span className="hidden sm:inline text-slate-400">•</span>
            <span className="hidden sm:inline text-slate-300">Transactions & inventory changes saved locally to workspace</span>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-[11px]">
            <span className="text-slate-400">Auto-sync queue active</span>
            <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono text-[10px] border border-amber-500/30 font-semibold">Offline Protected</span>
          </div>
        </div>
      )}

      {/* Main Top App Navigation */}
      <TopBar 
        onOpenSearch={() => setIsSearchModalOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 md:pb-6 scrollbar-thin">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400 dark:text-slate-500 font-sans">
              <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary border-t-transparent mb-3"></div>
              <p className="text-[10px] font-bold uppercase tracking-wider animate-pulse-soft">Loading...</p>
            </div>
          }>
            <div key={activeTab} className="animate-page-enter">
              {renderActiveView()}
            </div>
          </Suspense>
        </main>
      </div>

      {/* Mobile Bottom Navigation (screens < 768px) */}
      <BottomNav />



      {/* Global Cmd+K Search Modal Dialog */}
      <Dialog
        isOpen={isSearchModalOpen}
        onClose={() => {
          setIsSearchModalOpen(false);
          setSearchVal('');
        }}
        title="DukaPos Global Search Platform"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products, customers, settings, modules..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              autoFocus
              className="pl-9 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none dark:border-darkbg-border dark:bg-darkbg"
            />
          </div>

          {/* Results list */}
          <div className="max-h-72 overflow-y-auto space-y-3 font-sans pr-1">
            {!searchVal.trim() ? (
              <p className="text-xs text-slate-400 text-center py-6 italic">Type to search everything...</p>
            ) : (
              <>
                {/* Commands */}
                {searchResults.commands.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Actions & Navigation</div>
                    <div className="space-y-1">
                      {searchResults.commands.map((cmd, idx) => (
                        <button
                          key={idx}
                          onClick={cmd.action}
                          className={`w-full text-left rounded-lg border p-2 text-xs font-bold text-primary dark:text-primary-dark flex items-center justify-between transition ${
                            idx === searchSelectedIdx
                              ? 'bg-primary/10 border-primary/30 dark:bg-primary-dark/10'
                              : 'bg-slate-50 dark:bg-darkbg-card border-slate-100 dark:border-darkbg-border hover:bg-primary/5'
                          }`}
                        >
                          <span>⚡ {cmd.name}</span>
                          <span className="text-[9px] bg-primary/10 px-1.5 py-0.5 rounded font-semibold text-primary">Shortcut</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Products */}
                {searchResults.products.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Products & Services</div>
                    <div className="space-y-1">
                      {searchResults.products.map((p) => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setActiveTab('Inventory');
                            setActiveModule(p.module as any);
                            setIsSearchModalOpen(false);
                            setSearchVal('');
                          }}
                          className="rounded-lg bg-slate-50 dark:bg-darkbg-card border border-slate-100 dark:border-darkbg-border p-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                        >
                          <span className="font-bold">{p.name} ({p.module})</span>
                          <span className="font-semibold text-slate-400">Tsh. {p.price.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customers */}
                {searchResults.customers.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Customers & Members</div>
                    <div className="space-y-1">
                      {searchResults.customers.map((c) => (
                        <div 
                          key={c.id}
                          onClick={() => {
                            setActiveTab('Customers');
                            setIsSearchModalOpen(false);
                            setSearchVal('');
                          }}
                          className="rounded-lg bg-slate-50 dark:bg-darkbg-card border border-slate-100 dark:border-darkbg-border p-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                        >
                          <span className="font-bold">{c.name} ({c.type})</span>
                          <span className="text-slate-400">{c.phone}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.products.length === 0 && searchResults.customers.length === 0 && searchResults.commands.length === 0 && (
                  <EmptyState
                    variant="no-results"
                    title={`No results for "${searchVal}"`}
                    description="Try a different keyword — product name, customer, or action."
                    className="py-8"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
};

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ModuleProvider>
          <SyncProvider>
            <DukaPosAppContent />
          </SyncProvider>
        </ModuleProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
