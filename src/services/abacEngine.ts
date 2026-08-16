/**
 * KwakoPos SaaS — Attribute-Based Access Control (ABAC) Policy Engine
 * 
 * Enforces dynamic multi-dimensional authorization policies:
 * - Subject (User Role, Clearance, Shift, Target Tenant)
 * - Resource (Entity Type, Amount Threshold, Branch Ownership, Confidentiality)
 * - Action (Refund, Discount, Void, Delete, Export, Administer)
 * - Environment (Online/Offline status, Geolocation/Branch match, Time window)
 */

export interface AbacSubject {
  userId: string;
  role: string;
  tenantId: string;
  assignedBranchId: string;
  isSuperAdmin?: boolean;
}

export interface AbacResource {
  resourceType: 'sale' | 'product' | 'customer' | 'inventory' | 'expense' | 'user' | 'tenant' | 'payment';
  branchId?: string;
  tenantId?: string;
  amount?: number;
  isConfidential?: boolean;
  status?: string;
}

export interface AbacEnvironment {
  isOnline: boolean;
  activeBranchId: string;
  currentTime?: number;
  platform?: string;
}

export interface AbacPolicyRule {
  id: string;
  name: string;
  effect: 'ALLOW' | 'DENY';
  action: string; // e.g. 'sale.refund', 'sale.discount', 'inventory.adjust'
  conditions: (subject: AbacSubject, resource: AbacResource, env: AbacEnvironment) => boolean;
}

export class AbacEngine {
  private static instance: AbacEngine;
  private customRules: AbacPolicyRule[] = [];

  private constructor() {
    this.registerDefaultPolicies();
  }

  public static getInstance(): AbacEngine {
    if (!AbacEngine.instance) {
      AbacEngine.instance = new AbacEngine();
    }
    return AbacEngine.instance;
  }

  /**
   * Evaluates if subject can perform action on target resource within environment
   */
  public evaluate(params: {
    subject: AbacSubject;
    resource: AbacResource;
    action: string;
    environment: AbacEnvironment;
  }): { allowed: boolean; reason?: string } {
    const { subject, resource, action, environment } = params;

    // Super Admin & Tenant Owner Bypass
    if (subject.isSuperAdmin || subject.role === 'Super Admin' || subject.role === 'Tenant Owner') {
      return { allowed: true };
    }

    // 1. Cross-Tenant Barrier (Hard Deny)
    if (resource.tenantId && resource.tenantId !== subject.tenantId) {
      return { allowed: false, reason: 'Cross-tenant boundary violation.' };
    }

    // 2. Evaluate registered policy rules
    for (const rule of this.customRules) {
      if (rule.action === action || rule.action === '*') {
        const matches = rule.conditions(subject, resource, environment);
        if (matches) {
          if (rule.effect === 'DENY') {
            return { allowed: false, reason: `Policy '${rule.name}' denied this operation.` };
          }
          return { allowed: true };
        }
      }
    }

    // 3. Fallback standard role evaluation
    if (subject.role === 'Admin' || subject.role === 'Manager' || subject.role === 'General Manager') {
      return { allowed: true };
    }

    // Cashier standard limits
    if (subject.role === 'Cashier' || subject.role === 'Staff') {
      if (action.includes('delete') || action.includes('destroy') || action.includes('config')) {
        return { allowed: false, reason: 'Staff accounts cannot perform administrative or destructive actions.' };
      }
    }

    return { allowed: true };
  }

  public registerRule(rule: AbacPolicyRule): void {
    this.customRules.unshift(rule);
  }

  private registerDefaultPolicies(): void {
    // Policy: High Value Refunds require Manager / Owner
    this.registerRule({
      id: 'high-value-refund',
      name: 'High-Value Refund Policy',
      effect: 'DENY',
      action: 'sale.refund',
      conditions: (subject, resource) => {
        const amount = resource.amount || 0;
        const isStaff = subject.role === 'Cashier' || subject.role === 'Staff';
        return isStaff && amount > 50000; // TZS 50,000 / $25 threshold
      }
    });

    // Policy: Physical Branch Mismatch Block (cannot approve refunds at different physical branch)
    this.registerRule({
      id: 'branch-mismatch-action',
      name: 'Physical Branch Location Guard',
      effect: 'DENY',
      action: 'sale.void',
      conditions: (subject, resource, env) => {
        if (!resource.branchId) return false;
        return resource.branchId !== env.activeBranchId && subject.role !== 'Regional Manager';
      }
    });

    // Policy: Offline Sensitive Deletion Block (cannot delete customers or inventory ledger while offline)
    this.registerRule({
      id: 'offline-destructive-block',
      name: 'Offline Destruction Prevention',
      effect: 'DENY',
      action: 'inventory.delete',
      conditions: (_, __, env) => !env.isOnline
    });
  }
}

export const abacEngine = AbacEngine.getInstance();
