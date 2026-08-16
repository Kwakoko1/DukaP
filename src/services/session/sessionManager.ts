/**
 * KwakoPos SaaS — Central Session Manager Singleton
 * 
 * Rules:
 * 1. Single source of truth for client authentication state.
 * 2. Strict 10-state lifecycle state machine.
 * 3. Never deletes business data upon logout, token expiry, session lock, or auth failure.
 * 4. Maintains offline grace window (24h default) for low-risk POS transactions.
 */
import type {
  SessionState,
  SessionErrorCode,
  SessionContextData,
  SessionConfig,
  SessionEventListener,
  LocalSessionState
} from './sessionTypes';
import { tokenManager } from './tokenManager';
import { deviceManager } from './deviceManager';
import { permissionManager } from './permissionManager';
import { sessionStore } from './sessionStore';
import { db } from '../../db/dexie';

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  accessTokenTtlSeconds: 1200, // 20 minutes
  refreshTokenTtlMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  offlineGraceHours: 24, // 24h default (24 | 36 | 72)
  offlineGracePeriodMs: 24 * 60 * 60 * 1000, // 24 hours
  onlineIdleTimeoutMs: 45 * 60 * 1000, // 45 minutes
  absoluteTimeoutMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  idleWarningThresholdMs: 60 * 1000, // 60 seconds
  clockSkewThresholdMs: 5 * 60 * 1000 // 5 minutes
};

export class SessionManager {
  private static instance: SessionManager;
  private state: SessionState = 'UNKNOWN';
  private context: SessionContextData | null = null;
  private config: SessionConfig = { ...DEFAULT_SESSION_CONFIG };
  private listeners: Set<SessionEventListener> = new Set();
  
  private idleTimer: any = null;
  private offlineGraceTimer: any = null;
  private heartbeatTimer: any = null;
  private lastActivityThrottle: number = 0;
  private serverTimeOffsetMs: number = 0;

  private constructor() {
    this.setupNetworkListeners();
    this.setupUserActivityListeners();
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Boot & Rehydrate Session on App Initialization
   */
  public async initialize(): Promise<SessionState> {
    console.log('[SessionManager] Initializing Hybrid Session Engine...');
    this.transitionState('AUTHENTICATING');

    try {
      const savedGrace = typeof localStorage !== 'undefined' ? localStorage.getItem('KWAKOPOS_OFFLINE_GRACE_HOURS') : null;
      if (savedGrace && [24, 36, 72].includes(Number(savedGrace))) {
        this.setOfflineGraceHours(Number(savedGrace) as 24 | 36 | 72);
      }
    } catch (_) {}

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    // 1. Attempt token recovery & refresh if online
    if (isOnline && tokenManager.getStoredRefreshToken()) {
      const refreshResult = await tokenManager.refresh();
      if (refreshResult && refreshResult.accessToken) {
        const claims = tokenManager.getDecodedClaims();
        if (claims) {
          const loadedContext = await this.hydrateContextFromCloudOrLocal(claims.sub, claims.tenantId, claims.sessionId, claims.branchId);
          if (loadedContext) {
            this.context = loadedContext;
            this.transitionState('AUTHENTICATED_ONLINE');
            this.startHeartbeat();
            this.resetIdleTimer();
            return this.state;
          }
        }
      }
    }

    // 2. Fallback to Local IndexedDB Non-Secret Session State
    const localSession = await sessionStore.getLocalSession();
    if (localSession && localSession.userId && localSession.tenantId) {
      const now = Date.now();
      const offlineExpiresAt = localSession.offlineExpiresAt || (localSession.authenticatedAt + this.config.offlineGracePeriodMs);

      if (now > offlineExpiresAt) {
        console.warn('[SessionManager] Local offline grace period expired. Transitioning to OFFLINE_LOCKED.');
        this.transitionState('OFFLINE_LOCKED', { code: 'OFFLINE_GRACE_EXPIRED', message: 'Offline grace period expired (24h). Reconnect to authenticate.' });
        return this.state;
      }

      // Rehydrate local context
      const localUser = await db.users.get(localSession.userId);
      const localTenant = await db.tenants.get(localSession.tenantId);
      const localBranches = await db.branches.where('tenant_id').equals(localSession.tenantId).toArray();

      if (localUser && localTenant) {
        this.context = {
          sessionId: localSession.sessionId,
          userId: localSession.userId,
          tenantId: localSession.tenantId,
          branchId: localSession.branchId || localBranches[0]?.id || 'branch-default',
          deviceId: localSession.deviceId || deviceManager.getDeviceId(),
          role: localSession.role || localUser.role || 'Staff',
          user: localUser,
          tenant: localTenant,
          branches: localBranches,
          permissions: [],
          permissionsVersion: localSession.permissionsVersion || 1,
          tenantVersion: localSession.tenantVersion || 1,
          authenticatedAt: localSession.authenticatedAt,
          lastOnlineAt: localSession.lastOnlineAt,
          lastActivityAt: Date.now(),
          lastValidatedAt: localSession.lastValidatedAt,
          offlineStartedAt: localSession.offlineStartedAt || Date.now(),
          offlineExpiresAt,
          isOnline: false
        };

        if (isOnline) {
          this.transitionState('AUTHENTICATED_ONLINE');
          this.startHeartbeat();
        } else {
          this.transitionState('AUTHENTICATED_OFFLINE');
          this.startOfflineGraceCountdown(offlineExpiresAt);
        }
        this.resetIdleTimer();
        return this.state;
      }
    }

    // No valid session found
    this.transitionState('LOGGED_OUT');
    return this.state;
  }

  /**
   * Complete Online Authentication
   */
  public async setAuthenticatedSession(authPayload: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    deviceId: string;
    serverTime?: number;
    user: any;
    tenant: any;
    branches: any[];
  }): Promise<void> {
    const { accessToken, refreshToken, sessionId, deviceId, serverTime, user, tenant, branches } = authPayload;

    tokenManager.setStoredRefreshToken(refreshToken);
    tokenManager.setAccessToken(accessToken);

    if (serverTime) {
      this.serverTimeOffsetMs = serverTime - Date.now();
    }

    const now = Date.now();
    const offlineExpiresAt = now + this.config.offlineGracePeriodMs;
    const serverExpiresAt = now + this.config.refreshTokenTtlMs;
    const primaryBranchId = branches[0]?.id || user.branch_id || 'branch-default';

    this.context = {
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      branchId: primaryBranchId,
      deviceId: deviceId || deviceManager.getDeviceId(),
      role: user.role || 'Staff',
      user,
      tenant,
      branches: branches || [],
      permissions: [],
      permissionsVersion: 1,
      tenantVersion: 1,
      authenticatedAt: now,
      lastOnlineAt: now,
      lastActivityAt: now,
      lastValidatedAt: now,
      offlineExpiresAt,
      serverExpiresAt,
      isOnline: true
    };

    // Save Non-Secret State to Dexie
    const localState: LocalSessionState = {
      id: 'current',
      userId: user.id,
      tenantId: tenant.id,
      branchId: primaryBranchId,
      deviceId: deviceId || deviceManager.getDeviceId(),
      sessionId,
      status: 'AUTHENTICATED_ONLINE',
      role: user.role || 'Staff',
      authenticatedAt: now,
      lastOnlineAt: now,
      lastActivityAt: now,
      lastValidatedAt: now,
      offlineExpiresAt,
      serverExpiresAt,
      permissionsVersion: 1,
      tenantVersion: 1
    };

    await sessionStore.saveLocalSession(localState);
    await permissionManager.reloadPermissionsForUser(tenant.id, user.role || 'Staff');

    this.transitionState('AUTHENTICATED_ONLINE');
    this.startHeartbeat();
    this.resetIdleTimer();
  }

  /**
   * Centralized Logout (Zero Data Loss)
   */
  public async logout(options: { notifyServer?: boolean } = { notifyServer: true }): Promise<void> {
    console.log('[SessionManager] Logging out... Preserving all IndexedDB business stores.');
    
    if (options.notifyServer && this.context?.sessionId) {
      try {
        const token = tokenManager.getAccessToken();
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ sessionId: this.context.sessionId, userId: this.context.userId, tenantId: this.context.tenantId })
        }).catch(() => {});
      } catch (_) {}
    }

    this.stopHeartbeat();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.offlineGraceTimer) clearTimeout(this.offlineGraceTimer);

    tokenManager.clearTokens();
    await sessionStore.clearLocalSession();
    this.context = null;

    this.transitionState('LOGGED_OUT');
  }

  /**
   * Lock protected application UI
   */
  public lock(reason: 'IDLE' | 'USER_LOCKED' | 'OFFLINE_EXPIRED' = 'USER_LOCKED'): void {
    if (this.state === 'LOGGED_OUT') return;
    console.log(`[SessionManager] Locking session (${reason}). Business data intact.`);
    if (reason === 'OFFLINE_EXPIRED') {
      this.transitionState('OFFLINE_LOCKED', { code: 'OFFLINE_GRACE_EXPIRED', message: 'Offline grace period reached' });
    } else {
      this.transitionState('REAUTH_REQUIRED', { code: 'SESSION_LOCKED', message: 'Session locked due to inactivity or user lock' });
    }
  }

  /**
   * Unlock session with PIN or Password
   */
  public async unlock(credentials: { password?: string; pin?: string }): Promise<boolean> {
    if (!this.context?.userId) return false;

    // Check online validation first if connected
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch('/api/auth/re-authenticate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.context.userId,
            sessionId: this.context.sessionId,
            ...credentials
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            this.context.lastValidatedAt = Date.now();
            this.context.lastActivityAt = Date.now();
            this.transitionState('AUTHENTICATED_ONLINE');
            this.resetIdleTimer();
            return true;
          }
        }
      } catch (_) {}
    }

    // Local offline PIN validation fallback
    if (credentials.pin && this.context.user) {
      const userSec = await db.userSecurity.get(this.context.userId);
      if (userSec && userSec.pin_hash) {
        let sha256Pin = '';
        try {
          const msgBuffer = new TextEncoder().encode(credentials.pin.trim());
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          sha256Pin = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) {}

        if (userSec.pin_hash === credentials.pin || userSec.pin_hash === sha256Pin) {
          this.context.lastActivityAt = Date.now();
          this.transitionState(typeof navigator !== 'undefined' && navigator.onLine ? 'AUTHENTICATED_ONLINE' : 'AUTHENTICATED_OFFLINE');
          this.resetIdleTimer();
          return true;
        }
      }
    }

    return false;
  }

  /**
   * State Accessors
   */
  public getState(): SessionState {
    return this.state;
  }

  public getContext(): SessionContextData | null {
    return this.context;
  }

  public isOnline(): boolean {
    return this.state === 'AUTHENTICATED_ONLINE';
  }

  public isOffline(): boolean {
    return this.state === 'AUTHENTICATED_OFFLINE';
  }

  public canOperateOffline(): boolean {
    return this.state === 'AUTHENTICATED_ONLINE' || this.state === 'AUTHENTICATED_OFFLINE';
  }

  public canSync(): boolean {
    return this.state === 'AUTHENTICATED_ONLINE';
  }

  public getAccessToken(): string | null {
    return tokenManager.getAccessToken();
  }

  public getServerTimeOffset(): number {
    return this.serverTimeOffsetMs;
  }

  public setOfflineGraceHours(hours: 24 | 36 | 72): void {
    const validHours: 24 | 36 | 72 = [24, 36, 72].includes(hours) ? hours : 24;
    this.config.offlineGraceHours = validHours;
    this.config.offlineGracePeriodMs = validHours * 60 * 60 * 1000;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('KWAKOPOS_OFFLINE_GRACE_HOURS', String(validHours));
      }
    } catch (_) {}
    if (this.context && this.context.authenticatedAt) {
      this.context.offlineExpiresAt = this.context.authenticatedAt + this.config.offlineGracePeriodMs;
    }
  }

  public getOfflineGraceHours(): 24 | 36 | 72 {
    return this.config.offlineGraceHours || 24;
  }

  public subscribe(listener: SessionEventListener): () => void {
    this.listeners.add(listener);
    listener(this.state, this.context);
    return () => this.listeners.delete(listener);
  }

  /**
   * Record User Activity (Throttled)
   */
  public recordActivity(): void {
    const now = Date.now();
    if (now - this.lastActivityThrottle < 10000) return; // Throttle to every 10s
    this.lastActivityThrottle = now;

    if (this.context) {
      this.context.lastActivityAt = now;
    }
    this.resetIdleTimer();
  }

  /**
   * Private State Machine Helpers
   */
  private transitionState(newState: SessionState, error?: { code: SessionErrorCode; message: string }): void {
    if (this.state === newState) return;
    console.log(`[SessionManager State] Transition: ${this.state} -> ${newState}`);
    this.state = newState;
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, this.context, error);
      } catch (e) {
        console.error('[SessionManager Listener Error]', e);
      }
    });
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', async () => {
      console.log('[SessionManager] Network online event detected.');
      if (this.state === 'AUTHENTICATED_OFFLINE' || this.state === 'OFFLINE_LOCKED') {
        await this.handleReconnection();
      }
    });

    window.addEventListener('offline', () => {
      console.log('[SessionManager] Network offline event detected.');
      if (this.state === 'AUTHENTICATED_ONLINE') {
        const now = Date.now();
        if (this.context) {
          this.context.offlineStartedAt = now;
          this.context.offlineExpiresAt = now + this.config.offlineGracePeriodMs;
          this.context.isOnline = false;
        }
        this.stopHeartbeat();
        this.transitionState('AUTHENTICATED_OFFLINE');
        this.startOfflineGraceCountdown(now + this.config.offlineGracePeriodMs);
      }
    });
  }

  private setupUserActivityListeners(): void {
    if (typeof window === 'undefined') return;
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => {
      window.addEventListener(evt, () => this.recordActivity(), { passive: true });
    });
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.state !== 'AUTHENTICATED_ONLINE' && this.state !== 'AUTHENTICATED_OFFLINE') return;

    this.idleTimer = setTimeout(() => {
      console.warn('[SessionManager] Idle timeout reached. Locking protected session.');
      this.lock('IDLE');
    }, this.config.onlineIdleTimeoutMs);
  }

  private startOfflineGraceCountdown(expiresAt: number): void {
    if (this.offlineGraceTimer) clearTimeout(this.offlineGraceTimer);
    const delay = Math.max(1000, expiresAt - Date.now());
    this.offlineGraceTimer = setTimeout(() => {
      console.warn('[SessionManager] Offline grace period expired (24h).');
      this.lock('OFFLINE_EXPIRED');
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Validate session with server every 5 minutes
    this.heartbeatTimer = setInterval(async () => {
      if (this.state === 'AUTHENTICATED_ONLINE') {
        await this.validateSessionHeartbeat();
      }
    }, 5 * 60 * 1000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async validateSessionHeartbeat(): Promise<void> {
    try {
      const token = tokenManager.getAccessToken();
      if (!token) return;

      const res = await fetch('/api/auth/session/validate', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.serverTime) {
          // Clock Skew Detection
          const clientTime = Date.now();
          const skew = Math.abs(clientTime - data.serverTime);
          if (skew > this.config.clockSkewThresholdMs) {
            console.warn(`[SessionManager Clock Anomaly] Skew: ${skew}ms exceeds threshold (${this.config.clockSkewThresholdMs}ms).`);
          }

          // Version Invalidation
          if (data.permissionsVersion && this.context && data.permissionsVersion !== this.context.permissionsVersion) {
            console.log(`[SessionManager] Permissions version mismatch (server: ${data.permissionsVersion}, local: ${this.context.permissionsVersion}). Reloading permissions...`);
            this.context.permissionsVersion = data.permissionsVersion;
            await permissionManager.reloadPermissionsForUser(this.context.tenantId, this.context.role);
          }
        }
      } else if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === 'SESSION_REVOKED') {
          console.error('[SessionManager] Server session revoked.');
          this.transitionState('REVOKED', { code: 'SESSION_REVOKED', message: 'Session has been revoked by an administrator.' });
        } else if (errData.code === 'TOKEN_EXPIRED') {
          await tokenManager.refresh();
        }
      }
    } catch (_) {}
  }

  private async handleReconnection(): Promise<void> {
    console.log('[SessionManager] Validating server session upon network reconnection...');
    const refreshRes = await tokenManager.refresh();
    if (refreshRes && refreshRes.accessToken) {
      if (this.context) {
        this.context.isOnline = true;
        this.context.lastOnlineAt = Date.now();
      }
      this.transitionState('AUTHENTICATED_ONLINE');
      this.startHeartbeat();
      this.resetIdleTimer();
    } else {
      console.warn('[SessionManager] Reconnect validation failed. Re-authentication required.');
      this.transitionState('REAUTH_REQUIRED', { code: 'REAUTH_REQUIRED', message: 'Reconnection requires reauthentication.' });
    }
  }

  private async hydrateContextFromCloudOrLocal(userId: string, tenantId: string, sessionId: string, branchId: string): Promise<SessionContextData | null> {
    try {
      const user = await db.users.get(userId);
      const tenant = await db.tenants.get(tenantId);
      const branches = await db.branches.where('tenant_id').equals(tenantId).toArray();

      if (user && tenant) {
        const now = Date.now();
        return {
          sessionId,
          userId,
          tenantId,
          branchId: branchId || branches[0]?.id || 'branch-default',
          deviceId: deviceManager.getDeviceId(),
          role: user.role || 'Staff',
          user,
          tenant,
          branches,
          permissions: [],
          permissionsVersion: 1,
          tenantVersion: 1,
          authenticatedAt: now,
          lastOnlineAt: now,
          lastActivityAt: now,
          lastValidatedAt: now,
          offlineExpiresAt: now + this.config.offlineGracePeriodMs,
          isOnline: true
        };
      }
    } catch (e) {
      console.warn('[SessionManager] Failed to hydrate context:', e);
    }
    return null;
  }
}

export const sessionManager = SessionManager.getInstance();
