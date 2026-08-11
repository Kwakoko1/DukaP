/**
 * DukaPos SaaS — Multi-Tenant Security & Real-Time Broadcast Service
 * Broadcasts workspace deletion/revocation events across browser tabs & windows.
 */

export interface TenantSecurityEvent {
  type: 'TENANT_PURGED' | 'SESSION_REVOKED';
  tenantId: string;
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
