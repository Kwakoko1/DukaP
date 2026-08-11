import React, { useState, useEffect, Suspense } from 'react';

import { SALayout, type SATab } from './SALayout';
import { cloudDb } from '../../db/supabaseMock';
import { SuperAdminService } from '../../services/superAdminService';
import { useLiveQuery } from 'dexie-react-hooks';

// ── Tab components (eager load — they're already lazy-split at route level) ──
import { SAOverview }            from './tabs/SAOverview';
import { SAMarketplace }         from './tabs/SAMarketplace';
import { SABillingFinance }      from './tabs/SABillingFinance';
import { SAPlatformMonitoring }  from './tabs/SAPlatformMonitoring';
import { SASecurityCenter }      from './tabs/SASecurityCenter';
import { SAProductionReadiness } from './tabs/SAProductionReadiness';
import { SAReleaseCenter }       from './tabs/SAReleaseCenter';
import { SADeveloperCenter }     from './tabs/SADeveloperCenter';

// ── Wrapper tabs (feature-rich existing components) ──
import { SATenantManagement }    from './tabs/SATenantManagement';
import { SAUsersRoles }          from './tabs/SAUsersRoles';
import { SASubscriptions }       from './tabs/SASubscriptions';

// ── Fallback spinner ─────────────────────────────────────────────────────────
const TabLoader: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-500">
    <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent mb-3" />
    <p className="text-[10px] font-bold uppercase tracking-widest">Loading…</p>
  </div>
);

// ── Map external sidebar tab names → internal SA tabs ───────────────────────
function resolveActiveTab(externalTab: string): SATab {
  const map: Record<string, SATab> = {
    'Dashboard':           'Overview',
    'Tenant Management':   'Tenant Management',
    'Users & Roles':       'Users & Roles',
    'Users Directory':     'Users & Roles',
    'User Directory':      'Users & Roles',
    'Users':               'Users & Roles',
    'Subscription Tiers':  'Subscription Tiers',
    'Billing & Finance':   'Billing & Finance',
    'Business Categories': 'Business Categories',
    'Marketplace':         'Business Categories',
    'Platform Monitoring': 'Platform Monitoring',
    'Security Center':     'Security Center',
    'Developer Center':    'Developer Center',
    'Persistence Auditor': 'Developer Center',
    'API Keys':            'Developer Center',
    'Webhooks':            'Developer Center',
    'Production Readiness': 'Production Readiness',
    'Release Center':      'Release Center',
    'Release Management':  'Release Center',
    'Releases':            'Release Center',
    'CI/CD Pipeline':      'Release Center',
  };
  return map[externalTab] || 'Overview';
}

interface SuperAdminCPanelProps {
  initialTab?: string;
}

export const SuperAdminCPanel: React.FC<SuperAdminCPanelProps> = ({ initialTab }) => {
  const [activeTab, setActiveTab] = useState<SATab>(() =>
    initialTab ? resolveActiveTab(initialTab) : 'Overview'
  );

  // Sync platform registry on mount
  useEffect(() => {
    SuperAdminService.syncPlatformRegistry().catch(err =>
      console.warn('[SuperAdminCPanel] Registry sync warning:', err)
    );
  }, []);

  // Live tenant count for sidebar badge (merchant business tenants only)
  const tenantCount = useLiveQuery(
    () => cloudDb.cloud_tenants.filter((t: any) => 
      t.id !== 'tenant-admin-system' &&
      t.id !== 'tenant-admin-master' &&
      !t.deleted_at &&
      t.status !== 'Deleted' &&
      t.status !== 'Archived' &&
      t.status !== 'Draft' &&
      t.status !== 'DRAFT' &&
      t.registration_completed !== false
    ).count()
  );

  // Update internal tab when external initialTab prop changes
  useEffect(() => {
    if (initialTab) setActiveTab(resolveActiveTab(initialTab));
  }, [initialTab]);

  const renderTab = () => {
    switch (activeTab) {
      case 'Overview':              return <SAOverview />;
      case 'Tenant Management':     return <SATenantManagement />;
      case 'Users & Roles':         return <SAUsersRoles />;
      case 'Subscription Tiers':    return <SASubscriptions />;
      case 'Billing & Finance':     return <SABillingFinance />;
      case 'Business Categories':   return <SAMarketplace />;
      case 'Platform Monitoring':   return <SAPlatformMonitoring />;
      case 'Security Center':       return <SASecurityCenter />;
      case 'Developer Center':      return <SADeveloperCenter />;
      case 'Production Readiness':  return <SAProductionReadiness />;
      case 'Release Center':        return <SAReleaseCenter />;
      default:                      return <SAOverview />;
    }
  };

  return (
    <SALayout
      active={activeTab}
      onNavigate={setActiveTab}
      tenantCount={tenantCount ?? undefined}
    >
      <Suspense fallback={<TabLoader />}>
        <div key={activeTab} className="animate-page-enter">
          {renderTab()}
        </div>
      </Suspense>
    </SALayout>
  );
};

// Default export for App.tsx lazy import
export default SuperAdminCPanel;
