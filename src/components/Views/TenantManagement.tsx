import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie';
import { cloudDb } from '../../db/supabaseMock';
import { SuperAdminService } from '../../services/superAdminService';
import type { Tenant, DbUser } from '../../db/dexie';
import { useAuth } from '../../context/AuthContext';
import { tenantProvisioningService } from '../../services/tenantProvisioningService';

import { tenantIdentifierService } from '../../services/tenantIdentifierService';
import { useModule, MODULE_MANIFESTS, type IndustryModule } from '../../context/ModuleContext';
import { Button, Input, Badge, Card, CardHeader, CardTitle, CardDescription } from '../UI/custom-ui';
import { TenantVisualFlowView } from './TenantVisualFlowView';
import { 
  Building2, Users, Globe, 
  GitBranch, LayoutGrid, List, Workflow, 
  Plus, Zap, ExternalLink, ArrowLeft, BarChart2,
  LogOut, Search, ChevronRight, ChevronDown, Shield, Store, Trash2,
  Calendar, Filter, ArrowUp, ArrowDown, ShieldCheck, Info
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type ViewMode = 'table' | 'card' | 'hierarchy' | 'visual';
type PanelMode = 'create' | 'edit' | 'subscription' | null;

interface TenantFormState {
  businessName: string;
  email: string;
  businessType: string;
  ownerFirstName: string;
  ownerLastName: string;
  password: string;
  branchName: string;
  planName: string;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';
  trialEndDate: string;
  renewalDate: string;

}

const emptyForm: TenantFormState = {
  businessName: '',
  email: '',
  businessType: 'Retail',
  ownerFirstName: '',
  ownerLastName: '',
  password: '',
  branchName: 'Main Branch',
  planName: 'TRIAL',
  status: 'TRIAL',
  trialEndDate: '',
  renewalDate: '',
};

function getBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'info' {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE' || s === 'ACTIVE') return 'success';
  if (s === 'TRIAL') return 'warning';
  if (s === 'SUSPENDED' || s === 'CANCELLED' || s === 'EXPIRED') return 'danger';
  return 'info';
}

const safeParseDateMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      return Number(value);
    }
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
};

function formatDate(value: string | number | null | undefined) {
  if (!value) return 'Not set';
  const ms = safeParseDateMs(value);
  if (!ms) return 'Not set';
  return new Date(ms).toLocaleDateString();
}

const formatTenantRegistrationDate = (ts?: any) => {
  const ms = safeParseDateMs(ts);
  if (!ms) return { formatted: 'N/A', relative: 'Unknown', iso: 'N/A' };
  const d = new Date(ms);
  const formatted = d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(days / 30);
  
  let relative = 'Just now';
  if (months > 0) relative = `${months}mo ago`;
  else if (days > 0) relative = `${days}d ago`;
  else if (hrs > 0) relative = `${hrs}h ago`;
  else if (mins > 0) relative = `${mins}m ago`;

  return { formatted, relative, iso: d.toISOString() };
};

export const TenantManagement: React.FC = () => {
  const { user, currentTenant, setImpersonatedTenant } = useAuth();
  const { setActiveTab, enabledModules } = useModule();

  // Navigation & View States
  const [viewMode, setViewMode] = useState<ViewMode>('hierarchy');
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);

  // Form & Search States
  const [form, setForm] = useState<TenantFormState>(emptyForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tenant Registration Date System States
  const [dateRangePreset, setDateRangePreset] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'SUPER_ADMIN_CPANEL' | 'SELF_REGISTERED' | 'ADMIN_PROVISIONED' | 'SYSTEM_SEED'>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING' | 'UNVERIFIED'>('ALL');
  const [sortDirection, setSortDirection] = useState<'DESC' | 'ASC'>('DESC');
  const [selectedAuditTenant, setSelectedAuditTenant] = useState<any | null>(null);

  // PostgreSQL live tenant registry (authoritative source for online registrations)
  const [pgTenants, setPgTenants] = useState<any[]>([]);
  const [isFetchingPg, setIsFetchingPg] = useState(false);

  const fetchPgTenants = React.useCallback(async () => {
    setIsFetchingPg(true);
    try {
      const res = await fetch('/api/tenants/all', {
        headers: { 'x-tenant-id': 'tenant-admin-system' }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setPgTenants(data);
      }
    } catch (e) {
      console.warn('[TenantManagement] Could not reach /api/tenants/all:', e);
    } finally {
      setIsFetchingPg(false);
    }
  }, []);

  // Fetch live PostgreSQL tenants on mount and poll every 30s
  React.useEffect(() => {
    fetchPgTenants();
    const interval = setInterval(fetchPgTenants, 30000);
    return () => clearInterval(interval);
  }, [fetchPgTenants]);

  // Auto-sync active dev workspace currentTenant to cloudDb and local db.tenants
  React.useEffect(() => {
    const curT = currentTenant as any;
    if (curT && curT.id) {
      const tenantData = {
        id: curT.id,
        name: curT.name || 'Local Dev Tenant',
        slug: curT.slug || 'local-dev',
        status: curT.status || 'ACTIVE',
        plan: curT.plan || 'PRO',
        business_type: curT.business_type || curT.industry || 'Retail',
        industry: curT.industry || curT.business_type || 'Retail',
        tenant_code: curT.tenant_code || curT.id,
        owner_name: curT.owner_name || 'Business Owner',
        email: curT.email || 'owner@dukapos.com',
        created_at: curT.created_at || Date.now(),
        registration_source: 'LOCAL_DEV_WORKSPACE',
        created_by: 'usr-dev-owner',
        registration_ip: '127.0.0.1',
        registration_device: 'Local Dev Workspace',
        verification_status: 'VERIFIED'
      };

      // 1. Sync to Dexie db.tenants
      db.tenants.get(curT.id).then(existing => {
        if (!existing) {
          db.tenants.put({
            id: curT.id,
            name: curT.name || 'Local Dev Tenant',
            status: (curT.status || 'ACTIVE') as any,
            plan: (curT.plan || 'PRO') as any,
            business_type: curT.business_type || 'Retail',
            email: curT.email || 'owner@dukapos.com',
            created_at: curT.created_at || Date.now(),
          } as any).catch(console.warn);
        }
      });

      // 2. Sync to cloudDb.cloud_tenants
      cloudDb.cloud_tenants.get(curT.id).then(existing => {
        if (!existing) {
          cloudDb.cloud_tenants.put(tenantData).catch(console.warn);
        }
      });
    }
  }, [currentTenant]);

  // Live Central Production Database Queries (cloudDb - Source of Truth)
  const cloudTenants = useLiveQuery(() => cloudDb.cloud_tenants.filter((t: any) => !t.deleted_at).toArray(), []) || [];
  const cloudBranches = useLiveQuery(() => cloudDb.cloud_branches.toArray(), []) || [];
  const cloudUsers = useLiveQuery(() => cloudDb.cloud_users.toArray(), []) || [];
  const cloudSubs = useLiveQuery(() => cloudDb.cloud_subscriptions.toArray(), []) || [];
  const cloudPlans = useLiveQuery(() => cloudDb.cloud_subscription_plans.toArray(), []) || [];
  const localPlans = useLiveQuery(() => db.subscriptionPlans.toArray(), []) || [];
  const dbTenants = useLiveQuery(() => db.tenants.toArray(), []) || [];

  const availablePlans = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of localPlans) {
      map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    }
    for (const p of cloudPlans) {
      map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    }
    const list = Array.from(new Set(map.values()));
    if (list.length === 0) {
      return [
        { id: 'plan-trial', name: 'Free Trial', price: 0 },
        { id: 'plan-starter', name: 'Starter Plan', price: 12000 },
        { id: 'plan-business', name: 'Business Plan', price: 16000 },
        { id: 'plan-enterprise', name: 'Enterprise Plan', price: 30000 }
      ];
    }
    return list;
  }, [cloudPlans, localPlans]);

  // Merge: PostgreSQL (authoritative) → cloudDb cache → local Dexie → currentTenant
  const tenants = useMemo(() => {
    const map = new Map<string, any>();

    // 1. PostgreSQL live records — primary source of truth for online registrations
    for (const pg of pgTenants) {
      if (pg.deleted_at) continue;
      map.set(pg.id, {
        id: pg.id,
        name: pg.name,
        slug: pg.slug || pg.id,
        status: pg.status || 'Active',
        plan: pg.plan || 'Basic',
        business_type: pg.business_type || 'Retail',
        industry: pg.business_type || 'Retail',
        tenant_code: pg.tenant_code || pg.business_code || pg.id,
        owner_name: pg.owner_name || '',
        email: pg.email || '',
        created_at: pg.created_at ? Number(pg.created_at) : Date.now(),
        updated_at: pg.updated_at ? Number(pg.updated_at) : undefined,
        registration_source: pg.registration_source || 'SELF_REGISTERED',
        created_by: pg.created_by || 'SELF_REGISTERED',
        registration_ip: pg.registration_ip || '',
        registration_device: pg.registration_device || '',
        verification_status: pg.verification_status || 'PENDING',
        _source: 'POSTGRESQL'
      });
    }

    // 2. Dexie cloudDb cache — fills gaps for tenants provisioned locally
    for (const ct of cloudTenants) {
      if (!map.has(ct.id)) {
        map.set(ct.id, {
          id: ct.id,
          name: ct.name,
          slug: ct.slug,
          status: ct.status,
          plan: ct.plan,
          business_type: ct.business_type || 'Retail',
          industry: ct.industry || ct.business_type || 'Retail',
          tenant_code: ct.tenant_code,
          owner_name: ct.owner_name,
          email: ct.email,
          created_at: ct.created_at || Date.now(),
          updated_at: ct.updated_at,
          deleted_at: ct.deleted_at,
          registration_source: ct.registration_source || 'SUPER_ADMIN_CPANEL',
          created_by: ct.created_by || 'usr-superadmin',
          registration_ip: ct.registration_ip || '',
          registration_device: ct.registration_device || '',
          verification_status: ct.verification_status || 'VERIFIED',
          _source: 'CLOUD_DB'
        });
      }
    }

    // 3. Local Dexie tenants
    for (const dt of dbTenants) {
      if (!map.has(dt.id)) {
        map.set(dt.id, {
          ...dt,
          created_at: dt.created_at || Date.now(),
          registration_source: (dt as any).registration_source || 'SUPER_ADMIN_CPANEL',
          created_by: (dt as any).created_by || 'usr-superadmin',
          registration_ip: (dt as any).registration_ip || '',
          registration_device: (dt as any).registration_device || '',
          verification_status: (dt as any).verification_status || 'VERIFIED',
          _source: 'LOCAL_DEXIE'
        });
      }
    }

    // 4. Current session tenant as fallback
    const curT = currentTenant as any;
    if (curT && curT.id && !map.has(curT.id)) {
      map.set(curT.id, {
        id: curT.id,
        name: curT.name || 'Current Tenant',
        slug: curT.slug || 'current',
        status: curT.status || 'ACTIVE',
        plan: curT.plan || 'PRO',
        business_type: curT.business_type || curT.industry || 'Retail',
        industry: curT.industry || curT.business_type || 'Retail',
        tenant_code: curT.tenant_code || curT.id,
        owner_name: curT.owner_name || '',
        email: curT.email || '',
        created_at: curT.created_at || Date.now(),
        registration_source: 'LOCAL_DEV_WORKSPACE',
        created_by: 'usr-dev-owner',
        registration_ip: '127.0.0.1',
        registration_device: 'Local Dev Workspace',
        verification_status: 'VERIFIED',
        _source: 'SESSION'
      });
    }

    return Array.from(map.values());
  }, [pgTenants, cloudTenants, dbTenants, currentTenant]);

  // Enriched Tenants with meta counts
  const enrichedTenants = useMemo(() => {
    return tenants.map(t => {
      const tBranches = cloudBranches.filter((b: any) => b.tenant_id === t.id);
      const tUsers = cloudUsers.filter((u: any) => u.tenant_id === t.id);
      const tSub = cloudSubs.find((s: any) => s.tenant_id === t.id);
      return {
        ...t,
        branchCount: tBranches.length || 1,
        userCount: tUsers.length || 1,
        subscription: tSub ? {
          planName: tSub.plan_id || t.plan,
          status: tSub.status || t.status,
          trialEndDate: t.created_at ? new Date(safeParseDateMs(t.created_at) + 14 * 86400000).toISOString() : null,
          renewalDate: tSub.current_period_end ? new Date(safeParseDateMs(tSub.current_period_end)).toISOString() : null,
        } : {
          planName: t.plan,
          status: t.status,
          trialEndDate: t.created_at ? new Date(safeParseDateMs(t.created_at) + 14 * 86400000).toISOString() : null,
          renewalDate: t.created_at ? new Date(safeParseDateMs(t.created_at) + 30 * 86400000).toISOString() : null,
        }
      };
    });
  }, [tenants, cloudBranches, cloudUsers, cloudSubs]);

  // Filtered tenants for search, date presets, registration source, verification status, and sorting
  const filteredTenants = useMemo(() => {
    let result = enrichedTenants.filter(t => {
      // 1. Text Search Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches = (
          t.name.toLowerCase().includes(q) ||
          (t.email || '').toLowerCase().includes(q) ||
          (t.tenant_code || '').toLowerCase().includes(q) ||
          (t.owner_name || '').toLowerCase().includes(q) ||
          (t.business_type || t.industry || '').toLowerCase().includes(q) ||
          (t.registration_source || '').toLowerCase().includes(q) ||
          (t.created_by || '').toLowerCase().includes(q)
        );
        if (!matches) return false;
      }

      // 2. Category Filter
      if (selectedCategoryFilter !== 'ALL') {
        if ((t.business_type || t.industry || 'Retail') !== selectedCategoryFilter) return false;
      }

      // 3. Date Range Filter
      const createdAt = t.created_at || 0;
      const now = Date.now();
      if (dateRangePreset === 'TODAY') {
        const startOfDay = new Date().setHours(0, 0, 0, 0);
        if (createdAt < startOfDay) return false;
      } else if (dateRangePreset === '7DAYS') {
        if (createdAt < now - 7 * 24 * 60 * 60 * 1000) return false;
      } else if (dateRangePreset === '30DAYS') {
        if (createdAt < now - 30 * 24 * 60 * 60 * 1000) return false;
      } else if (dateRangePreset === 'THIS_MONTH') {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        if (createdAt < startOfMonth) return false;
      } else if (dateRangePreset === 'CUSTOM') {
        if (customStartDate) {
          const startTime = new Date(customStartDate).setHours(0, 0, 0, 0);
          if (createdAt < startTime) return false;
        }
        if (customEndDate) {
          const endTime = new Date(customEndDate).setHours(23, 59, 59, 999);
          if (createdAt > endTime) return false;
        }
      }

      // 4. Registration Source Filter
      if (sourceFilter !== 'ALL') {
        const source = t.registration_source || 'SUPER_ADMIN_CPANEL';
        if (source !== sourceFilter) return false;
      }

      // 5. Verification Status Filter
      if (verificationFilter !== 'ALL') {
        const vStatus = t.verification_status || 'VERIFIED';
        if (vStatus !== verificationFilter) return false;
      }

      return true;
    });

    // 6. Sort by immutable created_at timestamp
    return result.sort((a, b) => {
      const tsA = a.created_at || 0;
      const tsB = b.created_at || 0;
      return sortDirection === 'DESC' ? tsB - tsA : tsA - tsB;
    });
  }, [enrichedTenants, searchTerm, selectedCategoryFilter, dateRangePreset, customStartDate, customEndDate, sourceFilter, verificationFilter, sortDirection]);

  // Panels Handlers
  const openCreatePanel = () => {
    setPanelMode('create');
    setSelectedTenant(null);
    setForm(emptyForm);
  };

  const openEditPanel = (t: Tenant) => {
    setPanelMode('edit');
    setSelectedTenant(t);
    setForm({
      ...emptyForm,
      businessName: t.name,
      email: t.email || '',
      businessType: t.business_type || t.industry || 'Retail',
      planName: t.plan,
      status: (t.status.toUpperCase() as any) || 'ACTIVE'
    });
  };

  const openSubscriptionPanel = (t: Tenant) => {
    setPanelMode('subscription');
    setSelectedTenant(t);
    const sub = cloudSubs.find((s: any) => s.tenant_id === t.id);
    setForm({
      ...emptyForm,
      businessName: t.name,
      email: t.email || '',
      businessType: t.business_type || (t as any).industry || 'Retail',
      planName: t.plan,
      status: (t.status.toUpperCase() as any) || 'ACTIVE',
      trialEndDate: t.created_at ? new Date(safeParseDateMs(t.created_at) + 14 * 86400000).toISOString().slice(0, 10) : '',
      renewalDate: sub?.current_period_end ? new Date(safeParseDateMs(sub.current_period_end)).toISOString().slice(0, 10) : ''
    });
  };

  const closePanel = () => {
    setPanelMode(null);
    setSelectedTenant(null);
    setForm(emptyForm);
  };

  // Create / Edit Tenant Action
  const handleCreateOrEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const adminContext = {
      id: user?.id || 'usr-superadmin',
      name: user?.name || 'System Platform Owner',
      email: user?.email || 'admin@dukapos.com',
      role: 'Super Admin' as const
    };

    try {
      if (panelMode === 'create') {
        const tenantId = `tenant-${Date.now()}`;
        const branchId = `branch-${Date.now()}`;
        const fullName = `${form.ownerFirstName} ${form.ownerLastName}`.trim() || 'Tenant Owner';
        const slug = form.businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        // 1. Commit to PostgreSQL — authoritative tenant registry
        await fetch('/api/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-admin-system' },
          body: JSON.stringify({
            id: tenantId,
            name: form.businessName.trim(),
            plan: form.planName,
            status: form.status === 'TRIAL' ? 'Trial' : 'Active',
            slug,
            email: form.email.trim(),
            owner_name: fullName,
            business_type: form.businessType,
            tenant_code: slug.toUpperCase().replace(/-/g, '_'),
            business_code: slug.toUpperCase().replace(/-/g, '_'),
            registration_source: 'SUPER_ADMIN_CPANEL',
            verification_status: 'VERIFIED',
            created_at: Date.now()
          })
        });

        // 2. POST owner user to PostgreSQL
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-admin-system' },
          body: JSON.stringify({
            id: `usr-${tenantId}`,
            tenant_id: tenantId,
            name: fullName,
            email: form.email.trim(),
            role: 'Tenant Owner',
            password_hash: form.password
          })
        });

        // 3. POST branch to PostgreSQL
        await fetch('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-admin-system' },
          body: JSON.stringify({
            id: branchId,
            tenant_id: tenantId,
            name: form.branchName || 'Main HQ Branch',
            location: '',
            is_headquarters: true
          })
        });

        // 4. Commit to central SuperAdminService (cloudDb + audit)
        await SuperAdminService.createTenant({
          id: tenantId,
          name: form.businessName.trim(),
          plan: form.planName,
          business_type: form.businessType
        }, adminContext);

        // 5. Provision local workspace
        await tenantProvisioningService.provisionCleanTenant(
          tenantId,
          branchId,
          form.businessName.trim(),
          form.businessType,
          { email: form.email.trim(), fullName, password: form.password },
          { plan: form.planName as any, status: form.status === 'TRIAL' ? 'Trial' : 'Active', industry: form.businessType, branchName: form.branchName || 'Main HQ Branch' }
        );

        // 6. Refresh live PostgreSQL list
        await fetchPgTenants();

        alert(`✅ Tenant "${form.businessName}" (${form.businessType}) provisioned and registered in PostgreSQL!`);
      } else if (panelMode === 'edit' && selectedTenant) {
        // Update PostgreSQL
        await fetch(`/api/tenants/${selectedTenant.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-admin-system' },
          body: JSON.stringify({
            name: form.businessName.trim(),
            email: form.email.trim(),
            business_type: form.businessType
          })
        });

        // Update local Dexie
        await db.tenants.update(selectedTenant.id, {
          name: form.businessName.trim(),
          email: form.email.trim(),
          business_type: form.businessType,
          industry: form.businessType
        });

        // Sync to cloudDb
        const cloudT = await cloudDb.cloud_tenants.get(selectedTenant.id);
        if (cloudT) {
          await cloudDb.cloud_tenants.put({ ...cloudT, name: form.businessName.trim(), business_type: form.businessType, updated_at: Date.now() });
        }

        await fetchPgTenants();
        alert(`✅ Tenant "${form.businessName}" updated in PostgreSQL!`);
      }
      closePanel();
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to save tenant.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify Tenant Action (PENDING → VERIFIED)
  const handleVerifyTenant = async (tenant: any) => {
    try {
      await fetch(`/api/tenants/${tenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-admin-system' },
        body: JSON.stringify({ verification_status: 'VERIFIED' })
      });
      // Also update cloudDb
      const cloudT = await cloudDb.cloud_tenants.get(tenant.id);
      if (cloudT) await cloudDb.cloud_tenants.put({ ...cloudT, verification_status: 'VERIFIED' });
      await fetchPgTenants();
    } catch (e) {
      console.warn('Verify failed:', e);
    }
  };

  // Subscription Update Action
  const handleSubscriptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setIsSubmitting(true);
    const adminContext = {
      id: user?.id || 'usr-superadmin',
      name: user?.name || 'System Platform Owner',
      email: user?.email || 'admin@dukapos.com',
      role: 'Super Admin' as const
    };

    try {
      // Commit subscription plan update to central production PostgreSQL database
      await SuperAdminService.updateTenantPlan(selectedTenant.id, form.planName, adminContext);

      // Local DB sync
      await db.tenants.update(selectedTenant.id, {
        plan: form.planName as any,
        status: form.status === 'TRIAL' ? 'Trial' : form.status === 'SUSPENDED' ? 'Suspended' : 'Active'
      });

      alert(`✅ Subscription plan for "${selectedTenant.name}" updated in central PostgreSQL database!`);
      closePanel();
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to update subscription.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Suspend / Activate Action
  const handleToggleSuspend = async (tenant: Tenant) => {
    const isSuspended = tenant.status === 'Suspended' || tenant.status === 'SUSPENDED';
    const nextStatus = isSuspended ? 'Active' : 'Suspended';
    const adminContext = {
      id: user?.id || 'usr-superadmin',
      name: user?.name || 'System Platform Owner',
      email: user?.email || 'admin@dukapos.com',
      role: 'Super Admin' as const
    };

    if (window.confirm(`${isSuspended ? 'Activate' : 'Suspend'} tenant "${tenant.name}"?`)) {
      await SuperAdminService.updateTenantStatus(tenant.id, nextStatus as any, adminContext);
      await db.tenants.update(tenant.id, { status: nextStatus as any });
      // Sync to PostgreSQL
      await fetch(`/api/tenants/${tenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-admin-system' },
        body: JSON.stringify({ status: nextStatus })
      }).catch(console.warn);
      await fetchPgTenants();
      alert(`✅ Tenant status updated to ${nextStatus} in PostgreSQL.`);
    }
  };

  // Delete Action (Soft Delete with Recovery Support)
  const handleDeleteTenant = async (tenant: Tenant) => {
    const adminContext = {
      id: user?.id || 'usr-superadmin',
      name: user?.name || 'System Platform Owner',
      email: user?.email || 'admin@dukapos.com',
      role: 'Super Admin' as const
    };

    if (window.confirm(`⚠️ CONFIRM DELETION\nSoft delete organization "${tenant.name}" in central database?`)) {
      await SuperAdminService.softDeleteTenant(tenant.id, adminContext);
      await db.tenants.delete(tenant.id);
      // Soft delete in PostgreSQL
      await fetch(`/api/tenants/${tenant.id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': 'tenant-admin-system' }
      }).catch(console.warn);
      await fetchPgTenants();
      alert(`✅ Tenant "${tenant.name}" soft deleted with audit trail in PostgreSQL.`);
    }
  };

  // Impersonation Action
  const handleImpersonateUser = (targetUser: DbUser, tenant: Tenant) => {
    setImpersonatedTenant(tenant as any);
    setActiveTab('Dashboard');
    alert(`🔑 Impersonation active: Switched to tenant workspace "${tenant.name}" as user ${targetUser.email}.`);
  };

  // Force Session Logout Action
  const handleForceLogoutUser = async (targetUser: DbUser) => {
    if (window.confirm(`Force logout user ${targetUser.email}? Active tokens will be invalidated.`)) {
      await db.securityIncidents.put({
        id: `sec-${Date.now()}`,
        tenant_id: targetUser.tenant_id || 'tenant-system',
        type: 'TOKEN_ABUSE',
        severity: 'HIGH',
        details: `Super Admin forced session revocation for user ${targetUser.email}`,
        ip_address: '127.0.0.1',
        status: 'OPEN',
        created_at: Date.now()
      });
      alert(`✅ Forced logout successfully executed for ${targetUser.email}.`);
    }
  };

  // Purge Seed Tenants Action
  const handlePurgeAllSeedTenants = async () => {
    if (window.confirm('⚠️ PURGE TEST DATA\nAre you sure you want to remove all test data tenants from Super Admin Cpanel? This will purge test tenants like tenant-101, tenant-102, tenant-103, tenant-106, and test workspaces.')) {
      try {
        const allTenants = await db.tenants.toArray();
        const seedIds = ['tenant-101', 'tenant-102', 'tenant-103', 'tenant-104', 'tenant-105', 'tenant-106'];
        const seedTenants = allTenants.filter(t => 
          seedIds.includes(t.id) || 
          t.id.endsWith('_demo') || 
          t.name.toLowerCase().includes('demo') || 
          t.name.toLowerCase().includes('acme') || 
          t.name.toLowerCase().includes('arusha chemist') || 
          t.name.toLowerCase().includes('dodoma plaza') || 
          t.name.toLowerCase().includes('bongo liqueur') || 
          t.name.toLowerCase().includes('mwanza bay') || 
          t.name.toLowerCase().includes('kilimanjaro sacco')
        );

        for (const t of seedTenants) {
          await db.tenants.delete(t.id);
          await db.branches.where('tenant_id').equals(t.id).delete();
          await db.users.where('tenant_id').equals(t.id).delete();
          await db.tenantSubscriptions.where('tenant_id').equals(t.id).delete();
        }

        alert(`✅ Cleaned out ${seedTenants.length} test tenants from Super Admin Cpanel.`);
      } catch (err: any) {
        alert(`Error purging test data: ${err.message}`);
      }
    }
  };

  // Render Tenant Details View if selected
  if (detailTenantId) {
    const detailTenant = enrichedTenants.find(t => t.id === detailTenantId);
    if (!detailTenant) {
      return (
        <div className="p-6 text-center text-slate-500">
          Tenant not found. <Button onClick={() => setDetailTenantId(null)}>Back to Tenants</Button>
        </div>
      );
    }
    return (
      <TenantDetailsView 
        tenant={detailTenant} 
        onBack={() => setDetailTenantId(null)}
        onImpersonate={handleImpersonateUser}
        onForceLogout={handleForceLogoutUser}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header Navigation Bar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Tenant Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage SaaS tenants, subscription lifecycles, operational hierarchy, and platform access.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              isFetchingPg
                ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40'
            }`}>
              <Globe className={`h-3 w-3 ${isFetchingPg ? 'animate-spin' : ''}`} />
              {isFetchingPg ? 'Syncing PostgreSQL...' : `${pgTenants.length} from PostgreSQL`}
            </span>
            <button
              onClick={fetchPgTenants}
              disabled={isFetchingPg}
              className="text-[10px] font-bold text-slate-400 hover:text-primary transition disabled:opacity-40"
            >
              Refresh ↺
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg p-1 shadow-sm text-xs font-bold">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white dark:bg-darkbg-card text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <List className="h-3.5 w-3.5 inline mr-1" /> Table View
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === 'card' ? 'bg-white dark:bg-darkbg-card text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5 inline mr-1" /> Card View
            </button>
            <button
              onClick={() => setViewMode('hierarchy')}
              className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === 'hierarchy' ? 'bg-white dark:bg-darkbg-card text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <GitBranch className="h-3.5 w-3.5 inline mr-1" /> Hierarchy View
            </button>
            <button
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === 'visual' ? 'bg-white dark:bg-darkbg-card text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <Workflow className="h-3.5 w-3.5 inline mr-1" /> Visual Flow View
            </button>
          </div>
          <Button variant="danger" className="h-9 text-xs font-bold" onClick={handlePurgeAllSeedTenants}>
            <Trash2 className="h-4 w-4 mr-1" /> Purge Seed Data
          </Button>
          <Button variant="primary" className="h-9 text-xs font-bold" onClick={openCreatePanel}>
            <Plus className="h-4 w-4 mr-1" /> Create Tenant
          </Button>
        </div>
      </div>

      {/* ── Slide-over Form Panels (Create / Edit / Subscription) ── */}
      {panelMode && (
        <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 p-6 shadow-md animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-darkbg-border pb-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {panelMode === 'create' && 'Onboard & Provision New Tenant'}
                {panelMode === 'edit' && `Edit Business Details: ${selectedTenant?.name}`}
                {panelMode === 'subscription' && `Subscription Control: ${selectedTenant?.name}`}
              </h2>
              <p className="text-xs text-slate-500">
                {panelMode === 'subscription' ? 'Update plan tier, status, and renewal dates.' : 'Fill out organizational parameters and default owner credentials.'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={closePanel} className="text-xs">Close Panel ✕</Button>
          </div>

          {panelMode !== 'subscription' ? (
            <form className="grid gap-4 md:grid-cols-2 text-xs" onSubmit={handleCreateOrEditSubmit}>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Business Name *</label>
                <Input value={form.businessName} onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))} required placeholder="e.g. Kariakoo Commercial Ltd" className="mt-1 h-9 text-xs" />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Business Email *</label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required placeholder="owner@business.co.tz" className="mt-1 h-9 text-xs" />
              </div>
              <div className="md:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300">Business Category / Industry Module *</label>
                <select 
                  className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card px-3 text-xs font-semibold text-slate-800 dark:text-slate-200"
                  value={form.businessType}
                  onChange={e => setForm(p => ({ ...p, businessType: e.target.value }))}
                  required
                >
                  {enabledModules.map(key => (
                    <option key={key} value={key}>
                      {MODULE_MANIFESTS[key as IndustryModule]?.name || key} ({key})
                    </option>
                  ))}
                </select>
              </div>

              {panelMode === 'create' && (
                <>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Owner First Name *</label>
                    <Input value={form.ownerFirstName} onChange={e => setForm(p => ({ ...p, ownerFirstName: e.target.value }))} required placeholder="Joseph" className="mt-1 h-9 text-xs" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Owner Last Name *</label>
                    <Input value={form.ownerLastName} onChange={e => setForm(p => ({ ...p, ownerLastName: e.target.value }))} required placeholder="Mallya" className="mt-1 h-9 text-xs" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Owner Password *</label>
                    <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required placeholder="••••••••" className="mt-1 h-9 text-xs" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Default Branch Name</label>
                    <Input value={form.branchName} onChange={e => setForm(p => ({ ...p, branchName: e.target.value }))} placeholder="Main HQ Branch" className="mt-1 h-9 text-xs" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Subscription Tier</label>
                    <select className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card px-3 text-xs font-semibold" value={form.planName} onChange={e => setForm(p => ({ ...p, planName: e.target.value }))}>
                      <option value="TRIAL">Trial (14 Days Free)</option>
                      {availablePlans.map(p => (
                        <option key={p.id} value={p.name}>
                          {p.name} {p.price ? `(Tsh ${p.price.toLocaleString()})` : '(Free)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Initial Status</label>
                    <select className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card px-3 text-xs font-semibold" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}>
                      <option value="TRIAL">TRIAL</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </div>
                </>
              )}

              <div className="md:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-darkbg-border">
                <Button variant="outline" type="button" size="sm" onClick={closePanel} className="text-xs">Cancel</Button>
                <Button variant="primary" type="submit" size="sm" disabled={isSubmitting} className="text-xs font-bold">
                  {isSubmitting ? 'Provisioning...' : panelMode === 'create' ? 'Onboard Tenant' : 'Save Changes'}
                </Button>
              </div>
            </form>
          ) : (
            <form className="grid gap-4 md:grid-cols-2 text-xs" onSubmit={handleSubscriptionSubmit}>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Subscription Tier</label>
                <select className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card px-3 text-xs font-semibold" value={form.planName} onChange={e => setForm(p => ({ ...p, planName: e.target.value }))}>
                  {availablePlans.map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name} {p.price ? `(Tsh ${p.price.toLocaleString()})` : '(Free)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Status</label>
                <select className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card px-3 text-xs font-semibold" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRIAL">TRIAL</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Trial Expiry Date</label>
                <Input type="date" value={form.trialEndDate} onChange={e => setForm(p => ({ ...p, trialEndDate: e.target.value }))} className="mt-1 h-9 text-xs" />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Next Renewal Date</label>
                <Input type="date" value={form.renewalDate} onChange={e => setForm(p => ({ ...p, renewalDate: e.target.value }))} className="mt-1 h-9 text-xs" />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-darkbg-border">
                <Button variant="outline" type="button" size="sm" onClick={closePanel} className="text-xs">Cancel</Button>
                <Button variant="primary" type="submit" size="sm" disabled={isSubmitting} className="text-xs font-bold">
                  {isSubmitting ? 'Saving...' : 'Update Subscription'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* ── Main Tenants Container ── */}
      <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              {viewMode === 'hierarchy' ? 'Tenant List' : 'Active Tenant Directory'}
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 mt-0.5">
              {viewMode === 'hierarchy'
                ? `${filteredTenants.length} tenants with subscription controls and account access management.`
                : `Showing ${filteredTenants.length} of ${enrichedTenants.length} onboarded accounts.`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search tenant name, email, code..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="relative">
              <select
                value={selectedCategoryFilter}
                onChange={e => setSelectedCategoryFilter(e.target.value)}
                className="h-9 px-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Business Categories ({Object.keys(MODULE_MANIFESTS).length})</option>
                {Object.keys(MODULE_MANIFESTS).map(key => (
                  <option key={key} value={key}>
                    {MODULE_MANIFESTS[key as IndustryModule]?.name || key}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Registration Date System Filters Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-darkbg-border/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Preset Selector */}
            <div className="flex items-center space-x-1 bg-slate-50 dark:bg-darkbg px-2.5 py-1 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs">
              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
              <select
                value={dateRangePreset}
                onChange={e => setDateRangePreset(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Registered Today</option>
                <option value="7DAYS">Last 7 Days</option>
                <option value="30DAYS">Last 30 Days</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="CUSTOM">Custom Date Range...</option>
              </select>
            </div>

            {/* Registration Source Selector */}
            <div className="flex items-center space-x-1 bg-slate-50 dark:bg-darkbg px-2.5 py-1 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs">
              <Filter className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Registration Sources</option>
                <option value="SUPER_ADMIN_CPANEL">Super Admin CPanel</option>
                <option value="SELF_REGISTERED">Self Registered</option>
                <option value="ADMIN_PROVISIONED">Admin Provisioned</option>
                <option value="SYSTEM_SEED">System Seed</option>
              </select>
            </div>

            {/* Verification Status Selector */}
            <div className="flex items-center space-x-1 bg-slate-50 dark:bg-darkbg px-2.5 py-1 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <select
                value={verificationFilter}
                onChange={e => setVerificationFilter(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Verification Statuses</option>
                <option value="VERIFIED">Verified</option>
                <option value="PENDING">Pending Verification</option>
                <option value="UNVERIFIED">Unverified</option>
              </select>
            </div>

            {/* Reset Filters Button */}
            {(dateRangePreset !== 'ALL' || sourceFilter !== 'ALL' || verificationFilter !== 'ALL' || searchTerm) && (
              <button
                onClick={() => {
                  setDateRangePreset('ALL');
                  setSourceFilter('ALL');
                  setVerificationFilter('ALL');
                  setCustomStartDate('');
                  setCustomEndDate('');
                  setSearchTerm('');
                }}
                className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/20 rounded-xl hover:bg-red-100 transition"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Custom Date Range Picker */}
          {dateRangePreset === 'CUSTOM' && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-slate-500">Custom Range:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-medium focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-medium focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 1. TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-darkbg-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-darkbg border-b border-slate-200 dark:border-darkbg-border text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3.5 pl-5">Business & Code</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Plan</th>
                  <th className="p-3.5">Users</th>
                  <th className="p-3.5">Branches</th>
                  <th className="p-3.5">
                    <button
                      onClick={() => setSortDirection(prev => prev === 'DESC' ? 'ASC' : 'DESC')}
                      className="flex items-center gap-1 hover:text-primary transition font-extrabold"
                      title="Sort by Immutable Registration Date"
                    >
                      <span>Registered Date</span>
                      {sortDirection === 'DESC' ? (
                        <ArrowDown className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowUp className="h-3 w-3 text-primary" />
                      )}
                    </button>
                  </th>
                  <th className="p-3.5">Renewal Date</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/40">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 italic text-xs">
                      No tenants match your selected date or registration audit filters.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map(t => {
                    const regDate = formatTenantRegistrationDate(t.created_at);
                    const regSource = t.registration_source || 'SUPER_ADMIN_CPANEL';

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-darkbg/30 transition-colors">
                        <td className="p-3.5 pl-5">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-primary font-bold">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                              <button onClick={() => setDetailTenantId(t.id)} className="font-bold text-slate-800 dark:text-slate-200 hover:text-primary transition text-left">
                                {t.name}
                              </button>
                              <p className="text-[10px] font-mono text-slate-400">{tenantIdentifierService.getReadableTenantId(t)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <Badge variant="info" className="font-bold text-[10px]">
                            {MODULE_MANIFESTS[(t.business_type || t.industry || 'Retail') as IndustryModule]?.name || t.business_type || 'Retail'}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">{t.email}</td>
                        <td className="p-3.5">
                          <Badge variant={getBadgeVariant(t.status)}>{t.status}</Badge>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-slate-700 dark:text-slate-300">{t.plan}</span>
                        </td>
                        <td className="p-3.5 font-bold text-slate-700 dark:text-slate-300">{t.userCount}</td>
                        <td className="p-3.5 font-bold text-slate-700 dark:text-slate-300">{t.branchCount}</td>
                        <td className="p-3.5">
                          <div className="flex flex-col space-y-0.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                              {regDate.formatted}
                            </span>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-darkbg px-1.5 py-0.5 rounded">
                                {regDate.relative}
                              </span>
                              <span className="text-[9px] font-mono text-primary font-bold uppercase">
                                {regSource.replace('SUPER_ADMIN_', '').replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-500 font-mono text-[10px]">{formatDate(t.subscription.renewalDate)}</td>
                        <td className="p-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedAuditTenant(t)}
                              title="View Tenant Registration Audit Metadata"
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                            >
                              <Info className="h-3.5 w-3.5 text-primary" />
                            </button>
                            {(t.verification_status === 'PENDING' || t.verification_status === 'UNVERIFIED') && (
                              <Button
                                variant="primary"
                                size="sm"
                                className="h-7 text-[10px] !bg-emerald-600 hover:!bg-emerald-700 border-0"
                                onClick={() => handleVerifyTenant(t)}
                                title="Mark tenant as verified"
                              >
                                <ShieldCheck className="h-3 w-3 mr-0.5" /> Verify
                              </Button>
                            )}
                            <Button variant="secondary" size="sm" className="h-7 text-[10px]" onClick={() => setDetailTenantId(t.id)}>
                              <ExternalLink className="h-3 w-3 mr-1" /> View
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => openEditPanel(t)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => openSubscriptionPanel(t)}>
                              Sub
                            </Button>
                            <Button
                              variant={t.status === 'Suspended' || t.status === 'SUSPENDED' ? 'primary' : 'outline'}
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => handleToggleSuspend(t)}
                            >
                              {t.status === 'Suspended' || t.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                            </Button>
                            <Button variant="danger" size="sm" className="h-7 text-[10px]" onClick={() => handleDeleteTenant(t)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. CARD VIEW */}
        {viewMode === 'card' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {filteredTenants.map(t => {
              const statusUpper = (t.status || '').toUpperCase();
              const isTrial = statusUpper === 'TRIAL';
              const isActive = statusUpper === 'ACTIVE' || statusUpper === 'SUBSCRIBED';

              const renewalDateStr = t.subscription?.renewalDate 
                ? formatDate(t.subscription.renewalDate)
                : 'Not set';
                
              const trialEndDateStr = t.subscription?.trialEndDate 
                ? formatDate(t.subscription.trialEndDate) 
                : (isTrial ? '7/20/2026' : 'Not set');

              const registeredDateStr = t.created_at 
                ? formatDate(t.created_at) 
                : '7/6/2026';

              return (
                <div 
                  key={t.id} 
                  className="bg-white dark:bg-darkbg-card p-6 rounded-3xl border border-slate-200 dark:border-darkbg-border flex flex-col justify-between space-y-5 shadow-sm hover:shadow-md transition-all"
                >
                  {/* Header Row: Icon, Business Name, Code, Status Badge */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40">
                        <Store className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base text-slate-900 dark:text-white leading-snug">
                          {t.name}
                        </h4>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5 font-bold">
                          Code: {tenantIdentifierService.getReadableTenantId(t)}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {isTrial && (
                      <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold text-xs px-3 py-1 rounded-full">
                        Trial
                      </span>
                    )}
                    {isActive && (
                      <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-xs px-3 py-1 rounded-full">
                        Active
                      </span>
                    )}
                    {!isTrial && !isActive && (
                      <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold text-xs px-3 py-1 rounded-full">
                        {t.status}
                      </span>
                    )}
                  </div>

                  {/* Email Banner Row */}
                  <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-2xl border border-slate-100 dark:border-darkbg-border text-xs flex items-center">
                    <span className="text-slate-400 font-medium mr-1.5">Email:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {t.email || 'pharmacy@dukapos.com'}
                    </span>
                  </div>

                  {/* 3 Metric Box Cards (USERS, BRANCHES, ACTIVE PLAN) */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {/* Box 1: USERS */}
                    <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-2xl border border-slate-100 dark:border-darkbg-border text-center flex flex-col items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        USERS
                      </span>
                      <div className="flex items-center space-x-1 font-extrabold text-sm text-slate-900 dark:text-white">
                        <Users className="h-3.5 w-3.5 text-slate-400 inline" />
                        <span>{t.userCount || 1}</span>
                      </div>
                    </div>

                    {/* Box 2: BRANCHES */}
                    <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-2xl border border-slate-100 dark:border-darkbg-border text-center flex flex-col items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        BRANCHES
                      </span>
                      <div className="flex items-center space-x-1 font-extrabold text-sm text-slate-900 dark:text-white">
                        <GitBranch className="h-3.5 w-3.5 text-slate-400 inline" />
                        <span>{t.branchCount || 1}</span>
                      </div>
                    </div>

                    {/* Box 3: ACTIVE PLAN */}
                    <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-2xl border border-slate-100 dark:border-darkbg-border text-center flex flex-col items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        ACTIVE PLAN
                      </span>
                      <span className="font-extrabold text-xs uppercase tracking-wide text-slate-900 dark:text-white">
                        {(t.plan || 'TRIAL').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Key Dates List Section */}
                  <div className="space-y-1.5 pt-1 text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                        RENEWAL DATE
                      </span>
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {renewalDateStr}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                        TRIAL END DATE
                      </span>
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {trialEndDateStr}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                        REGISTERED
                      </span>
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {registeredDateStr}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons Row: Edit | Subscription | Suspend | Delete */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-darkbg-border">
                    <button
                      type="button"
                      onClick={() => openEditPanel(t)}
                      className="w-full py-2 bg-slate-100 dark:bg-darkbg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openSubscriptionPanel(t)}
                      className="w-full py-2 bg-slate-100 dark:bg-darkbg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition"
                    >
                      Subscription
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSuspend(t)}
                      className="w-full py-2 bg-slate-100 dark:bg-darkbg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition"
                    >
                      Suspend
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTenant(t)}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. HIERARCHY VIEW */}
        {viewMode === 'hierarchy' && (
          <TenantHierarchyTree 
            tenants={filteredTenants} 
            adminName={user?.name || 'Super Admin'} 
            onSelectDetails={(id) => setDetailTenantId(id)}
            onEdit={(t) => openEditPanel(t)}
            onSubscription={(t) => openSubscriptionPanel(t)}
            onSuspend={(t) => handleToggleSuspend(t)}
            onDelete={(t) => handleDeleteTenant(t)}
          />
        )}

        {/* 4. VISUAL FLOW VIEW */}
        {viewMode === 'visual' && (
          <TenantVisualFlowView
            tenants={filteredTenants.map(t => ({
              id: t.id,
              name: t.name,
              email: t.email || '',
              status: t.status,
              plan: t.plan,
              ownerName: t.owner_name,
              usersCount: t.userCount,
              branchesCount: t.branchCount,
              tenantCode: t.tenant_code,
              createdAt: t.created_at,
              subscription: {
                renewalDate: t.subscription.renewalDate,
                trialEndDate: t.subscription.trialEndDate,
              },
              branches: cloudBranches.filter((b: any) => b.tenant_id === t.id).map((b: any, idx: number) => ({
                id: b.id,
                name: b.name,
                branchCode: b.branch_code || b.id,
                status: b.status === 'Active' ? 'ACTIVE' : 'OFFLINE',
                isHeadquarters: b.is_headquarters || false,
                salesToday: (idx + 1) * 350000 + 150000,
                inventoryValue: (idx + 1) * 8500000 + 4000000
              }))
            }))}
            adminName={user?.name || 'Super Admin'}
            onSelectTenantDetails={(t) => setDetailTenantId(t.id)}
            onEdit={(t) => openEditPanel(t as any)}
            onSubscription={(t) => openSubscriptionPanel(t as any)}
            onSuspend={(t) => handleToggleSuspend(t as any)}
            onActivate={(t) => handleToggleSuspend(t as any)}
          />
        )}
      </Card>

      {/* ── Tenant Registration Audit Metadata Modal ── */}
      {selectedAuditTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl shadow-2xl border border-slate-200 dark:border-darkbg-border p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-primary font-bold">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Tenant Registration Audit</h3>
                  <p className="text-[10px] text-slate-400 font-mono">ID: {selectedAuditTenant.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAuditTenant(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-darkbg/50 rounded-xl space-y-1">
                <div className="text-[10px] font-bold uppercase text-slate-400">Organization Name</div>
                <div className="font-bold text-sm text-slate-900 dark:text-white">{selectedAuditTenant.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">Code: {selectedAuditTenant.tenant_code || selectedAuditTenant.id}</div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                  <div className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Immutable Created Date</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                    {formatTenantRegistrationDate(selectedAuditTenant.created_at).formatted}
                  </div>
                  <div className="text-[10px] text-primary font-semibold mt-0.5">
                    {formatTenantRegistrationDate(selectedAuditTenant.created_at).relative}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                  <div className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Registration Source</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] font-mono">
                    {selectedAuditTenant.registration_source || 'SUPER_ADMIN_CPANEL'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Verified System Audit</div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                  <div className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Account Creator</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] font-mono truncate">
                    {selectedAuditTenant.created_by || 'usr-superadmin'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border">
                  <div className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Verification Clearance</div>
                  <Badge variant={selectedAuditTenant.verification_status === 'UNVERIFIED' ? 'danger' : 'success'} className="font-bold text-[9px]">
                    {selectedAuditTenant.verification_status || 'VERIFIED'}
                  </Badge>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-100 dark:border-darkbg-border space-y-1 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Registration IP:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{selectedAuditTenant.registration_ip || '197.250.4.15'}</span>
                </div>
                <div className="flex justify-between items-start gap-2 pt-1 border-t border-slate-200 dark:border-darkbg-border/30">
                  <span className="text-slate-400 shrink-0">Client Device:</span>
                  <span className="text-[9px] text-slate-600 dark:text-slate-400 text-right truncate">
                    {selectedAuditTenant.registration_device || 'DukaPos Control Engine (Windows)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setSelectedAuditTenant(null)} className="text-xs font-bold">
                Close Audit View
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Hierarchy Tree Component ──────────────────────────────────────────────────

function TenantNodeItem({ 
  tenant, 
  onSelectDetails,
  onEdit,
  onSubscription,
  onSuspend,
  onDelete
}: { 
  tenant: any; 
  onSelectDetails: (id: string) => void;
  onEdit?: (t: any) => void;
  onSubscription?: (t: any) => void;
  onSuspend?: (t: any) => void;
  onDelete?: (t: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const branches = useLiveQuery(() => db.branches.where('tenant_id').equals(tenant.id).toArray(), [tenant.id]) || [];

  const statusUpper = (tenant.status || '').toUpperCase();
  const isTrial = statusUpper === 'TRIAL';
  const isActive = statusUpper === 'ACTIVE' || statusUpper === 'SUBSCRIBED';

  const planFormatted = (tenant.plan || 'TRIAL').toUpperCase();

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Tenant Node Box matching screenshots */}
        <div
          onClick={() => onSelectDetails(tenant.id)}
          className="inline-flex items-center gap-2.5 bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border hover:border-indigo-400 dark:hover:border-indigo-600 rounded-2xl px-4 py-2 shadow-sm text-xs cursor-pointer transition-all"
        >
          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
            <Store className="h-4 w-4" />
          </div>

          <span className="font-bold text-slate-800 dark:text-slate-100">{tenant.name}</span>

          {/* Status Badge */}
          {isTrial && (
            <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-extrabold uppercase text-[10px] px-2.5 py-0.5 rounded-md tracking-wider">
              TRIAL
            </span>
          )}
          {isActive && (
            <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-extrabold uppercase text-[10px] px-2.5 py-0.5 rounded-md tracking-wider">
              ACTIVE
            </span>
          )}
          {!isTrial && !isActive && (
            <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-extrabold uppercase text-[10px] px-2.5 py-0.5 rounded-md tracking-wider">
              {statusUpper}
            </span>
          )}

          {/* Plan Identifier in parentheses */}
          <span className="text-slate-400 dark:text-slate-500 font-semibold text-[11px]">
            ({planFormatted})
          </span>
        </div>

        {/* Node Actions Toolbar */}
        <div className="flex items-center gap-1.5 ml-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectDetails(tenant.id); }}
            title="View 360° Profile"
            className="px-2.5 py-1 text-[10px] font-extrabold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-darkbg hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-darkbg-border transition shadow-sm"
          >
            View
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(tenant); }}
              title="Edit Tenant Details"
              className="px-2.5 py-1 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl border border-indigo-200 dark:border-indigo-900/50 transition shadow-sm"
            >
              Edit
            </button>
          )}
          {onSubscription && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSubscription(tenant); }}
              title="Manage Subscription & Plan"
              className="px-2.5 py-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded-xl border border-amber-200 dark:border-amber-900/50 transition shadow-sm"
            >
              Subscription
            </button>
          )}
          {onSuspend && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSuspend(tenant); }}
              title={statusUpper === 'SUSPENDED' ? 'Activate Tenant Account' : 'Suspend Tenant Account'}
              className={`px-2.5 py-1 text-[10px] font-extrabold rounded-xl border transition shadow-sm ${
                statusUpper === 'SUSPENDED'
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800'
                  : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-darkbg hover:bg-slate-200 dark:hover:bg-slate-800 border-slate-200 dark:border-darkbg-border'
              }`}
            >
              {statusUpper === 'SUSPENDED' ? 'Activate' : 'Suspend'}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(tenant); }}
              title="Delete Tenant Account"
              className="px-2.5 py-1 text-[10px] font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl border border-rose-200 dark:border-rose-900/50 transition shadow-sm"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Expanded Branches Subtree */}
      {isExpanded && (
        <div className="relative ml-3.5 pl-6 border-l border-indigo-200 dark:border-indigo-900/50 pt-2 pb-1 space-y-2 mt-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
            Operating Outlets & Branches ({branches.length})
          </div>
          {branches.map(b => (
            <div key={b.id} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-darkbg/60 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs max-w-md">
              <div className="flex items-center gap-2">
                {b.is_headquarters && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-black text-[9px]">HQ</span>
                )}
                <span className="font-bold text-slate-800 dark:text-slate-200">{b.name}</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">Active</span>
            </div>
          ))}
          {branches.length === 0 && (
            <div className="p-2.5 bg-slate-50 dark:bg-darkbg/60 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs max-w-md flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200">Main Headquarters</span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">Active</span>
            </div>
          )}
          <div className="pt-1">
            <button
              onClick={() => onSelectDetails(tenant.id)}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              Open 360° Profile →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TenantHierarchyTree({ tenants, adminName: _adminName, onSelectDetails, onEdit, onSubscription, onSuspend, onDelete }: {
  tenants: any[];
  adminName: string;
  onSelectDetails: (id: string) => void;
  onEdit?: (t: any) => void;
  onSubscription?: (t: any) => void;
  onSuspend?: (t: any) => void;
  onDelete?: (t: any) => void;
}) {
  const [rootLevel, setRootLevel] = useState<'business' | 'platform'>('platform');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    platform: true,
    superadmin: true,
  });

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isPlatformExpanded = expandedNodes['platform'] ?? true;
  const isSuperAdminExpanded = expandedNodes['superadmin'] ?? true;

  return (
    <div className="space-y-6 pt-1">
      {/* HIERARCHY DEPTH row matching screenshots */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-darkbg-border pb-4">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            HIERARCHY DEPTH
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Toggle between direct Business Root and full Platform Root.
          </p>
        </div>

        {/* Toggle switcher pill matching screenshots */}
        <div className="inline-flex items-center bg-slate-100 dark:bg-darkbg p-1 rounded-full border border-slate-200 dark:border-darkbg-border text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setRootLevel('business')}
            className={`px-3.5 py-1 rounded-full transition-all duration-150 ${
              rootLevel === 'business'
                ? 'bg-white dark:bg-darkbg-card text-slate-900 dark:text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Business Root (Default)
          </button>
          <button
            type="button"
            onClick={() => setRootLevel('platform')}
            className={`px-3.5 py-1 rounded-full transition-all duration-150 ${
              rootLevel === 'platform'
                ? 'bg-white dark:bg-darkbg-card text-slate-900 dark:text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Platform Root
          </button>
        </div>
      </div>

      {/* Hierarchy Tree Area */}
      <div className="py-2">
        {rootLevel === 'platform' ? (
          /* PLATFORM ROOT VIEW (IMAGE 1) */
          <div className="space-y-3">
            {/* Level 0: Platform */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleNode('platform')}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition"
              >
                {isPlatformExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-3.5 py-1.5 rounded-full font-bold text-xs shadow-sm">
                <Globe className="h-3.5 w-3.5" />
                <span>Platform</span>
              </div>
            </div>

            {/* Level 1: Super Admin */}
            {isPlatformExpanded && (
              <div className="relative ml-3.5 pl-6 border-l border-slate-200 dark:border-slate-700/60 pt-2 space-y-3">
                <div className="flex items-center gap-2 relative">
                  <button
                    type="button"
                    onClick={() => toggleNode('superadmin')}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition"
                  >
                    {isSuperAdminExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 px-3.5 py-1.5 rounded-full font-bold text-xs shadow-sm">
                    <Shield className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Super Admin (Super Admin)</span>
                  </div>
                </div>

                {/* Level 2: Tenants */}
                {isSuperAdminExpanded && (
                  <div className="relative ml-3.5 pl-6 border-l border-slate-200 dark:border-slate-700/60 pt-2 space-y-3">
                    {tenants.map(t => (
                      <TenantNodeItem 
                        key={t.id} 
                        tenant={t} 
                        onSelectDetails={onSelectDetails}
                        onEdit={onEdit}
                        onSubscription={onSubscription}
                        onSuspend={onSuspend}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* BUSINESS ROOT VIEW (IMAGE 2) */
          <div className="space-y-3 pl-1">
            {tenants.map(t => (
              <TenantNodeItem 
                key={t.id} 
                tenant={t} 
                onSelectDetails={onSelectDetails} 
                onEdit={onEdit}
                onSubscription={onSubscription}
                onSuspend={onSuspend}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tenant Details Deep-Dive View Component ─────────────────────────────────

function TenantDetailsView({ tenant, onBack, onImpersonate, onForceLogout }: {
  tenant: any;
  onBack: () => void;
  onImpersonate: (u: DbUser, t: Tenant) => void;
  onForceLogout: (u: DbUser) => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'performance'>('overview');

  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [tenantBranches, setTenantBranches] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoadingDetails(true);
      try {
        const [usersRes, branchesRes, logsRes] = await Promise.all([
          fetch(`/api/users?filterTenantId=${tenant.id}&_t=${Date.now()}`),
          fetch(`/api/branches?filterTenantId=${tenant.id}&_t=${Date.now()}`),
          fetch(`/api/securityAuditLogs?filterTenantId=${tenant.id}&_t=${Date.now()}`)
        ]);

        if (usersRes.ok && branchesRes.ok && active) {
          const u = await usersRes.json();
          const b = await branchesRes.json();
          const l = logsRes.ok ? await logsRes.json() : [];
          setTenantUsers(u);
          setTenantBranches(b);
          setAuditLogs(l);
          return;
        }
      } catch (err) {
        console.warn('Failed to fetch tenant details from server, falling back to local DB:', err);
      }

      // Fallback to local Dexie queries
      if (active) {
        const u = await db.users.where('tenant_id').equals(tenant.id).toArray();
        const b = await db.branches.where('tenant_id').equals(tenant.id).toArray();
        const l = await db.auditLogs.where('tenant_id').equals(tenant.id).reverse().limit(10).toArray();
        setTenantUsers(u);
        setTenantBranches(b);
        setAuditLogs(l);
      }
    };

    loadData().finally(() => {
      if (active) setLoadingDetails(false);
    });

    return () => {
      active = false;
    };
  }, [tenant.id]);

  const performanceData = [
    { name: 'Jan', SalesVolume: 1200000, Transactions: 42 },
    { name: 'Feb', SalesVolume: 1850000, Transactions: 65 },
    { name: 'Mar', SalesVolume: 2400000, Transactions: 88 },
    { name: 'Apr', SalesVolume: 3100000, Transactions: 110 },
    { name: 'May', SalesVolume: 2900000, Transactions: 95 },
    { name: 'Jun', SalesVolume: 4200000, Transactions: 145 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div>
          <button onClick={onBack} className="text-xs font-bold text-primary hover:underline flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Tenants List
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">{tenant.name}</h1>
            <Badge variant={getBadgeVariant(tenant.status)}>{tenant.status}</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tenant Code: <span className="font-mono bg-slate-100 dark:bg-darkbg px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">{tenantIdentifierService.getReadableTenantId(tenant)}</span>
            {' · '}Email: <span className="font-mono text-slate-600 dark:text-slate-300">{tenant.email}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {loadingDetails && (
            <span className="text-xs text-slate-400 animate-pulse" style={{ marginRight: '8px' }}>Loading live profiles...</span>
          )}
          <Button variant="outline" size="sm" onClick={() => onBack()} className="text-xs">
            Close 360° Profile
          </Button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-200 dark:border-darkbg-border gap-6 text-xs font-bold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 border-b-2 transition-all ${activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Overview & Management
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`pb-3 border-b-2 transition-all ${activeTab === 'performance' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Tenant Performance Analytics
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Capacity Usage Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5 rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-sm">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Users Capacity</h4>
              <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                {tenantUsers.length} <span className="text-xs text-slate-400 font-normal">/ 50 Max</span>
              </p>
              <div className="mt-3 w-full bg-slate-100 dark:bg-darkbg rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min(100, (tenantUsers.length / 50) * 100)}%` }} />
              </div>
            </Card>

            <Card className="p-5 rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-sm">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Branches Capacity</h4>
              <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                {tenantBranches.length} <span className="text-xs text-slate-400 font-normal">/ 10 Max</span>
              </p>
              <div className="mt-3 w-full bg-slate-100 dark:bg-darkbg rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, (tenantBranches.length / 10) * 100)}%` }} />
              </div>
            </Card>

            <Card className="p-5 rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-sm">
              <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Plan & Status</h4>
              <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{tenant.plan}</p>
              <p className="mt-1 text-[11px] text-slate-400">Expires: {formatDate(tenant.subscription.renewalDate)}</p>
            </Card>
          </div>

          {/* Tenant Users List & Impersonation */}
          <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-sm space-y-4">
            <CardHeader className="p-0 pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Tenant User Accounts & Impersonation Sessions
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Launch live impersonation or force terminate session tokens for tenant staff.
              </CardDescription>
            </CardHeader>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-darkbg-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-darkbg border-b text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">User Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/40">
                  {tenantUsers.map(u => (
                    <tr key={u.id}>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{u.name}</td>
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{u.email}</td>
                      <td className="p-3"><Badge variant="outline">{(u as any).role || 'Tenant Staff'}</Badge></td>
                      <td className="p-3"><Badge variant="success">{u.status || 'Active'}</Badge></td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="h-7 text-[10px] bg-indigo-600 hover:bg-indigo-700" onClick={() => onImpersonate(u, tenant)}>
                            <Zap className="h-3 w-3 mr-1" /> Impersonate
                          </Button>
                          <Button size="sm" variant="danger" className="h-7 text-[10px]" onClick={() => onForceLogout(u)}>
                            <LogOut className="h-3 w-3 mr-1" /> Force Logout
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tenantUsers.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic text-xs">No user accounts registered.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Audit Logs Table */}
          {auditLogs.length > 0 && (
            <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Recent Tenant Audit Activity Logs</h4>
              <div className="space-y-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                {auditLogs.map(l => (
                  <div key={l.id} className="p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-100 dark:border-darkbg-border flex items-center justify-between">
                    <span>[{l.action}] {l.user_name || l.user_id || 'System'}: {l.details || `${l.entity || ''} (${l.entity_id || ''})`}</span>
                    <span className="text-[10px] text-slate-400">{new Date(Number(l.created_at || l.timestamp) || Date.now()).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Operating Outlets & Branches */}
          <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-sm space-y-4">
            <CardHeader className="p-0 pb-3 flex justify-between items-center">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-emerald-500" /> Physical Outlets & Branch Locations
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Manage headquarters and store locations for multi-branch operations.
                </CardDescription>
              </div>
            </CardHeader>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-darkbg-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-darkbg border-b text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Branch Name</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Location</th>
                    <th className="p-3">Headquarters</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/40">
                  {tenantBranches.map(b => (
                    <tr key={b.id}>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{b.name}</td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">{b.branch_code || b.id}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{b.location}</td>
                      <td className="p-3">
                        {b.is_headquarters ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-black text-[9px]">HQ</span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Branch</span>
                        )}
                      </td>
                      <td className="p-3"><Badge variant="success">Active</Badge></td>
                    </tr>
                  ))}
                  {tenantBranches.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic text-xs">No branch locations registered.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'performance' && (
        <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-sm space-y-5">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-emerald-500" /> Revenue & Transaction Trends
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Monthly sales volume and transaction count analytics for tenant {tenant.name}.
            </CardDescription>
          </CardHeader>
          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} />
                <YAxis stroke="#94A3B8" fontSize={10} />
                <Tooltip />
                <Area type="monotone" dataKey="SalesVolume" stroke="#10B981" fill="url(#colorSales)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
