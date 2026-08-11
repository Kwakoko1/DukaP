import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, safeGet, recalculateProductStock } from '../db/dexie';
import { supabase, setMockAuthOverride } from '../db/supabaseClient';
import { ProductService } from '../services/productService';
import { sessionService } from '../services/sessionService';
import { SettingsResolver, DEFAULT_SECURITY_CONFIG, type SecurityConfig } from '../services/settingsService';
import { tenantRecoveryService } from '../services/tenantRecoveryService';
import { tenantHealthMonitor } from '../services/tenantHealthMonitor';
import { stockLedgerSyncEngine } from '../services/stockLedgerSyncEngine';
import { bootstrapEngine } from '../services/bootstrapEngine';
import { tenantSecurityBroadcast } from '../utils/tenantSecurityBroadcast';

export type UserRole = 'Super Admin' | 'Business Owner' | 'Tenant Owner' | 'Business Administrator' | 'Branch Manager' | 'Cashier' | 'Inventory Officer' | 'Accountant' | (string & {});

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  location: string;
}

export interface Tenant {
  id: string;
  name: string;
  plan: 'Basic' | 'Professional' | 'Enterprise';
  status?: 'Active' | 'Suspended' | 'Trial' | 'Registered' | 'Cancelled' | 'Demo' | 'DEMO' | 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'EXPIRED' | 'ARCHIVED';
  business_code?: string;
  tenant_code?: string;
  human_tenant_id?: string;
  created_at?: number;
  createdAt?: number;
  deleted_at?: number;
  deletedAt?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  tenant_id: string;
  branch_id: string;
  industry_id?: string;
}

export interface JWTClaims {
  sub: string;
  iss: string;
  exp: number;
  is_super_admin: boolean;
  context?: {
    tenant_id: string;
    branch_id: string;
    industry_id: string;
  };
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  currentTenant: Tenant;
  setTenant: (tenant: Tenant) => void;
  currentBranch: Branch;
  setCurrentBranch: (branch: Branch) => void;
  branches: Branch[];
  currentIndustry: { id: string; name: string } | null;
  setCurrentIndustry: (industry: { id: string; name: string } | null) => void;
  jwtToken: string | null;
  jwtClaims: JWTClaims | null;
  switchContext: (tenantId: string, branchId: string, industryId: string, roleName: UserRole) => Promise<boolean>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  hasPermission: (permission: string) => boolean;
  isSuperAdminView: boolean;
  setIsSuperAdminView: (val: boolean) => void;
  impersonatedTenant: Tenant | null;
  setImpersonatedTenant: (t: Tenant | null) => void;
  logout: () => void;
  verifyPin: (userId: string, pin: string) => Promise<boolean>;
  syncFromCloudOnLogin: (tenantId: string) => Promise<boolean>;
  isOfflineLocked: boolean;
  setIsOfflineLocked: (val: boolean) => void;
  hasBranchAccess: (branchId: string) => boolean;
  rotateSession: () => Promise<void>;
  isInitializing: boolean;
}

const defaultTenant: Tenant = { id: '', name: '', plan: 'Basic', status: 'Active' };
const defaultBranch: Branch = { id: '', tenant_id: '', name: '', location: '' };

const defaultAuthContext: AuthContextType = {
  user: null,
  setUser: () => {},
  role: 'Business Owner',
  setRole: () => {},
  currentTenant: defaultTenant,
  setTenant: () => {},
  currentBranch: defaultBranch,
  setCurrentBranch: () => {},
  branches: [],
  currentIndustry: { id: 'ind-retail', name: 'Retail' },
  setCurrentIndustry: () => {},
  jwtToken: null,
  jwtClaims: null,
  switchContext: async () => true,
  theme: 'light',
  toggleTheme: () => {},
  hasPermission: () => true,
  isSuperAdminView: false,
  setIsSuperAdminView: () => {},
  impersonatedTenant: null,
  setImpersonatedTenant: () => {},
  logout: () => {},
  verifyPin: async () => true,
  syncFromCloudOnLogin: async () => true,
  isOfflineLocked: false,
  setIsOfflineLocked: () => {},
  hasBranchAccess: () => true,
  rotateSession: async () => {},
  isInitializing: false
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

const AVAILABLE_BRANCHES: Branch[] = [];

/**
 * DB-first tenant resolver.
 * 1. Checks IndexedDB (covers all dynamically provisioned tenants)
 * 2. Falls back to MOCK_TENANTS (covers seed data before DB is populated)
 * 3. Returns null if neither source has the tenant
 */
async function resolveTenantById(tenantId: string): Promise<Tenant | null> {
  if (!tenantId || tenantId.trim() === '') return null;

  if (typeof window !== 'undefined') {
    try {
      const rawDeleted = localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]';
      const deletedSet = new Set(JSON.parse(rawDeleted));
      if (deletedSet.has(tenantId)) {
        return null;
      }
    } catch (_) {}

    if (localStorage.getItem('DUKAPOS_PRODUCTION_LOCKED') === 'true') {
      try {
        const dbTenant = await safeGet(db.tenants, tenantId);
        if (dbTenant && dbTenant.status !== 'Deleted' && dbTenant.status !== 'Archived' && dbTenant.status !== 'ARCHIVED') {
          return {
            id: dbTenant.id,
            name: dbTenant.name,
            plan: (dbTenant.plan as Tenant['plan']) || 'Basic',
            status: dbTenant.status as Tenant['status']
          };
        }
      } catch (_) {}
      return null;
    }
  }

  try {
    const dbTenant = await safeGet(db.tenants, tenantId);
    if (dbTenant && dbTenant.status !== 'Deleted' && dbTenant.status !== 'Archived' && dbTenant.status !== 'ARCHIVED') {
      return {
        id: dbTenant.id,
        name: dbTenant.name,
        plan: (dbTenant.plan as Tenant['plan']) || 'Basic',
        status: dbTenant.status as Tenant['status']
      };
    }
    // Check cloud database for newly registered or remote tenant
    try {
      const { data: cloudTenants } = await supabase.from('tenants').select('*').eq('id', tenantId);
      if (cloudTenants && cloudTenants.length > 0) {
        const ct = cloudTenants[0];
        if (!ct.deleted_at && ct.status !== 'Deleted' && ct.status !== 'Archived' && ct.status !== 'ARCHIVED') {
          await db.tenants.put(ct);
          return {
            id: ct.id,
            name: ct.name,
            plan: (ct.plan as Tenant['plan']) || 'Basic',
            status: ct.status as Tenant['status']
          };
        }
      }
    } catch (_) {}

    // If the database has records but we did not find this tenant, it was deleted!
    const tenantCount = await db.tenants.count();
    if (tenantCount > 0) {
      return null;
    }
  } catch (e) {
    console.warn('[Auth] DB tenant lookup failed:', e);
  }
  return null;
}

export const getPermissionsForRoleSlug = async (roleSlugOrName: string): Promise<string[]> => {
  if (!roleSlugOrName) return ['*'];

  const clean = roleSlugOrName.trim().toLowerCase();
  
  // Super Admin & Tenant Owner & Business Owner get full permissions [*]
  if (
    clean === 'super admin' || 
    clean === 'business owner' || 
    clean === 'tenant owner' || 
    clean === 'tenant_owner' ||
    clean.includes('owner') ||
    clean.startsWith('role-owner')
  ) {
    return ['*'];
  }

  // Map user-friendly names to slugs
  const mapper: Record<string, string> = {
    'Business Owner': 'tenant_owner',
    'Tenant Owner': 'tenant_owner',
    'Business Administrator': 'business_administrator',
    'Branch Manager': 'branch_manager',
    'Cashier': 'cashier',
    'Inventory Officer': 'inventory_officer',
    'Accountant': 'accountant'
  };

  const slug = mapper[roleSlugOrName] || clean.replace(/\s+/g, '_');

  try {
    let roleObj = await db.roles.where('slug').equals(slug).first();
    if (!roleObj && roleSlugOrName) {
      roleObj = await safeGet(db.roles, roleSlugOrName);
    }

    if (!roleObj) {
      if (slug === 'tenant_owner' || slug.includes('owner')) return ['*'];
      if (slug === 'business_administrator' || slug === 'admin') {
        return ['sales.create', 'sales.refund', 'sales.void', 'discount.override', 'inventory.product.create', 'inventory.product.edit', 'inventory.category.create', 'inventory.stock.view', 'inventory.stock.receive', 'inventory.stock.transfer', 'inventory.stock.adjust', 'purchase.create', 'purchase.approve', 'supplier.manage', 'customer.view', 'customer.create', 'expense.manage', 'expense.approve', 'banking.manage', 'taxes.manage', 'reports.view', 'reports.branch', 'reports.sales.view', 'reports.inventory.view', 'users.manage', 'roles.assign', 'branches.manage', 'settings.manage', 'audit.logs.view'];
      }
      if (slug === 'branch_manager') {
        return ['sales.create', 'sales.refund', 'sales.void', 'inventory.product.create', 'inventory.stock.view', 'inventory.stock.receive', 'inventory.stock.transfer', 'inventory.stock.adjust', 'inventory.stock.count', 'purchase.create', 'supplier.manage', 'customer.create', 'customer.view', 'expense.manage', 'reports.branch', 'users.manage', 'audit.logs.view'];
      }
      if (slug === 'inventory_officer') {
        return ['inventory.product.create', 'inventory.product.edit', 'inventory.category.create', 'inventory.stock.view', 'inventory.stock.receive', 'inventory.stock.transfer', 'inventory.stock.adjust', 'inventory.stock.count', 'inventory.stock.wastage', 'inventory.barcode.print', 'purchase.create', 'purchase.approve', 'supplier.manage', 'reports.inventory.view', 'audit.logs.view'];
      }
      if (slug === 'accountant') {
        return ['expense.manage', 'expense.create', 'expense.approve', 'payment.manage', 'financial_reports.view', 'banking.manage', 'taxes.manage', 'reports.view', 'reports.branch', 'inventory.stock.view', 'customer.view', 'supplier.manage', 'audit.logs.view'];
      }
      if (slug === 'cashier') {
        return ['sales.create', 'payment.manage', 'pos.shift.manage', 'customer.create', 'customer.view', 'inventory.stock.view'];
      }
      return ['sales.create', 'payment.manage'];
    }

    const rpList = await db.rolePermissions.where('role_id').equals(roleObj.id).toArray();
    if (rpList.length === 0 && (roleObj.slug === 'tenant_owner' || roleObj.slug.includes('owner'))) {
      return ['*'];
    }

    const permIds = rpList.map(rp => rp.permission_id);
    const permRecords = await db.permissions.where('id').anyOf(permIds).toArray();
    return permRecords.length > 0 ? permRecords.map(p => p.slug) : (roleObj.slug === 'tenant_owner' ? ['*'] : ['sales.create', 'payment.manage']);
  } catch (e) {
    console.error('Error fetching role permissions:', e);
    return clean.includes('owner') ? ['*'] : ['sales.create', 'payment.manage'];
  }
};

const safeBtoa = (str: string): string => {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    return btoa(str);
  }
};

const generateMockJWT = (user: User, permissions: string[]): { token: string; claims: JWTClaims } => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims: JWTClaims = {
    sub: user.id,
    iss: 'https://auth.dukapos.com',
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    is_super_admin: user.role === 'Super Admin',
    context: user.role !== 'Super Admin' ? {
      tenant_id: user.tenant_id,
      branch_id: user.branch_id,
      industry_id: user.industry_id || 'ind-retail'
    } : undefined,
    roles: [user.role.toLowerCase().replace(' ', '_')],
    permissions: permissions
  };

  const b64Header = safeBtoa(JSON.stringify(header));
  const b64Claims = safeBtoa(JSON.stringify(claims));
  const token = `${b64Header}.${b64Claims}.mock_signature_signature`;
  return { token, claims };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [role, setRoleState] = useState<UserRole>('Business Owner');
  const defaultTenant: Tenant = { id: '', name: '', plan: 'Basic', status: 'Active' };
  const defaultBranch: Branch = { id: '', tenant_id: '', name: '', location: '' };

  const [currentTenant, setTenantState] = useState<Tenant>(defaultTenant);
  const [currentBranch, setCurrentBranchState] = useState<Branch>(defaultBranch);
  const [currentIndustry, setCurrentIndustryState] = useState<{ id: string; name: string } | null>({ id: 'ind-retail', name: 'Retail' });
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [jwtClaims, setJwtClaims] = useState<JWTClaims | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('dukapos_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });
  const [isOfflineLocked, setIsOfflineLocked] = useState<boolean>(false);

  const [isSuperAdminView, setIsSuperAdminView] = useState<boolean>(false);
  const [impersonatedTenant, setImpersonatedTenant] = useState<Tenant | null>(null);

  const [dbBranches, setDbBranches] = useState<Branch[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('dukapos_theme', theme);
  }, [theme]);

  // Listen for real-time cross-tab workspace revocation signals
  useEffect(() => {
    const unsubscribe = tenantSecurityBroadcast.subscribe((evt) => {
      if (evt.type === 'TENANT_PURGED') {
        const myTenantId = currentTenant?.id || user?.tenant_id;
        if (myTenantId && myTenantId === evt.tenantId && user?.role !== 'Super Admin') {
          console.warn(`[AuthContext] Tenant ${evt.tenantId} purged by another browser session. Revoking session.`);
          localStorage.removeItem('dukapos_session');
          localStorage.removeItem('activeTenant');
          localStorage.removeItem('user');
          setUserState(null);
          setTenantState(defaultTenant);
          alert('⚠️ Workspace Revoked: Your organization workspace was deleted by an administrator. Session terminated.');
          window.location.href = '/';
        }
      }
    });

    return () => unsubscribe();
  }, [currentTenant?.id, user?.tenant_id, user?.role]);

  // Load session and restore user state on initialization
  useEffect(() => {
    // Restore session from localStorage
    const sessionStr = localStorage.getItem('dukapos_session');
    let initFinalized = false;

    const finalizeInit = () => {
      if (!initFinalized) {
        initFinalized = true;
        setIsInitializing(false);
      }
    };

    // Safety net: never stay on loading spinner beyond 8s
    const startupSafetyTimer = setTimeout(() => {
      console.warn('[Auth] Startup safety timeout: forcing isInitializing=false');
      finalizeInit();
    }, 8000);

    const cleanup = () => clearTimeout(startupSafetyTimer);

    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        
        const normalizeRoleName = (r: string): UserRole => {
          if (!r) return 'Tenant Owner';
          const clean = r.trim().toLowerCase();
          if (clean === 'super admin') return 'Super Admin';
          if (clean.includes('owner') || clean.startsWith('role-owner')) return 'Tenant Owner';
          if (clean.includes('admin') || clean.startsWith('role-admin')) return 'Business Administrator';
          if (clean.includes('manager') || clean.startsWith('role-manager')) return 'Branch Manager';
          if (clean.includes('cashier') || clean.startsWith('role-cashier')) return 'Cashier';
          if (clean.includes('inventory') || clean.startsWith('role-inventory')) return 'Inventory Officer';
          if (clean.includes('accountant') || clean.startsWith('role-accountant')) return 'Accountant';
          return (r as UserRole) || 'Tenant Owner';
        };

        const restoreSessionData = (sess: any) => {
          const normRole = normalizeRoleName(sess.role || sess.user?.role);
          const normUser = sess.user ? { ...sess.user, role: normRole } : null;

          // Check if session tenant or user email is in revoked/deleted tombstones
          if (sess.tenant?.id && normRole !== 'Super Admin') {
            try {
              const rawDeleted = localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]';
              const deletedList: string[] = JSON.parse(rawDeleted);
              const rawEmails = localStorage.getItem('DUKAPOS_DELETED_USER_EMAILS') || '[]';
              const deletedEmails: string[] = JSON.parse(rawEmails);

              if (deletedList.includes(sess.tenant.id) || (sess.user?.email && deletedEmails.includes(sess.user.email.toLowerCase()))) {
                console.warn('[AuthContext] Restored session belongs to deleted workspace. Revoking.');
                localStorage.removeItem('dukapos_session');
                setUserState(null);
                setTenantState(defaultTenant);
                finalizeInit();
                return;
              }
            } catch (_) {}
          }

          setUserState(normUser);
          setRoleState(normRole);
          setTenantState(sess.tenant);
          setCurrentBranchState(sess.branch);
          setCurrentIndustryState(sess.industry);
          setJwtToken(sess.jwtToken);
          setJwtClaims(sess.jwtClaims);
          if (normRole === 'Super Admin' || normUser?.role === 'Super Admin' || sess.isSuperAdminView) {
            setIsSuperAdminView(true);
          }
          console.log(`[Auth] Session restored successfully for ${normUser?.name || 'User'} (${normRole})`);
          
          if (sess.tenant && sess.tenant.id) {
            syncFromCloudOnLogin(sess.tenant.id).catch(err => {
              console.error('Background cloud sync failed on init:', err);
            });
            
            sessionService.validateOfflineSession(sess.user.id, sess.tenant.id).then(check => {
              if (check.locked) {
                console.warn("Offline grace period expired. Terminal locked.");
                setIsOfflineLocked(true);
              }
            });

            // Start background Health Monitor Loop
            tenantHealthMonitor.startMonitorLoop(sess.tenant.id, (alertMsg) => {
              console.warn(`[Health Monitor Alert] ${alertMsg}`);
            });
          }
        };

        // Validate non-super-admin tenant context against server and startup integrity rules
        if (session.user && session.user.role !== 'Super Admin') {
          const tenantId = session.user.tenant_id;

          // Immediate tombstone check
          const rawDeleted = localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]';
          const deletedSet = new Set(JSON.parse(rawDeleted));
          if (deletedSet.has(tenantId)) {
            console.warn(`[Auth Startup] Tenant ${tenantId} has been deleted. Clearing active session.`);
            localStorage.removeItem('dukapos_session');
            setUserState(null);
            cleanup();
            finalizeInit();
            return;
          }
          
          tenantHealthMonitor.verifyStartupIntegrity(tenantId).then(async (integrity) => {
            try {
              if (integrity.ok) {
                const validTenant = await resolveTenantById(tenantId);
                if (validTenant) {
                  restoreSessionData({ ...session, tenant: validTenant });
                } else {
                  console.warn(`[Auth Startup] Tenant ${tenantId} missing or deleted. Clearing session.`);
                  localStorage.removeItem('dukapos_session');
                  setUserState(null);
                }
              } else {
                console.warn(`[Auth Startup] Tenant verification failed: ${integrity.message}. Clearing invalid session cache.`);
                localStorage.removeItem('dukapos_session');
                setUserState(null);
              }
            } catch (innerErr) {
              console.error('[Auth Startup] Inner restore error:', innerErr);
              localStorage.removeItem('dukapos_session');
              setUserState(null);
            } finally {
              cleanup();
              finalizeInit();
            }
          }).catch(err => {
            console.error('[Auth Startup] Error verifying tenant integrity:', err);
            localStorage.removeItem('dukapos_session');
            setUserState(null);
            cleanup();
            finalizeInit();
          });
        } else {
          restoreSessionData(session);
          cleanup();
          finalizeInit();
        }
      } catch (e) {
        console.error('Failed to parse active session:', e);
        cleanup();
        finalizeInit();
      }
    } else {
      cleanup();
      finalizeInit();
    }
  }, []);

  // Load branches dynamically from DB when user or tenant changes
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const list = await db.branches.toArray();
        if (list.length > 0) {
          setDbBranches(list.map(b => ({
            id: b.id,
            tenant_id: b.tenant_id,
            name: b.name,
            location: b.location
          })));
        }
      } catch (err) {
        console.error('Failed to load branches from database:', err);
      }
    };
    loadBranches();
  }, [user, currentTenant]);

  const updateJWTClaims = async (currentUser: User, currentRole: UserRole, resolvedTenant?: Tenant) => {
    const permissions = await getPermissionsForRoleSlug(currentRole);
    const { token, claims } = generateMockJWT(currentUser, permissions);
    setJwtToken(token);
    setJwtClaims(claims);

    // Resolve the correct tenant — ALWAYS prefer IndexedDB over hardcoded mocks
    // Use pre-resolved tenant if provided (avoids double DB hit), otherwise fetch
    const tenantForSession = resolvedTenant
      || await resolveTenantById(currentUser.tenant_id)
      || currentTenant;

    // Resolve branch: prefer user.branch_id match, then HQ branch from DB
    let matchedBranch: Branch | undefined = (dbBranches.length > 0 ? dbBranches : AVAILABLE_BRANCHES).find(b => b.id === currentUser.branch_id);
    if (!matchedBranch) {
      try {
        const allBranches = await db.branches.where('tenant_id').equals(currentUser.tenant_id).toArray();
        const hq = allBranches.find(b => (b as any).is_headquarters || (b as any).is_default) || allBranches[0];
        if (hq) {
          matchedBranch = { id: hq.id, tenant_id: hq.tenant_id, name: hq.name, location: hq.location };
          setCurrentBranchState(matchedBranch);
        }
      } catch (_) {}
    }
    const activeBranch = matchedBranch || currentBranch;
    const indNames: Record<string, string> = {
      'ind-retail': 'Retail',
      'ind-pharmacy': 'Pharmacy',
      'ind-restaurant': 'Restaurant',
      'ind-sacco': 'SACCO',
      'ind-bar': 'Bar',
      'ind-consulting': 'BusinessConsultant',
      'ind-technical': 'TechnicalCompany'
    };
    const industryId = currentUser.industry_id || 'ind-retail';
    const activeInd = { id: industryId, name: indNames[industryId] || 'Retail' };

    localStorage.setItem('dukapos_session', JSON.stringify({
      user: currentUser,
      role: currentRole,
      tenant: tenantForSession,
      branch: activeBranch,
      industry: activeInd,
      jwtToken: token,
      jwtClaims: claims
    }));
  };

  const setUser = (newUser: User | null) => {
    if (newUser) {
      const cleanRole = (newUser.role || '').toLowerCase();
      let normRole: UserRole = newUser.role;
      if (cleanRole === 'super admin') normRole = 'Super Admin';
      else if (cleanRole.includes('owner') || cleanRole.startsWith('role-owner')) normRole = 'Tenant Owner';
      else if (cleanRole.includes('admin') || cleanRole.startsWith('role-admin')) normRole = 'Business Administrator';
      else if (cleanRole.includes('manager') || cleanRole.startsWith('role-manager')) normRole = 'Branch Manager';
      else if (cleanRole.includes('cashier') || cleanRole.startsWith('role-cashier')) normRole = 'Cashier';
      else if (cleanRole.includes('inventory')) normRole = 'Inventory Officer';
      else if (cleanRole.includes('accountant')) normRole = 'Accountant';

      const normalizedUser = { ...newUser, role: normRole };
      setUserState(normalizedUser);
      setIsInitializing(true);
      setRoleState(normRole);
      if (normRole === 'Super Admin') {
        setIsSuperAdminView(true);
      } else {
        setIsSuperAdminView(false);
        setImpersonatedTenant(null);
      }

      // Resolve current branch: prefer user.branch_id, then HQ branch, then first available
      const resolveHQBranch = async (): Promise<Branch | null> => {
        try {
          // 1. Exact match by user's stored branch_id
          if (newUser.branch_id) {
            const byId = (dbBranches.length > 0 ? dbBranches : []).find(b => b.id === newUser.branch_id);
            if (byId) return byId;
          }
          // 2. Fetch from DB — look for HQ branch for this tenant
          const allBranches = await db.branches.where('tenant_id').equals(newUser.tenant_id).toArray();
          if (allBranches.length > 0) {
            const hq = allBranches.find(b => (b as any).is_headquarters || (b as any).is_default) || allBranches[0];
            return { id: hq.id, tenant_id: hq.tenant_id, name: hq.name, location: hq.location };
          }
        } catch (_) {}
        return null;
      };

      resolveHQBranch().then(hqBranch => {
        if (hqBranch) setCurrentBranchState(hqBranch);
      });

      const indNames: Record<string, string> = {
        'ind-retail': 'Retail',
        'ind-pharmacy': 'Pharmacy',
        'ind-restaurant': 'Restaurant',
        'ind-sacco': 'SACCO',
        'ind-bar': 'Bar',
        'ind-consulting': 'BusinessConsultant',
        'ind-technical': 'TechnicalCompany'
      };
      const industryId = newUser.industry_id || 'ind-retail';
      setCurrentIndustryState({ id: industryId, name: indNames[industryId] || 'Retail' });

      const initUserSession = async () => {
        // Safety timeout: force-clear isInitializing after 6 seconds to prevent permanent blank screen
        const safetyTimer = setTimeout(() => {
          setIsInitializing(false);
          console.warn('[Auth] Safety timeout: isInitializing force-cleared after 6s');
        }, 6000);

        try {
          // 1. Resolve tenant from DB (covers all dynamically registered tenants)
          let resolvedTenant = await resolveTenantById(newUser.tenant_id);
          
          // Trigger automatic recovery if tenant is not found locally
          if (!resolvedTenant && newUser.role !== 'Super Admin') {
            console.log(`[Auth Login] Local tenant missing for ${newUser.tenant_id}. Running recovery...`);
            resolvedTenant = await tenantRecoveryService.validateAndRestoreTenantContext(newUser.tenant_id);
          }

          if (resolvedTenant) {
            setTenantState(resolvedTenant);
          }

          // 1.5 Resolve branch from DB (covers all dynamically registered branches)
          const resolvedBranch = newUser.branch_id ? await safeGet(db.branches, newUser.branch_id) : null;
          if (resolvedBranch) {
            setCurrentBranchState(resolvedBranch);
          } else {
            const tenantBranches = await db.branches.where('tenant_id').equals(newUser.tenant_id).toArray();
            if (tenantBranches.length > 0) {
              setCurrentBranchState(tenantBranches[0]);
            }
          }

          // 2. Set up IndexedDB session record
          await SettingsResolver.migrateFromLegacy(newUser.tenant_id);
          const sess = await sessionService.createSession(newUser.id, newUser.tenant_id, newUser.branch_id);
          const security = await SettingsResolver.resolveNamespace<SecurityConfig>({
            tenantId: newUser.tenant_id,
            namespace: 'SECURITY',
            globalDefaults: DEFAULT_SECURITY_CONFIG
          });
          const allowMultiple = security.allowMultipleSessions;
          if (!allowMultiple) {
            const activeSess = await db.userSessions
              .where('userId')
              .equals(newUser.id)
              .and(s => s.status === 'ACTIVE' && s.id !== sess.id)
              .toArray();
            for (const s of activeSess) {
              s.status = 'REVOKED';
              s.revokedAt = Date.now();
              await db.userSessions.put(s);
              await sessionService.logSecurityEvent(s.tenantId, s.userId, 'SESSION_REVOKED', {
                reason: 'Concurrent session revoked due to Single Device Mode',
                sessionId: s.id
              });
            }
          }

          // Start health monitor check loop
          tenantHealthMonitor.startMonitorLoop(newUser.tenant_id, (alertMsg) => {
            console.warn(`[Health Monitor Alert] ${alertMsg}`);
          });

          // 3. Persist JWT + correct tenant to localStorage AFTER DB resolves
          await updateJWTClaims(newUser, newUser.role, resolvedTenant || undefined);
        } catch (err) {
          console.error('Failed to initialize user session:', err);
          // Still persist session even if some steps fail
          try {
            await updateJWTClaims(newUser, newUser.role);
          } catch (e2) {
            console.error('updateJWTClaims fallback also failed:', e2);
          }
        } finally {
          clearTimeout(safetyTimer);
          setIsInitializing(false);
        }
      };
      initUserSession();
    } else {
      setUserState(null);
      setRoleState('Business Owner');
      setIsSuperAdminView(false);
      setImpersonatedTenant(null);
      setTenantState(defaultTenant);
      setCurrentBranchState(defaultBranch);
      setJwtToken(null);
      setJwtClaims(null);
      localStorage.removeItem('dukapos_session');
      setIsInitializing(false);
    }
  };

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    if (newRole === 'Super Admin') {
      setIsSuperAdminView(true);
    } else {
      setIsSuperAdminView(false);
      setImpersonatedTenant(null);
    }
    
    if (user) {
      const updatedUser = { ...user, role: newRole };
      setUserState(updatedUser);
      updateJWTClaims(updatedUser, newRole);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const setCurrentBranch = (branch: Branch) => {
    setCurrentBranchState(branch);
    if (user) {
      const updatedUser = { ...user, branch_id: branch.id };
      setUserState(updatedUser);
      updateJWTClaims(updatedUser, role);
    }
  };

  const switchContext = async (
    tenantId: string,
    branchId: string,
    industryId: string,
    roleName: UserRole
  ): Promise<boolean> => {
    console.log(`Switching context dynamically to Tenant: ${tenantId}, Branch: ${branchId}, Industry: ${industryId}, Role: ${roleName}`);

    // DB-first tenant resolution — covers all registered tenants, not just mock seed data
    const resolvedTenant = await resolveTenantById(tenantId);
    if (resolvedTenant) {
      setTenantState(resolvedTenant);
    }

    const matchedBranch = (dbBranches.length > 0 ? dbBranches : AVAILABLE_BRANCHES).find(b => b.id === branchId);
    if (matchedBranch) setCurrentBranchState(matchedBranch);

    const indNames: Record<string, string> = {
      'ind-retail': 'Retail',
      'ind-pharmacy': 'Pharmacy',
      'ind-restaurant': 'Restaurant',
      'ind-sacco': 'SACCO',
      'ind-bar': 'Bar',
      'ind-consulting': 'BusinessConsultant',
      'ind-technical': 'TechnicalCompany'
    };
    setCurrentIndustryState({ id: industryId, name: indNames[industryId] || 'Retail' });
    setRoleState(roleName);

    if (user) {
      const updatedUser: User = {
        ...user,
        tenant_id: tenantId,
        branch_id: branchId,
        industry_id: industryId,
        role: roleName
      };
      setUserState(updatedUser);
      // Pass the already-resolved tenant to avoid a redundant DB hit
      await updateJWTClaims(updatedUser, roleName, resolvedTenant || undefined);
    }

    // Trigger background sync pull to retrieve newly switched tenant's data
    syncFromCloudOnLogin(tenantId).catch(err => {
      console.error('Background cloud sync failed on context switch:', err);
    });

    return true;
  };

  const verifyPin = async (userId: string, pin: string): Promise<boolean> => {
    const sec = await db.userSecurity.get(userId);
    if (!sec) return false;
    return sec.pin_hash === pin;
  };

  const logout = async () => {
    if (user) {
      try {
        const activeSess = await db.userSessions
          .where({ userId: user.id, tenantId: user.tenant_id, status: 'ACTIVE' })
          .first();
        if (activeSess) {
          activeSess.status = 'LOGGED_OUT';
          activeSess.revokedAt = Date.now();
          await db.userSessions.put(activeSess);
          await sessionService.logSecurityEvent(user.tenant_id, user.id, 'LOGOUT', { sessionId: activeSess.id });
        }
      } catch (e) {
        console.error('Error closing session on logout:', e);
      }
    }

    setUserState(null);
    setRoleState('Business Owner');
    setIsSuperAdminView(false);
    setImpersonatedTenant(null);
    setTenantState(defaultTenant);
    setCurrentBranchState(defaultBranch);
    setJwtToken(null);
    setJwtClaims(null);
    setIsOfflineLocked(false);
    setIsInitializing(false);
    localStorage.removeItem('dukapos_session');
    // Dev superuser: preserve module+tab state across logout so last active context
    // is automatically restored on next login (never falls back to Retail).
    const isDevSuperuser = user?.email === 'yannick@kwakoko.co.tz';
    if (!isDevSuperuser) {
      localStorage.removeItem('dukapos_active_tab');
      localStorage.removeItem('dukapos_active_module');
    }
  };

  const hasBranchAccess = (targetBranchId: string): boolean => {
    if (!user) return false;
    const rClean = (user.role || '').toLowerCase();
    if (rClean === 'super admin' || rClean === 'business owner' || rClean === 'tenant owner' || rClean.includes('owner')) return true;
    return user.branch_id === targetBranchId;
  };

  const rotateSession = async () => {
    if (!user) return;
    try {
      const activeSess = await db.userSessions
        .where({ userId: user.id, tenantId: user.tenant_id, status: 'ACTIVE' })
        .first();
      
      if (activeSess) {
        const { newRefreshTokenHash } = await sessionService.refreshSessionToken(activeSess.refreshTokenHash);
        await updateJWTClaims(user, role);
        console.log(`[Session Rotation] Rotated successfully. New refresh hash: ${newRefreshTokenHash}`);
      }
    } catch (err: any) {
      console.error('[Session Rotation Hijack Check Failed]', err.message);
      alert(err.message);
      logout();
    }
  };

  // Trigger token rotation every 15 minutes to refresh access tokens
  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        console.log('[Auth] Initiating token rotation process...');
        rotateSession();
      }, 15 * 60 * 1000); // 15 minutes
      return () => clearInterval(interval);
    }
  }, [user, role]);

  const syncFromCloudOnLogin = async (tenantId: string): Promise<boolean> => {
    console.log(`[Supabase Persistence] Syncing products from cloud for Tenant: ${tenantId}...`);
    
    // Set temporary authorization context override so Supabase client bypasses RLS using this tenant
    const tempUser = user || { id: 'usr-temp-sync', name: 'Temp Sync User' };
    setMockAuthOverride({
      tenant_id: tenantId,
      user_id: tempUser.id,
      user_name: tempUser.name
    });

    try {
      const { data: cloudProducts, error: prodError } = await supabase.from('products').select('*').eq('tenant_id', tenantId);
      if (prodError) throw new Error(prodError.message);

      const { data: cloudVariants, error: varError } = await supabase.from('product_variants').select('*').eq('tenant_id', tenantId);
      if (varError) throw new Error(varError.message);

      // Reconcile tenant metadata: tenants (and purge local tombstones)
      const { data: cloudTenants, error: tError } = await supabase.from('tenants').select('*');
      if (!tError && cloudTenants) {
        const activeCloudTenantIds = new Set(cloudTenants.filter((t: any) => !t.deleted_at && t.status !== 'Deleted' && t.status !== 'Archived').map((t: any) => t.id));
        const localTenants = await db.tenants.toArray();
        for (const lt of localTenants) {
          if (!activeCloudTenantIds.has(lt.id) && lt.id !== 'tenant-admin-system') {
            await db.tenants.delete(lt.id);
            await db.users.where('tenant_id').equals(lt.id).delete().catch(() => {});
            await db.branches.where('tenant_id').equals(lt.id).delete().catch(() => {});
            await db.userBranchRoles.where('tenant_id').equals(lt.id).delete().catch(() => {});
          }
        }
        if (cloudTenants.length > 0) {
          await db.tenants.bulkPut(cloudTenants.filter((t: any) => !t.deleted_at && t.status !== 'Deleted'));
        }
      }

      // Reconcile platform metadata: subscription plans
      const { data: cloudPlans, error: spError } = await supabase.from('subscriptionPlans').select('*');
      if (!spError && cloudPlans && cloudPlans.length > 0) {
        await db.subscriptionPlans.bulkPut(cloudPlans);
      }

      // Reconcile tenant metadata: branches — ONLY reconcile if cloud returns records
      const { data: cloudBranches, error: bError } = await supabase.from('branches').select('*').eq('tenant_id', tenantId);
      if (!bError && cloudBranches && cloudBranches.length > 0) {
        await db.branches.where('tenant_id').equals(tenantId).delete();
        await db.branches.bulkPut(cloudBranches);
        await tenantHealthMonitor.deduplicateBranches(tenantId);
        const cleanBranches = await db.branches.where('tenant_id').equals(tenantId).toArray();
        setDbBranches(cleanBranches);
      }

      // Reconcile tenant metadata: modules — ONLY reconcile if cloud returns records
      const { data: cloudModules, error: mError } = await supabase.from('tenantModules').select('*').eq('tenant_id', tenantId);
      if (!mError && cloudModules && cloudModules.length > 0) {
        await db.tenantModules.where('tenant_id').equals(tenantId).delete();
        await db.tenantModules.bulkPut(cloudModules);
      }

      // Reconcile tenant metadata: settings — ONLY reconcile if cloud returns records
      const { data: cloudSettings, error: sError } = await supabase.from('tenantSettings').select('*').eq('tenant_id', tenantId);
      if (!sError && cloudSettings && cloudSettings.length > 0) {
        await db.tenantSettings.where('tenant_id').equals(tenantId).delete();
        await db.tenantSettings.bulkPut(cloudSettings);
      }

      // Reconcile tenant metadata: feature flags — ONLY reconcile if cloud returns records
      const { data: cloudFlags, error: fError } = await supabase.from('featureFlags').select('*').eq('tenant_id', tenantId);
      if (!fError && cloudFlags && cloudFlags.length > 0) {
        await db.featureFlags.where('tenant_id').equals(tenantId).delete();
        await db.featureFlags.bulkPut(cloudFlags);
      }

      // Reconcile tenant metadata: roles & user contexts — ONLY reconcile if cloud returns records
      const { data: cloudRoles, error: rError } = await supabase.from('userBranchRoles').select('*').eq('tenant_id', tenantId);
      if (!rError && cloudRoles && cloudRoles.length > 0) {
        await db.userBranchRoles.where('tenant_id').equals(tenantId).delete();
        await db.userBranchRoles.bulkPut(cloudRoles);
      }

      const { data: cloudUsers, error: uError } = await supabase.from('users').select('*').eq('tenant_id', tenantId);
      if (!uError && cloudUsers && cloudUsers.length > 0) {
        await db.users.bulkPut(cloudUsers);
      }

      const { data: cloudTu, error: tuError } = await supabase.from('tenantUsers').select('*').eq('tenant_id', tenantId);
      if (!tuError && cloudTu && cloudTu.length > 0) {
        await db.tenantUsers.bulkPut(cloudTu);
      }

      const { data: cloudTub, error: tubError } = await supabase.from('tenantUserBranches').select('*').eq('tenant_id', tenantId);
      if (!tubError && cloudTub && cloudTub.length > 0) {
        await db.tenantUserBranches.bulkPut(cloudTub);
      }

      if (cloudProducts) {
        await ProductService.reconcileCloudChanges(cloudProducts, tenantId);
      }

      // Resolve primary branch for tenant
      const tenantBranches = await db.branches.where('tenant_id').equals(tenantId).toArray();
      const primaryBranchId = tenantBranches.length > 0 ? tenantBranches[0].id : 'branch-dar-hq';

      if (cloudVariants) {
        // Build a set of cloud variant IDs for targeted reconciliation
        const cloudVariantIds = new Set(cloudVariants.map((cv: any) => cv.id));

        // Only remove local variants that:
        //   (a) exist in the cloud response (so we replace with fresh data), AND
        //   (b) are not PENDING (offline work that hasn't synced yet)
        // This preserves locally-created records that were never pushed to the cloud.
        const localVars = await db.productVariants.where('tenant_id').equals(tenantId).toArray();
        for (const lv of localVars) {
          if (cloudVariantIds.has(lv.id) && lv.syncStatus !== 'PENDING') {
            await db.productVariants.delete(lv.id);
          }
        }

        // Upsert cloud variants (skip if a PENDING local version exists)
        for (const cv of cloudVariants) {
          const existing = await db.productVariants.get(cv.id);
          if (existing && existing.syncStatus === 'PENDING') {
            continue; // Preserve offline-pending version
          }

          const bid = cv.branch_id || cv.branchId || 'branch-dar-hq';
          const resolvedBranchId = (bid === 'branch-dar-hq' && tenantId !== 'tenant-101') ? primaryBranchId : bid;

          await db.productVariants.put({
            id: cv.id,
            productId: cv.productId || cv.product_id,
            sku: cv.sku,
            barcode: cv.barcode,
            buyingPrice: cv.buyingPrice ?? cv.buying_price ?? cv.costPrice ?? cv.cost_price ?? 0,
            sellingPrice: cv.sellingPrice ?? cv.selling_price ?? cv.price ?? 0,
            stock: Number(cv.stock ?? cv.quantity ?? 0) || 0,
            reservedStock: Number(cv.reservedStock ?? cv.reserved_stock ?? 0) || 0,
            reorderLevel: cv.reorderLevel ?? cv.reorder_level ?? 5,
            status: cv.status || 'Active',
            attributes: cv.attributes || {},
            tenant_id: cv.tenant_id || cv.tenantId || tenantId,
            branch_id: resolvedBranchId
          });
        }
      }

      // Recalculate parent stocks locally
      if (cloudProducts) {
        for (const cp of cloudProducts) {
          if (cp.hasVariants) {
            await recalculateProductStock(cp.id);
          }
        }
      }

      // Rebuild all branch balances directly from stock ledger entries to guarantee stock accuracy across login/logout
      await stockLedgerSyncEngine.rebuildAllBranchBalances(tenantId, primaryBranchId);

      // Execute Production-Grade Fast Bootstrap Snapshot Restoration (<2-5 seconds target)
      try {
        await bootstrapEngine.executeFastBootstrap(tenantId, tempUser, primaryBranchId);
        // Launch background non-blocking delta sync & real-time updates
        bootstrapEngine.executeDeltaSync(tenantId).catch(() => {});
      } catch (bsErr) {
        console.warn('[AuthContext] Fast bootstrap engine error:', bsErr);
      }

      // Ensure every category and brand referenced by products exists in db.categories & db.brands
      const allLocalProds = await db.products.where('tenant_id').equals(tenantId).toArray();
      const existingCatMap = new Map((await db.categories.where('tenant_id').equals(tenantId).toArray()).map(c => [c.name, c]));
      const existingBrandMap = new Map((await db.brands.where('tenant_id').equals(tenantId).toArray()).map(b => [b.name, b]));

      for (const p of allLocalProds) {
        if (p.category && p.category.trim() && !existingCatMap.has(p.category.trim())) {
          const newCat = {
            id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: p.category.trim(),
            tenant_id: tenantId,
            created_at: Date.now()
          };
          await db.categories.put(newCat);
          existingCatMap.set(p.category.trim(), newCat);
        }
        if (p.brand && p.brand.trim() && !existingBrandMap.has(p.brand.trim())) {
          const newBrand = {
            id: `brand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: p.brand.trim(),
            tenant_id: tenantId,
            created_at: Date.now()
          };
          await db.brands.put(newBrand);
          existingBrandMap.set(p.brand.trim(), newBrand);
        }
      }

      console.log(`[Supabase Persistence] Cloud data sync completed. Loaded ${cloudProducts?.length || 0} products.`);
      return true;
    } catch (err) {
      console.error('[Supabase Persistence] Sync from cloud failed:', err);
      return false;
    } finally {
      setMockAuthOverride(null);
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    const rLower = (role || user.role || '').toLowerCase();
    if (
      rLower === 'super admin' || 
      rLower === 'business owner' || 
      rLower === 'tenant owner' || 
      rLower === 'tenant_owner' ||
      rLower.includes('owner') ||
      rLower.startsWith('role-owner')
    ) {
      return true;
    }
    if (!jwtClaims) return false;
    if (jwtClaims.permissions.includes('*')) return true;
    return jwtClaims.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      role,
      setRole,
      currentTenant: impersonatedTenant || currentTenant,
      setTenant: (t) => setTenantState(t),
      currentBranch,
      setCurrentBranch,
      branches: (dbBranches.length > 0 ? dbBranches : AVAILABLE_BRANCHES).filter(b => b.tenant_id === (impersonatedTenant?.id || currentTenant.id)),
      currentIndustry,
      setCurrentIndustry: setCurrentIndustryState,
      jwtToken,
      jwtClaims,
      switchContext,
      theme,
      toggleTheme,
      hasPermission,
      isSuperAdminView,
      setIsSuperAdminView,
      impersonatedTenant,
      setImpersonatedTenant,
      logout,
      verifyPin,
      syncFromCloudOnLogin,
      isOfflineLocked,
      setIsOfflineLocked,
      hasBranchAccess,
      rotateSession,
      isInitializing
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  return context || defaultAuthContext;
};
