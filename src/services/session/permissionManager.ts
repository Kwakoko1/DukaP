/**
 * Permission Manager — Versioned RBAC & Module Entitlement Engine
 */
import { db } from '../../db/dexie';

export class PermissionManager {
  private static instance: PermissionManager;
  private currentPermissionsVersion: number = 1;
  private currentTenantVersion: number = 1;
  private cachedPermissions: Set<string> = new Set();
  private userRole: string = 'Staff';

  private constructor() {}

  public static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  public setVersions(permissionsVersion: number, tenantVersion: number): void {
    this.currentPermissionsVersion = permissionsVersion || 1;
    this.currentTenantVersion = tenantVersion || 1;
  }

  public getPermissionsVersion(): number {
    return this.currentPermissionsVersion;
  }

  public getTenantVersion(): number {
    return this.currentTenantVersion;
  }

  public setRoleAndPermissions(role: string, permissions: string[]): void {
    this.userRole = role || 'Staff';
    this.cachedPermissions = new Set(permissions || []);
  }

  public hasPermission(permission: string): boolean {
    if (this.userRole === 'Super Admin' || this.userRole === 'Tenant Owner') {
      return true;
    }
    return this.cachedPermissions.has(permission) || this.cachedPermissions.has('*');
  }

  public hasAnyPermission(permissions: string[]): boolean {
    if (this.userRole === 'Super Admin' || this.userRole === 'Tenant Owner') {
      return true;
    }
    return permissions.some((p) => this.hasPermission(p));
  }

  public canPerformOnlineOnlyAction(action: string): boolean {
    const onlineOnlyActions = [
      'tenant.delete',
      'tenant.suspend',
      'subscription.change',
      'billing.manage',
      'superadmin.action',
      'mfa.configure',
      'role.administer',
      'user.delete',
      'device.revoke',
      'session.revoke'
    ];
    return !onlineOnlyActions.includes(action);
  }

  public async reloadPermissionsForUser(tenantId: string, roleName: string): Promise<string[]> {
    try {
      this.userRole = roleName;
      if (roleName === 'Super Admin' || roleName === 'Tenant Owner') {
        const all = ['*'];
        this.cachedPermissions = new Set(all);
        return all;
      }

      const roleRecords = await db.roles
        .where('tenant_id')
        .equals(tenantId)
        .filter((r) => r.name.toLowerCase() === roleName.toLowerCase())
        .toArray();

      if (roleRecords.length > 0) {
        const roleId = roleRecords[0].id;
        const rolePerms = await db.rolePermissions
          .where('role_id')
          .equals(roleId)
          .toArray();

        const permIds = rolePerms.map((rp) => rp.permission_id);
        const perms = await db.permissions.where('id').anyOf(permIds).toArray();
        const permCodes = perms.map((p) => p.slug || `${p.module}.${p.resource}.${p.action}`);
        this.cachedPermissions = new Set(permCodes);
        return permCodes;
      }
    } catch (e) {
      console.warn('[PermissionManager] Failed to reload permissions from Dexie:', e);
    }
    return Array.from(this.cachedPermissions);
  }
}

export const permissionManager = PermissionManager.getInstance();
