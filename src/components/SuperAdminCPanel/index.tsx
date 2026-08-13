import React, { useState, useEffect, Suspense } from 'react';

import { SALayout, type SATab } from './SALayout';
import { cloudDb } from '../../db/supabaseMock';
import { db } from '../../db/dexie';
import { SuperAdminService } from '../../services/superAdminService';
import { useLiveQuery } from 'dexie-react-hooks';

import { isTenantDeleted } from '../../utils/tenantSecurityBroadcast';

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
    async () => {
      const [cTenants, lTenants, cSubs, lSubs] = await Promise.all([
        cloudDb.cloud_tenants.toArray().catch(() => []),
        db.tenants.toArray().catch(() => []),
        cloudDb.cloud_subscriptions.toArray().catch(() => []),
        db.tenantSubscriptions.toArray().catch(() => [])
      ]);
      const map = new Map<string, any>();
      for (const t of cTenants) map.set(t.id, t);
      for (const t of lTenants) {
        if (!map.has(t.id)) map.set(t.id, t);
      }
      const list = Array.from(map.values()).filter((t: any) => !isTenantDeleted(t));
      const existingIds = new Set(list.map((t: any) => t.id));

      const subMap = new Map<string, any>();
      for (const s of cSubs) if (s.id || s.tenant_id) subMap.set(s.id || s.tenant_id, s);
      for (const s of lSubs) if ((s.id || s.tenant_id) && !subMap.has(s.id || s.tenant_id)) subMap.set(s.id || s.tenant_id, s);

      for (const s of Array.from(subMap.values())) {
        const st = (s.status || '').toUpperCase();
        if (st !== 'ACTIVE' && st !== 'TRIAL' && s.status) continue;
        const tid = s.tenant_id || (s as any).tenantId;
        if (tid && !existingIds.has(tid) && !isTenantDeleted(tid)) {
          existingIds.add(tid);
          list.push({ id: tid });
        }
      }

      return list.length;
    }
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
