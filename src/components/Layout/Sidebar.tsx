import React, { useState, useEffect, useMemo } from 'react';
import { useModule, type SidebarItem, type NestedSidebarItem } from '../../context/ModuleContext';
import { useAuth } from '../../context/AuthContext';
import { 
  BarChart3, DollarSign, Package, Users, LineChart, 
  Settings, Grid, CookingPot, FileText, 
  Coins, TrendingUp, Sparkles,
  ChevronDown, HelpCircle, HardHat, Gavel, 
  Home, Sprout, Wrench, Fuel, GraduationCap, 
  BookOpen, Shield, Droplet, Bus, Trash2, Boxes, 
  Shirt, Briefcase, Scissors, Bed,
  Egg, Heart, Footprints, Activity, Database,
  Truck, ShoppingCart, ClipboardList, Receipt,
  Calendar, Clock, Target, MessageSquare,
  GlassWater, UserCheck, Wallet, X, LogOut, Sun, Moon, MapPin
} from 'lucide-react';
import { getShortModuleName, getShortBranchName } from '../../utils/mobileFormatters';

interface SidebarProps {}

export const Sidebar: React.FC<SidebarProps> = () => {
  const { manifest, activeModule, activeTab, setActiveTab, isMobileSidebarOpen, setIsMobileSidebarOpen } = useModule();
  const { role, isSuperAdminView, hasPermission, jwtClaims, user, logout, currentBranch, toggleTheme, theme } = useAuth();
  
  if (isSuperAdminView) {
    return null;
  }

  // Track expanded parent menus
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  const rawSidebarItems = manifest.sidebar;

  const userInitials = useMemo(() => {
    if (!user?.name) return 'U';
    return user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }, [user]);

  const hasSidebarItemPermission = (item: SidebarItem): boolean => {
    const itemName = typeof item === 'string' ? item : item.name;
    const nameLower = itemName.toLowerCase();
    
    if (nameLower === 'dashboard') return true;
    if (nameLower === 'pos' || nameLower === 'counter pos' || nameLower === 'bar counter pos' || nameLower.includes('sale')) {
      return hasPermission('sales.create');
    }
    if (nameLower.includes('inventory') || nameLower === 'products' || nameLower === 'medicines' || nameLower === 'categories') {
      return true; // Allow reading inventory stock levels
    }
    if (nameLower === 'settings' || nameLower === 'general settings') {
      return hasPermission('settings.manage') || hasPermission('business_profile.view') || ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator', 'Accountant', 'Read Only Auditor'].includes(role);
    }
    if (nameLower === 'users & roles' || nameLower === 'employees') {
      return hasPermission('users.manage') || hasPermission('roles.manage');
    }
    if (nameLower === 'reports' || nameLower === 'reports & analytics') {
      return hasPermission('reports.view') || hasPermission('reports.branch') || hasPermission('financial_reports.view');
    }
    if (nameLower === 'purchasing' || nameLower === 'purchasing & supplies' || nameLower === 'suppliers') {
      return hasPermission('purchase.create') || hasPermission('supplier.manage');
    }
    if (nameLower === 'expenses') {
      return hasPermission('expense.manage');
    }
    if (nameLower === 'receipts' || nameLower === 'receipt history' || nameLower === 'receipt management' || nameLower === 'receipt templates' || nameLower === 'receipt analytics' || nameLower === 'receipt verification' || nameLower === 'receipt archive') {
      // Cashiers and above can view receipts; templates/analytics require manager role
      if (nameLower === 'receipt templates' || nameLower === 'receipt analytics') {
        return hasPermission('settings.manage') || ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator', 'Accountant', 'Branch Manager', 'Manager'].includes(role);
      }
      return hasPermission('sales.create') || hasPermission('reports.view') || ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator', 'Cashier', 'Accountant', 'Branch Manager', 'Manager', 'Read Only Auditor'].includes(role);
    }
    if (nameLower === 'subscriptions' || nameLower === 'plans & pricing') {
      return hasPermission('settings.manage') || role === 'Business Owner' || role === 'Tenant Owner';
    }
    return true;
  };

  const sidebarItems = useMemo(() => {
    let items = [...rawSidebarItems];
    if (!items.some(item => (typeof item === 'string' ? item : item.name) === 'AI Insights Engine')) {
      const settingsIdx = items.findIndex(item => (typeof item === 'string' ? item : item.name) === 'Settings');
      const aiItem: SidebarItem = {
        name: 'AI Insights Engine',
        subItems: [
          'Business Health Score',
          'Sales Intelligence',
          'Inventory Intelligence',
          'Profit & Pricing',
          'Customer CLV',
          'Cash Flow & Burn',
          'Fraud & Security',
          'Branch Comparison',
          'Demand Forecast'
        ]
      };
      if (settingsIdx !== -1) {
        items.splice(settingsIdx, 0, aiItem);
      } else {
        items.push(aiItem);
      }
    }

    if (!items.some(item => (typeof item === 'string' ? item : item.name) === 'Cash Drawer')) {
      const posIdx = items.findIndex(item => {
        const n = (typeof item === 'string' ? item : item.name).toLowerCase();
        return n === 'pos' || n.includes('sale') || n.includes('counter');
      });
      const cashDrawerItem: SidebarItem = {
        name: 'Cash Drawer',
        subItems: [
          'Shift & Active Register',
          'Cash Movement Ledger',
          'Reconciliation & Variances',
          'Safe & Bank Deposits',
          'No Sale & Event Logs',
          '15 Financial Reports',
          'Security & RBAC Rules',
          'AI Cash Advisor'
        ]
      };
      if (posIdx !== -1) {
        items.splice(posIdx + 1, 0, cashDrawerItem);
      } else {
        items.push(cashDrawerItem);
      }
    }

    if (!items.some(item => {
      const n = (typeof item === 'string' ? item : item.name).toLowerCase();
      return n === 'receipts' || n.includes('receipt');
    })) {
      const cashIdx = items.findIndex(item => {
        const n = (typeof item === 'string' ? item : item.name).toLowerCase();
        return n === 'cash drawer' || n === 'pos' || n.includes('sale');
      });
      const receiptsItem: SidebarItem = {
        name: 'Receipts',
        subItems: [
          'Receipt History',
          'Receipt Templates',
          'Receipt Analytics',
          'Receipt Verification',
          'Receipt Archive'
        ]
      };
      if (cashIdx !== -1) {
        items.splice(cashIdx + 1, 0, receiptsItem);
      } else {
        items.push(receiptsItem);
      }
    }

    return items
      .map(item => {
        const name = typeof item === 'string' ? item : item.name;
        if (name === 'Inventory' || name === 'Beverage Inventory') {
          return {
            name: name,
            subItems: [
              'Inventory Overview',
              'Products',
              'Categories & Brands',
              'Stock Adjustment',
              'Stock Transfer',
              'Stock Alerts',
              'Stock Sync Engine',
              activeModule === 'Bar' ? 'Recipes & Pour Control' : 'Product Bundles & Kits',
              'Stock Count',
              'Ledger Drilldown',
              'Inventory Reports'
            ]
          };
        }

        if (name === 'Purchasing' || name === 'Purchasing & Supplies' || name === 'Suppliers' || name === 'Distributors & Suppliers' || name === 'Procurement') {
          return {
            name: 'Purchasing',
            subItems: [
              'Suppliers',
              'Purchase Orders',
              'Goods Received',
              'Supplier Ledgers',
              'Warehouses'
            ]
          };
        }

        if (name === 'Receipts' || name === 'Receipt Management' || name === 'Receipt') {
          return {
            name: 'Receipts',
            subItems: [
              'Receipt History',
              'Receipt Templates',
              'Receipt Analytics',
              'Receipt Verification',
              'Receipt Archive'
            ]
          };
        }

        if (name === 'Reports' || name === 'Reports & Analytics') {
          return {
            name: 'Reports',
            subItems: [
              'Sales',
              'Profit',
              'Inventory Valuation',
              'Tax',
              'Customers Report',
              'Expenses Report',
              'Payment Methods',
              'Stock Movement',
              'Purchasing Report',
              'Discounts',
              'Returns & Refunds',
              'Branch Comparison',
              'Cashier Performance',
              'Receivables Aging'
            ]
          };
        }

        if (name === 'Settings' || name === 'System Settings' || name === 'General Settings') {
          return {
            name: 'Settings',
            subItems: [
              'Business Profile & Identity',
              'POS Configurations',
              'Inventory Rules',
              'Tax & Billing',
              'Security Policies',
              'Terminals & Sessions',
              'Subscriptions & Billing',
              'Developer Options',
              'User Manual & Guide',
              'Change Log'
            ]
          };
        }

        if (name === 'Inventory' || name === 'Beverage Inventory') {
          const rawSubs = typeof item === 'string'
            ? ['Products', 'Categories', 'Stock Adjustment', 'Stock Transfer', 'Stock Alerts']
            : (item.subItems || []);

          const baseSubs = rawSubs.filter(
            s => s !== 'Categories' && s !== 'Stock Sync Engine' && s !== 'Categories & Brands' && s !== 'Product Bundles & Kits'
          );

          const alertsIndex = baseSubs.findIndex(
            s => s === 'Stock Alerts' || s === 'Low Stock Alerts' || s === 'Low Stock'
          );

          const injectedItems = ['Stock Sync Engine', 'Categories & Brands', 'Product Bundles & Kits'];

          let newSubItems: string[];
          if (alertsIndex !== -1) {
            newSubItems = [
              ...baseSubs.slice(0, alertsIndex + 1),
              ...injectedItems,
              ...baseSubs.slice(alertsIndex + 1)
            ];
          } else {
            newSubItems = [...baseSubs, ...injectedItems];
          }

          return {
            name: typeof item === 'string' ? item : item.name,
            subItems: newSubItems
          };
        }

        return item;
      })
      .filter((item, index, self) => {
        const itemName = typeof item === 'string' ? item : item.name;
        return self.findIndex(i => (typeof i === 'string' ? i : i.name) === itemName) === index;
      })
      .map(item => {
        if (typeof item === 'string') return item;
        const filteredSubs = item.subItems?.filter(sub => {
          const subLower = sub.toLowerCase();
          if (subLower === 'users & roles' || subLower === 'employees') {
            return hasPermission('users.manage') || hasPermission('roles.manage');
          }
          if (subLower === 'plans & pricing' || subLower === 'coupons' || subLower === 'grace periods') {
            return hasPermission('settings.manage') || role === 'Business Owner' || role === 'Tenant Owner';
          }
          if (subLower === 'bar setup & tables' || subLower === 'measurement units (pours/bottles)' || subLower === 'happy hour rules' || subLower === 'role permissions') {
            return hasPermission('settings.manage');
          }
          if (subLower === 'business profile & identity') {
            return hasPermission('business_profile.view') || ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator', 'Accountant', 'Read Only Auditor'].includes(role);
          }
          if (
            subLower === 'pos configurations' ||
            subLower === 'inventory rules' ||
            subLower === 'tax & billing' ||
            subLower === 'security policies' ||
            subLower === 'terminals & sessions' ||
            subLower === 'subscriptions & billing' ||
            subLower === 'developer options' ||
            subLower === 'user manual & guide' ||
            subLower === 'user manual' ||
            subLower === 'change log'
          ) {
            return hasPermission('settings.manage') || ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator'].includes(role);
          }
          return true;
        }) || [];
        return { ...item, subItems: filteredSubs };
      })
      .filter(item => {
        if (typeof item === 'string') {
          return hasSidebarItemPermission(item);
        }
        return item.subItems.length > 0 && hasSidebarItemPermission(item.name);
      });
  }, [rawSidebarItems, role, jwtClaims, hasPermission]);

  // Auto-expand parent if its sub-item is active
  useEffect(() => {
    sidebarItems.forEach((item) => {
      if (typeof item !== 'string' && item.subItems?.includes(activeTab)) {
        if (!expandedMenus[item.name]) {
          setExpandedMenus((prev) => ({ ...prev, [item.name]: true }));
        }
      }
    });
  }, [activeTab, sidebarItems, expandedMenus]);

  const toggleMenu = (name: string) => {
    setExpandedMenus((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleNavClick = (tabName: string) => {
    setActiveTab(tabName);
    setIsMobileSidebarOpen(false);
  };

  // Icon mapping helper
  const getIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n === 'dashboard') return <BarChart3 className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('ai') || n.includes('copilot') || n.includes('intelligence')) return <Sparkles className="h-4.5 w-4.5 shrink-0 text-indigo-500" />;
    if (n === 'pos') return <ShoppingCart className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('inventory') || n === 'products' || n === 'medicines') return <Package className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'customers' || n === 'members' || n === 'patients' || n === 'clients' || n === 'guests' || n === 'students' || n === 'tenants' || n === 'employees' || n === 'staff' || n === 'users & roles') return <Users className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'reports') return <LineChart className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'settings') return <Settings className="h-4.5 w-4.5 shrink-0" />;
    
    // Custom industry matches
    if (n === 'counter pos' || n === 'bar counter pos') return <ShoppingCart className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'recipe & pour control') return <GlassWater className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'shift & counter management') return <Clock className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'staff & commissions') return <UserCheck className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'reports & analytics') return <LineChart className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'tables') return <Grid className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('kitchen')) return <CookingPot className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'prescriptions') return <FileText className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'savings' || n === 'shares') return <Coins className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'loans') return <TrendingUp className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'projects') return <HardHat className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'cases') return <Gavel className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'properties') return <Home className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'crops' || n === 'farms') return <Sprout className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'repairs') return <Wrench className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('pump') || n.includes('tank')) return <Fuel className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'classes' || n === 'exams') return <GraduationCap className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'books') return <BookOpen className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'guards') return <Shield className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('water') || n === 'meters') return <Droplet className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'vehicles' || n === 'routes') return <Bus className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('waste') || n.includes('collection')) return <Trash2 className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('bulk') || n === 'warehouses') return <Boxes className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'suppliers' || n === 'distributors & suppliers') return <Truck className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'purchasing' || n === 'purchasing & supplies') return <ShoppingCart className="h-4.5 w-4.5 shrink-0" />;
    if (n.includes('purchase orders') || n === 'goods received') return <ClipboardList className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'sizes' || n === 'colors' || n === 'variants') return <Shirt className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'services' || n === 'appointments') return <Briefcase className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'salon' || n === 'commission') return <Scissors className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'rooms' || n === 'reservations') return <Bed className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'receipts' || n === 'receipt management' || n.includes('receipt')) return <Receipt className="h-4.5 w-4.5 shrink-0 text-indigo-500 dark:text-indigo-400" />;
    if (n === 'expenses' || n === 'expense ledger' || n === 'operating expenses') return <Wallet className="h-4.5 w-4.5 shrink-0 text-amber-500" />;
    if (n.includes('cash drawer') || n.includes('drawer')) return <Wallet className="h-4.5 w-4.5 shrink-0 text-emerald-500" />;
    
    // Poultry & Livestock specific matches
    if (n === 'animals') return <Footprints className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'poultry management') return <Egg className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'livestock operations') return <Sprout className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'health & veterinary') return <Heart className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'feed management') return <Boxes className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'farm management') return <Home className="h-4.5 w-4.5 shrink-0" />;

    // Super Admin specific matches
    if (n === 'tenant management') return <Users className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'business categories') return <Grid className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'subscriptions') return <DollarSign className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'billing & finance') return <Coins className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'users & roles') return <Shield className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'platform monitoring') return <Activity className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'ai management') return <Sparkles className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'marketplace') return <Boxes className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'support center') return <HelpCircle className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'notifications') return <Droplet className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'security center') return <Shield className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'developer center') return <Wrench className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'backup & recovery') return <Database className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'activity center') return <BarChart3 className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'platform updates') return <TrendingUp className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'integrations') return <Boxes className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'system settings') return <Settings className="h-4.5 w-4.5 shrink-0" />;
    
    // Business Consultant module matches
    if (n === 'engagements') return <ClipboardList className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'proposals' || n === 'contracts') return <FileText className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'time tracking') return <Clock className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'meetings') return <Calendar className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'assessments') return <ClipboardList className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'strategy') return <Target className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'invoicing') return <Receipt className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'team') return <Users className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'knowledge base') return <BookOpen className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'ai consultant') return <Sparkles className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'communications') return <MessageSquare className="h-4.5 w-4.5 shrink-0" />;
    if (n === 'administration') return <Settings className="h-4.5 w-4.5 shrink-0" />;

    return <HelpCircle className="h-4.5 w-4.5 shrink-0" />;
  };

  const renderSidebarItem = (item: SidebarItem) => {
    // 1. Render Flat String Item
    if (typeof item === 'string') {
      const isActive = activeTab === item;
      return (
        <button
          key={item}
          onClick={() => handleNavClick(item)}
          className={`flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            isActive
              ? 'bg-primary text-white shadow-sm dark:bg-primary-dark font-bold'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
          }`}
        >
          {getIcon(item)}
          <span className="truncate">{item}</span>
        </button>
      );
    }

    // 2. Render Nested Parent-Child Tree Item
    const parentItem = item as NestedSidebarItem;
    const isExpanded = !!expandedMenus[parentItem.name];
    const isAnyChildActive = parentItem.subItems?.includes(activeTab) || false;

    return (
      <div key={parentItem.name} className="space-y-1">
        {/* Parent Toggle Button */}
        <button
          onClick={() => toggleMenu(parentItem.name)}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            isAnyChildActive
              ? 'text-primary dark:text-primary-dark font-bold bg-primary/5 dark:bg-primary-dark/10'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-3 truncate">
            {getIcon(parentItem.name)}
            <span className="truncate">{parentItem.name}</span>
          </div>
          <ChevronDown 
            className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`} 
          />
        </button>

        {/* Child Submenu list */}
        {isExpanded && parentItem.subItems && (
          <div className="pl-6 border-l border-slate-100 dark:border-darkbg-border/40 ml-5 space-y-0.5 animate-in slide-in-from-top-1 duration-150">
            {parentItem.subItems.map((sub) => {
              const isSubActive = activeTab === sub;
              return (
                <button
                  key={sub}
                  onClick={() => handleNavClick(sub)}
                  className={`flex w-full items-center space-x-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    isSubActive
                      ? 'text-primary font-bold bg-primary/5 dark:text-primary-dark dark:bg-primary-dark/10'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <div className="h-1 w-1 rounded-full bg-slate-400" />
                  <span className="truncate">{sub}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const navContent = (
    <>
      {/* Module Title info — hidden on desktop to eliminate duplicate TopBar header */}
      <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-darkbg-border/30 shrink-0 lg:hidden">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-0.5 shadow-sm border border-slate-200/70 dark:border-darkbg-border overflow-hidden shrink-0">
            <img src="/dukapos-logo.png" alt="DukaPos Logo" className="h-full w-full object-contain" />
          </div>
          <div className="truncate">
            <h2 className="text-xs font-black text-slate-900 dark:text-white truncate leading-tight">
              {getShortModuleName(manifest.name)}
            </h2>
            <p className="text-[10px] font-semibold text-slate-400 capitalize truncate mt-0.5">{role.toLowerCase()}</p>
          </div>
        </div>
        
        {/* Mobile Close Button */}
        <button
          onClick={() => setIsMobileSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="Close Navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* User Profile Card inside Mobile Sidebar */}
      <div className="lg:hidden p-3 bg-slate-50 dark:bg-darkbg/60 rounded-xl border border-slate-200/60 dark:border-darkbg-border/60 mx-3 my-2 space-y-2 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-white font-black text-xs shadow-sm shrink-0">
            {userInitials}
          </div>
          <div className="truncate flex-1">
            <div className="font-bold text-slate-800 dark:text-white text-xs truncate">{user?.name || 'Operator'}</div>
            <div className="text-[10px] text-slate-400 truncate">{user?.email || 'user@dukapos.com'}</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-200/40 dark:border-darkbg-border/30">
          <span className="font-bold px-2 py-0.5 rounded bg-primary/10 text-primary dark:bg-primary-dark/20 dark:text-primary-dark">
            {user?.role || role}
          </span>
          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 font-semibold">
            <MapPin className="h-3 w-3 text-slate-400" />
            {getShortBranchName(currentBranch?.name)}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-slate-200/40 dark:border-darkbg-border/30 text-xs">
          <button
            onClick={toggleTheme}
            className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition py-1 px-2 rounded-lg bg-white dark:bg-darkbg border border-slate-200 dark:border-darkbg-border text-[11px] font-semibold"
          >
            <Sun className="h-3.5 w-3.5 dark:hidden text-amber-500" />
            <Moon className="h-3.5 w-3.5 hidden dark:block text-indigo-400" />
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
          <button
            onClick={() => {
              setIsMobileSidebarOpen(false);
              logout();
            }}
            className="flex items-center space-x-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition py-1 px-2.5 rounded-lg text-[11px] font-bold"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Dynamic Nav List Scrollable */}
      <nav className="flex-1 space-y-1.5 px-3 py-3 overflow-y-auto scrollbar-thin">
        {sidebarItems.map((item) => renderSidebarItem(item))}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile/tablet) */}
      <aside className="hidden lg:flex h-[calc(100vh-4rem)] w-64 flex-col border-r border-slate-200 bg-white dark:border-darkbg-border dark:bg-darkbg-card shadow-sm shrink-0 overflow-hidden">
        {navContent}
      </aside>

      {/* Mobile / Tablet Sliding Overlay Drawer Sidebar */}
      {isMobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Blur */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={() => setIsMobileSidebarOpen(false)} 
          />
          {/* Drawer Panel */}
          <aside className="relative flex w-80 max-w-[85vw] flex-col bg-white dark:bg-darkbg-card shadow-2xl animate-in slide-in-from-left duration-200 z-50 h-full overflow-hidden">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
