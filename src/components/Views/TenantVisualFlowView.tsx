import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Globe, 
  Building2, 
  Search, 
  Activity, 
  Users, 
  Calendar, 
  ExternalLink,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { Button } from '../UI/custom-ui';

export interface TenantVisualSummary {
  id: string;
  name: string;
  email: string;
  status: string;
  plan: string;
  ownerName?: string;
  usersCount?: number;
  branchesCount?: number;
  tenantCode?: string;
  tenant_code?: string;
  createdAt?: string | number;
  subscription?: {
    renewalDate?: string | null;
    trialEndDate?: string | null;
  };
  branches?: Array<{
    id: string;
    name: string;
    branchCode?: string;
    branch_code?: string;
    status: string;
    isHeadquarters?: boolean;
    is_headquarters?: boolean;
    salesToday?: number;
    inventoryValue?: number;
  }>;
}

interface TenantVisualFlowViewProps {
  tenants: TenantVisualSummary[];
  adminName: string;
  onEdit?: (tenant: any) => void;
  onSubscription?: (tenant: any) => void;
  onSuspend?: (tenant: any) => void;
  onActivate?: (tenant: any) => void;
  onDelete?: (tenant: any) => void;
  onSelectTenantDetails?: (tenant: any) => void;
  isSuspending?: boolean;
  isActivating?: boolean;
  isDeleting?: boolean;
}

export const TenantVisualFlowView: React.FC<TenantVisualFlowViewProps> = ({
  tenants,
  adminName: _adminName,
  onEdit,
  onSubscription,
  onSuspend,
  onActivate: _onActivate,
  onSelectTenantDetails,
  isSuspending = false,
  isActivating: _isActivating = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [animateFlow, setAnimateFlow] = useState(true);

  // Filter tenants based on search term
  const filteredTenants = tenants.filter(t => 
    (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.tenantCode || t.tenant_code || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Auto-select first tenant
  useEffect(() => {
    if (filteredTenants.length > 0) {
      if (!selectedTenantId || !filteredTenants.some(t => t.id === selectedTenantId)) {
        setSelectedTenantId(filteredTenants[0].id);
      }
    } else {
      setSelectedTenantId(null);
    }
  }, [searchTerm, tenants]);

  const activeTenant = tenants.find(t => t.id === selectedTenantId);
  const rawBranches = activeTenant?.branches || [];
  
  // Use actual tenant branches if populated, or fallback to default HQ branch
  const displayBranches = rawBranches.length > 0 ? rawBranches : [
    { id: 'br-hq', name: 'Main HQ Branch', branchCode: 'HQ', status: 'Active', isHeadquarters: true, salesToday: 0, inventoryValue: 0 }
  ];

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE' || s === 'SUBSCRIBED') {
      return <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full tracking-wider">Active</span>;
    }
    return <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full tracking-wider">Trial</span>;
  };

  return (
    <div className="flex flex-col xl:flex-row gap-5 p-5 min-h-[620px] bg-slate-50/60 dark:bg-darkbg/40 rounded-3xl border border-slate-200 dark:border-darkbg-border">
      
      {/* LEFT COLUMN: BUSINESS DIRECTORY */}
      <div className="w-full xl:w-72 shrink-0 flex flex-col gap-4 bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">Business Directory</h3>
          <span className="text-[10px] bg-slate-100 dark:bg-darkbg text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-mono font-bold">
            {filteredTenants.length} of {tenants.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search tenants, emails..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Directory List */}
        <div className="flex-1 overflow-y-auto max-h-[480px] xl:max-h-[550px] space-y-2.5 pr-1 scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {filteredTenants.length > 0 ? (
              filteredTenants.map((tenant) => {
                const isSelected = tenant.id === selectedTenantId;
                return (
                  <motion.button
                    key={tenant.id}
                    layoutId={`tenant-btn-${tenant.id}`}
                    onClick={() => setSelectedTenantId(tenant.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 relative ${
                      isSelected
                        ? 'border-2 border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md ring-2 ring-indigo-500/10'
                        : 'border-slate-200 dark:border-darkbg-border hover:bg-slate-50 dark:hover:bg-darkbg/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold truncate text-xs ${isSelected ? 'text-indigo-950 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                        {tenant.name}
                      </span>
                      {getStatusBadge(tenant.status)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate max-w-[140px] text-[10px] text-slate-400">{tenant.email || 'no-email@dukapos.com'}</span>
                      <span className="font-mono bg-slate-100 dark:bg-darkbg px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400">
                        {tenant.tenantCode || tenant.tenant_code || 'N/A'}
                      </span>
                    </div>
                  </motion.button>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                No businesses match search filter.
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* View Controls */}
        <div className="border-t border-slate-100 dark:border-darkbg-border pt-3 flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider">
            <Sliders className="w-3.5 h-3.5" /> Flow Animation
          </span>
          <button
            type="button"
            onClick={() => setAnimateFlow(!animateFlow)}
            className={`w-8 h-4 rounded-full transition-colors relative ${
              animateFlow ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-darkbg'
            }`}
          >
            <motion.div
              animate={{ x: animateFlow ? 16 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 shadow-sm"
            />
          </button>
        </div>
      </div>

      {/* RIGHT CANVAS: TOPOLOGY MAP */}
      <div className="flex-1 min-w-0 bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-2xl p-5 flex flex-col justify-between shadow-sm min-h-[520px] overflow-hidden">
        {activeTenant ? (
          <div className="flex flex-col h-full justify-between gap-6">
            
            {/* CANVAS HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-darkbg-border pb-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">TOPOLOGY MAP</span>
                  <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                </div>
                <h4 className="font-extrabold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2 mt-0.5">
                  <span>{activeTenant.name}</span>
                  {onSelectTenantDetails && (
                    <button 
                      type="button"
                      onClick={() => onSelectTenantDetails(activeTenant)} 
                      className="text-slate-400 hover:text-indigo-600 transition"
                      title="View tenant 360 profile"
                    >
                      <ExternalLink className="w-4 h-4 inline" />
                    </button>
                  )}
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border px-3 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 font-bold">
                <span>Owner: {activeTenant.ownerName || (activeTenant as any).owner_name || activeTenant.email || 'Business Owner'}</span>
              </div>
            </div>

            {/* INTERACTIVE FLOW CANVAS */}
            <div className="flex-1 flex flex-col lg:flex-row items-center justify-between gap-3 lg:gap-4 relative py-6 overflow-x-auto scrollbar-thin">
              
              {/* LEVEL 1: PLATFORM MASTER NODE */}
              <div className="z-10 flex flex-col items-center shrink-0">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-44 p-4 rounded-3xl bg-slate-950 dark:bg-darkbg border border-indigo-500/40 text-white text-center shadow-2xl relative"
                >
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="p-2.5 bg-indigo-600/30 rounded-2xl border border-indigo-500/40 mb-2">
                      <Globe className="w-5 h-5 text-indigo-300" />
                    </div>
                    <span className="font-extrabold text-xs block">KwakoPos Platform</span>
                    <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider mt-0.5 block">SUPER CONSOLE</span>
                    <div className="mt-2.5 flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[8px] text-emerald-400 font-mono font-bold">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                      <span>Live Admin: Super</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* CONNECTOR 1: PLATFORM TO BUSINESS */}
              <div className="hidden lg:block w-12 h-0.5 relative z-0 shrink-0">
                <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                  <path 
                    d="M0,0 L48,0" 
                    fill="none" 
                    stroke="#818cf8" 
                    strokeWidth="2.5" 
                    strokeDasharray="6,6"
                    className={animateFlow ? 'animate-flow-dash' : ''}
                  />
                </svg>
              </div>

              {/* LEVEL 2: ACTIVE BUSINESS NODE */}
              <div className="z-10 flex flex-col items-center shrink-0">
                <motion.div 
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  key={activeTenant.id}
                  className="w-56 p-4 rounded-3xl bg-white dark:bg-darkbg-card border-2 border-indigo-500 shadow-2xl relative flex flex-col items-center"
                >
                  <div className="absolute -top-3 -right-2">
                    {getStatusBadge(activeTenant.status)}
                  </div>
                  <div className="flex flex-col items-center text-center w-full min-w-0">
                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl text-indigo-600 dark:text-indigo-400 mb-1.5 border border-indigo-100 dark:border-indigo-900/60">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight block truncate max-w-full">
                      {activeTenant.name}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border px-2 py-0.5 rounded-full mt-1 font-bold">
                      Code: {activeTenant.tenantCode || activeTenant.tenant_code || 'N/A'}
                    </span>

                    <div className="grid grid-cols-2 gap-1.5 w-full mt-3 border-t border-slate-100 dark:border-darkbg-border pt-2 text-center">
                      <div>
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block font-bold">PLAN</span>
                        <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 block mt-0.5">
                          {(activeTenant.plan || 'PROFESSIONAL').toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block font-bold">USERS</span>
                        <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 block mt-0.5">
                          {activeTenant.usersCount || 1}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* CONNECTOR 2: BUSINESS TO BRANCHES */}
              <div className="hidden lg:block w-12 h-0.5 relative z-0 shrink-0">
                <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                  {displayBranches.map((_, idx) => {
                    const total = displayBranches.length;
                    const mid = (total - 1) / 2;
                    const diff = idx - mid;
                    const startY = 0;
                    const endY = diff * 80;
                    const controlX = 24;
                    const pathD = `M 0,${startY} C ${controlX},${startY} ${controlX},${endY} 48,${endY}`;

                    return (
                      <g key={idx}>
                        <path 
                          d={pathD} 
                          fill="none" 
                          stroke="#10b981" 
                          strokeWidth="2" 
                          strokeDasharray="4,4"
                          className={animateFlow ? 'animate-flow-dash' : ''}
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* LEVEL 3: OPERATING BRANCH CARDS */}
              <div className="z-10 flex flex-col gap-3 w-60 shrink-0">
                <AnimatePresence mode="popLayout">
                  {displayBranches.map((branch, idx) => (
                    <motion.div
                      key={branch.id || idx}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-3.5 bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-2xl shadow-sm text-xs"
                    >
                      <div className="flex items-start justify-between gap-1.5 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[130px]">{branch.name}</span>
                          <span className="text-[9px] font-mono text-slate-400 mt-0.5 font-bold truncate">
                            [{branch.branchCode || (idx === 0 ? 'HQ' : `TN-00${idx}`)}]
                          </span>
                        </div>
                        <span className="bg-emerald-100 text-emerald-800 font-bold uppercase text-[9px] px-2 py-0.5 rounded-full shrink-0">
                          Active
                        </span>
                      </div>
                      
                      {/* Branch Metrics */}
                      <div className="grid grid-cols-2 gap-1.5 mt-2.5 border-t border-slate-100 dark:border-darkbg-border pt-2 text-[9px]">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-mono text-emerald-600 font-bold truncate">$ Sales: $0</span>
                        </div>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-mono text-indigo-600 font-bold truncate">🌐 Value: $0</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

            </div>

            {/* BOTTOM CONSOLE BAR */}
            <div className="bg-slate-50/80 dark:bg-darkbg/60 border border-slate-200 dark:border-darkbg-border rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">SUBSCRIPTION RENEWAL</span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block">Not set</span>
                  <span className="text-[10px] text-slate-400 block">Trial ends: Not set</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">USER CAPACITY</span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block">
                    {activeTenant.usersCount || 1} Active Accounts
                  </span>
                  <span className="text-[10px] text-slate-400 block">Across {displayBranches.length} operating {displayBranches.length === 1 ? 'branch' : 'branches'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                {onEdit && (
                  <Button size="sm" variant="outline" className="text-xs h-8 font-bold px-3" onClick={() => onEdit(activeTenant)}>
                    Edit Tenant
                  </Button>
                )}
                {onSubscription && (
                  <Button size="sm" variant="outline" className="text-xs h-8 font-bold px-3" onClick={() => onSubscription(activeTenant)}>
                    Subscription
                  </Button>
                )}
                {onSuspend && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-xs h-8 font-bold px-3 text-slate-700 hover:bg-slate-100"
                    onClick={() => onSuspend(activeTenant)}
                    disabled={isSuspending}
                  >
                    Suspend
                  </Button>
                )}
              </div>

            </div>

          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
            <Building2 className="w-12 h-12 text-slate-300 mb-2 animate-pulse" />
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No Business Selected</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
              Select a tenant business from the directory list on the left to inspect its live topology map.
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes flowDash {
          to {
            stroke-dashoffset: -20;
          }
        }
        .animate-flow-dash {
          animation: flowDash 0.8s linear infinite;
        }
      `}</style>

    </div>
  );
};
