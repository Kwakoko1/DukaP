/**
 * KwakoPos SaaS — Production-Grade Hybrid Online/Offline Session Types
 */

export type SessionState =
  | 'UNKNOWN'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED_ONLINE'
  | 'AUTHENTICATED_OFFLINE'
  | 'REFRESHING'
  | 'REAUTH_REQUIRED'
  | 'OFFLINE_LOCKED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'LOGGED_OUT';

export type SessionErrorCode =
  | 'AUTH_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_LOCKED'
  | 'DEVICE_REVOKED'
  | 'PERMISSION_CHANGED'
  | 'TENANT_ACCESS_REVOKED'
  | 'OFFLINE_GRACE_EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'TOKEN_REUSE_DETECTED'
  | 'CLOCK_ANOMALY';

export interface DeviceInfo {
  deviceId: string;
  name: string;
  platform: string;
  browser: string;
  trusted: boolean;
  registeredAt: number;
  lastSeenAt: number;
}

export interface DecodedAccessToken {
  sub: string;
  sessionId: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  role: string;
  permissionsVersion: number;
  iat: number;
  exp: number;
}

export interface SessionContextData {
  sessionId: string;
  userId: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  role: string;
  user: any;
  tenant: any;
  branches: any[];
  permissions: string[];
  permissionsVersion: number;
  tenantVersion: number;
  authenticatedAt: number;
  lastOnlineAt: number;
  lastActivityAt: number;
  lastValidatedAt: number;
  offlineStartedAt?: number;
  offlineExpiresAt?: number;
  serverExpiresAt?: number;
  isOnline: boolean;
}

export interface LocalSessionState {
  id: string; // 'current'
  userId: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  sessionId: string;
  status: SessionState;
  role: string;
  authenticatedAt: number;
  lastOnlineAt: number;
  lastActivityAt: number;
  lastValidatedAt: number;
  offlineStartedAt?: number;
  offlineExpiresAt?: number;
  serverExpiresAt?: number;
  permissionsVersion: number;
  tenantVersion: number;
  lastSyncAt?: number;
  localLogoutPending?: boolean;
}

export interface SessionConfig {
  accessTokenTtlSeconds: number; // default 1200 (20 min)
  refreshTokenTtlMs: number; // default 14 days
  offlineGracePeriodMs: number; // default 24 hours
  onlineIdleTimeoutMs: number; // default 45 minutes
  absoluteTimeoutMs: number; // default 7 days
  idleWarningThresholdMs: number; // default 60 seconds
  clockSkewThresholdMs: number; // default 5 minutes
}

export interface SessionEventListener {
  (state: SessionState, context: SessionContextData | null, error?: { code: SessionErrorCode; message: string }): void;
}
