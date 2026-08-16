/**
 * KwakoPos SaaS — Reactive Session Context Provider & useSession Hook
 */
import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { SessionState, SessionContextData, SessionErrorCode } from '../services/session/sessionTypes';
import { sessionManager } from '../services/session/sessionManager';
import { permissionManager } from '../services/session/permissionManager';
import { deviceManager } from '../services/session/deviceManager';
import { abacEngine, type AbacResource } from '../services/abacEngine';
import { customRulesEngine } from '../services/customRulesEngine';

interface SessionContextValue {
  status: SessionState;
  context: SessionContextData | null;
  user: any | null;
  tenant: any | null;
  branch: any | null;
  deviceId: string;
  isOnline: boolean;
  isOffline: boolean;
  canOperateOffline: boolean;
  canSync: boolean;
  isLocked: boolean;
  error: { code: SessionErrorCode; message: string } | null;
  login: (authPayload: any) => Promise<void>;
  logout: () => Promise<void>;
  lock: () => void;
  unlock: (credentials: { password?: string; pin?: string }) => Promise<boolean>;
  hasPermission: (permission: string) => boolean;
  evaluateAbac: (action: string, resource: Partial<AbacResource>) => { allowed: boolean; reason?: string };
  evaluateRule: (event: string, context: Record<string, any>) => { allowed: boolean; actionType?: string; message?: string };
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SessionState>(sessionManager.getState());
  const [context, setContext] = useState<SessionContextData | null>(sessionManager.getContext());
  const [error, setError] = useState<{ code: SessionErrorCode; message: string } | null>(null);

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((newStatus, newContext, newError) => {
      setStatus(newStatus);
      setContext(newContext);
      if (newError) setError(newError);
      else setError(null);
    });

    sessionManager.initialize();

    return () => {
      unsubscribe();
    };
  }, []);

  const value = useMemo<SessionContextValue>(() => {
    const isLocked = status === 'REAUTH_REQUIRED' || status === 'OFFLINE_LOCKED';
    const isOnline = status === 'AUTHENTICATED_ONLINE';
    const isOffline = status === 'AUTHENTICATED_OFFLINE';
    const canOperateOffline = isOnline || isOffline;
    const canSync = isOnline;
    const activeBranchId = context?.branchId || context?.branches?.[0]?.id || 'main-branch';

    return {
      status,
      context,
      user: context?.user || null,
      tenant: context?.tenant || null,
      branch: context?.branches?.[0] || null,
      deviceId: deviceManager.getDeviceId(),
      isOnline,
      isOffline,
      canOperateOffline,
      canSync,
      isLocked,
      error,
      login: async (payload: any) => {
        await sessionManager.setAuthenticatedSession(payload);
      },
      logout: async () => {
        await sessionManager.logout();
      },
      lock: () => {
        sessionManager.lock('USER_LOCKED');
      },
      unlock: async (credentials) => {
        return await sessionManager.unlock(credentials);
      },
      hasPermission: (permission: string) => {
        return permissionManager.hasPermission(permission);
      },
      evaluateAbac: (action: string, resource: Partial<AbacResource>) => {
        if (!context?.userId || !context?.tenantId) return { allowed: false, reason: 'No active session' };
        return abacEngine.evaluate({
          subject: {
            userId: context.userId,
            role: context.role || 'Staff',
            tenantId: context.tenantId,
            assignedBranchId: activeBranchId,
            isSuperAdmin: context.role === 'Super Admin'
          },
          resource: {
            resourceType: (resource.resourceType || 'sale') as any,
            branchId: resource.branchId || activeBranchId,
            tenantId: resource.tenantId || context.tenantId,
            amount: resource.amount,
            isConfidential: resource.isConfidential
          },
          action,
          environment: {
            isOnline,
            activeBranchId
          }
        });
      },
      evaluateRule: (event: string, ruleContext: Record<string, any>) => {
        const tenantId = context?.tenantId || 'tenant-default';
        return customRulesEngine.evaluate({
          tenantId,
          event,
          context: ruleContext
        });
      }
    };
  }, [status, context, error]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
