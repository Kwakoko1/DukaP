/**
 * Session Store — Non-Secret Local IndexedDB Session Persistence
 * 
 * Rules:
 * 1. Only persists non-secret session state (e.g. userId, tenantId, status, offline grace).
 * 2. NEVER stores passwords, raw tokens, or secrets.
 * 3. Clearing or updating session state NEVER deletes business data tables.
 */
import { db } from '../../db/dexie';
import type { LocalSessionState } from './sessionTypes';

const LOCAL_SESSION_KEY = 'current';

export class SessionStore {
  private static instance: SessionStore;

  private constructor() {}

  public static getInstance(): SessionStore {
    if (!SessionStore.instance) {
      SessionStore.instance = new SessionStore();
    }
    return SessionStore.instance;
  }

  public async saveLocalSession(sessionState: LocalSessionState): Promise<void> {
    try {
      await db.userSessions.put({
        id: LOCAL_SESSION_KEY,
        userId: sessionState.userId,
        tenantId: sessionState.tenantId,
        branchId: sessionState.branchId,
        refreshTokenHash: 'MANAGED_SERVER_SIDE',
        deviceId: sessionState.deviceId,
        status: (sessionState.status === 'REVOKED' ? 'REVOKED' : sessionState.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE') as any,
        lastActivity: sessionState.lastActivityAt || Date.now(),
        createdAt: sessionState.authenticatedAt || Date.now(),
        expiresAt: sessionState.offlineExpiresAt || Date.now() + 24 * 60 * 60 * 1000
      });

      // Also persist to offlineSessions table for offline auth engine
      await db.offlineSessions.put({
        id: LOCAL_SESSION_KEY,
        userId: sessionState.userId,
        tenantId: sessionState.tenantId,
        branchId: sessionState.branchId,
        permissions: [],
        offlineAllowedUntil: sessionState.offlineExpiresAt || Date.now() + 24 * 60 * 60 * 1000,
        lastSync: Date.now()
      });
    } catch (e) {
      console.warn('[SessionStore] Failed to write non-secret session state to Dexie:', e);
    }
  }

  public async getLocalSession(): Promise<LocalSessionState | null> {
    try {
      const userSession = await db.userSessions.get(LOCAL_SESSION_KEY);
      const offlineSession = await db.offlineSessions.get(LOCAL_SESSION_KEY);

      if (userSession && offlineSession) {
        return {
          id: LOCAL_SESSION_KEY,
          userId: userSession.userId,
          tenantId: userSession.tenantId,
          branchId: userSession.branchId || 'branch-default',
          deviceId: userSession.deviceId,
          sessionId: userSession.id,
          status: userSession.status as any,
          role: 'Staff',
          authenticatedAt: userSession.createdAt,
          lastOnlineAt: offlineSession.lastSync,
          lastActivityAt: userSession.lastActivity,
          lastValidatedAt: userSession.lastActivity,
          offlineExpiresAt: offlineSession.offlineAllowedUntil,
          permissionsVersion: 1,
          tenantVersion: 1
        };
      }
    } catch (e) {
      console.warn('[SessionStore] Failed to load local session state:', e);
    }
    return null;
  }

  public async clearLocalSession(): Promise<void> {
    try {
      await db.userSessions.delete(LOCAL_SESSION_KEY).catch(() => {});
      await db.offlineSessions.delete(LOCAL_SESSION_KEY).catch(() => {});
    } catch (e) {
      console.warn('[SessionStore] Failed to clear local session:', e);
    }
  }
}

export const sessionStore = SessionStore.getInstance();
