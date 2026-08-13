import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { useAuth } from '../context/AuthContext';

export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'GRACE_PERIOD' | 'UNKNOWN';

export interface UsageLimit {
  current: number;
  max: number;
  percent: number;
  exceeded: boolean;
  nearLimit: boolean; // ≥ 80%
}

export interface UseSubscriptionReturn {
  subscriptionStatus: SubscriptionStatus;
  planCode: string;
  planName: string;
  graceDaysRemaining: number;
  isHardLocked: boolean;
  daysUntilExpiry: number;
  isExpiringSoon: boolean; // within 5 days
  hasFeature: (featureCode: string) => boolean;
  getUsageLimit: (resource: 'products' | 'users' | 'branches') => UsageLimit;
  enabledFeatureCodes: string[];
  currentPlan: import('../db/dexie').SubscriptionPlan | null;
  currentSub: import('../db/dexie').TenantSubscription | null;
}

export function useSubscription(): UseSubscriptionReturn {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || '';

  const currentSub = useLiveQuery(
    () => db.tenantSubscriptions.where('tenant_id').equals(tenantId).first(),
    [tenantId]
  );

  const plans = useLiveQuery(() => db.subscriptionPlans.toArray()) || [];
  const allFeatures = useLiveQuery(() => db.features.toArray()) || [];
  const allPlanFeatures = useLiveQuery(() => db.planFeatures.toArray()) || [];
  const usage = useLiveQuery(
    () => db.subscriptionUsage.where('tenant_id').equals(tenantId).first(),
    [tenantId]
  );

  const liveProductCount = useLiveQuery(
    () => db.products.where('tenant_id').equals(tenantId).filter(p => !((p as any).deleted_at || (p as any).deletedAt)).count(),
    [tenantId]
  ) || 0;

  const liveUserCount = useLiveQuery(
    () => db.users.where('tenant_id').equals(tenantId).filter(u => !((u as any).deleted_at || (u as any).deletedAt)).count(),
    [tenantId]
  ) || 0;

  const liveBranchCount = useLiveQuery(
    () => db.branches.where('tenant_id').equals(tenantId).filter(b => !((b as any).deleted_at || (b as any).deletedAt)).count(),
    [tenantId]
  ) || 0;

  const currentPlan = useMemo(() => {
    if (!plans.length) return null;
    if (currentSub?.plan_id) {
      const match = plans.find(p => p.id === currentSub.plan_id);
      if (match) return match;
    }
    // Fallback: match by tenant plan name/code
    const tenantPlanStr = (currentTenant.plan || '').toLowerCase();
    return plans.find(p => p.code.toLowerCase() === tenantPlanStr || p.name.toLowerCase().includes(tenantPlanStr)) || plans[0] || null;
  }, [currentSub, plans, currentTenant.plan]);

  // Compute effective subscription status (including offline grace period)
  const { subscriptionStatus, graceDaysRemaining, isHardLocked, daysUntilExpiry } = useMemo(() => {
    if (!currentSub) return { subscriptionStatus: 'ACTIVE' as SubscriptionStatus, graceDaysRemaining: 7, isHardLocked: false, daysUntilExpiry: 30 };

    const now = Date.now();
    const expiry = currentSub.end_date;
    const msDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry = Math.ceil((expiry - now) / msDay);

    if (currentSub.status === 'SUSPENDED') {
      return { subscriptionStatus: 'SUSPENDED' as SubscriptionStatus, graceDaysRemaining: 0, isHardLocked: true, daysUntilExpiry };
    }
    if (currentSub.status === 'CANCELLED') {
      return { subscriptionStatus: 'CANCELLED' as SubscriptionStatus, graceDaysRemaining: 0, isHardLocked: true, daysUntilExpiry };
    }
    if (currentSub.status === 'TRIAL') {
      if (now <= expiry) {
        return { subscriptionStatus: 'TRIAL' as SubscriptionStatus, graceDaysRemaining: 0, isHardLocked: false, daysUntilExpiry };
      } else {
        return { subscriptionStatus: 'EXPIRED' as SubscriptionStatus, graceDaysRemaining: 0, isHardLocked: true, daysUntilExpiry };
      }
    }
    if (now <= expiry) {
      return { subscriptionStatus: currentSub.status as SubscriptionStatus, graceDaysRemaining: 7, isHardLocked: false, daysUntilExpiry };
    }

    // Past expiry — check grace period (7 days)
    const graceEnd = expiry + 7 * msDay;
    if (now <= graceEnd) {
      const graceDays = Math.ceil((graceEnd - now) / msDay);
      return { subscriptionStatus: 'GRACE_PERIOD' as SubscriptionStatus, graceDaysRemaining: graceDays, isHardLocked: false, daysUntilExpiry };
    }

    // Hard locked — grace period over
    return { subscriptionStatus: 'EXPIRED' as SubscriptionStatus, graceDaysRemaining: 0, isHardLocked: true, daysUntilExpiry };
  }, [currentSub]);

  const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 5;

  // Build feature entitlement map for current plan
  const enabledFeatureCodes = useMemo(() => {
    if (!currentPlan || !allPlanFeatures.length || !allFeatures.length) return [];
    const planFeatureEntitlements = allPlanFeatures.filter(
      pf => pf.plan_id === currentPlan.id && pf.enabled
    );
    return planFeatureEntitlements.map(pf => {
      const feat = allFeatures.find(f => f.id === pf.feature_id);
      return feat?.code || '';
    }).filter(Boolean);
  }, [currentPlan, allPlanFeatures, allFeatures]);

  const hasFeature = (featureCode: string): boolean => {
    if (subscriptionStatus === 'SUSPENDED' || isHardLocked) return false;
    return enabledFeatureCodes.includes(featureCode);
  };

  const getUsageLimit = (resource: 'products' | 'users' | 'branches'): UsageLimit => {
    let current = 0;
    let max = 9999;

    if (resource === 'products') {
      current = usage?.products_used ?? liveProductCount;
      max = currentPlan?.max_products || 999999;
    } else if (resource === 'users') {
      current = usage?.users_used ?? liveUserCount;
      max = currentPlan?.max_users || 9999;
    } else if (resource === 'branches') {
      current = usage?.branches_used ?? liveBranchCount;
      max = currentPlan?.max_branches || 9999;
    }

    const percent = max === 0 ? 0 : Math.min(100, Math.round((current / max) * 100));
    return {
      current,
      max,
      percent,
      exceeded: current >= max,
      nearLimit: percent >= 80
    };
  };

  return {
    subscriptionStatus,
    planCode: currentPlan?.code || 'UNKNOWN',
    planName: currentPlan?.name || 'Unknown Plan',
    graceDaysRemaining,
    isHardLocked,
    daysUntilExpiry,
    isExpiringSoon,
    hasFeature,
    getUsageLimit,
    enabledFeatureCodes,
    currentPlan: currentPlan || null,
    currentSub: currentSub || null,
  };
}
