/**
 * DukaPos SaaS — Multi-Tenant Isolation & Row-Level Security (RLS) Guard
 * Validates tenant context boundaries and prevents cross-tenant data leakage.
 */

import { cloudDb } from '../db/supabaseMock';
import { getSyncRealClientIp } from './clientIpService';

export interface TenantContext {
  tenantId: string;
  branchId: string;
  userId: string;
  isSuperAdmin: boolean;
}

export interface SecurityViolation {
  violationId: string;
  tenantId: string;
  userId: string;
  attemptedTenantId: string;
  resource: string;
  action: string;
  timestamp: number;
}

class TenantIsolationGuard {
  private violations: SecurityViolation[] = [];

  /**
   * Validate that an execution payload contains valid tenant scoping
   */
  validateContext(ctx: TenantContext): { valid: boolean; reason?: string } {
    if (ctx.isSuperAdmin) {
      return { valid: true };
    }

    if (!ctx.tenantId || ctx.tenantId.trim() === '') {
      return { valid: false, reason: 'Missing mandatory tenant_id context' };
    }

    if (!ctx.userId || ctx.userId.trim() === '') {
      return { valid: false, reason: 'Missing mandatory user_id context' };
    }

    return { valid: true };
  }

  /**
   * Filter dataset by tenant context (Row-Level Security)
   */
  applyRLS<T extends { tenant_id?: string; tenantId?: string }>(
    records: T[],
    ctx: TenantContext
  ): T[] {
    if (ctx.isSuperAdmin || ctx.tenantId === 'tenant-admin-system') {
      return records;
    }

    return records.filter(r => {
      const recordTenant = r.tenant_id || r.tenantId;
      return recordTenant === ctx.tenantId;
    });
  }

  /**
   * Assert single record belongs to authorized tenant; throws error on cross-tenant leak
   */
  assertTenantAccess<T extends { tenant_id?: string; tenantId?: string }>(
    record: T,
    ctx: TenantContext,
    resourceName: string = 'entity'
  ): void {
    if (ctx.isSuperAdmin || ctx.tenantId === 'tenant-admin-system') {
      return;
    }

    const recordTenant = record.tenant_id || record.tenantId;
    if (recordTenant && recordTenant !== ctx.tenantId) {
      const violation: SecurityViolation = {
        violationId: `viol-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        attemptedTenantId: recordTenant,
        resource: resourceName,
        action: 'CROSS_TENANT_READ_ATTEMPT',
        timestamp: Date.now()
      };

      this.violations.push(violation);
      void this.logViolationToCloud(violation);

      throw new Error(`[RLS Security Violation] Access Denied: Attempted to access ${resourceName} belonging to tenant "${recordTenant}".`);
    }
  }

  /**
   * Log security violation to cloud audit log
   */
  private async logViolationToCloud(v: SecurityViolation): Promise<void> {
    try {
      await cloudDb.supabase_audit_logs.add({
        id: v.violationId,
        tenant_id: v.tenantId,
        user_id: v.userId,
        action: 'security.rls_violation_blocked',
        ip_address: getSyncRealClientIp(),
        status: 'FAILED',
        details: `Blocked cross-tenant access to ${v.resource} belonging to ${v.attemptedTenantId}`,
        timestamp: v.timestamp
      });
    } catch (_) {
      /* ignore background audit error */
    }
  }

  /**
   * Retrieve recent RLS violations
   */
  getViolations(): SecurityViolation[] {
    return [...this.violations];
  }
}

export const tenantIsolationGuard = new TenantIsolationGuard();
