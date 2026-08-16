import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';
import { 
  db, 
  type TableEntity, 
  type PricingRule, 
  type UserDevice, 
  type UserSession 
} from '../../db/dexie';
import { TenantStoreCleanupService } from '../../services/tenantStoreCleanupService';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Badge } from '../UI/custom-ui';
import { 
  Plus, Trash2, Flame, MapPin, Globe, Sliders, User, RotateCcw,
  BookOpen, Check, Copy, Download, RefreshCw, Cpu, Database, ShieldCheck, FileText, Shield, CreditCard
} from 'lucide-react';
import { 
  SettingsResolver,
  GLOBAL_DEFAULTS_REGISTRY,
  type InventoryConfig,
  type POSConfig,
  type TaxConfig,
  type SecurityConfig
} from '../../services/settingsService';
import { LegalPolicyModal, type LegalTab } from '../Legal/LegalPolicyModal';
import { Subscriptions } from './Subscriptions';
import { BusinessProfile } from './BusinessProfile';
import { AppVersionFooter } from '../Layout/AppVersionFooter';
import { sessionManager } from '../../services/session/sessionManager';

export const Settings: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const { currentTenant, currentBranch, role, branches, user } = useAuth();
  const { activeModule, activeTab: layoutTab, setActiveTab } = useModule();

  // Active configurations section resolved from layout sidebar activeTab or initialTab prop
  const activeTab = useMemo<'localization' | 'pos' | 'inventory' | 'tax' | 'security' | 'devices' | 'audit' | 'bar' | 'subscriptions' | 'developer' | 'manual'>(() => {
    const target = initialTab || layoutTab;
    switch (target) {
      case 'Business Profile & Identity':
      case 'localization':
        return 'localization';
      case 'POS Configurations':
      case 'pos':
        return 'pos';
      case 'Inventory Rules':
      case 'inventory':
        return 'inventory';
      case 'Tax & Billing':
      case 'tax':
        return 'tax';
      case 'Security Policies':
      case 'security':
        return 'security';
      case 'Terminals & Sessions':
      case 'devices':
        return 'devices';
      case 'Subscriptions & Billing':
      case 'subscriptions':
        return 'subscriptions';
      case 'Developer Options':
      case 'developer':
        return 'developer';
      case 'User Manual & Guide':
      case 'User Manual':
      case 'manual':
        return 'manual';
      case 'Change Log':
      case 'audit':
        return 'audit';
      case 'Bar Tables & Promo':
      case 'bar':
        return 'bar';
      default:
        return 'localization';
    }
  }, [layoutTab, initialTab]);
  const [editingScope, setEditingScope] = useState<'tenant' | 'branch' | 'user'>('tenant');
  const [selectedBranchId, setSelectedBranchId] = useState(currentBranch.id);

  // Table Management States (Happy Hour / Bar)
  const [tableName, setTableName] = useState('');
  const [tableZone, setTableZone] = useState('Main Area');
  const [tableCapacity, setTableCapacity] = useState(4);

  // Happy Hour States
  const [ruleType, setRuleType] = useState('');
  const [ruleDiscount, setRuleDiscount] = useState(20);
  const [ruleStartTime, setRuleStartTime] = useState('17:00');
  const [ruleEndTime, setRuleEndTime] = useState('22:00');

  // Live Queries
  const liveAppSettings = useLiveQuery(() => db.appSettings.toArray()) || [];
  const liveAuditLogs = useLiveQuery(() => db.auditLogs.where('entity').equals('settings').toArray()) || [];
  
  const liveTables = useLiveQuery(() => 
    db.barTables ? db.barTables.where('tenant_id').equals(currentTenant.id).toArray() : Promise.resolve([] as TableEntity[])
  , [currentTenant.id]) || [];

  const liveRules = useLiveQuery(() => 
    db.pricingRules ? db.pricingRules.where('tenant_id').equals(currentTenant.id).toArray() : Promise.resolve([] as PricingRule[])
  , [currentTenant.id]) || [];

  const liveDevices = useLiveQuery(() =>
    db.userDevices ? db.userDevices.where('tenantId').equals(currentTenant.id).toArray() : Promise.resolve([] as UserDevice[])
  , [currentTenant.id]) || [];

  const liveSessions = useLiveQuery(() =>
    db.userSessions ? db.userSessions.where('tenantId').equals(currentTenant.id).toArray() : Promise.resolve([] as UserSession[])
  , [currentTenant.id]) || [];

  // Check permissions for selected scope
  const isSuperOrOwner = ['Super Admin', 'Business Owner', 'Tenant Owner'].includes(role);
  const isBranchManager = ['Branch Manager'].includes(role);
  
  const hasScopePermission = useMemo(() => {
    if (editingScope === 'tenant') return isSuperOrOwner;
    if (editingScope === 'branch') return isSuperOrOwner || isBranchManager;
    return true; // User preference scope
  }, [editingScope, isSuperOrOwner, isBranchManager]);

  const resolvedPOS = useMemo(() => {
    const overrides = liveAppSettings.filter(s => s.tenantId === currentTenant.id && s.namespace === 'POS');
    const tenant = overrides.find(s => !s.branchId && !s.userId)?.config || {};
    const branch = overrides.find(s => s.branchId === selectedBranchId && !s.userId)?.config || {};
    const userPref = overrides.find(s => s.userId === user?.id)?.config || {};
    return { ...GLOBAL_DEFAULTS_REGISTRY.POS, ...tenant, ...branch, ...userPref } as POSConfig;
  }, [liveAppSettings, currentTenant.id, selectedBranchId, user?.id]);

  const resolvedInventory = useMemo(() => {
    const overrides = liveAppSettings.filter(s => s.tenantId === currentTenant.id && s.namespace === 'INVENTORY');
    const tenant = overrides.find(s => !s.branchId && !s.userId)?.config || {};
    const branch = overrides.find(s => s.branchId === selectedBranchId && !s.userId)?.config || {};
    const userPref = overrides.find(s => s.userId === user?.id)?.config || {};
    return { ...GLOBAL_DEFAULTS_REGISTRY.INVENTORY, ...tenant, ...branch, ...userPref } as InventoryConfig;
  }, [liveAppSettings, currentTenant.id, selectedBranchId, user?.id]);

  const resolvedTax = useMemo(() => {
    const overrides = liveAppSettings.filter(s => s.tenantId === currentTenant.id && s.namespace === 'TAX');
    const tenant = overrides.find(s => !s.branchId && !s.userId)?.config || {};
    const branch = overrides.find(s => s.branchId === selectedBranchId && !s.userId)?.config || {};
    const userPref = overrides.find(s => s.userId === user?.id)?.config || {};
    return { ...GLOBAL_DEFAULTS_REGISTRY.TAX, ...tenant, ...branch, ...userPref } as TaxConfig;
  }, [liveAppSettings, currentTenant.id, selectedBranchId, user?.id]);

  const resolvedSecurity = useMemo(() => {
    const overrides = liveAppSettings.filter(s => s.tenantId === currentTenant.id && s.namespace === 'SECURITY');
    const tenant = overrides.find(s => !s.branchId && !s.userId)?.config || {};
    const branch = overrides.find(s => s.branchId === selectedBranchId && !s.userId)?.config || {};
    const userPref = overrides.find(s => s.userId === user?.id)?.config || {};
    return { ...GLOBAL_DEFAULTS_REGISTRY.SECURITY, ...tenant, ...branch, ...userPref } as SecurityConfig;
  }, [liveAppSettings, currentTenant.id, selectedBranchId, user?.id]);

  // Helper to determine which scope defines a specific configuration key
  const getWinningScopeBadge = (namespace: string, key: string) => {
    const overrides = liveAppSettings.filter(s => s.tenantId === currentTenant.id && s.namespace === namespace);
    
    const userVal = overrides.find(s => s.userId === user?.id)?.config?.[key];
    if (userVal !== undefined) return <Badge variant="outline" className="text-[9px] px-1 py-0 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 font-bold border-indigo-200/30">User Preferences</Badge>;

    const branchVal = overrides.find(s => s.branchId === selectedBranchId && !s.userId)?.config?.[key];
    if (branchVal !== undefined) return <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 font-bold border-emerald-200/30">Branch Override</Badge>;

    const tenantVal = overrides.find(s => !s.branchId && !s.userId)?.config?.[key];
    if (tenantVal !== undefined) return <Badge variant="outline" className="text-[9px] px-1 py-0 bg-violet-50 dark:bg-violet-950/40 text-violet-500 font-bold border-violet-200/30">Tenant Setting</Badge>;

    return <Badge variant="outline" className="text-[9px] px-1 py-0 bg-slate-50 dark:bg-slate-900 text-slate-400 font-medium">Global Default</Badge>;
  };

  // Helper to check if a setting key is currently overridden at the active editing scope
  const isOverriddenAtEditingScope = (namespace: string, key: string) => {
    const overrides = liveAppSettings.filter(s => s.tenantId === currentTenant.id && s.namespace === namespace);
    const target = overrides.find(s => 
      s.branchId === (editingScope === 'branch' ? selectedBranchId : undefined) &&
      s.userId === (editingScope === 'user' ? user?.id : undefined)
    );
    return target?.config?.[key] !== undefined;
  };

  // State hooks for form inputs (pre-filled with resolved values)
  const [formPOS, setFormPOS] = useState<POSConfig>({ ...resolvedPOS });
  const [formInventory, setFormInventory] = useState<InventoryConfig>({ ...resolvedInventory });
  const [formTax, setFormTax] = useState<TaxConfig>({ ...resolvedTax });
  const [formSecurity, setFormSecurity] = useState<SecurityConfig>({ ...resolvedSecurity });

  // Legal Policy Modal State
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab>('privacy');

  // Sync state hooks when resolved values or selected scope changes

  useEffect(() => {
    setFormPOS({ ...resolvedPOS });
  }, [resolvedPOS, editingScope, selectedBranchId]);

  useEffect(() => {
    setFormInventory({ ...resolvedInventory });
  }, [resolvedInventory, editingScope, selectedBranchId]);

  useEffect(() => {
    setFormTax({ ...resolvedTax });
  }, [resolvedTax, editingScope, selectedBranchId]);

  useEffect(() => {
    setFormSecurity({ ...resolvedSecurity });
  }, [resolvedSecurity, editingScope, selectedBranchId]);

  // Handle saving of configuration changes
  const handleSaveConfig = async (namespace: string, key: string, value: any) => {
    try {
      const configUpdate = { [key]: value };
      const ctx = {
        id: user?.id || 'usr-anon',
        name: user?.name || 'Unknown Operator',
        role: role || 'Cashier'
      };

      await SettingsResolver.saveSetting({
        tenantId: currentTenant.id,
        branchId: editingScope === 'branch' ? selectedBranchId : undefined,
        userId: editingScope === 'user' ? user?.id : undefined,
        namespace,
        config: configUpdate,
        userContext: ctx
      });
    } catch (err: any) {
      alert('Error updating setting: ' + err.message);
    }
  };

  // Helper to remove an override at the active editing scope so it falls back to the parent
  const handleClearOverride = async (namespace: string, key: string) => {
    try {
      const overrides = liveAppSettings.filter(s => s.tenantId === currentTenant.id && s.namespace === namespace);
      const target = overrides.find(s => 
        s.branchId === (editingScope === 'branch' ? selectedBranchId : undefined) &&
        s.userId === (editingScope === 'user' ? user?.id : undefined)
      );

      if (!target) return;

      const newConfig = { ...target.config };
      delete newConfig[key];

      const ctx = {
        id: user?.id || 'usr-anon',
        name: user?.name || 'Unknown Operator',
        role: role || 'Cashier'
      };

      // Check if there are still keys left
      if (Object.keys(newConfig).length === 0) {
        await db.appSettings.delete(target.id);
        // Log manual delete
        await db.auditLogs.add({
          id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          tenant_id: currentTenant.id,
          user_id: ctx.id,
          user_name: ctx.name,
          action: 'REMOVE_SETTING_OVERRIDE',
          entity: 'settings',
          entity_id: target.id,
          metadata: { namespace, scope: editingScope, key },
          created_at: Date.now()
        });
      } else {
        await SettingsResolver.saveSetting({
          tenantId: currentTenant.id,
          branchId: editingScope === 'branch' ? selectedBranchId : undefined,
          userId: editingScope === 'user' ? user?.id : undefined,
          namespace,
          config: newConfig,
          userContext: ctx
        });
      }
    } catch (err: any) {
      alert('Error removing override: ' + err.message);
    }
  };

  // Devices & sessions handlers
  const handleRevokeSession = async (sessId: string) => {
    if (confirm('Are you sure you want to revoke this session? The device will be logged out.')) {
      await db.userSessions.update(sessId, {
        status: 'REVOKED',
        revokedAt: Date.now()
      });
      alert('Session revoked successfully.');
    }
  };

  const handleTrustDevice = async (devId: string, currentTrust: boolean) => {
    await db.userDevices.update(devId, { trusted: !currentTrust });
    alert(`Device trust state updated to: ${!currentTrust ? 'Trusted' : 'Untrusted'}`);
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim()) return;

    await db.barTables.add({
      id: `bt-${Date.now()}`,
      tenant_id: currentTenant.id,
      branch_id: selectedBranchId,
      zone_id: tableZone,
      name: tableName.trim(),
      capacity: tableCapacity,
      status: 'AVAILABLE'
    });

    setTableName('');
    alert(`Table "${tableName}" added successfully.`);
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleType.trim()) return;

    await db.pricingRules.add({
      id: `rule-${Date.now()}`,
      tenant_id: currentTenant.id,
      rule_type: ruleType.trim(),
      start_time: ruleStartTime,
      end_time: ruleEndTime,
      days: ['Friday', 'Saturday', 'Sunday'],
      discount_percent: ruleDiscount
    });

    setRuleType('');
    alert(`Happy Hour rule "${ruleType}" activated.`);
  };

  const sortedAuditLogs = useMemo(() => {
    return [...liveAuditLogs].sort((a, b) => b.created_at - a.created_at);
  }, [liveAuditLogs]);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 dark:border-darkbg-border/30 pb-4 gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            Settings & Configurations
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enterprise scope-inherited controls, active device parameters, and system policy overrides.
          </p>
        </div>
        {/* Scope Selector */}
        <div className="flex bg-slate-100 dark:bg-darkbg p-1 rounded-lg border border-slate-200/50 dark:border-darkbg-border/50 text-xs font-semibold gap-1">
          <button 
            onClick={() => setEditingScope('tenant')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${editingScope === 'tenant' ? 'bg-white dark:bg-darkbg-card shadow text-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Globe size={13} /> Tenant Level
          </button>
          <button 
            onClick={() => setEditingScope('branch')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${editingScope === 'branch' ? 'bg-white dark:bg-darkbg-card shadow text-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <MapPin size={13} /> Branch Level
          </button>
          <button 
            onClick={() => setEditingScope('user')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${editingScope === 'user' ? 'bg-white dark:bg-darkbg-card shadow text-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <User size={13} /> User Preferences
          </button>
        </div>
      </div>

      {/* Scope Details Banner */}
      <div className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${
        !hasScopePermission 
          ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-400'
          : editingScope === 'tenant'
            ? 'bg-violet-50/70 border-violet-100 dark:bg-violet-950/10 dark:border-violet-900/20 text-violet-700 dark:text-violet-300'
            : editingScope === 'branch'
              ? 'bg-emerald-50/70 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-indigo-50/70 border-indigo-100 dark:bg-indigo-950/10 dark:border-indigo-900/20 text-indigo-700 dark:text-indigo-300'
      }`}>
        <div className="flex items-center gap-2">
          <Sliders size={14} />
          <span>
            {!hasScopePermission ? (
              <strong>Permission Required:</strong>
            ) : (
              <strong>Target Scope:</strong>
            )}
            {editingScope === 'tenant' && ' Tenant-wide policies (applies across all outlets). Requires Owner privileges.'}
            {editingScope === 'branch' && ' Outlet-specific configurations. Overrides tenant values for selected branch.'}
            {editingScope === 'user' && ' Local terminal preferences. Overrides all other scopes for your active session.'}
          </span>
        </div>
        {editingScope === 'branch' && (
          <select 
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="h-7 border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg text-[11px] rounded px-1.5 focus:outline-none dark:text-white"
          >
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Quick Settings Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200/60 dark:border-darkbg-border text-xs font-bold no-scrollbar">
        {[
          { id: 'Business Profile & Identity', label: 'Business Identity', icon: Globe },
          { id: 'POS Configurations', label: 'POS Configs', icon: Sliders },
          { id: 'Inventory Rules', label: 'Inventory Rules', icon: Database },
          { id: 'Tax & Billing', label: 'Tax & VAT', icon: ShieldCheck },
          { id: 'Security Policies', label: 'Security & Access', icon: Shield },
          { id: 'Terminals & Sessions', label: 'Terminals & Sessions', icon: User },
          { id: 'Subscriptions & Billing', label: 'Subscriptions', icon: CreditCard },
          { id: 'Developer Options', label: 'Developer Options', icon: Cpu, badge: 'DEV', badgeColor: 'bg-red-500 text-white' },
          { id: 'User Manual & Guide', label: 'User Manual & Guide', icon: BookOpen, badge: 'GUIDE', badgeColor: 'bg-amber-500 text-white' },
          { id: 'Change Log', label: 'Change Log', icon: RotateCcw }
        ].map((tab) => {
          const isActive = layoutTab === tab.id || (tab.id === 'User Manual & Guide' && layoutTab === 'User Manual');
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 text-xs select-none cursor-pointer border ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-black'
                  : 'bg-white dark:bg-darkbg hover:bg-slate-50 dark:hover:bg-darkbg-card text-slate-700 dark:text-slate-300 border-slate-200 dark:border-darkbg-border font-semibold'
              }`}
            >
              <Icon size={13} className={isActive ? 'text-white' : 'text-slate-500'} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-extrabold ${tab.badgeColor}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Configurations Fields Main Panel */}
      <div className="w-full">
        {activeTab === 'subscriptions' && <Subscriptions />}
        {activeTab === 'localization' && <BusinessProfile />}
        {activeTab !== 'subscriptions' && activeTab !== 'localization' && (
            <Card className="min-h-[400px]">
            <CardHeader className="border-b border-slate-100 dark:border-darkbg-border/30 pb-3">
              <CardTitle>
                {activeTab === 'pos' && 'Point of Sale (POS) Settings'}
                {activeTab === 'inventory' && 'Inventory Management Rules'}
                {activeTab === 'tax' && 'Taxes, Billing & Chart of Accounts'}
                {activeTab === 'security' && 'Identity & Security Policies'}
                {activeTab === 'devices' && 'Active Terminals & Sessions'}
                {activeTab === 'audit' && 'Configuration Audit History'}
                {activeTab === 'bar' && 'Bar Layout & Happy Hour Rules'}
                {activeTab === 'developer' && 'Developer & System Control Options'}
                {activeTab === 'manual' && 'KwakoPos Operational User Manual & Training Guide'}
              </CardTitle>
              <CardDescription>
                {activeTab === 'pos' && 'Enforce checkout restrictions, receipt headers, printing targets, and prefix rules.'}
                {activeTab === 'inventory' && 'Determine stock valuation logic, thresholds, tracking modes, and backdating overrides.'}
                {activeTab === 'tax' && 'Define default tax structures, VAT percentages, and double-entry COA configs.'}
                {activeTab === 'security' && 'Update authentication targets, password specifications, timeouts, and backdated checkout blocks.'}
                {activeTab === 'devices' && 'Track active terminal keys, device security tags, and remote logout controls.'}
                {activeTab === 'audit' && 'Review details of recent settings updates, tracking before and after states.'}
                {activeTab === 'bar' && 'Manage dining area seating layouts, lounge tables, and active discount periods.'}
                {activeTab === 'developer' && 'Isolated tenant database purge routines, release channels, and runtime IndexedDB diagnostics.'}
                {activeTab === 'manual' && 'Complete role-based access rules (RBAC), checkout workflows, offline sync, and stock requisition instructions.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              
              {/* POS Tab */}
              {activeTab === 'pos' && (
                <div className="space-y-4 text-xs">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Receipt Header</label>
                        {getWinningScopeBadge('POS', 'receiptHeader')}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled={!hasScopePermission}
                          value={formPOS.receiptHeader}
                          onChange={(e) => setFormPOS(p => ({ ...p, receiptHeader: e.target.value }))}
                          onBlur={() => handleSaveConfig('POS', 'receiptHeader', formPOS.receiptHeader)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        />
                        {isOverriddenAtEditingScope('POS', 'receiptHeader') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('POS', 'receiptHeader')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Receipt Footer</label>
                        {getWinningScopeBadge('POS', 'receiptFooter')}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled={!hasScopePermission}
                          value={formPOS.receiptFooter}
                          onChange={(e) => setFormPOS(p => ({ ...p, receiptFooter: e.target.value }))}
                          onBlur={() => handleSaveConfig('POS', 'receiptFooter', formPOS.receiptFooter)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        />
                        {isOverriddenAtEditingScope('POS', 'receiptFooter') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('POS', 'receiptFooter')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Printer Interface</label>
                        {getWinningScopeBadge('POS', 'printerInterface')}
                      </div>
                      <div className="flex gap-2">
                        <select
                          disabled={!hasScopePermission}
                          value={formPOS.printerInterface}
                          onChange={(e) => {
                            setFormPOS(p => ({ ...p, printerInterface: e.target.value }));
                            handleSaveConfig('POS', 'printerInterface', e.target.value);
                          }}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        >
                          <option value="thermal-usb">Thermal Printer (USB)</option>
                          <option value="thermal-network">Network TCP/IP Printer</option>
                          <option value="standard-pdf">Standard Document (PDF Preview)</option>
                        </select>
                        {isOverriddenAtEditingScope('POS', 'printerInterface') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('POS', 'printerInterface')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Allow Cashier Discount</label>
                        {getWinningScopeBadge('POS', 'allowDiscount')}
                      </div>
                      <div className="flex gap-2">
                        <select
                          disabled={!hasScopePermission}
                          value={String(formPOS.allowDiscount)}
                          onChange={(e) => {
                            const val = e.target.value === 'true';
                            setFormPOS(p => ({ ...p, allowDiscount: val }));
                            handleSaveConfig('POS', 'allowDiscount', val);
                          }}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        >
                          <option value="true">Allowed (Flexible checkout discounts)</option>
                          <option value="false">Blocked (Fixed prices only)</option>
                        </select>
                        {isOverriddenAtEditingScope('POS', 'allowDiscount') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('POS', 'allowDiscount')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Inventory Tab */}
              {activeTab === 'inventory' && (
                <div className="space-y-4 text-xs">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Allow Negative Stock sales</label>
                        {getWinningScopeBadge('INVENTORY', 'allowNegativeStock')}
                      </div>
                      <div className="flex gap-2">
                        <select
                          disabled={!hasScopePermission}
                          value={String(formInventory.allowNegativeStock)}
                          onChange={(e) => {
                            const val = e.target.value === 'true';
                            setFormInventory(p => ({ ...p, allowNegativeStock: val }));
                            handleSaveConfig('INVENTORY', 'allowNegativeStock', val);
                          }}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        >
                          <option value="false">Disabled (Strict out-of-stock blocks)</option>
                          <option value="true">Enabled (Allow selling below zero)</option>
                        </select>
                        {isOverriddenAtEditingScope('INVENTORY', 'allowNegativeStock') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('INVENTORY', 'allowNegativeStock')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Stock Valuation Method</label>
                        {getWinningScopeBadge('INVENTORY', 'stockValuationMethod')}
                      </div>
                      <div className="flex gap-2">
                        <select
                          disabled={!hasScopePermission}
                          value={formInventory.stockValuationMethod}
                          onChange={(e) => {
                            setFormInventory(p => ({ ...p, stockValuationMethod: e.target.value as any }));
                            void handleSaveConfig('INVENTORY', 'stockValuationMethod', e.target.value);
                          }}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        >
                          <option value="FIFO">FIFO (First-In, First-Out)</option>
                          <option value="AVERAGE">WAC (Weighted Average Cost)</option>
                          <option value="MANUAL">LIFO / Manual Valuation</option>
                        </select>
                        {isOverriddenAtEditingScope('INVENTORY', 'stockValuationMethod') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('INVENTORY', 'stockValuationMethod')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Safety Stock Low Threshold</label>
                        {getWinningScopeBadge('INVENTORY', 'lowStockThreshold')}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          disabled={!hasScopePermission}
                          value={formInventory.lowStockThreshold}
                          onChange={(e) => setFormInventory(p => ({ ...p, lowStockThreshold: Number(e.target.value) || 0 }))}
                          onBlur={() => handleSaveConfig('INVENTORY', 'lowStockThreshold', formInventory.lowStockThreshold)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        />
                        {isOverriddenAtEditingScope('INVENTORY', 'lowStockThreshold') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('INVENTORY', 'lowStockThreshold')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tax Tab */}
              {activeTab === 'tax' && (
                <div className="space-y-4 text-xs">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">VAT Status</label>
                        {getWinningScopeBadge('TAX', 'vatEnabled')}
                      </div>
                      <div className="flex gap-2">
                        <select
                          disabled={!hasScopePermission}
                          value={String(formTax.vatEnabled)}
                          onChange={(e) => {
                            const val = e.target.value === 'true';
                            setFormTax(p => ({ ...p, vatEnabled: val }));
                            void handleSaveConfig('TAX', 'vatEnabled', val);
                          }}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        >
                          <option value="true">Enabled (Apply default VAT to sales)</option>
                          <option value="false">Disabled (Tax-exempt / Zero-rated)</option>
                        </select>
                        {isOverriddenAtEditingScope('TAX', 'vatEnabled') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('TAX', 'vatEnabled')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Standard VAT Rate (%)</label>
                        {getWinningScopeBadge('TAX', 'vatRate')}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          disabled={!hasScopePermission}
                          value={formTax.vatRate}
                          onChange={(e) => setFormTax(p => ({ ...p, vatRate: Number(e.target.value) || 0 }))}
                          onBlur={() => handleSaveConfig('TAX', 'vatRate', formTax.vatRate)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        />
                        {isOverriddenAtEditingScope('TAX', 'vatRate') && (
                          <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('TAX', 'vatRate')} title="Clear Override"><RotateCcw size={14} /></Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-4 text-xs">
                  {/* Concurrency Policies */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 dark:text-white border-b dark:border-darkbg-border/30 pb-1">Concurrency & Access Controls</h4>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="font-bold text-slate-600 dark:text-slate-400">Max Allowed Devices</label>
                          {getWinningScopeBadge('SECURITY', 'maxDevices')}
                        </div>
                        <div className="flex gap-2">
                          <select
                            disabled={!hasScopePermission}
                            value={formSecurity.maxDevices}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setFormSecurity(p => ({ ...p, maxDevices: val }));
                              void handleSaveConfig('SECURITY', 'maxDevices', val);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                          >
                            {[1, 2, 3, 5, 10, 20].map(v => (
                              <option key={v} value={v}>{v} Devices</option>
                            ))}
                          </select>
                          {isOverriddenAtEditingScope('SECURITY', 'maxDevices') && (
                            <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('SECURITY', 'maxDevices')} title="Clear Override"><RotateCcw size={14} /></Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="font-bold text-slate-600 dark:text-slate-400">Concurrency Mode</label>
                          {getWinningScopeBadge('SECURITY', 'allowMultipleSessions')}
                        </div>
                        <div className="flex gap-2">
                          <select
                            disabled={!hasScopePermission}
                            value={String(formSecurity.allowMultipleSessions)}
                            onChange={(e) => {
                              const val = e.target.value === 'true';
                              setFormSecurity(p => ({ ...p, allowMultipleSessions: val }));
                              void handleSaveConfig('SECURITY', 'allowMultipleSessions', val);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                          >
                            <option value="true">Multi-Device Mode (Allow Multiple)</option>
                            <option value="false">Single Device Mode (Force Logout Old)</option>
                          </select>
                          {isOverriddenAtEditingScope('SECURITY', 'allowMultipleSessions') && (
                            <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('SECURITY', 'allowMultipleSessions')} title="Clear Override"><RotateCcw size={14} /></Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="font-bold text-slate-600 dark:text-slate-400">Offline Grace Period</label>
                          {getWinningScopeBadge('SECURITY', 'offlineGraceHours')}
                        </div>
                        <div className="flex gap-2">
                          <select
                            disabled={!hasScopePermission}
                            value={formSecurity.offlineGraceHours}
                            onChange={(e) => {
                              const val = Number(e.target.value) as 24 | 36 | 72;
                              setFormSecurity(p => ({ ...p, offlineGraceHours: val }));
                              sessionManager.setOfflineGraceHours(val);
                              void handleSaveConfig('SECURITY', 'offlineGraceHours', val);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                          >
                            <option value="24">24 Hours Grace (1 Day — Standard Security)</option>
                            <option value="36">36 Hours Grace (1.5 Days — Extended Shift)</option>
                            <option value="72">72 Hours Grace (3 Days — Weekend / Remote Ops)</option>
                          </select>
                          {isOverriddenAtEditingScope('SECURITY', 'offlineGraceHours') && (
                            <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('SECURITY', 'offlineGraceHours')} title="Clear Override"><RotateCcw size={14} /></Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Backdated Transactions */}
                  <div className="space-y-4 pt-3">
                    <h4 className="font-bold text-slate-800 dark:text-white border-b dark:border-darkbg-border/30 pb-1">Backdated Transactions Controls</h4>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="font-bold text-slate-600 dark:text-slate-400">Backdated POS Sales</label>
                          {getWinningScopeBadge('SECURITY', 'allowBackdatedSales')}
                        </div>
                        <div className="flex gap-2">
                          <select
                            disabled={!hasScopePermission}
                            value={String(formSecurity.allowBackdatedSales)}
                            onChange={(e) => {
                              const val = e.target.value === 'true';
                              setFormSecurity(p => ({ ...p, allowBackdatedSales: val }));
                              void handleSaveConfig('SECURITY', 'allowBackdatedSales', val);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                          >
                            <option value="false">Disabled (Current Date Only)</option>
                            <option value="true">Enabled (Requires Approval)</option>
                          </select>
                          {isOverriddenAtEditingScope('SECURITY', 'allowBackdatedSales') && (
                            <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('SECURITY', 'allowBackdatedSales')} title="Clear Override"><RotateCcw size={14} /></Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="font-bold text-slate-600 dark:text-slate-400">Backdated Products</label>
                          {getWinningScopeBadge('SECURITY', 'allowBackdatedProducts')}
                        </div>
                        <div className="flex gap-2">
                          <select
                            disabled={!hasScopePermission}
                            value={String(formSecurity.allowBackdatedProducts)}
                            onChange={(e) => {
                              const val = e.target.value === 'true';
                              setFormSecurity(p => ({ ...p, allowBackdatedProducts: val }));
                              void handleSaveConfig('SECURITY', 'allowBackdatedProducts', val);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                          >
                            <option value="false">Disabled (Current Date Only)</option>
                            <option value="true">Enabled (Requires Approval)</option>
                          </select>
                          {isOverriddenAtEditingScope('SECURITY', 'allowBackdatedProducts') && (
                            <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('SECURITY', 'allowBackdatedProducts')} title="Clear Override"><RotateCcw size={14} /></Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="font-bold text-slate-600 dark:text-slate-400">Backdated Stock Adjustments</label>
                          {getWinningScopeBadge('SECURITY', 'allowBackdatedInventory')}
                        </div>
                        <div className="flex gap-2">
                          <select
                            disabled={!hasScopePermission}
                            value={String(formSecurity.allowBackdatedInventory)}
                            onChange={(e) => {
                              const val = e.target.value === 'true';
                              setFormSecurity(p => ({ ...p, allowBackdatedInventory: val }));
                              void handleSaveConfig('SECURITY', 'allowBackdatedInventory', val);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                          >
                            <option value="false">Disabled (Current Date Only)</option>
                            <option value="true">Enabled (Requires Approval)</option>
                          </select>
                          {isOverriddenAtEditingScope('SECURITY', 'allowBackdatedInventory') && (
                            <Button variant="outline" className="h-9 px-2" onClick={() => handleClearOverride('SECURITY', 'allowBackdatedInventory')} title="Clear Override"><RotateCcw size={14} /></Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legal & Governance Policies Card */}
                  <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/40 space-y-3 mt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-900 dark:text-white text-xs">Legal & Data Governance Documentation</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Review Kwakoko Privacy Policies, Copyright & IP ownership, and Terms of Service (SLA).</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 font-bold border-indigo-200 text-indigo-700 dark:text-indigo-300 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                        onClick={() => { setLegalModalTab('privacy'); setLegalModalOpen(true); }}
                      >
                        Privacy Policy
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 font-bold border-indigo-200 text-indigo-700 dark:text-indigo-300 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                        onClick={() => { setLegalModalTab('copyright'); setLegalModalOpen(true); }}
                      >
                        Copyright & IP Policy
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 font-bold border-indigo-200 text-indigo-700 dark:text-indigo-300 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                        onClick={() => { setLegalModalTab('terms'); setLegalModalOpen(true); }}
                      >
                        Terms of Service & SLA
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Terminals & Sessions Tab */}
              {activeTab === 'devices' && (
                <div className="space-y-6 text-xs">
                  <div className="overflow-x-auto border border-slate-100 dark:border-darkbg-border/30 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 font-bold uppercase tracking-wider text-slate-500 dark:border-darkbg-border/30 dark:bg-darkbg/50">
                          <th className="p-3">Device Name</th>
                          <th className="p-3">Platform</th>
                          <th className="p-3">Last Seen</th>
                          <th className="p-3 text-center">Trust Status</th>
                          <th className="p-3 text-center">Session Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                        {liveDevices.map((d) => {
                          const activeSess = liveSessions.find(s => s.deviceId === d.deviceId && s.status === 'ACTIVE');
                          return (
                            <tr key={d.id}>
                              <td className="p-3">
                                <div className="font-bold text-slate-800 dark:text-slate-200">{d.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{d.deviceId}</div>
                              </td>
                              <td className="p-3 text-slate-500">{d.platform}</td>
                              <td className="p-3 text-slate-400">{new Date(d.lastSeen).toLocaleString()}</td>
                              <td className="p-3 text-center">
                                <Button 
                                  size="xs" 
                                  variant="outline"
                                  className={d.trusted ? "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" : ""}
                                  onClick={() => handleTrustDevice(d.id, d.trusted)}
                                >
                                  {d.trusted ? 'Trusted' : 'Untrusted'}
                                </Button>
                              </td>
                              <td className="p-3 text-center">
                                {activeSess ? (
                                  <Button 
                                    size="xs" 
                                    variant="danger"
                                    onClick={() => handleRevokeSession(activeSess.id)}
                                  >
                                    Revoke Session
                                  </Button>
                                ) : (
                                  <span className="text-slate-400 italic text-[10px]">No active session</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {liveDevices.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-6 text-slate-400 italic">No registered devices.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Settings Audit Log Tab */}
              {activeTab === 'audit' && (
                <div className="space-y-4 text-xs">
                  <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                    {sortedAuditLogs.length > 0 ? (
                      sortedAuditLogs.map((log) => (
                        <div key={log.id} className="p-3 bg-slate-50 dark:bg-darkbg/40 border dark:border-darkbg-border/60 rounded-lg space-y-2">
                          <div className="flex justify-between items-center text-[10px] border-b border-slate-100 dark:border-darkbg-border/20 pb-1">
                            <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                              <User size={10} /> {log.user_name} ({log.metadata?.scope} Scope)
                            </span>
                            <span className="text-slate-400 font-mono">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between items-start text-xs">
                            <div>
                              <div className="font-bold text-slate-800 dark:text-white">
                                Namespace: {log.metadata?.namespace}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono mt-1 space-y-0.5">
                                <div><strong>Changed properties:</strong></div>
                                {log.metadata?.after && Object.keys(log.metadata?.after || {}).map(k => (
                                  <div key={k} className="pl-2">
                                    • <span className="font-bold text-slate-600 dark:text-slate-400">{k}</span>: 
                                    <span className="text-red-500 line-through mx-1">{String(log.metadata?.before?.[k] ?? 'None')}</span> → 
                                    <span className="text-emerald-500 font-bold ml-1">{String(log.metadata?.after?.[k])}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <Badge variant="outline" className="font-bold tracking-wide text-[9px] uppercase">
                              {log.action}
                            </Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-400 italic">No settings adjustments recorded in history.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Bar Layout & Happy Hour Rules Tab */}
              {activeTab === 'bar' && activeModule === 'Bar' && (
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Bar Setup & Tables */}
                  <Card>
                    <CardHeader className="p-3">
                      <div className="flex items-center space-x-2">
                        <MapPin className="h-4 w-4 text-indigo-500" />
                        <CardTitle className="text-sm">Floor Tables & Seating</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 p-3">
                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                        {liveTables && liveTables.length > 0 ? (
                          liveTables.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-darkbg/40 border dark:border-darkbg-border/60 rounded-lg text-xs">
                              <div>
                                <span className="font-bold text-slate-800 dark:text-white">{t.name}</span>
                                <span className="ml-2 text-slate-400">({t.zone_id} • Cap: {t.capacity})</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={t.status === 'AVAILABLE' ? 'success' : 'warning'}>{t.status}</Badge>
                                <button 
                                  onClick={async () => {
                                    if (confirm(`Remove ${t.name}?`)) {
                                      await db.barTables.delete(t.id);
                                    }
                                  }}
                                  className="text-slate-400 hover:text-danger p-1"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-slate-400 italic text-xs">No tables configured.</div>
                        )}
                      </div>

                      <form onSubmit={handleAddTable} className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-white">Add New Table</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Input 
                            label="Table Name *" 
                            placeholder="e.g. Table 10" 
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            required
                          />
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zone / Area *</label>
                            <select 
                              value={tableZone}
                              onChange={(e) => setTableZone(e.target.value)}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                            >
                              <option value="Main Area">Main Area</option>
                              <option value="Bar Counter">Bar Counter</option>
                              <option value="VIP Lounge">VIP Lounge</option>
                              <option value="Garden / Patio">Garden / Patio</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input 
                            label="Seat Capacity *" 
                            type="number" 
                            placeholder="4" 
                            value={tableCapacity}
                            onChange={(e) => setTableCapacity(parseInt(e.target.value) || 2)}
                            required
                          />
                          <div className="flex items-end">
                            <Button variant="primary" type="submit" className="w-full">
                              <Plus size={14} className="mr-1" /> Add Table
                            </Button>
                          </div>
                        </div>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Happy Hour Rules */}
                  <Card>
                    <CardHeader className="p-3">
                      <div className="flex items-center space-x-2">
                        <Flame className="h-4 w-4 text-amber-500" />
                        <CardTitle className="text-sm">Happy Hour & Promotion Rules</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 p-3">
                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                        {liveRules && liveRules.length > 0 ? (
                          liveRules.map(r => (
                            <div key={r.id} className="p-2.5 bg-slate-50 dark:bg-darkbg/40 border dark:border-darkbg-border/60 rounded-lg text-xs space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800 dark:text-white">{r.rule_type}</span>
                                <button 
                                  onClick={async () => {
                                    if (confirm('Delete this Happy Hour rule?')) {
                                      await db.pricingRules.delete(r.id);
                                    }
                                  }}
                                  className="text-slate-400 hover:text-danger p-1"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Discount: <span className="font-bold text-amber-500">{r.discount_percent}% Off</span></span>
                                <span>Schedule: {r.start_time} - {r.end_time}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-slate-400 italic text-xs">No rules configured.</div>
                        )}
                      </div>

                      <form onSubmit={handleAddRule} className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-white">New Promo Schedule</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Input 
                            label="Promo Label *" 
                            placeholder="Weekend Promo" 
                            value={ruleType}
                            onChange={(e) => setRuleType(e.target.value)}
                            required
                          />
                          <Input 
                            label="Discount Percent *" 
                            type="number" 
                            value={ruleDiscount}
                            onChange={(e) => setRuleDiscount(parseInt(e.target.value) || 0)}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input 
                            label="Start Time *" 
                            placeholder="17:00" 
                            value={ruleStartTime}
                            onChange={(e) => setRuleStartTime(e.target.value)}
                            required
                          />
                          <Input 
                            label="End Time *" 
                            placeholder="22:00" 
                            value={ruleEndTime}
                            onChange={(e) => setRuleEndTime(e.target.value)}
                            required
                          />
                        </div>
                        <Button variant="primary" type="submit" className="w-full">
                          <Plus size={14} className="mr-1" /> Add Rule
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Developer Options Tab */}
              {activeTab === 'developer' && (
                <DeveloperOptionsSection tenantId={currentTenant.id} />
              )}

              {/* User Manual Tab */}
              {activeTab === 'manual' && (
                <UserManualSection />
              )}

            </CardContent>
          </Card>
        )}
      </div>

      {/* Global Legal Policy Modal */}
      <LegalPolicyModal 
        isOpen={legalModalOpen} 
        onClose={() => setLegalModalOpen(false)} 
        initialTab={legalModalTab} 
      />
    </div>
  );
};

const HoldToPurgeButton: React.FC<{
  label: string;
  successMessage: string;
  isAuthorized: boolean;
  onPurge: () => Promise<void>;
}> = ({ label, successMessage, isAuthorized, onPurge }) => {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = React.useRef<any>(null);
  const intervalRef = React.useRef<any>(null);

  // Circle radius 10 -> Circumference = 2 * PI * 10 = 62.8318
  const circumference = 62.8318;
  const strokeDashoffset = circumference - (circumference * (progress / 100));

  const startHold = (e?: React.SyntheticEvent) => {
    if (!isAuthorized) {
      alert('Permission Denied: Only Business Owners, Administrators, and Super Admins can execute tenant purge routines.');
      return;
    }
    if (e && e.type.startsWith('touch')) {
      try { e.preventDefault(); } catch (_) {}
    }
    console.info('[TenantCleanup] Hold initiated for action:', label);
    setHolding(true);
    setProgress(0);
    const startTime = Date.now();

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / 2000) * 100);
      setProgress(pct);
    }, 30);

    timerRef.current = setTimeout(async () => {
      clearInterval(intervalRef.current);
      setProgress(100);
      setLoading(true);
      console.info('[TenantCleanup] 2-second hold threshold reached for action:', label);

      const confirmPurge = window.confirm(
        `⚠️ DESTRUCTIVE TENANT DATA PURGE:\n\n` +
        `Are you sure you want to permanently execute:\n"${label}"?\n\n` +
        `This operation will purge records directly from IndexedDB and PostgreSQL database and cannot be reversed.`
      );

      if (confirmPurge) {
        try {
          console.info('[TenantCleanup] Calling purge function...');
          await onPurge();
          console.info('[TenantCleanup] Purge operation finished successfully.');
          alert(successMessage);
        } catch (err: any) {
          console.error('[TenantCleanup] Error executing purge:', err);
          alert('Purge Error: ' + (err?.message || 'Failed to complete purge operation.'));
        }
      } else {
        console.info('[TenantCleanup] Purge cancelled by user in confirmation dialog.');
      }

      setLoading(false);
      setHolding(false);
      setProgress(0);
    }, 2000);
  };

  const endHold = () => {
    if (holding) {
      console.info('[TenantCleanup] Hold released before 2s threshold.');
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setHolding(false);
    setProgress(0);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && holding) {
        endHold();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [holding]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-4 space-y-3">
      {holding && (
        <div 
          className="absolute inset-0 bg-red-500/20 transition-all duration-75 origin-left"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      )}
      <div className="relative z-10 flex flex-col justify-between h-full space-y-3">
        <div>
          <h4 className="text-xs font-black text-red-900 dark:text-red-300">{label}</h4>
          <p className="text-[10px] text-red-700 dark:text-red-400 mt-1 leading-snug">
            Press & hold continuously for 2 seconds to execute cleanup.
          </p>
        </div>

        <button
          type="button"
          onMouseDown={startHold}
          onMouseUp={endHold}
          onMouseLeave={endHold}
          onTouchStart={startHold}
          onTouchEnd={endHold}
          onTouchCancel={endHold}
          disabled={loading}
          className={`purge-btn w-full py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition active:scale-95 select-none cursor-pointer flex items-center justify-center gap-2 ${holding ? 'holding scale-[0.98]' : ''}`}
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Purging Store...
            </span>
          ) : (
            <div className="flex items-center justify-center gap-2">
              {/* Circular Radial Countdown SVG Ring */}
              <svg className="progress-ring -rotate-90" width="20" height="20" viewBox="0 0 24 24">
                <circle 
                  className="progress-ring__track" 
                  cx="12" cy="12" r="10" 
                  stroke="rgba(255,255,255,0.3)" 
                  strokeWidth="2.5" 
                  fill="transparent"
                />
                <circle 
                  className="progress-ring__circle transition-all duration-75" 
                  cx="12" cy="12" r="10" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              
              <span>
                {holding ? `HOLD FOR 2S... (${Math.round(progress)}%)` : 'PRESS & HOLD (2S) TO PURGE'}
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};

const DeveloperOptionsSection: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { role, hasPermission } = useAuth();
  const [channel, setChannel] = useState<'stable' | 'canary'>('stable');

  const isAuthorized = hasPermission('settings.manage') || ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator'].includes(role);

  return (
    <div className="space-y-6 text-xs font-sans">
      {/* Release Channel & Environment Card */}
      <div className="bg-slate-50 dark:bg-darkbg/40 border border-slate-200 dark:border-darkbg-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-darkbg-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-xs">Developer Update Channel</h3>
              <p className="text-[11px] text-slate-500">Choose between public stability or edge developer channels.</p>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
            v2026.4.1-PWA
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
              Active Software Channel
            </label>
            <select
              value={channel}
              onChange={(e) => {
                const ch = e.target.value as 'stable' | 'canary';
                setChannel(ch);
                alert(`Channel updated to ${ch.toUpperCase()}. Canary mode enables experimental sync engines.`);
              }}
              className="w-full h-9 bg-white dark:bg-darkbg text-slate-800 dark:text-white font-bold rounded-xl border border-slate-200 dark:border-darkbg-border px-3 focus:outline-none"
            >
              <option value="stable">Stable 2026 (Production Default)</option>
              <option value="canary">Canary Nightly (Developer Testers)</option>
            </select>
          </div>

          <div className="space-y-1 bg-white dark:bg-darkbg p-3 rounded-xl border border-slate-200 dark:border-darkbg-border font-mono text-[10px]">
            <div className="flex justify-between text-slate-500">
              <span>Database Engine:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">Dexie IndexedDB (v21) & PostgreSQL</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Isolation Tenant ID:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[140px]">{tenantId}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Offline Lock State:</span>
              <span className="font-bold text-emerald-600">UNLOCKED (PRODUCTION)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tenant Purge Tools */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-red-500" />
          <h3 className="font-extrabold text-slate-900 dark:text-white text-xs">Tenant Store Cleanup Tools</h3>
        </div>
        <p className="text-[11px] text-slate-500">
          Hold down buttons for 2 continuous seconds to purge tenant store records safely.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <HoldToPurgeButton
            label="Delete All Products & Stock Ledgers"
            successMessage="All products catalog and stock transaction logs have been purged successfully."
            isAuthorized={isAuthorized}
            onPurge={async () => {
              await TenantStoreCleanupService.purgeProductsAndLedgers(tenantId);
            }}
          />
          <HoldToPurgeButton
            label="Delete All Sales & Receipts Permanently"
            successMessage="All point of sales receipts history and shift records have been purged permanently."
            isAuthorized={isAuthorized}
            onPurge={async () => {
              await TenantStoreCleanupService.purgeSalesAndReceipts(tenantId);
            }}
          />
          <HoldToPurgeButton
            label="Delete Contacts & Expense Records"
            successMessage="All customer, supplier, and expense ledgers have been cleared successfully."
            isAuthorized={isAuthorized}
            onPurge={async () => {
              await TenantStoreCleanupService.purgeContactsAndExpenses(tenantId);
            }}
          />
        </div>
      </div>
    </div>
  );
};

const UserManualSection: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const rawManualUrl = '/docs/USER_MANUAL.md';

  const handleCopyManualText = () => {
    const text = `DukaPos User Operational Manual

1. Role-Based Access Control (RBAC) Matrix
- Owner: Full access (Master Catalog, POS Checkout, Branch Allocations, Financial Logs, Org settings).
- Manager: Branch management (Master Catalog, POS Checkout, Branch Allocations).
- Accountant (Tanzanian Mhasibu): View-only write barrier on inventory increases/reductions to prevent internal fraud. Access to ledgers, charts, compliance & audit logs.
- Cashier: Locked out of configuration panels, price edits, and SKU modifications.

2. Core Operational Workflows
- POS Checkout: Scan barcode or search items, select customer to award loyalty points (1 point per 1,000 TZS), choose payment method (Cash, Card, Mobile Money), checkout to decrement stock via StockLedger and print receipt.
- Offline-First Operations: Runs inside browser IndexedDB cache. Synchronizes when reconnected.
- Cross-Branch Stock Requisitions: Request -> Approval -> Ledger Requisition (TRANSFER-OUT from source, TRANSFER-IN to target).
- Subscriptions & Lockout Policies: 14-day trial. Overdue subscriptions trigger read-only lock.`;

    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 text-xs font-sans">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-sm">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-amber-950 dark:text-amber-200 text-sm">KwakoPos Operational User Manual</h3>
            <p className="text-[11px] text-amber-800/80 dark:text-amber-300">RBAC matrices, POS checkout rules, offline sync protocols & stock requisitions.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyManualText}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-darkbg text-slate-800 dark:text-white border border-slate-200 dark:border-darkbg-border font-bold text-[11px] hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
          </button>

          <a
            href={rawManualUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Raw File</span>
          </a>
        </div>
      </div>

      {/* Manual Content Cards */}
      <div className="space-y-4">
        {/* Section 1: RBAC Matrix */}
        <div className="border border-slate-200 dark:border-darkbg-border rounded-2xl p-5 space-y-3 bg-white dark:bg-darkbg/40">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-sm border-b dark:border-darkbg-border pb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>1. Role-Based Access Control (RBAC) Matrix</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-darkbg text-slate-600 dark:text-slate-400 font-bold border-b dark:border-darkbg-border">
                  <th className="p-2.5">Role</th>
                  <th className="p-2.5">Target Users</th>
                  <th className="p-2.5 text-center">Master Catalog Edit</th>
                  <th className="p-2.5 text-center">POS Checkout</th>
                  <th className="p-2.5 text-center">Branch Allocations</th>
                  <th className="p-2.5 text-center">Financial Audit Logs</th>
                  <th className="p-2.5 text-center">Org Settings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
                <tr>
                  <td className="p-2.5 font-bold text-slate-900 dark:text-white">Owner</td>
                  <td className="p-2.5 text-slate-500">Business Owners</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-slate-900 dark:text-white">Manager</td>
                  <td className="p-2.5 text-slate-500">Branch Managers</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-slate-900 dark:text-white">Accountant</td>
                  <td className="p-2.5 text-slate-500">Tanzanian <i>Mhasibu</i></td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-slate-900 dark:text-white">Cashier</td>
                  <td className="p-2.5 text-slate-500">Store Operators</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                  <td className="p-2.5 text-center font-bold text-emerald-600">Yes</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                  <td className="p-2.5 text-center font-bold text-red-500">No</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 rounded-xl p-3 text-[11px] text-amber-900 dark:text-amber-300 space-y-1">
            <p className="font-bold">🇹🇿 Tanzanian "Mhasibu" (Accountant) Write Barrier:</p>
            <p>To prevent internal fraud, accountants cannot perform manual stock increases or inventory reductions. They can inspect ledgers, download sales charts, run tax compliance reviews, and inspect audit logs.</p>
          </div>
        </div>

        {/* Section 2: Core Workflows */}
        <div className="border border-slate-200 dark:border-darkbg-border rounded-2xl p-5 space-y-3 bg-white dark:bg-darkbg/40">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-sm border-b dark:border-darkbg-border pb-2">
            <FileText className="w-4 h-4" />
            <span>2. Core Operational Workflows</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2 p-3 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border">
              <h4 className="font-bold text-slate-900 dark:text-white">🛒 POS Checkout Workflow</h4>
              <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                <li>Navigate to POS tab & scan barcode or search item.</li>
                <li>Select customer from dropdown to award <strong>Loyalty Points</strong> (1 pt per 1,000 TZS).</li>
                <li>Select payment method (Cash, Card, M-Pesa, Tigo Pesa).</li>
                <li>Click <strong>Checkout</strong> to decrement stock via <code>StockLedger</code> and generate receipt.</li>
              </ol>
            </div>

            <div className="space-y-2 p-3 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border">
              <h4 className="font-bold text-slate-900 dark:text-white">📶 Offline-First Operations</h4>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                <li><strong>Offline Execution:</strong> Keep checking out customers, adding items, and recording shifts offline inside browser IndexedDB cache.</li>
                <li><strong>Status Indicator:</strong> 🟢 Connected (Synced) · 🟡 Syncing · 🔴 Offline (Queued locally).</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Section 3: Stock Requisitions & Subscriptions */}
        <div className="border border-slate-200 dark:border-darkbg-border rounded-2xl p-5 space-y-3 bg-white dark:bg-darkbg/40">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-sm border-b dark:border-darkbg-border pb-2">
            <Database className="w-4 h-4" />
            <span>3. Cross-Branch Stock Requisitions & Lockout Policies</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
              <h4 className="font-bold text-slate-900 dark:text-white">📦 Cross-Branch Stock Requisitions</h4>
              <p>1. <strong>Request:</strong> Branch Manager requests stock from another outlet.</p>
              <p>2. <strong>Approval:</strong> Manager or Owner approves source request.</p>
              <p>3. <strong>Ledger Update:</strong> Source decremented (<code>TRANSFER-OUT</code>), Target incremented (<code>TRANSFER-IN</code>).</p>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
              <h4 className="font-bold text-slate-900 dark:text-white">💳 Subscriptions & Lockout Policies</h4>
              <p>• <strong>Free Trial:</strong> 14 days evaluation package.</p>
              <p>• <strong>Lockout Policy:</strong> Overdue subscriptions trigger read-only lock, disabling registers until renewal payment is confirmed.</p>
            </div>
          </div>
        </div>
      </div>

      <AppVersionFooter className="mt-8" />
    </div>
  );
};
