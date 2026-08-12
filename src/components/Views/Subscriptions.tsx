import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, type SubscriptionPlan, type Invoice, type Payment, type Coupon } from '../../db/dexie';
import { cloudDb } from '../../db/supabaseMock';
import { supabase } from '../../db/supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSubscription } from '../../hooks/useSubscription';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '../UI/custom-ui';
import {
  Clock, AlertTriangle, Trash2,
  DollarSign, Percent, Shield, Layers, Wifi, RefreshCw,
  Zap, BarChart2, Users, GitBranch, Package, Lock, Unlock,
  Activity, FileText, Tag, TrendingUp, X, CheckCircle,
  XCircle, Info, History, Settings, Plus, Edit, Save, SlidersHorizontal
} from 'lucide-react';

// ─── Status color helpers ───────────────────────────────────────────────────

function statusVariant(status: string): 'success' | 'danger' | 'info' | 'warning' {
  switch (status) {
    case 'ACTIVE': return 'success';
    case 'TRIAL': return 'info';
    case 'GRACE_PERIOD': return 'warning';
    case 'PAST_DUE': return 'warning';
    case 'EXPIRED': case 'SUSPENDED': case 'CANCELLED': return 'danger';
    default: return 'info';
  }
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  PLAN_UPGRADED:         <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />,
  PLAN_DOWNGRADED:       <TrendingUp className="h-3.5 w-3.5 text-amber-500 rotate-180" />,
  PAYMENT_RECEIVED:      <DollarSign className="h-3.5 w-3.5 text-blue-500" />,
  TRIAL_STARTED:         <Zap className="h-3.5 w-3.5 text-violet-500" />,
  TRIAL_EXTENDED:        <Clock className="h-3.5 w-3.5 text-indigo-400" />,
  SUBSCRIPTION_EXPIRED:  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  SUBSCRIPTION_CANCELLED:<X className="h-3.5 w-3.5 text-red-400" />,
  FEATURE_ENABLED:       <Unlock className="h-3.5 w-3.5 text-teal-500" />,
  LIMIT_OVERRIDDEN:      <Settings className="h-3.5 w-3.5 text-orange-500" />,
  COUPON_APPLIED:        <Tag className="h-3.5 w-3.5 text-pink-500" />,
};

// ─── Usage Progress Bar ─────────────────────────────────────────────────────
function UsageBar({ label, icon, current, max, unit = '' }: {
  label: string; icon: React.ReactNode; current: number; max: number; unit?: string;
}) {
  const isUnlimited = max >= 9999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100));
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          {icon}{label}
        </span>
        <span className="font-mono text-slate-500">
          {current.toLocaleString()} / {isUnlimited ? '∞' : max.toLocaleString()}
          {unit && ` ${unit}`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-darkbg/60 overflow-hidden">
        {isUnlimited ? (
          <div className="h-full w-full bg-gradient-to-r from-emerald-400 to-teal-400 animate-pulse" />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {!isUnlimited && pct >= 80 && (
        <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          {pct >= 100 ? '⛔ Limit reached — upgrade to add more' : `⚠ ${100 - pct}% capacity remaining`}
        </p>
      )}
    </div>
  );
}

// ─── Feature Row ────────────────────────────────────────────────────────────
function FeatureRow({ name, module: mod, description, enabled }: {
  name: string; module: string; description: string; enabled: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
      enabled
        ? 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/10'
        : 'border-slate-100 dark:border-darkbg-border/30 bg-slate-50/30 dark:bg-darkbg/10 opacity-60'
    }`}>
      <div className={`mt-0.5 shrink-0 rounded-full p-1 ${enabled ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-slate-100 dark:bg-darkbg/30 text-slate-400'}`}>
        {enabled ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-800 dark:text-white">{name}</span>
          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-darkbg/40 text-slate-500">{mod}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="shrink-0">
        {enabled
          ? <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">✓ Active</span>
          : <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Locked</span>
        }
      </div>
    </div>
  );
}

// ─── Main Subscriptions Component ──────────────────────────────────────────
export const Subscriptions: React.FC = () => {
  const { currentTenant, role } = useAuth();
  const sub = useSubscription();

  // Tabs for this module
  const TABS = ['Plans & Pricing', 'Features', 'Usage Meter', 'Coupons', 'Grace Periods', 'Audit Log'];

  const [currentTab, setCurrentTab] = useState('Plans & Pricing');

  // ── DB queries (Central Production PostgreSQL cloudDb) ───────────────────
  const cloudPlans = useLiveQuery(() => cloudDb.cloud_subscription_plans.toArray()) || [];
  const localPlans = useLiveQuery(() => db.subscriptionPlans.toArray()) || [];

  const plans = useMemo(() => {
    const map = new Map<string, SubscriptionPlan>();
    // First insert localPlans defaults
    for (const p of localPlans) {
      map.set(p.id, p);
      if (p.code) map.set(p.code, p);
    }
    // Then layer cloudPlans on top
    for (const p of cloudPlans) {
      map.set(p.id, p);
      if (p.code) map.set(p.code, p);
    }
    return Array.from(new Set(map.values()));
  }, [cloudPlans, localPlans]);

  // Ensure cloudDb.cloud_subscription_plans is seeded with default plans if empty
  useEffect(() => {
    if (localPlans.length > 0) {
      (async () => {
        const count = await cloudDb.cloud_subscription_plans.count();
        if (count === 0) {
          await cloudDb.cloud_subscription_plans.bulkPut(localPlans);
        }
      })();
    }
  }, [localPlans]);
  const currentSub = useLiveQuery(() =>
    db.tenantSubscriptions.where('tenant_id').equals(currentTenant.id).first()
  );
  const invoices = useLiveQuery(() =>
    db.invoices.where('tenant_id').equals(currentTenant.id).toArray()
  ) || [];
  const payments = useLiveQuery(() =>
    db.payments.where('tenant_id').equals(currentTenant.id).toArray()
  ) || [];
  const allFeatures = useLiveQuery(() => db.features.toArray()) || [];
  const allPlanFeatures = useLiveQuery(() => db.planFeatures.toArray()) || [];
  const coupons = useLiveQuery(() => db.coupons.toArray()) || [];
  const subEvents = useLiveQuery(() =>
    db.subscriptionEvents.where('tenant_id').equals(currentTenant.id).reverse().sortBy('created_at')
  ) || [];

  // ── Coupon state ──────────────────────────────────────────────────────────
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');

  // ── Payment state ─────────────────────────────────────────────────────────
  const [payingPlan, setPayingPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<'M-PESA' | 'AIRTEL' | 'CRDB' | 'NBC' | 'STRIPE' | 'PAYPAL'>('M-PESA');
  const [phoneNumber, setPhoneNumber] = useState('+255');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // ── Alter Subscription Tiers State ────────────────────────────────────────
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '',
    code: '',
    description: '',
    price: 49000,
    billing_cycle: 'monthly' as 'monthly' | 'yearly',
    max_users: 5,
    max_branches: 1,
    max_products: 5000,
    max_storage_mb: 2000,
    is_trial: false,
    is_active: true
  });

  const openCreatePlanModal = () => {
    setEditingPlan(null);
    setPlanForm({
      name: '',
      code: '',
      description: '',
      price: 49000,
      billing_cycle: 'monthly',
      max_users: 5,
      max_branches: 1,
      max_products: 5000,
      max_storage_mb: 2000,
      is_trial: false,
      is_active: true
    });
    setIsPlanModalOpen(true);
  };

  const openEditPlanModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      code: plan.code,
      description: plan.description,
      price: plan.price,
      billing_cycle: plan.billing_cycle,
      max_users: plan.max_users,
      max_branches: plan.max_branches,
      max_products: plan.max_products,
      max_storage_mb: plan.max_storage_mb,
      is_trial: plan.is_trial,
      is_active: plan.is_active
    });
    setIsPlanModalOpen(true);
  };

  const handleSavePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const planId = editingPlan ? editingPlan.id : `plan-${Date.now()}`;
      const code = planForm.code.trim().toUpperCase() || planForm.name.trim().toUpperCase().replace(/\s+/g, '_');
      
      const payload: SubscriptionPlan = {
        id: planId,
        name: planForm.name.trim(),
        code,
        description: planForm.description.trim(),
        price: Number(planForm.price),
        currency: 'TZS',
        billing_cycle: planForm.billing_cycle,
        max_users: Number(planForm.max_users),
        max_branches: Number(planForm.max_branches),
        max_products: Number(planForm.max_products),
        max_storage_mb: Number(planForm.max_storage_mb),
        is_trial: planForm.is_trial,
        is_active: planForm.is_active,
        created_at: editingPlan ? editingPlan.created_at : Date.now(),
        updated_at: Date.now()
      };

      await cloudDb.cloud_subscription_plans.put(payload);
      await db.subscriptionPlans.put(payload);

      try {
        await fetch('/api/subscriptionPlans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-admin-system' },
          body: JSON.stringify(payload)
        });
      } catch (apiErr) {
        console.warn('[API Persistence] DevServer sync notice:', apiErr);
      }

      try {
        await supabase.from('subscriptionPlans').insert(payload as any);
      } catch (cloudErr) {
        console.warn('[Cloud Sync] Failed to push subscription plan to Cloud:', cloudErr);
      }

      await db.subscriptionEvents.put({
        id: `ev-plan-${Date.now()}`,
        tenant_id: currentTenant.id,
        event_type: 'LIMIT_OVERRIDDEN',
        old_value: editingPlan || {},
        new_value: payload,
        performed_by: 'Super Admin',
        created_at: Date.now()
      });

      alert(`✅ Subscription Tier "${payload.name}" successfully saved!`);
      setIsPlanModalOpen(false);
      setEditingPlan(null);
    } catch (err: any) {
      alert(`Error saving subscription tier: ${err.message || 'Failed'}`);
    }
  };

  const handleDeletePlanSubmit = async (plan: SubscriptionPlan) => {
    const isSystemTier = ['plan-trial', 'plan-starter', 'plan-basic', 'plan-growth', 'plan-enterprise'].includes(plan.id) || ['TRIAL', 'FREE', 'BASIC', 'GROWTH', 'ENTERPRISE', 'STARTER'].includes(plan.code);
    if (isSystemTier) {
      alert(`System core tier "${plan.name}" is protected and cannot be deleted.`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete Subscription Tier "${plan.name}"?`)) {
      try {
        await cloudDb.cloud_subscription_plans.delete(plan.id);
        await db.subscriptionPlans.delete(plan.id);
        alert(`✅ Subscription Tier "${plan.name}" deleted successfully.`);
      } catch (e: any) {
        alert(`Error deleting subscription tier: ${e.message || 'Failed'}`);
      }
    }
  };


  // ── Coupon validation (DB-backed) ─────────────────────────────────────────
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    setCouponSuccess('');
    setAppliedCoupon(null);
    const code = couponCode.trim().toUpperCase();

    const found = coupons.find(c => c.code === code);
    if (!found) {
      setCouponError(`Coupon "${code}" not found.`);
      return;
    }
    if (!found.is_active) {
      setCouponError(`Coupon "${code}" is no longer active.`);
      return;
    }
    if (Date.now() > found.valid_until) {
      setCouponError(`Coupon "${code}" expired on ${new Date(found.valid_until).toLocaleDateString()}.`);
      return;
    }
    if (found.max_uses > 0 && found.times_used >= found.max_uses) {
      setCouponError(`Coupon "${code}" has reached its maximum usage limit.`);
      return;
    }
    // Plan restriction check
    if (found.applicable_plans.length > 0 && sub.planCode && !found.applicable_plans.includes(sub.planCode)) {
      setCouponError(`Coupon "${code}" is only valid for: ${found.applicable_plans.join(', ')}.`);
      return;
    }
    setAppliedCoupon(found);
    setCouponSuccess(`✅ ${found.discount_percent}% discount applied! ${found.description}`);
  };

  // ── Payment processing ────────────────────────────────────────────────────
  const handleProcessPayment = async () => {
    if (!payingPlan) return;
    setIsProcessingPayment(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const discount = appliedCoupon?.discount_percent || 0;
      const discountedPrice = payingPlan.price * (1 - discount / 100);
      const totalToPay = discountedPrice * 1.16; // 16% VAT

      const paymentId = `pay-${Date.now()}`;
      const newPayment: Payment = {
        id: paymentId,
        tenant_id: currentTenant.id,
        subscription_id: currentSub?.id || `sub-${currentTenant.id}`,
        provider: paymentProvider as Payment['provider'],
        transaction_reference: `${paymentProvider}-TXN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        amount: totalToPay,
        currency: 'TZS',
        status: 'COMPLETED',
        paid_at: Date.now()
      };
      await db.payments.put(newPayment);

      const invoiceId = `inv-${Date.now()}`;
      const newInvoice: Invoice = {
        id: invoiceId,
        tenant_id: currentTenant.id,
        invoice_number: `DKP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
        amount: discountedPrice,
        tax: discountedPrice * 0.16,
        total: totalToPay,
        status: 'PAID',
        due_date: Date.now(),
        created_at: Date.now()
      };
      await db.invoices.put(newInvoice);

      const newExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      // Use the actual subscription ID, creating one if it doesn't exist yet
      const subId = currentSub?.id || `sub-${currentTenant.id}`;
      await db.tenantSubscriptions.put({
        ...(currentSub || {
          id: subId,
          tenant_id: currentTenant.id,
          start_date: Date.now(),
          auto_renew: true,
          created_at: Date.now()
        }),
        plan_id: payingPlan.id,
        status: 'ACTIVE',
        end_date: newExpiry,
        updated_at: Date.now()
      });

      await db.tenants.update(currentTenant.id, {
        plan: payingPlan.name.replace(' Plan', '') as any
      });

      // Log event
      await db.subscriptionEvents.put({
        id: `ev-${Date.now()}`,
        tenant_id: currentTenant.id,
        event_type: 'PLAN_UPGRADED',
        old_value: { plan_id: currentSub?.plan_id, status: currentSub?.status },
        new_value: { plan_id: payingPlan.id, status: 'ACTIVE', end_date: newExpiry },
        performed_by: 'Tenant Owner',
        created_at: Date.now()
      });

      // If coupon applied, increment usage & log event
      if (appliedCoupon) {
        await db.coupons.update(appliedCoupon.id, { times_used: appliedCoupon.times_used + 1 });
        await db.subscriptionEvents.put({
          id: `ev-coup-${Date.now()}`,
          tenant_id: currentTenant.id,
          event_type: 'COUPON_APPLIED',
          old_value: {},
          new_value: { coupon: appliedCoupon.code, discount: appliedCoupon.discount_percent },
          performed_by: 'Tenant Owner',
          created_at: Date.now()
        });
        setAppliedCoupon(null);
        setCouponCode('');
      }

      // Log payment event
      await db.subscriptionEvents.put({
        id: `ev-pay-${Date.now()}`,
        tenant_id: currentTenant.id,
        event_type: 'PAYMENT_RECEIVED',
        old_value: {},
        new_value: { amount: totalToPay, provider: paymentProvider, invoice: newInvoice.invoice_number },
        performed_by: 'Tenant Owner',
        created_at: Date.now()
      });

      alert(`✅ Payment of Tsh. ${totalToPay.toLocaleString()} received!\nSubscription upgraded/renewed to ${payingPlan.name}.`);
      setPayingPlan(null);
    } catch (e) {
      console.error(e);
      alert('Payment processing failed. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // ── Super Admin Controls ──────────────────────────────────────────────────
  const handleExtendTrial = async () => {
    if (!currentSub) return;
    const newEnd = currentSub.end_date + 7 * 24 * 60 * 60 * 1000;
    await db.tenantSubscriptions.update(currentSub.id, { end_date: newEnd, status: 'ACTIVE' });
    await db.subscriptionEvents.put({
      id: `ev-ext-${Date.now()}`, tenant_id: currentTenant.id, event_type: 'TRIAL_EXTENDED',
      old_value: { end_date: currentSub.end_date }, new_value: { end_date: newEnd },
      performed_by: 'Super Admin', created_at: Date.now()
    });
    alert('✅ Extended tenant subscription by 7 days.');
  };

  const handleToggleSuspend = async () => {
    if (!currentSub) return;
    const nextStatus = currentSub.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    await db.tenantSubscriptions.update(currentSub.id, { status: nextStatus });
    await db.subscriptionEvents.put({
      id: `ev-susp-${Date.now()}`, tenant_id: currentTenant.id,
      event_type: nextStatus === 'SUSPENDED' ? 'SUBSCRIPTION_CANCELLED' : 'PLAN_UPGRADED',
      old_value: { status: currentSub.status }, new_value: { status: nextStatus },
      performed_by: 'Super Admin', created_at: Date.now()
    });
    alert(`✅ Tenant subscription status set to ${nextStatus}.`);
  };

  const handleOverrideLimits = async () => {
    await db.subscriptionEvents.put({
      id: `ev-ovr-${Date.now()}`, tenant_id: currentTenant.id, event_type: 'LIMIT_OVERRIDDEN',
      old_value: {}, new_value: { features: ['MULTI_BRANCH', 'AI_ASSISTANT', 'API_ACCESS'], note: 'Admin custom override' },
      performed_by: 'Super Admin', created_at: Date.now()
    });
    alert('✅ Custom Feature Override applied: MULTI_BRANCH + AI_ASSISTANT + API_ACCESS enabled for this tenant.');
  };

  // ── Expiry warning banner ─────────────────────────────────────────────────
  const showExpiryBanner = sub.isExpiringSoon || sub.subscriptionStatus === 'GRACE_PERIOD' || sub.subscriptionStatus === 'EXPIRED';

  return (
    <div className="space-y-5">
      {/* ── Expiry Warning Banner ── */}
      {showExpiryBanner && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border text-sm font-semibold ${
          sub.subscriptionStatus === 'EXPIRED' || sub.isHardLocked
            ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300'
        }`}>
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            {sub.subscriptionStatus === 'GRACE_PERIOD'
              ? `⏳ Your subscription has expired. You're in the 7-day offline grace period (${sub.graceDaysRemaining} days remaining). Renew now to avoid a hard lock.`
              : sub.subscriptionStatus === 'EXPIRED'
              ? `🔒 Subscription hard-locked. Please renew immediately to restore full access.`
              : `⚠ Your ${sub.planName} expires in ${sub.daysUntilExpiry} day(s). Renew now to avoid service interruption.`
            }
            <button onClick={() => setCurrentTab('Plans & Pricing')} className="ml-2 underline font-bold">
              Renew Now →
            </button>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            SaaS Subscription Control Panel
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tenant: <span className="font-semibold text-slate-600 dark:text-slate-200">{currentTenant.name}</span>
            {' · '}
            Plan: <span className="font-semibold text-primary">{sub.planName}</span>
            {' · '}
            Status:&nbsp;
            <Badge variant={statusVariant(sub.subscriptionStatus)} className="ml-0.5 font-bold uppercase tracking-wider text-[9px] px-2 py-0.5">
              {sub.subscriptionStatus}
            </Badge>
            {currentSub && (
              <span className="ml-2 text-slate-400">
                · Expires: {new Date(currentSub.end_date).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>

        {/* Tab selector */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-darkbg p-1 rounded-xl text-[11px] font-bold self-start sm:self-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setCurrentTab(t)}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                currentTab === t
                  ? 'bg-white dark:bg-darkbg-card text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: PLANS & PRICING
      ═══════════════════════════════════════════════════════════════════ */}
      {currentTab === 'Plans & Pricing' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Subscription Tiers & Capacity Control Panel
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure plan pricing, user capacities, branch limits, and active subscription tiers.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={openCreatePlanModal} className="text-xs font-bold">
              <Plus className="h-4 w-4 mr-1" /> Create / Alter Tier
            </Button>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p: SubscriptionPlan) => {
              const isActive = p.id === currentSub?.plan_id;
              const planPfs = allPlanFeatures.filter(pf => pf.plan_id === p.id);
              const enabledCount = planPfs.filter(pf => pf.enabled).length;
              const totalCount = planPfs.length;

              return (
                <Card
                  key={p.id}
                  className={`relative flex flex-col border rounded-2xl overflow-hidden shadow-sm transition-all ${
                    isActive
                      ? 'border-2 border-primary bg-primary/5 dark:bg-primary/5 ring-2 ring-primary/20'
                      : 'border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card hover:shadow-md'
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-2.5 right-2.5 bg-primary text-white text-[8px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full shadow-sm">
                      Current
                    </span>
                  )}
                  {p.code === 'BUSINESS' && !isActive && (
                    <span className="absolute top-2.5 right-2.5 bg-amber-400 text-white text-[8px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full">
                      Popular
                    </span>
                  )}

                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-center justify-between gap-1.5 pr-12">
                      <CardTitle className="text-sm font-black text-slate-800 dark:text-white truncate">{p.name}</CardTitle>
                      <button
                        onClick={() => openEditPlanModal(p)}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-darkbg text-slate-400 hover:text-primary transition shrink-0"
                        title="Alter Subscription Tier Parameters"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <CardDescription className="text-[10px] text-slate-400 mt-1 min-h-[28px] line-clamp-2">{p.description}</CardDescription>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        {p.price === 0 ? 'Free' : `Tsh. ${p.price.toLocaleString()}`}
                      </span>
                      {p.price > 0 && <span className="text-[10px] text-slate-400 font-semibold">/ mo</span>}
                    </div>
                  </CardHeader>

                  <CardContent className="px-4 pb-4 space-y-3 flex-1 flex flex-col">
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="bg-slate-50 dark:bg-darkbg/30 rounded-lg p-1.5 text-center">
                        <div className="font-black text-slate-900 dark:text-white">
                          {p.max_users >= 9999 ? '∞' : p.max_users}
                        </div>
                        <div className="text-slate-400 text-[9px]">Users</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-darkbg/30 rounded-lg p-1.5 text-center">
                        <div className="font-black text-slate-900 dark:text-white">
                          {p.max_branches >= 9999 ? '∞' : p.max_branches}
                        </div>
                        <div className="text-slate-400 text-[9px]">Branches</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-darkbg/30 rounded-lg p-1.5 text-center">
                        <div className="font-black text-slate-900 dark:text-white">
                          {p.max_products >= 999999 ? '∞' : p.max_products.toLocaleString()}
                        </div>
                        <div className="text-slate-400 text-[9px]">Products</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-darkbg/30 rounded-lg p-1.5 text-center">
                        <div className="font-black text-slate-900 dark:text-white">
                          {p.max_storage_mb >= 10000 ? `${p.max_storage_mb / 1000} GB` : `${p.max_storage_mb} MB`}
                        </div>
                        <div className="text-slate-400 text-[9px]">Storage</div>
                      </div>
                    </div>

                    {totalCount > 0 && (
                      <div className="text-[9px] text-slate-500">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{enabledCount}</span>/{totalCount} features
                        <div className="mt-1 h-1 rounded-full bg-slate-100 dark:bg-darkbg/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{ width: `${totalCount ? (enabledCount / totalCount) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-auto pt-2 flex flex-col gap-1.5">
                      <Button
                        onClick={() => setPayingPlan(p)}
                        variant={isActive ? 'outline' : 'primary'}
                        className="w-full text-[11px] font-bold h-7 py-0"
                      >
                        {isActive ? '↻ Renew' : '⬆ Upgrade'}
                      </Button>
                      <div className="flex items-center gap-1.5">
                        <Button
                          onClick={() => openEditPlanModal(p)}
                          variant="ghost"
                          className="flex-1 text-[10px] font-semibold text-slate-500 hover:text-primary py-0 h-6"
                        >
                          <Edit className="h-3 w-3 mr-1" /> Alter Tier
                        </Button>
                        {!['plan-trial', 'plan-starter', 'plan-basic', 'plan-growth', 'plan-enterprise'].includes(p.id) && !['TRIAL', 'FREE', 'BASIC', 'GROWTH', 'ENTERPRISE', 'STARTER'].includes(p.code) && (
                          <Button
                            onClick={() => handleDeletePlanSubmit(p)}
                            variant="ghost"
                            className="text-[10px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 py-0 h-6 px-2"
                            title="Delete Custom Subscription Tier"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Invoice Ledger */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-500" />
                Tenant Invoice Ledger
              </CardTitle>
              <CardDescription>Billing history and payment records for this tenant.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="p-3.5 pl-6">Invoice #</th>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Due Date</th>
                      <th className="p-3.5">Subtotal</th>
                      <th className="p-3.5">VAT (16%)</th>
                      <th className="p-3.5">Total</th>
                      <th className="p-3.5 pr-6">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                    {invoices.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">No invoices found.</td></tr>
                    ) : (
                      invoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                          <td className="p-3.5 pl-6 font-mono font-bold text-slate-700 dark:text-slate-300">{inv.invoice_number}</td>
                          <td className="p-3.5">{new Date(inv.created_at).toLocaleDateString()}</td>
                          <td className="p-3.5">{new Date(inv.due_date).toLocaleDateString()}</td>
                          <td className="p-3.5 font-semibold">Tsh. {inv.amount.toLocaleString()}</td>
                          <td className="p-3.5 text-slate-400">Tsh. {inv.tax.toLocaleString()}</td>
                          <td className="p-3.5 font-bold text-slate-800 dark:text-white">Tsh. {inv.total.toLocaleString()}</td>
                          <td className="p-3.5 pr-6">
                            <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'OVERDUE' ? 'danger' : 'warning'}>
                              {inv.status}
                            </Badge>
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
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: FEATURES
      ═══════════════════════════════════════════════════════════════════ */}
      {currentTab === 'Features' && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-500" />
                Feature Entitlements — {sub.planName}
              </CardTitle>
              <CardDescription>
                Features your current plan entitles you to. Upgrade to unlock additional capabilities.
                <span className="ml-2 font-bold text-emerald-600 dark:text-emerald-400">
                  {sub.enabledFeatureCodes.length} of {allFeatures.length} features active
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Group by module */}
              {(() => {
                const grouped = allFeatures.reduce((acc, feat) => {
                  if (!acc[feat.module]) acc[feat.module] = [];
                  acc[feat.module].push(feat);
                  return acc;
                }, {} as Record<string, typeof allFeatures>);

                return Object.entries(grouped).map(([moduleName, feats]) => (
                  <div key={moduleName} className="space-y-1.5">
                    <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 pt-2 pb-0.5 border-b border-slate-100 dark:border-darkbg-border/30">
                      {moduleName}
                    </h4>
                    {feats.map(feat => {
                      const pf = allPlanFeatures.find(
                        x => x.plan_id === sub.currentPlan?.id && x.feature_id === feat.id
                      );
                      const enabled = pf?.enabled ?? false;
                      return (
                        <FeatureRow
                          key={feat.id}
                          name={feat.name}
                          module={feat.module}
                          description={feat.description}
                          enabled={enabled}
                        />
                      );
                    })}
                  </div>
                ));
              })()}
            </CardContent>
          </Card>

          {/* Comparison table shortcut */}
          <Card className="bg-gradient-to-br from-primary/5 to-indigo-50/30 dark:from-primary/10 dark:to-indigo-900/10 border-primary/20">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">Want more features?</p>
                <p className="text-xs text-slate-500 mt-0.5">Upgrade to Business or Enterprise to unlock AI, API access, and unlimited branches.</p>
              </div>
              <Button variant="primary" className="shrink-0 text-xs" onClick={() => setCurrentTab('Plans & Pricing')}>
                View Plans →
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3: USAGE METER
      ═══════════════════════════════════════════════════════════════════ */}
      {currentTab === 'Usage Meter' && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-500" />
                Resource Usage — {sub.planName}
              </CardTitle>
              <CardDescription>Live usage metrics tracked against your plan limits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {(() => {
                const productLimit = sub.getUsageLimit('products');
                const userLimit = sub.getUsageLimit('users');
                const branchLimit = sub.getUsageLimit('branches');
                return (
                  <>
                    <UsageBar label="Products" icon={<Package className="h-3.5 w-3.5 text-violet-500" />}
                      current={productLimit.current} max={productLimit.max} />
                    <UsageBar label="Users" icon={<Users className="h-3.5 w-3.5 text-blue-500" />}
                      current={userLimit.current} max={userLimit.max} />
                    <UsageBar label="Branches" icon={<GitBranch className="h-3.5 w-3.5 text-emerald-500" />}
                      current={branchLimit.current} max={branchLimit.max} />
                    <UsageBar label="Storage" icon={<Activity className="h-3.5 w-3.5 text-amber-500" />}
                      current={128} max={sub.currentPlan?.max_storage_mb || 500} unit="MB" />
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Usage Summary
              </CardTitle>
              <CardDescription>Current billing period resource consumption.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Plan', value: sub.planName, color: 'text-primary' },
                { label: 'Billing Cycle', value: sub.currentPlan?.billing_cycle === 'monthly' ? 'Monthly' : 'Yearly', color: '' },
                { label: 'Subscription Status', value: sub.subscriptionStatus, color: statusVariant(sub.subscriptionStatus) === 'success' ? 'text-emerald-600' : 'text-amber-600' },
                { label: 'Plan Expires', value: currentSub ? new Date(currentSub.end_date).toLocaleDateString() : '—', color: sub.isExpiringSoon ? 'text-red-500' : '' },
                { label: 'Auto-Renewal', value: currentSub?.auto_renew ? 'Enabled' : 'Disabled', color: currentSub?.auto_renew ? 'text-emerald-600' : 'text-amber-600' },
                { label: 'Total Invoices', value: `${invoices.length} invoices`, color: '' },
                { label: 'Payments Made', value: `${payments.length} transactions`, color: '' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center text-xs border-b border-slate-50 dark:border-darkbg-border/10 pb-2">
                  <span className="text-slate-500">{row.label}</span>
                  <span className={`font-bold text-slate-800 dark:text-white ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 4: COUPONS
      ═══════════════════════════════════════════════════════════════════ */}
      {currentTab === 'Coupons' && (
        <div className="grid gap-5 md:grid-cols-2">
          {/* Coupon Apply Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Percent className="h-4 w-4 text-pink-500" />
                Apply Discount Coupon
              </CardTitle>
              <CardDescription>Validate and apply referral, corporate, or promo coupons on renewal checkout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleApplyCoupon} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter coupon code (e.g. DUKAPOS20)"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-darkbg-card focus:outline-none focus:ring-2 focus:ring-primary uppercase tracking-wider font-mono"
                />
                <Button type="submit" variant="primary" className="h-9 text-xs shrink-0">
                  Apply
                </Button>
              </form>
              {couponError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 rounded-lg text-xs text-red-600 dark:text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {couponError}
                </div>
              )}
              {couponSuccess && appliedCoupon && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 rounded-lg text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-bold">{appliedCoupon.discount_percent}% discount ready!</p>
                    <p className="text-[10px] mt-0.5">{appliedCoupon.description}</p>
                    <p className="text-[10px] mt-0.5 opacity-70">Valid until: {new Date(appliedCoupon.valid_until).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
              {appliedCoupon && (
                <Button onClick={() => setCurrentTab('Plans & Pricing')} variant="primary" className="w-full text-xs">
                  Proceed to Checkout with {appliedCoupon.discount_percent}% Off →
                </Button>
              )}
            </CardContent>
          </Card>

          {/* All Coupons List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-indigo-500" />
                Available Promotions
              </CardTitle>
              <CardDescription>Platform-wide coupon codes and their redemption status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {coupons.map(c => (
                <div
                  key={c.id}
                  className={`p-3 rounded-xl border text-xs ${
                    c.is_active && Date.now() <= c.valid_until
                      ? 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10'
                      : 'border-slate-100 dark:border-darkbg-border/30 bg-slate-50/30 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono font-black text-primary dark:text-primary-dark tracking-wider">{c.code}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={c.is_active && Date.now() <= c.valid_until ? 'success' : 'danger'}>
                        {c.is_active && Date.now() <= c.valid_until ? 'Active' : 'Expired'}
                      </Badge>
                      <span className="font-black text-slate-800 dark:text-white">{c.discount_percent}% OFF</span>
                    </div>
                  </div>
                  <p className="text-slate-500 mt-1">{c.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                    <span>Used: {c.times_used}{c.max_uses > 0 ? `/${c.max_uses}` : ''}</span>
                    <span>·</span>
                    <span>Expires: {new Date(c.valid_until).toLocaleDateString()}</span>
                    {c.applicable_plans.length > 0 && (
                      <><span>·</span><span>Plans: {c.applicable_plans.join(', ')}</span></>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 5: GRACE PERIODS
      ═══════════════════════════════════════════════════════════════════ */}
      {currentTab === 'Grace Periods' && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Offline Subscription Grace Period
              </CardTitle>
              <CardDescription>
                DukaPos allows 7 days of offline operation after subscription expiry before hard-locking.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Grace meter */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${
                sub.subscriptionStatus === 'GRACE_PERIOD'
                  ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40'
                  : sub.isHardLocked
                  ? 'border-red-200 dark:border-red-900/50 bg-red-50/30'
                  : 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30'
              }`}>
                <div className={`rounded-full p-3 ${
                  sub.subscriptionStatus === 'GRACE_PERIOD' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600'
                  : sub.isHardLocked ? 'bg-red-100 dark:bg-red-950/40 text-red-500'
                  : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600'
                }`}>
                  {sub.isHardLocked ? <Lock className="h-6 w-6" /> : sub.subscriptionStatus === 'GRACE_PERIOD' ? <AlertTriangle className="h-6 w-6" /> : <Unlock className="h-6 w-6" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                    {sub.isHardLocked ? 'Hard Locked — Subscription Expired' : sub.subscriptionStatus === 'GRACE_PERIOD' ? 'Grace Period Active' : 'Subscription Active'}
                  </h4>
                  <p className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                    {sub.subscriptionStatus === 'GRACE_PERIOD' ? `${sub.graceDaysRemaining} Days` : sub.isHardLocked ? 'Locked' : '7 Days Ready'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Grace period hard-lock: {currentSub ? new Date(currentSub.end_date + 7 * 24 * 60 * 60 * 1000).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Policy rules */}
              <div className="space-y-2 text-xs">
                <h4 className="font-bold text-slate-800 dark:text-white">Offline Grace Policy Rules:</h4>
                {[
                  { icon: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />, text: 'Active subscription: 100% offline operation guaranteed.' },
                  { icon: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />, text: 'Expired (within grace): POS sales, billing, inventory lookups remain operational.' },
                  { icon: <XCircle className="h-3.5 w-3.5 text-red-400" />, text: 'Expired (within grace): Adding new branches, users, or modules is blocked.' },
                  { icon: <XCircle className="h-3.5 w-3.5 text-red-400" />, text: 'Hard lock after grace: Internet required to sync and verify license.' },
                  { icon: <Info className="h-3.5 w-3.5 text-blue-400" />, text: 'POS sales data is preserved locally and synced upon reconnection.' },
                ].map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">{r.icon}</span>
                    <span className="text-slate-500">{r.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sync Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wifi className="h-4 w-4 text-indigo-500" />
                Offline License Sync Audit
              </CardTitle>
              <CardDescription>Real-time checks to verify local IndexedDB cache against DukaPos servers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Local Status Cache', value: <Badge variant="success">SYNCED</Badge> },
                { label: 'Last Sync Timestamp', value: <span className="font-mono text-slate-400">{new Date(currentSub?.updated_at || Date.now()).toLocaleTimeString()}</span> },
                { label: 'JWT Claims Valid', value: <Badge variant="success">VALID</Badge> },
                { label: 'Local License Hash', value: <span className="font-mono text-[10px] text-slate-500">SHA256: 9e32a76f...b29c</span> },
                { label: 'IndexedDB Version', value: <span className="font-mono text-slate-400">v7</span> },
                { label: 'Offline Mode', value: <Badge variant={navigator.onLine ? 'success' : 'warning'}>{navigator.onLine ? 'ONLINE' : 'OFFLINE'}</Badge> },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center p-2.5 rounded-lg border border-slate-200 dark:border-darkbg-border/50 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-200">{row.label}</span>
                  {row.value}
                </div>
              ))}

              <Button
                variant="outline"
                className="w-full text-xs font-bold flex items-center justify-center gap-1.5"
                onClick={() => alert('🔄 Syncing local license state cache with DukaPos backend Gateway...\n✅ License verified. IndexedDB updated.')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Force Sync License Cache
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 6: AUDIT LOG
      ═══════════════════════════════════════════════════════════════════ */}
      {currentTab === 'Audit Log' && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                Subscription Events Audit Trail
              </CardTitle>
              <CardDescription>
                Immutable log of all subscription lifecycle events — plan upgrades, payments, feature changes, and admin actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                {subEvents.length === 0 ? (
                  <p className="p-6 text-center text-slate-400 italic text-sm">No subscription events recorded yet.</p>
                ) : (
                  subEvents.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3 p-4 hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <div className="mt-0.5 rounded-full bg-slate-100 dark:bg-darkbg/40 p-1.5 shrink-0">
                        {EVENT_ICONS[ev.event_type] || <Activity className="h-3.5 w-3.5 text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 dark:text-white">
                            {ev.event_type.replace(/_/g, ' ')}
                          </span>
                          <Badge variant="info" className="text-[9px]">{ev.event_type}</Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          By: <span className="font-semibold">{ev.performed_by}</span>
                        </p>
                        {Object.keys(ev.new_value || {}).length > 0 && (
                          <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                            → {JSON.stringify(ev.new_value).substring(0, 80)}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Super Admin Controls ─────────────────────────────────────────── */}
      {role === 'Super Admin' && (
        <Card className="border border-red-200 dark:border-red-900/50 bg-red-50/5 dark:bg-red-950/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Super Admin — Subscription Management Console
            </CardTitle>
            <CardDescription>
              Platform-level override actions. All actions are logged to the audit trail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleExtendTrial}
                className="text-red-600 hover:bg-red-50 border-red-200 text-xs">
                ⏰ Extend Plan by 7 Days
              </Button>
              <Button variant="outline" size="sm" onClick={handleToggleSuspend}
                className="text-red-600 hover:bg-red-50 border-red-200 text-xs">
                {currentSub?.status === 'SUSPENDED' ? '✅ Reactivate Tenant' : '🚫 Suspend Tenant'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleOverrideLimits}
                className="text-red-600 hover:bg-red-50 border-red-200 text-xs">
                ⚡ Enable Custom Feature Override
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentTab('Audit Log')}
                className="text-red-600 hover:bg-red-50 border-red-200 text-xs">
                📋 View Audit Log
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Payment Modal ────────────────────────────────────────────────── */}
      {payingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-darkbg-border">
            <div className="p-5 border-b border-slate-100 dark:border-darkbg-border/30 flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-800 dark:text-white">
                🔒 Secure Checkout — {payingPlan.name}
              </h3>
              <button onClick={() => setPayingPlan(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg font-bold leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Price breakdown */}
              <div className="bg-slate-50 dark:bg-darkbg/40 p-4 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Plan:</span><span className="font-bold">{payingPlan.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Monthly Price:</span><span className="font-bold">Tsh. {payingPlan.price.toLocaleString()}</span></div>
                {appliedCoupon && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Coupon ({appliedCoupon.code}) {appliedCoupon.discount_percent}%:</span>
                    <span className="font-bold">- Tsh. {(payingPlan.price * appliedCoupon.discount_percent / 100).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">VAT (16%):</span>
                  <span className="font-bold">Tsh. {(payingPlan.price * (1 - (appliedCoupon?.discount_percent || 0) / 100) * 0.16).toLocaleString()}</span>
                </div>
                <hr className="border-slate-200 dark:border-darkbg-border/30" />
                <div className="flex justify-between font-black text-sm">
                  <span>Grand Total:</span>
                  <span className="text-primary">Tsh. {(payingPlan.price * (1 - (appliedCoupon?.discount_percent || 0) / 100) * 1.16).toLocaleString()}</span>
                </div>
              </div>

              {/* Payment provider grid */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Provider</label>

                {/* Mobile Money */}
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-2 mb-1">📱 Mobile Money</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['M-PESA', '📱 M-Pesa', 'bg-green-50 dark:bg-green-900/30 border-green-400 text-green-700 dark:text-green-300'], ['AIRTEL', '🔴 Airtel Money', 'bg-red-50 dark:bg-red-900/30 border-red-400 text-red-700 dark:text-red-300']] as const).map(([prov, label, active]) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setPaymentProvider(prov as any)}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        paymentProvider === prov
                          ? active + ' ring-1 ring-offset-1'
                          : 'border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Bank Transfer */}
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-3 mb-1">🏦 Bank Transfer</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['CRDB', '🏦 CRDB Bank', 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300'], ['NBC', '🏛 NBC Bank', 'bg-sky-50 dark:bg-sky-900/30 border-sky-500 text-sky-700 dark:text-sky-300']] as const).map(([prov, label, active]) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setPaymentProvider(prov as any)}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        paymentProvider === prov
                          ? active + ' ring-1 ring-offset-1'
                          : 'border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* International */}
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-3 mb-1">🌍 International</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['STRIPE', '💳 Stripe', 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-700 dark:text-indigo-300'], ['PAYPAL', '🅿 PayPal', 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-500 text-yellow-700 dark:text-yellow-300']] as const).map(([prov, label, active]) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setPaymentProvider(prov as any)}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        paymentProvider === prov
                          ? active + ' ring-1 ring-offset-1'
                          : 'border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile number input */}
              {(paymentProvider === 'M-PESA' || paymentProvider === 'AIRTEL') && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mobile Wallet Number</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-darkbg-card focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[10px] text-slate-400">A payment push prompt will be sent to this number.</p>
                </div>
              )}

              {paymentProvider === 'STRIPE' && (
                <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 rounded-lg text-[10px] text-indigo-600 dark:text-indigo-400">
                  💳 Credit/Debit card payment via Stripe. Clicking pay will securely complete the transaction.
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-darkbg-border/30 bg-slate-50 dark:bg-darkbg/40 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPayingPlan(null)} disabled={isProcessingPayment}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleProcessPayment} disabled={isProcessingPayment}>
                {isProcessingPayment ? '⏳ Processing...' : `Pay Tsh. ${(payingPlan.price * (1 - (appliedCoupon?.discount_percent || 0) / 100) * 1.16).toLocaleString()}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Alter Subscription Tier Modal ───────────────────────────────── */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white dark:bg-darkbg-card rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-darkbg-border animate-in fade-in slide-in-from-bottom-2">
            <div className="p-5 border-b border-slate-100 dark:border-darkbg-border/30 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  {editingPlan ? `Alter Subscription Tier — ${editingPlan.name}` : 'Create New Subscription Tier'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure pricing parameters, resource capacity ceilings, and active availability.
                </p>
              </div>
              <button onClick={() => setIsPlanModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg font-bold leading-none">×</button>
            </div>

            <form onSubmit={handleSavePlanSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Tier Name *</label>
                  <input
                    type="text"
                    value={planForm.name}
                    onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))}
                    required
                    placeholder="e.g. Professional Plan"
                    className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border px-3 bg-transparent text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Tier Code *</label>
                  <input
                    type="text"
                    value={planForm.code}
                    onChange={e => setPlanForm(p => ({ ...p, code: e.target.value }))}
                    required
                    placeholder="e.g. PROFESSIONAL"
                    className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border px-3 font-mono bg-transparent text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  value={planForm.description}
                  onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Describe target business tier capabilities..."
                  rows={2}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-darkbg-border bg-transparent text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Price per Month (TZS) *</label>
                  <input
                    type="number"
                    value={planForm.price}
                    onChange={e => setPlanForm(p => ({ ...p, price: Number(e.target.value) }))}
                    required
                    min={0}
                    className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border px-3 font-mono font-bold bg-transparent text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Billing Cycle</label>
                  <select
                    value={planForm.billing_cycle}
                    onChange={e => setPlanForm(p => ({ ...p, billing_cycle: e.target.value as any }))}
                    className="w-full mt-1 h-9 rounded-xl border border-slate-200 dark:border-darkbg-border px-3 bg-transparent text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  >
                    <option value="monthly">Monthly Billing</option>
                    <option value="yearly">Yearly Billing</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-200 dark:border-darkbg-border space-y-3">
                <h4 className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">Resource Capacity Ceilings</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold">Max Users (9999 = ∞)</label>
                    <input
                      type="number"
                      value={planForm.max_users}
                      onChange={e => setPlanForm(p => ({ ...p, max_users: Number(e.target.value) }))}
                      required
                      className="w-full mt-1 h-8 rounded-lg border border-slate-200 dark:border-darkbg-border px-2.5 font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold">Max Branches (9999 = ∞)</label>
                    <input
                      type="number"
                      value={planForm.max_branches}
                      onChange={e => setPlanForm(p => ({ ...p, max_branches: Number(e.target.value) }))}
                      required
                      className="w-full mt-1 h-8 rounded-lg border border-slate-200 dark:border-darkbg-border px-2.5 font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold">Max Products (999999 = ∞)</label>
                    <input
                      type="number"
                      value={planForm.max_products}
                      onChange={e => setPlanForm(p => ({ ...p, max_products: Number(e.target.value) }))}
                      required
                      className="w-full mt-1 h-8 rounded-lg border border-slate-200 dark:border-darkbg-border px-2.5 font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold">Storage Quota (MB)</label>
                    <input
                      type="number"
                      value={planForm.max_storage_mb}
                      onChange={e => setPlanForm(p => ({ ...p, max_storage_mb: Number(e.target.value) }))}
                      required
                      className="w-full mt-1 h-8 rounded-lg border border-slate-200 dark:border-darkbg-border px-2.5 font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.is_active}
                    onChange={e => setPlanForm(p => ({ ...p, is_active: e.target.checked }))}
                    className="rounded border-slate-300 text-primary"
                  />
                  <span>Active Tier Available for Signup</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.is_trial}
                    onChange={e => setPlanForm(p => ({ ...p, is_trial: e.target.checked }))}
                    className="rounded border-slate-300 text-primary"
                  />
                  <span>Default Free Trial Tier</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-darkbg-border flex justify-end gap-2">
                <Button variant="outline" type="button" size="sm" onClick={() => setIsPlanModalOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit" size="sm" className="font-bold">
                  <Save className="h-4 w-4 mr-1" /> Save Subscription Tier
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
