/**
 * DukaPos SaaS — Multi-Tenant Security & Real-Time Broadcast Service
 * Broadcasts workspace deletion/revocation events across browser tabs & windows.
 */

export interface TenantSecurityEvent {
  type: 'TENANT_PURGED' | 'SESSION_REVOKED' | 'SESSION_SWITCHED';
  tenantId: string;
  userId?: string;
  userEmails?: string[];
  timestamp: number;
}

const CHANNEL_NAME = 'dukapos_tenant_security_channel';

class TenantSecurityBroadcast {
  private channel: BroadcastChannel | null = null;
  private listeners: Array<(evt: TenantSecurityEvent) => void> = [];

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (e) => {
          if (e.data && e.data.type) {
            this.listeners.forEach((fn) => fn(e.data));
          }
        };
      } catch (err) {
        console.warn('[TenantSecurityBroadcast] BroadcastChannel init warning:', err);
      }
    }
  }

  /**
   * Broadcast tenant deletion event to all open browser windows/tabs
   */
  broadcastTenantPurged(tenantId: string, userEmails: string[] = []): void {
    const evt: TenantSecurityEvent = {
      type: 'TENANT_PURGED',
      tenantId,
      userEmails,
      timestamp: Date.now(),
    };

    if (this.channel) {
      try {
        this.channel.postMessage(evt);
      } catch (_) {}
    }

    // Also update local storage tombstones
    try {
      const rawTenants = localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]';
      const list: string[] = JSON.parse(rawTenants);
      if (!list.includes(tenantId)) {
        list.push(tenantId);
        localStorage.setItem('DUKAPOS_DELETED_TENANTS', JSON.stringify(list));
      }

      if (userEmails.length > 0) {
        const rawEmails = localStorage.getItem('DUKAPOS_DELETED_USER_EMAILS') || '[]';
        const emailList: string[] = JSON.parse(rawEmails);
        userEmails.forEach((em) => {
          if (em && !emailList.includes(em)) emailList.push(em);
        });
        localStorage.setItem('DUKAPOS_DELETED_USER_EMAILS', JSON.stringify(emailList));
      }
    } catch (_) {}
  }

  /**
   * Broadcast session switched event to all open browser windows/tabs
   */
  broadcastSessionSwitched(userId: string, tenantId: string): void {
    const evt: TenantSecurityEvent = {
      type: 'SESSION_SWITCHED',
      userId,
      tenantId,
      timestamp: Date.now(),
    };

    if (this.channel) {
      try {
        this.channel.postMessage(evt);
      } catch (_) {}
    }
  }

  /**
   * Subscribe to security events across browser tabs
   */
  subscribe(callback: (evt: TenantSecurityEvent) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== callback);
    };
  }
}

export const tenantSecurityBroadcast = new TenantSecurityBroadcast();

/**
 * System-wide Authoritative Check: Determines if a tenant record is deleted or a system tenant.
 * Protects against orphaned records, stale caches, and split-brain sync bugs across all CPanel views.
 */
export function isTenantDeleted(t: any): boolean {
  if (!t) return true;
  const tid = typeof t === 'string' ? t : (t.id || t.tenant_id || t.tenantId);
  if (!tid) return true;

  // 1. Reserved System & Master Admin Tenants (never counted as active merchant business tenants)
  if (
    tid === 'tenant-admin-system' ||
    tid === 'tenant-admin-master' ||
    tid === 'tenant-system-root' ||
    tid === 'tenant-admin-000' ||
    tid === 'tenant-master'
  ) {
    return true;
  }

  // 2. Soft Deletes / Inactive Status Flags
  if (typeof t === 'object') {
    if (t.deleted_at || t.deletedAt || (t as any).deleted) return true;
    const status = String(t.status || '').toUpperCase();
    if (status === 'DELETED' || status === 'ARCHIVED' || status === 'DRAFT') return true;
    if (t.registration_completed === false) return true;
  }

  // 3. Persistent LocalStorage Tombstone Verification
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]';
      const deletedList: string[] = JSON.parse(raw);
      if (deletedList.includes(tid)) return true;

      if (typeof t === 'object') {
        if (t.tenant_code && deletedList.includes(t.tenant_code)) return true;
        if (t.business_code && deletedList.includes(t.business_code)) return true;
        if (t.tenant_uuid && deletedList.includes(t.tenant_uuid)) return true;
        if (t.slug && deletedList.includes(t.slug)) return true;
      }

      const rawEmails = localStorage.getItem('DUKAPOS_DELETED_USER_EMAILS') || '[]';
      const emailList: string[] = JSON.parse(rawEmails);
      if (typeof t === 'object' && t.email && emailList.includes(t.email.trim().toLowerCase())) return true;
    } catch (_) {}
  }

  return false;
}

