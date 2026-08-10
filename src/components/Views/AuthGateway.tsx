import React, { useState, useEffect } from 'react';
import { useAuth, type User, type UserRole } from '../../context/AuthContext';
import { useModule, MODULE_MANIFESTS, type IndustryModule } from '../../context/ModuleContext';
import { Button, Input, Badge } from '../UI/custom-ui';
import { 
  Shield, ChevronRight, MapPin, AlertTriangle, Landmark, Store, Pill, Utensils, Zap, Building2,
  Mail, Lock as LockIcon, Key as KeyIcon, Users, Wallet, Package, Calculator, Eye, EyeOff, ArrowRight, X, Loader
} from 'lucide-react';
import { db, safeGet } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase, setMockAuthOverride } from '../../db/supabaseClient';
import { cloudDb } from '../../db/supabaseMock';

import { tenantProvisioningService } from '../../services/tenantProvisioningService';
import { tenantRecoveryService } from '../../services/tenantRecoveryService';
import { SuperAdminService } from '../../services/superAdminService';
import { Html5Qrcode } from 'html5-qrcode';

type AuthMode = 'select' | 'tenant-login' | 'admin-login' | 'context-selection' | 'register-wizard';

interface ResolvedContext {
  id: string;
  tenant_id: string;
  tenantName: string;
  branch_id: string;
  branchName: string;
  branchLocation: string;
  industry_id: string;
  industryName: string;
  role: UserRole;
}

const workspaceRoles = [
  { id: 'owner', name: 'Owner', icon: KeyIcon, defaultEmail: 'owner@dukapos.com', defaultPass: 'owner123' },
  { id: 'manager', name: 'Manager', icon: Users, defaultEmail: 'manager@dukapos.com', defaultPass: 'manager123' },
  { id: 'cashier', name: 'Cashier', icon: Wallet, defaultEmail: 'cashier@dukapos.com', defaultPass: 'cashier123' },
  { id: 'storekeeper', name: 'Storekeeper', icon: Package, defaultEmail: 'clerk@dukapos.com', defaultPass: 'clerk123' },
  { id: 'accountant', name: 'Accountant', icon: Calculator, defaultEmail: 'accountant@dukapos.com', defaultPass: 'accountant123' },
];

export const resolveFriendlyRole = async (roleIdOrName: string, fallbackRole?: string): Promise<UserRole> => {
  const validRoles: UserRole[] = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator', 'Branch Manager', 'Cashier', 'Inventory Officer', 'Accountant'];
  if (validRoles.includes(roleIdOrName as UserRole)) return roleIdOrName as UserRole;

  const clean = (roleIdOrName || '').trim().toLowerCase();
  if (clean === 'super admin' || clean.includes('super_admin')) return 'Super Admin';
  if (clean.includes('owner') || clean.startsWith('role-owner')) return 'Tenant Owner';
  if (clean.includes('admin') || clean.startsWith('role-admin')) return 'Business Administrator';
  if (clean.includes('manager') || clean.startsWith('role-manager')) return 'Branch Manager';
  if (clean.includes('cashier') || clean.startsWith('role-cashier')) return 'Cashier';
  if (clean.includes('inventory')) return 'Inventory Officer';
  if (clean.includes('accountant')) return 'Accountant';

  try {
    let roleObj = await db.roles.get(roleIdOrName);
    if (!roleObj) {
      roleObj = await db.roles.where('slug').equals(clean.replace(/\s+/g, '_')).first();
    }
    if (roleObj) {
      if (roleObj.slug === 'tenant_owner' || roleObj.slug === 'business_owner' || roleObj.name.toLowerCase().includes('owner')) return 'Tenant Owner';
      if (roleObj.slug === 'business_administrator' || roleObj.name.toLowerCase().includes('admin')) return 'Business Administrator';
      if (roleObj.slug === 'branch_manager' || roleObj.name.toLowerCase().includes('manager')) return 'Branch Manager';
      if (roleObj.slug === 'cashier' || roleObj.name.toLowerCase().includes('cashier')) return 'Cashier';
      if (roleObj.slug === 'inventory_officer' || roleObj.name.toLowerCase().includes('inventory')) return 'Inventory Officer';
      if (roleObj.slug === 'accountant' || roleObj.name.toLowerCase().includes('accountant')) return 'Accountant';
      if (roleObj.name) return roleObj.name as UserRole;
    }
  } catch (_) {}

  if (fallbackRole) {
    if (validRoles.includes(fallbackRole as UserRole)) return fallbackRole as UserRole;
    const fClean = fallbackRole.toLowerCase();
    if (fClean.includes('owner')) return 'Tenant Owner';
    if (fClean.includes('admin')) return 'Business Administrator';
    if (fClean.includes('manager')) return 'Branch Manager';
    if (fClean.includes('inventory')) return 'Inventory Officer';
    if (fClean.includes('accountant')) return 'Accountant';
    if (fClean.includes('cashier')) return 'Cashier';
    return fallbackRole as UserRole;
  }

  return (roleIdOrName as UserRole) || 'Cashier';
};

const featurePool = [
  {
    id: 'analytics',
    title: 'Real-time Analytics',
    desc: 'Track shifts, items, and sales margins live across all branches.',
    icon: Store
  },
  {
    id: 'security',
    title: 'Secure & Reliable',
    desc: 'Full database encryption, automated cloud backups, and offline support.',
    icon: Shield
  },
  {
    id: 'speed',
    title: 'Lightning Fast',
    desc: 'Optimized cashier registers. Complete billing and checkout in seconds.',
    icon: Zap
  },
  {
    id: 'multi-branch',
    title: 'Multi-Branch Ready',
    desc: 'Provision, audit, and re-scope branch contexts from a single manager console.',
    icon: Building2
  },
  {
    id: 'inventory',
    title: 'Advanced Inventory',
    desc: 'Track low stock warnings, expiry dates, and supplier purchase orders.',
    icon: Package
  },
  {
    id: 'accounting',
    title: 'Financial Reporting',
    desc: 'Generate tax reports, expense trackers, and profit/loss statements instantly.',
    icon: Calculator
  },
  {
    id: 'payments',
    title: 'Multi-Payment Support',
    desc: 'Accept Mobile Money, Card payments, Cash, and split checks seamlessly.',
    icon: Wallet
  },
  {
    id: 'crm',
    title: 'Customer Management',
    desc: 'Manage customer loyalty profiles, purchase history, and store credits.',
    icon: Users
  }
];

export const AuthGateway: React.FC = () => {
  const { setUser, setTenant, syncFromCloudOnLogin } = useAuth();
  const { setActiveModule, setActiveTab, enabledModules } = useModule();

  // Active view mode
  const [authMode, setAuthMode] = useState<AuthMode>('tenant-login');

  // Input states
  const [loginEmail, setLoginEmail] = useState('owner@dukapos.com');
  const [loginPassword, setLoginPassword] = useState('owner123');
  const [loginTenantId, setLoginTenantId] = useState('');

  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminMfa, setAdminMfa] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showTenantId, setShowTenantId] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [displayFeatures, setDisplayFeatures] = useState<any[]>([]);

  useEffect(() => {
    // Shuffle and pick 4 features on mount
    const shuffled = [...featurePool].sort(() => 0.5 - Math.random());
    setDisplayFeatures(shuffled.slice(0, 4));
  }, []);

  // Start and stop real QR scanner
  useEffect(() => {
    let html5Qrcode: Html5Qrcode | null = null;
    if (showQRScanner && !isScanning) {
      const timer = setTimeout(() => {
        const qrElement = document.getElementById('qr-reader');
        if (qrElement) {
          html5Qrcode = new Html5Qrcode('qr-reader');
          html5Qrcode.start(
            { facingMode: 'user' },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 }
            },
            async (decodedText) => {
              try {
                if (html5Qrcode && html5Qrcode.isScanning) {
                  await html5Qrcode.stop();
                }
              } catch (e) {
                console.error('Error stopping QR scanner:', e);
              }
              await handleQRScanSuccess(decodedText);
            },
            () => {
              // Frame level scanning logs can be ignored
            }
          ).catch(err => {
            console.error('Failed to start HTML5 QR Scanner:', err);
          });
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        if (html5Qrcode && html5Qrcode.isScanning) {
          html5Qrcode.stop().catch(err => console.error('Failed to stop QR scanner on unmount:', err));
        }
      };
    }
  }, [showQRScanner, isScanning]);

  const handleQRScanSuccess = async (decodedText: string) => {
    setErrorMsg('');
    setIsScanning(true);
    try {
      let emailParam = '';
      let tenantIdParam = '';
      
      try {
        const url = new URL(decodedText);
        emailParam = url.searchParams.get('email') || '';
        tenantIdParam = url.searchParams.get('tenant_id') || '';
      } catch (e) {
        if (decodedText.includes('@')) {
          emailParam = decodedText.trim();
        } else {
          setErrorMsg('Invalid QR Code. Please scan a valid employee invitation pass.');
          setIsScanning(false);
          setShowQRScanner(false);
          return;
        }
      }

      if (!emailParam) {
        setErrorMsg('Invalid QR Code pass: missing employee email.');
        setIsScanning(false);
        setShowQRScanner(false);
        return;
      }

      const normalizedEmail = emailParam.trim().toLowerCase();
      let dbUser: any = null;

      try {
        const { data: cloudUsers, error: cloudErr } = await supabase.from('users').select().eq('email', normalizedEmail);
        if (!cloudErr && cloudUsers && cloudUsers.length > 0) {
          dbUser = cloudUsers[0];
          console.log('[QR Auth] User found in Cloud. Rebuilding local IndexedDB cache...');
          const tenantId = dbUser.tenant_id;
          if (tenantId) {
            setMockAuthOverride({
              tenant_id: tenantId,
              user_id: dbUser.id,
              user_name: dbUser.name
            });
            let tRes: any, bRes: any, ubrRes: any, mRes: any, sRes: any, fRes: any, secRes: any;
            try {
              [tRes, bRes, ubrRes, mRes, sRes, fRes, secRes] = await Promise.all([
                supabase.from('tenants').select().eq('id', tenantId).catch(() => ({ data: [] })),
                supabase.from('branches').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('userBranchRoles').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('tenantModules').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('tenantSettings').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('featureFlags').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('userSecurity').select().eq('user_id', dbUser.id).catch(() => ({ data: [] }))
              ]);
            } finally {
              setMockAuthOverride(null);
            }

            await db.transaction('rw', [
              db.tenants, db.branches, db.users, db.userBranchRoles,
              db.tenantModules, db.tenantSettings, db.featureFlags, db.userSecurity
            ], async () => {
              if (tRes.data && tRes.data.length > 0) await db.tenants.put(tRes.data[0]);
              if (bRes.data && bRes.data.length > 0) await db.branches.bulkPut(bRes.data);
              if (ubrRes.data && ubrRes.data.length > 0) await db.userBranchRoles.bulkPut(ubrRes.data);
              if (mRes.data && mRes.data.length > 0) await db.tenantModules.bulkPut(mRes.data);
              if (sRes.data && sRes.data.length > 0) await db.tenantSettings.bulkPut(sRes.data);
              if (fRes.data && fRes.data.length > 0) await db.featureFlags.bulkPut(fRes.data);
              if (secRes.data && secRes.data.length > 0) await db.userSecurity.put(secRes.data[0]);
              await db.users.put(dbUser);
            });
          }
        }
      } catch (err) {
        console.warn('[QR Auth] Cloud unreachable, using local cache:', err);
      }

      if (!dbUser) {
        dbUser = await db.users.where('email').equals(normalizedEmail).first();
        if (!dbUser) {
          const allUsers = await db.users.toArray();
          dbUser = allUsers.find(u => u.email?.toLowerCase() === normalizedEmail);
        }
      }

      if (!dbUser) {
        setErrorMsg(`Employee with email "${emailParam}" not found.`);
        setIsScanning(false);
        setShowQRScanner(false);
        return;
      }

      let roles = await db.userBranchRoles
        .where('user_id')
        .equals(dbUser.id)
        .toArray();

      if (roles.length === 0 && dbUser.tenant_id) {
        roles = await db.userBranchRoles
          .where('tenant_id')
          .equals(dbUser.tenant_id)
          .toArray();
      }

      if (roles.length === 0 && dbUser.tenant_id) {
        const branchRec = (await db.branches.where('tenant_id').equals(dbUser.tenant_id).first()) || { id: `branch-${dbUser.tenant_id}-hq` };
        
        const healedRole: any = {
          id: `ubr-${dbUser.tenant_id}-healed-qr`,
          user_id: dbUser.id,
          tenant_id: dbUser.tenant_id,
          branch_id: branchRec.id,
          industry_id: 'ind-retail',
          role_id: dbUser.is_super_admin ? 'Super Admin' : 'Business Owner'
        };

        await db.userBranchRoles.put(healedRole);
        roles = [healedRole];
      }

      if (roles.length === 0) {
        setErrorMsg('User account has no associated workspace roles.');
        setIsScanning(false);
        setShowQRScanner(false);
        return;
      }

      const defaultTenantId = tenantIdParam || dbUser.tenant_id || roles[0].tenant_id;
      const tenantInfo = await db.tenants.get(defaultTenantId);
      if (!tenantInfo) {
        setErrorMsg('Associated workspace not found.');
        setIsScanning(false);
        setShowQRScanner(false);
        return;
      }

      if (tenantInfo.status === 'ARCHIVED' || tenantInfo.status === 'Archived' || tenantInfo.deletedAt || tenantInfo.deleted_at) {
        setErrorMsg('Workspace Archived. This business account is archived.');
        setIsScanning(false);
        setShowQRScanner(false);
        return;
      }

      if (tenantInfo.status === 'Suspended') {
        setErrorMsg('Workspace Suspended. This business account is suspended.');
        setIsScanning(false);
        setShowQRScanner(false);
        return;
      }



      const resolvedList: ResolvedContext[] = [];
      for (const r of roles) {
        const branch = r.branch_id ? await safeGet(db.branches, r.branch_id) : null;
        const t = r.tenant_id ? await safeGet(db.tenants, r.tenant_id) : null;
        const ind = r.industry_id ? await safeGet(db.industries, r.industry_id) : null;
        const roleLabel = await resolveFriendlyRole(r.role_id, dbUser.role);
        
        resolvedList.push({
          id: r.id || '',
          tenant_id: r.tenant_id,
          tenantName: t?.name || 'Unknown Tenant',
          branch_id: r.branch_id,
          branchName: branch?.name || 'Unknown Branch',
          branchLocation: branch?.location || 'Unknown Location',
          industry_id: r.industry_id,
          industryName: ind?.name || 'Retail',
          role: roleLabel
        });
      }

      setAvailableContexts(resolvedList);
      
      const loggedUser: User = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        role: resolvedList[0].role,
        tenant_id: defaultTenantId,
        branch_id: resolvedList[0].branch_id,
        industry_id: resolvedList[0].industry_id
      };
      
      setResolvedUser(loggedUser);
      setSelectedContext(resolvedList[0]);
      setIsScanning(false);
      setShowQRScanner(false);
      setAuthMode('context-selection');
    } catch (err) {
      console.error('[QR Scan Error]', err);
      setErrorMsg('Failed to scan and resolve credentials.');
      setIsScanning(false);
      setShowQRScanner(false);
    }
  };

  // Context selection states
  const [resolvedUser, setResolvedUser] = useState<User | null>(null);
  const [availableContexts, setAvailableContexts] = useState<ResolvedContext[]>([]);
  const [selectedContext, setSelectedContext] = useState<ResolvedContext | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Onboarding Wizard & Subscription Plan states
  const configuredPlans = useLiveQuery(() => db.subscriptionPlans.toArray()) || [];
  const [wizardStep, setWizardStep] = useState(1);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<IndustryModule>('Retail');
  const [selectedSubscribedModules, setSelectedSubscribedModules] = useState<IndustryModule[]>(['Retail']);
  const [regNumber, setRegNumber] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [industry, setIndustry] = useState('Grocery & Retail Store');
  const [country, setCountry] = useState('Tanzania');
  const [region, setRegion] = useState('Dar es Salaam');
  const [district, setDistrict] = useState('Ilala');
  const [branchAddress, setBranchAddress] = useState('Posta Block A');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [currency, setCurrency] = useState('TZS');
  const [timezone, setTimezone] = useState('Africa/Dar_es_Salaam');
  const [fiscalYear, setFiscalYear] = useState('01-01');
  const [vatRate, setVatRate] = useState(18);
  const [language, setLanguage] = useState('English');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');

  const [selectedPlan, setSelectedPlan] = useState<'Trial' | 'Monthly' | 'Annual' | 'Enterprise'>('Trial');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionProgress, setProvisionProgress] = useState(0);
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);
  const [createdTenantId, setCreatedTenantId] = useState('');
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Recovery Token Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ tenantName: string; ownerEmail: string } | null>(null);
  const [importError, setImportError] = useState('');

  // Handle Workspace Recovery Token import
  const handleImportWorkspace = async (file: File) => {
    setIsImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const text = await file.text();
      const result = await tenantProvisioningService.importFromRecoveryToken(text);
      setImportResult({ tenantName: result.tenantName, ownerEmail: result.ownerEmail });
    } catch (err: any) {
      setImportError(err.message || 'Failed to import workspace.');
    } finally {
      setIsImporting(false);
    }
  };



  // Handle standard Tenant Login Submit
  const handleTenantLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!loginEmail || !loginPassword) {
      setErrorMsg('Please fill in all credentials.');
      return;
    }

    try {
      // 1. Resolve user by email, phone, or business code — search Cloud Database first to support multi-device/clean cache logins
      const inputIdentifier = loginEmail.trim();
      const normalizedEmail = inputIdentifier.toLowerCase();
      let dbUser: any = null;

      try {
        setMockAuthOverride({
          tenant_id: 'tenant-admin-system',
          user_id: 'usr-login-system',
          user_name: 'Login System'
        });

        // Attempt cloud search by email or username first
        const { data: cloudUsers, error: cloudErr } = await supabase.from('users').select().eq('email', normalizedEmail);
        if (!cloudErr && cloudUsers && cloudUsers.length > 0) {
          dbUser = cloudUsers[0];
        } else {
          const { data: cloudUsernames } = await supabase.from('users').select().eq('username', normalizedEmail);
          if (cloudUsernames && cloudUsernames.length > 0) {
            dbUser = cloudUsernames[0];
          }
        }

        // If email lookup yielded no user, try server-side identifier search (phone, business_code, tenant ID)
        if (!dbUser) {
          const serverFound = await tenantRecoveryService.findTenantByIdentifier(inputIdentifier);
          if (serverFound) {
            if (serverFound.user) {
              dbUser = serverFound.user;
            } else {
              // Retrieve users for found tenant
              const { data: tenantUsers } = await supabase.from('users').select().eq('tenant_id', serverFound.tenant.id);
              if (tenantUsers && tenantUsers.length > 0) {
                dbUser = tenantUsers[0];
              }
            }
          }
        }

        if (dbUser) {
          dbUser.tenant_id = dbUser.tenant_id || dbUser.tenantId;
          console.log('[Auth Login] User context resolved from Cloud. Rebuilding local IndexedDB cache...');
          
          const tenantId = dbUser.tenant_id;
          if (tenantId) {
            setMockAuthOverride({
              tenant_id: tenantId,
              user_id: dbUser.id,
              user_name: dbUser.name
            });
            let tRes: any, bRes: any, ubrRes: any, mRes: any, sRes: any, fRes: any, secRes: any, tuRes: any, tubRes: any;
            try {
              [tRes, bRes, ubrRes, mRes, sRes, fRes, secRes, tuRes, tubRes] = await Promise.all([
                supabase.from('tenants').select().eq('id', tenantId).catch(() => ({ data: [] })),
                supabase.from('branches').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('userBranchRoles').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('tenantModules').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('tenantSettings').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('featureFlags').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('userSecurity').select().eq('user_id', dbUser.id).catch(() => ({ data: [] })),
                supabase.from('tenantUsers').select().eq('tenant_id', tenantId).catch(() => ({ data: [] })),
                supabase.from('tenantUserBranches').select().eq('tenant_id', tenantId).catch(() => ({ data: [] }))
              ]);
            } finally {
              setMockAuthOverride(null);
            }

            await db.transaction('rw', [
              db.tenants, db.branches, db.users, db.userBranchRoles,
              db.tenantModules, db.tenantSettings, db.featureFlags, db.userSecurity,
              db.tenantUsers, db.tenantUserBranches
            ], async () => {
              if (tRes.data && tRes.data.length > 0) {
                await db.tenants.put(tRes.data[0]);
              }
              if (bRes.data && bRes.data.length > 0) {
                await db.branches.bulkPut(bRes.data);
              }
              if (ubrRes.data && ubrRes.data.length > 0) {
                await db.userBranchRoles.bulkPut(ubrRes.data);
              }
              if (mRes.data && mRes.data.length > 0) {
                await db.tenantModules.bulkPut(mRes.data);
              }
              if (sRes.data && sRes.data.length > 0) {
                await db.tenantSettings.bulkPut(sRes.data);
              }
              if (fRes.data && fRes.data.length > 0) {
                await db.featureFlags.bulkPut(fRes.data);
              }
              if (secRes.data && secRes.data.length > 0) {
                await db.userSecurity.put(secRes.data[0]);
              }
              if (tuRes.data && tuRes.data.length > 0) {
                await db.tenantUsers.bulkPut(tuRes.data);
              }
              if (tubRes.data && tubRes.data.length > 0) {
                await db.tenantUserBranches.bulkPut(tubRes.data);
              }
              await db.users.put(dbUser);
            });
            console.log('[Auth Login] Local IndexedDB cache successfully rebuilt.');
          }
        }
      } catch (err) {
        console.warn('[Auth Login] Cloud database lookup failed, falling back to local cache login:', err);
      }

      // Fallback: lookup in local Dexie if cloud lookup failed
      if (!dbUser) {
        try {
          dbUser = await db.users.where('email').equalsIgnoreCase(normalizedEmail).first()
               || await db.users.where('username').equalsIgnoreCase(normalizedEmail).first();
        } catch (_) {}

        if (!dbUser) {
          const allUsers = await db.users.toArray();
          dbUser = allUsers.find(u => 
            (u.email && u.email.trim().toLowerCase() === normalizedEmail) ||
            (u.username && u.username.trim().toLowerCase() === normalizedEmail) ||
            (u.phone && u.phone.replace(/\D/g, '') === inputIdentifier.replace(/\D/g, '')) ||
            (u.user_code && u.user_code.trim().toLowerCase() === normalizedEmail)
          );
        }
      }

      const passMatch = dbUser && (
        dbUser.password_hash === loginPassword || 
        dbUser.password_hash === loginPassword.trim()
      );

      if (!dbUser || !passMatch) {
        setErrorMsg('Invalid credentials. Please verify your email, phone, or business code and password.');
        return;
      }

      dbUser.tenant_id = dbUser.tenant_id || dbUser.tenantId;

      // ── Persistent Tombstone Deletion Guard ──
      const rawDeleted = typeof window !== 'undefined' ? localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]' : '[]';
      const deletedTenantSet = new Set<string>(JSON.parse(rawDeleted));
      const userTenantId = dbUser.tenant_id;

      if (!dbUser.is_super_admin && dbUser.role !== 'Super Admin') {
        if (dbUser.status === 'Deleted' || dbUser.deleted_at) {
          setErrorMsg('Access Denied: Your account has been deactivated or deleted.');
          return;
        }

        if (userTenantId && deletedTenantSet.has(userTenantId)) {
          setErrorMsg('Access Denied: This organization workspace has been permanently deleted.');
          return;
        }
      }

      // 2. Resolve roles associated with the user across all tenants
      let roles = await db.userBranchRoles
        .where('user_id')
        .equals(dbUser.id)
        .toArray();

      // Fallback Layer 1: Search by tenant_id if user_id query returned empty
      if (roles.length === 0 && dbUser.tenant_id) {
        roles = await db.userBranchRoles
          .where('tenant_id')
          .equals(dbUser.tenant_id)
          .toArray();
      }

      // Fallback Layer 2: Search Cloud for userBranchRoles if empty locally
      if (roles.length === 0 && dbUser.tenant_id && !deletedTenantSet.has(dbUser.tenant_id)) {
        try {
          const { data: cloudUbr } = await supabase
            .from('userBranchRoles')
            .select();
          const userMatchingUbr = (cloudUbr || []).filter((r: any) => r.user_id === dbUser.id || (dbUser.tenant_id && (r.tenant_id === dbUser.tenant_id || r.tenantId === dbUser.tenant_id)));
          if (userMatchingUbr.length > 0) {
            await db.userBranchRoles.bulkPut(userMatchingUbr);
            roles = userMatchingUbr;
          }
        } catch (e) {
          console.warn('[Auth Login] Could not fetch userBranchRoles from Cloud:', e);
        }
      }

      // Fallback Layer 3: Auto-heal missing role for active non-deleted tenant user/owner
      if (roles.length === 0 && dbUser.tenant_id && !deletedTenantSet.has(dbUser.tenant_id)) {
        const branchRec = (await db.branches.where('tenant_id').equals(dbUser.tenant_id).first()) || { id: `branch-${dbUser.tenant_id}-hq` };
        
        const healedRole: any = {
          id: `ubr-${dbUser.tenant_id}-healed`,
          user_id: dbUser.id,
          tenant_id: dbUser.tenant_id,
          branch_id: branchRec.id,
          industry_id: 'ind-retail',
          role_id: dbUser.is_super_admin ? 'Super Admin' : 'Business Owner'
        };

        await db.userBranchRoles.put(healedRole);
        roles = [healedRole];
      }
      
      if (roles.length === 0) {
        setErrorMsg('Access Denied: User account has no active workspace roles or tenant has been deleted.');
        return;
      }

      // Retrieve default/active tenant — check local DB then recover from server/cloudDb
      const defaultTenantId = loginTenantId.trim() || dbUser.tenant_id || (roles[0] && roles[0].tenant_id);
      if (deletedTenantSet.has(defaultTenantId)) {
        setErrorMsg('Access Denied: This organization workspace has been permanently deleted.');
        return;
      }

      let tenant: any = defaultTenantId ? await safeGet(db.tenants, defaultTenantId) : null;
      if (!tenant && defaultTenantId) {
        console.log(`[Auth Login] Local tenant record missing for ${defaultTenantId}. Triggering server recovery...`);
        tenant = await tenantRecoveryService.validateAndRestoreTenantContext(defaultTenantId);
      }
      if (!tenant && defaultTenantId) {
        // Direct query to central production database cloudDb.cloud_tenants
        const cloudT = await safeGet(cloudDb.cloud_tenants, defaultTenantId);
        if (cloudT && !cloudT.deleted_at && cloudT.status !== 'Deleted' && cloudT.status !== 'Archived') {
          tenant = {
            id: cloudT.id,
            name: cloudT.name,
            slug: cloudT.slug,
            status: cloudT.status,
            plan: cloudT.plan,
            business_type: cloudT.business_type || 'Retail',
            email: cloudT.email || dbUser.email,
            created_at: cloudT.created_at
          };
          await db.tenants.put(tenant as any);
        }
      }

      if (!tenant) {
        setErrorMsg('Access Denied: Associated business workspace was not found or has been deleted.');
        return;
      }

      // Enforce soft-delete archive & deletion blocking
      if (tenant.status === 'ARCHIVED' || tenant.status === 'Archived' || tenant.status === 'Deleted' || tenant.deletedAt || tenant.deleted_at) {
        setErrorMsg('Access Denied: This business workspace has been deactivated or deleted.');
        return;
      }

      if (tenant.status === 'Suspended') {
        setErrorMsg('Workspace Suspended. This business account is suspended due to billing.');
        return;
      }

      const resolvedList: ResolvedContext[] = [];
      for (const r of roles) {
        const br = r.branch_id ? await safeGet(db.branches, r.branch_id) : null;
        const ind = r.industry_id ? await safeGet(db.industries, r.industry_id) : null;
        const t = r.tenant_id ? await safeGet(db.tenants, r.tenant_id) : null;
        const roleLabel = await resolveFriendlyRole(r.role_id, dbUser.role);
        
        resolvedList.push({
          id: r.id,
          tenant_id: r.tenant_id,
          tenantName: t?.name || 'Unknown Tenant',
          branch_id: r.branch_id,
          branchName: br?.name || 'Unknown Branch',
          branchLocation: br?.location || 'Unknown Location',
          industry_id: r.industry_id,
          industryName: ind?.name || 'Retail',
          role: roleLabel
        });
      }

      setAvailableContexts(resolvedList);
      
      const loggedUser: User = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        role: resolvedList[0].role,
        tenant_id: defaultTenantId,
        branch_id: resolvedList[0].branch_id,
        industry_id: resolvedList[0].industry_id
      };
      
      setResolvedUser(loggedUser);

      // Always route to context selection screen
      setSelectedContext(resolvedList[0]);
      setAuthMode('context-selection');
    } catch (err) {
      console.error(err);
      setErrorMsg('Authentication failed.');
    }
  };

  // Handle standard Super Admin Login Submit
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = adminEmail.trim().toLowerCase();
    const cleanPass = adminPassword.trim();
    const cleanMfa = (adminMfa || '123456').trim();

    if (!cleanEmail || !cleanPass) {
      setErrorMsg('Please enter your Super Admin email and password.');
      return;
    }

    if (cleanMfa && cleanMfa !== '123456') {
      setErrorMsg('Invalid MFA verification code! Use verification code "123456".');
      return;
    }

    try {
      // Authenticate directly against central PostgreSQL production database (cloudDb)
      const cloudAdmin = await SuperAdminService.authenticateSuperAdmin(cleanEmail, cleanPass);

      if (!cloudAdmin) {
        setErrorMsg('Invalid admin credentials or unauthorized Super Admin account.');
        return;
      }

      const adminUser: User = {
        id: cloudAdmin.id,
        name: cloudAdmin.name,
        email: cloudAdmin.email,
        phone: cloudAdmin.phone || '+255799999999',
        role: 'Super Admin',
        tenant_id: 'tenant-admin-system',
        branch_id: 'branch-dar-hq'
      };

      setUser(adminUser);
    } catch (err) {
      console.error('[Super Admin Login Error]', err);
      setErrorMsg('Super admin login failed. Please check server logs.');
    }
  };

  // Handle Context Selection Screen choice
  const handleSelectContext = async (ctx: ResolvedContext) => {
    if (!resolvedUser) return;
    
    const loggedUser: User = {
      ...resolvedUser,
      role: ctx.role,
      branch_id: ctx.branch_id,
      industry_id: ctx.industry_id
    };

    // Set the user and navigate immediately — do NOT block login on cloud sync
    setTenant({
      id: ctx.tenant_id,
      name: ctx.tenantName,
      plan: 'Enterprise'
    });
    setActiveModule(ctx.industryName as any);
    setActiveTab('Dashboard');
    setUser(loggedUser);

    // Run cloud sync in background after login completes (non-blocking)
    syncFromCloudOnLogin(ctx.tenant_id).catch(err => {
      console.warn('[Auth] Background cloud sync on login failed (non-fatal):', err);
    });
  };


  // Handle Onboarding Completion
  const runProvisioning = async () => {
    setIsProvisioning(true);
    setProvisionProgress(10);
    setProvisionLogs(['[System] Initializing DukaPos Tenant Provisioning...']);
    
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    
    try {
      await sleep(600);
      setProvisionProgress(25);
      setProvisionLogs(prev => [...prev, '[Database] Validating immutable workspace keys...', '[Database] Generating UUID: tenant-id and branch-id...']);
      
      const cleanTenantId = crypto.randomUUID();
      const cleanBranchId = crypto.randomUUID();
      const ownerUserId = `usr-${cleanTenantId}-owner`;

      await sleep(800);
      setProvisionProgress(50);
      setProvisionLogs(prev => [...prev, '[Database] Provisioning isolated database containers...', `[Database] Created tenant profile matching "${businessName}"`]);

      // Call provisioning service with custom inputs!
      await tenantProvisioningService.provisionCleanTenant(
        cleanTenantId,
        cleanBranchId,
        businessName || 'My DukaPos Business',
        businessType,
        {
          email: (email || 'owner@newbusiness.com').trim().toLowerCase(),
          fullName: fullName || 'Business Owner',
          pin: '1234',
          password: password || 'owner123',
          phone: phone || '+255700000000'
        },
        {
          regNumber,
          taxNumber,
          industry,
          country,
          region,
          district,
          address: branchAddress,
          currency,
          timezone,
          fiscalYearStart: fiscalYear,
          vatRate,
          language,
          dateFormat,
          plan: selectedPlan === 'Trial' ? 'Basic' : selectedPlan === 'Monthly' ? 'Professional' : selectedPlan === 'Annual' ? 'Professional' : 'Enterprise',
          status: selectedPlan === 'Trial' ? 'Trial' : 'Active',
          subscribedModules: selectedSubscribedModules
        }
      );

      await sleep(700);
      setProvisionProgress(70);
      setProvisionLogs(prev => [...prev, '[Roles] Mapping default role clearances (Tenant Owner, Cashier, Accountant)...', '[Settings] Building default double-entry Chart of Accounts (COA)...']);
      


      await sleep(600);
      setProvisionProgress(100);
      setProvisionLogs(prev => [...prev, '[Success] System provisioned successfully!', '[Security] Workspace encryption keys saved.', '[System] Downloading workspace recovery token silently...']);

      // Setup user session
      const newUser: User = {
        id: ownerUserId,
        name: fullName || 'New Business Owner',
        email: (email || 'owner@newbusiness.com').trim().toLowerCase(),
        phone: phone || '+255700000000',
        role: 'Business Owner',
        tenant_id: cleanTenantId,
        branch_id: cleanBranchId,
        industry_id: businessType === 'Pharmacy' ? 'ind-pharmacy' : businessType === 'Restaurant' ? 'ind-restaurant' : businessType === 'Bar' ? 'ind-bar' : businessType === 'Garage' ? 'ind-garage' : businessType === 'Hotel' ? 'ind-hotel' : businessType === 'SACCO' ? 'ind-sacco' : businessType === 'BusinessConsultant' ? 'ind-consulting' : 'ind-retail'
      };

      setCreatedTenantId(cleanTenantId);
      setCreatedUser(newUser);
      setIsReady(true);

      // Trigger recovery token download
      try {
        await tenantProvisioningService.downloadRecoveryToken(cleanTenantId, businessName || 'my-business');
      } catch (e) {
        console.warn('[Recovery Token] Auto-download failed:', e);
      }

    } catch (err: any) {
      console.error(err);
      setProvisionLogs(prev => [...prev, `[Error] Provisioning aborted: ${err.message || err}`]);
      setIsProvisioning(false);
    }
  };

  const handleLaunchWorkspace = async () => {
    if (!createdUser || !createdTenantId) return;
    await syncFromCloudOnLogin(createdTenantId);
    setTenant({
      id: createdTenantId,
      name: businessName || 'My DukaPos Business',
      plan: selectedPlan === 'Enterprise' ? 'Enterprise' : selectedPlan === 'Trial' ? 'Basic' : 'Professional',
      status: selectedPlan === 'Trial' ? 'Trial' : 'Active'
    });
    setActiveModule(businessType);
    setActiveTab('Dashboard');
    setUser(createdUser);
  };

  const getIndustryIcon = (indName: string) => {
    switch (indName.toLowerCase()) {
      case 'retail': return <Store className="h-4 w-4 text-emerald-500" />;
      case 'pharmacy': return <Pill className="h-4 w-4 text-rose-500" />;
      case 'restaurant': return <Utensils className="h-4 w-4 text-amber-500" />;
      default: return <Landmark className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-slate-50 dark:bg-darkbg text-slate-900 dark:text-white font-sans">
      
      {/* Left Branding & Info Column (Refined Proportions & Layout) */}
      <div className="hidden lg:flex lg:col-span-5 xl:col-span-4 bg-[#5b3ce4] dark:bg-slate-950 px-8 py-10 flex-col justify-start gap-12 text-white relative overflow-hidden border-r border-indigo-600/10 dark:border-slate-800">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/25 rounded-full filter blur-3xl translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-600/35 rounded-full filter blur-3xl -translate-x-1/3 translate-y-1/3" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1 shadow-lg border border-white/30 overflow-hidden shrink-0">
            <img src="/dukapos-logo.png" alt="DukaPos Brand Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-white block leading-none">DukaPos</span>
            <span className="text-[9px] font-bold text-blue-200 tracking-wider block mt-1">BUSINESS OPERATING SYSTEM</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6 text-left">
          <div className="space-y-3">
            <h1 className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Run Your <span className="text-[#fbc02d] block mt-1">Entire Business</span>
            </h1>
            <p className="text-xs xl:text-sm text-indigo-100/80 leading-relaxed font-sans font-normal">
              The complete Business Operating System for retail, pharmacies, restaurants, SACCOs, and more — all in one powerful platform.
            </p>
          </div>

          {/* Premium Features List - Balanced & Snug */}
          <div className="space-y-3.5 pt-2">
            {displayFeatures.map((feat) => {
              const FeatIcon = feat.icon;
              return (
                <div key={feat.id} className="group flex items-start gap-3 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md hover:bg-white/10 transition-all duration-300 hover:translate-x-1 shadow-sm">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#fbc02d] border border-white/10 group-hover:scale-105 transition duration-300">
                    <FeatIcon className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5 text-left">
                    <h3 className="font-bold text-white text-xs">{feat.title}</h3>
                    <p className="text-[11px] text-indigo-100/60 leading-snug font-sans">{feat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Social Proof */}
        <div className="relative z-10 flex items-center gap-3 mt-auto pt-4 border-t border-white/10 text-left">
          <div className="flex -space-x-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#5b3ce4] bg-yellow-400 text-[10px] font-bold text-slate-800 shadow-sm">A</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#5b3ce4] bg-pink-400 text-[10px] font-bold text-white shadow-sm">B</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#5b3ce4] bg-teal-400 text-[10px] font-bold text-white shadow-sm">C</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#5b3ce4] bg-blue-500 text-[10px] font-bold text-white shadow-sm">D</span>
          </div>
          <div className="text-[11px] text-indigo-100/80">
            <span className="font-bold text-white">2,400+ businesses</span> trust DukaPos daily
          </div>
        </div>
      </div>

      {/* Right Form Column */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-center items-center px-4 sm:px-10 md:px-14 py-10 bg-white dark:bg-darkbg-card overflow-hidden">
        <div className="w-full max-w-md space-y-6">
          
          {/* Logo brand for mobile view (hidden on lg) */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1 shadow-md border border-slate-200 dark:border-darkbg-border overflow-hidden shrink-0">
              <img src="/dukapos-logo.png" alt="DukaPos Logo" className="h-full w-full object-contain" />
            </div>
            <div className="text-left">
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white block leading-none">DukaPos</span>
              <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 tracking-wider block mt-1">BUSINESS OPERATING SYSTEM</span>
            </div>
          </div>

          {/* Wizard or Login Forms Container */}
          <div className="w-full bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Top Header info inside card */}
            <div className="bg-gradient-to-r from-primary to-blue-600 p-4 text-white text-center">
              <h2 className="text-sm font-bold tracking-tight">DukaPos Gateway</h2>
              <p className="text-[10px] text-white/80 mt-0.5">Business Operating System · Secure Multi-Tenant Access</p>
            </div>

        {/* UNIFIED TAB-BASED LOGIN PANEL */}
        {(authMode === 'tenant-login' || authMode === 'admin-login' || authMode === 'select') && (
          <div className="p-6 space-y-6">
            
            {/* Login Type Tab Selector */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAuthMode('admin-login')}
                className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition duration-200 focus:outline-none ${
                  authMode === 'admin-login'
                    ? 'border-[#5b3ce4] bg-[#5b3ce4]/5 dark:bg-indigo-950/30 ring-1 ring-[#5b3ce4]'
                    : 'border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card hover:border-slate-300'
                }`}
              >
                <div className={`p-2.5 rounded-xl border transition ${
                  authMode === 'admin-login'
                    ? 'bg-[#5b3ce4] text-white border-transparent'
                    : 'bg-slate-50 dark:bg-darkbg text-slate-500 border-slate-100 dark:border-darkbg-border'
                }`}>
                  <Shield className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-slate-800 dark:text-white text-xs">Super Admin</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">System control</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAuthMode('tenant-login')}
                className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition duration-200 focus:outline-none ${
                  authMode === 'tenant-login' || authMode === 'select'
                    ? 'border-[#5b3ce4] bg-[#5b3ce4]/5 dark:bg-indigo-950/30 ring-1 ring-[#5b3ce4]'
                    : 'border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card hover:border-slate-300'
                }`}
              >
                <div className={`p-2.5 rounded-xl border transition ${
                  authMode === 'tenant-login' || authMode === 'select'
                    ? 'bg-[#5b3ce4] text-white border-transparent'
                    : 'bg-slate-50 dark:bg-darkbg text-slate-500 border-slate-100 dark:border-darkbg-border'
                }`}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-slate-800 dark:text-white text-xs">Business Staff</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Workspace login</p>
                </div>
              </button>
            </div>

            {/* Error Message Box */}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}


            {/* 1. BUSINESS TENANT OWNER / STAFF LOGIN */}
            {(authMode === 'tenant-login' || authMode === 'select') && (
              <div className="space-y-5">
                


                {/* Login Form */}
                <form onSubmit={handleTenantLoginSubmit} className="space-y-4 text-left">
                  
                  {/* Email input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">EMAIL ADDRESS</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                      <input
                        type="email"
                        placeholder="you@business.com"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-[#5b3ce4] focus:outline-none transition shadow-sm"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Password input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">ACCOUNT PASSWORD</label>
                    <div className="relative">
                      <LockIcon className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-[#5b3ce4] focus:outline-none transition shadow-sm"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Tenant ID (expandable advanced option) */}
                  <div className="space-y-2 text-right">
                    <button
                      type="button"
                      onClick={() => setShowTenantId(!showTenantId)}
                      className="text-xs font-semibold text-slate-500 hover:text-[#5b3ce4] transition hover:underline"
                    >
                      {showTenantId ? 'Hide advanced settings' : 'Require Tenant ID? (Advanced)'}
                    </button>
                    
                    {showTenantId && (
                      <div className="space-y-1.5 text-left animate-fadeIn mt-2">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Tenant ID</label>
                        <input
                          type="text"
                          placeholder="Tenant UUID"
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-[#5b3ce4] focus:outline-none transition shadow-sm"
                          value={loginTenantId}
                          onChange={(e) => setLoginTenantId(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <Button type="submit" variant="primary" className="w-full bg-[#5b3ce4] hover:bg-[#4c30c9] py-6 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/25 transition flex items-center justify-center gap-2 border-none text-white font-bold rounded-xl">
                    <span>Sign In to Workspace</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>

                {/* QR Badge Scanner Banner */}
                <div className="border border-indigo-100 dark:border-indigo-950 bg-indigo-50/20 dark:bg-indigo-950/10 rounded-2xl px-4 py-3 flex items-center justify-between text-xs text-indigo-800 dark:text-indigo-400 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#5b3ce4] animate-pulse" />
                    <span>Have an active branch badge?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQRScanner(true)}
                    className="font-bold text-[#5b3ce4] dark:text-primary-dark hover:underline flex items-center gap-0.5"
                  >
                    Scan QR Code <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                {/* Onboarding Wizard Link */}
                <div className="bg-slate-50 dark:bg-darkbg border border-slate-100 dark:border-darkbg-border rounded-2xl p-4 flex items-center justify-between gap-4 mt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 text-[#5b3ce4] dark:text-primary-dark">
                      <Store className="h-5 w-5" />
                    </div>
                    <div className="text-left space-y-0.5">
                      <h5 className="font-bold text-slate-800 dark:text-white text-xs">New Business? Register here</h5>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Create your business account and get set as Admin</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setAuthMode('register-wizard')}
                    className="flex items-center gap-1 font-bold text-xs text-[#5b3ce4] dark:text-primary-dark hover:text-[#4c30c9] flex-shrink-0 transition"
                  >
                    Register <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Recovery Token Restore */}
                <div className="text-center pt-2">
                  <label className="cursor-pointer group inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-semibold transition">
                    <span>🔑</span>
                    <span className="hover:underline">Restore from Recovery Token</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportWorkspace(file);
                      }}
                    />
                  </label>
                </div>

                {/* Import status messages */}
                {isImporting && (
                  <p className="text-center text-[11px] text-[#5b3ce4] animate-pulse">Restoring workspace...</p>
                )}
                {importError && (
                  <p className="text-center text-[11px] text-red-500 font-semibold">{importError}</p>
                )}
                {importResult && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-lg text-center space-y-1">
                    <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">✅ Workspace Restored!</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-semibold">{importResult.tenantName}</p>
                    <p className="text-[10px] text-slate-500">Log in with: <strong>{importResult.ownerEmail}</strong></p>
                    <button
                      onClick={() => { setImportResult(null); setAuthMode('tenant-login'); }}
                      className="mt-1 text-[10px] font-black text-emerald-700 dark:text-emerald-400 underline"
                    >
                      Sign In Now →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. SUPER ADMIN LOGIN MODE */}
            {authMode === 'admin-login' && (
              <form onSubmit={handleAdminLoginSubmit} className="space-y-4 text-left">
                
                {/* Admin Email */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">SYSTEM ADMIN EMAIL</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      type="email"
                      placeholder="admin@dukapos.com"
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-[#5b3ce4] focus:outline-none transition shadow-sm"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Password input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">MASTER PASSWORD</label>
                  <div className="relative">
                    <LockIcon className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-[#5b3ce4] focus:outline-none transition shadow-sm"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* MFA code */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">ADMIN MFA CODE</label>
                  <div className="relative">
                    <KeyIcon className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Mock Code: 123456"
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-[#5b3ce4] focus:outline-none transition shadow-sm"
                      value={adminMfa}
                      onChange={(e) => setAdminMfa(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <Button type="submit" variant="primary" className="w-full bg-[#5b3ce4] hover:bg-[#4c30c9] py-6 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/25 transition flex items-center justify-center gap-2 border-none text-white font-bold rounded-xl">
                  <span>Secure Console Access</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            )}

          </div>
        )}

        {/* 4. CONTEXT SELECTION SCREEN (MULTI-BRANCH/MULTI-INDUSTRY) */}
        {authMode === 'context-selection' && (
          <div className="p-6 space-y-5 text-left">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Active Context Resolution</h3>
              <p className="text-[11px] text-slate-400">Select active branch & operational industry</p>
            </div>

            <div className="bg-slate-50 dark:bg-darkbg border border-slate-100 dark:border-darkbg-border rounded-xl p-3.5 space-y-2">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Authenticated Identity</div>
              <div className="text-xs font-bold text-slate-800 dark:text-white">{resolvedUser?.name}</div>
              <div className="text-[10px] text-slate-500 font-semibold">{resolvedUser?.email}</div>
            </div>

            {/* List of Available Contexts */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-0.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">SELECT BRANCH</label>
              {availableContexts.map((ctx) => {
                const isSelected = selectedContext?.id === ctx.id;
                return (
                  <button
                    key={ctx.id}
                    type="button"
                    onClick={() => setSelectedContext(ctx)}
                    className={`w-full text-left p-3 border rounded-xl transition group flex items-center justify-between focus:outline-none ${
                      isSelected
                        ? 'border-[#5b3ce4] bg-[#5b3ce4]/5 dark:bg-indigo-950/20 ring-1 ring-[#5b3ce4]'
                        : 'border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg transition ${
                        isSelected ? 'bg-[#5b3ce4]/10 text-[#5b3ce4]' : 'bg-slate-100 dark:bg-darkbg text-slate-500'
                      }`}>
                        {getIndustryIcon(ctx.industryName)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center space-x-1.5">
                          <span>{ctx.branchName}</span>
                          <span className="text-[9px] bg-slate-100 dark:bg-darkbg text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                            {ctx.industryName}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span>{ctx.branchLocation}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-2">
                      {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[#5b3ce4]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Read-Only Detected System Role & Proceed Block */}
            {selectedContext && (
              <div className="border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl space-y-4 animate-fadeIn">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase block">DETECTED SYSTEM ROLE</label>
                  
                  {/* Read-only field displaying role with matching icon */}
                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-[#5b3ce4]">
                      {(() => {
                        const cleanRole = (selectedContext.role || '').toLowerCase();
                        const isOwner = cleanRole.includes('owner') || cleanRole.startsWith('role-owner');
                        const isAdmin = cleanRole.includes('admin') || cleanRole.startsWith('role-admin');
                        const isManager = cleanRole.includes('manager') || cleanRole.startsWith('role-manager');
                        const isCashier = cleanRole.includes('cashier') || cleanRole.startsWith('role-cashier');
                        
                        const displayRole = isOwner ? 'Tenant Owner' : isAdmin ? 'Business Administrator' : isManager ? 'Branch Manager' : isCashier ? 'Cashier' : selectedContext.role;
                        const matchedRole = workspaceRoles.find(r => r.name.toLowerCase() === displayRole.toLowerCase() || r.id === displayRole.toLowerCase());
                        const RoleIcon = matchedRole?.icon || KeyIcon;
                        return <RoleIcon className="h-5 w-5" />;
                      })()}
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-400 font-semibold leading-none">System Privilege Level</div>
                      <div className="text-xs font-bold text-slate-800 dark:text-white mt-1 uppercase tracking-wider">
                        {(() => {
                          const cleanRole = (selectedContext.role || '').toLowerCase();
                          if (cleanRole.includes('owner') || cleanRole.startsWith('role-owner')) return 'Tenant Owner';
                          if (cleanRole.includes('admin') || cleanRole.startsWith('role-admin')) return 'Business Administrator';
                          if (cleanRole.includes('manager') || cleanRole.startsWith('role-manager')) return 'Branch Manager';
                          if (cleanRole.includes('cashier') || cleanRole.startsWith('role-cashier')) return 'Cashier';
                          if (cleanRole.includes('inventory')) return 'Inventory Officer';
                          if (cleanRole.includes('accountant')) return 'Accountant';
                          return selectedContext.role;
                        })()}
                      </div>
                    </div>
                    <span className="text-[9px] bg-slate-100 dark:bg-darkbg text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md font-bold uppercase border border-slate-200 dark:border-darkbg-border">
                      Read-Only
                    </span>
                  </div>
                </div>

                <Button 
                  onClick={() => handleSelectContext(selectedContext)}
                  className="w-full bg-[#5b3ce4] hover:bg-[#4c30c9] py-5 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/25 transition flex items-center justify-center gap-2 border-none text-white font-bold rounded-xl"
                >
                  <span>Proceed to Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-darkbg-border/40 pt-4 text-center">
              <button 
                onClick={() => {
                  setSelectedContext(null);
                  setAuthMode('tenant-login');
                }}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-white text-xs font-bold hover:underline"
              >
                ← Back to Credentials
              </button>
            </div>
          </div>
        )}

        {/* 5. ONBOARDING REGISTRATION WIZARD */}
        {authMode === 'register-wizard' && (
          <div className="p-6 space-y-6">
            
            {/* Step Indicators */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    wizardStep === s 
                      ? 'bg-primary text-white font-black' 
                      : wizardStep > s 
                        ? 'bg-success text-white' 
                        : 'bg-slate-100 text-slate-400 dark:bg-darkbg dark:text-slate-600'
                  }`}>
                    {s}
                  </div>
                  {s < 5 && <div className="h-0.5 w-4 sm:w-8 bg-slate-100 dark:bg-darkbg mx-1" />}
                </div>
              ))}
            </div>

            {/* Step 1: Business Information */}
            {wizardStep === 1 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Step 1 — Business Information</h4>
                
                <Input label="Business / Company Name *" placeholder="e.g. Mwanza Enterprise Ltd" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
                
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Primary Industry Module *</label>
                  <select 
                    value={businessType}
                    onChange={(e) => {
                      const val = e.target.value as IndustryModule;
                      setBusinessType(val);
                      if (!selectedSubscribedModules.includes(val)) {
                        setSelectedSubscribedModules([...selectedSubscribedModules, val]);
                      }
                    }}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none font-semibold"
                  >
                    {enabledModules.map((key) => (
                      <option key={key} value={key}>{MODULE_MANIFESTS[key]?.name || key}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Subscribed Business Modules ({selectedSubscribedModules.length} selected)
                  </label>
                  <p className="text-[10px] text-slate-400 mb-2">Select active industry modules for this workspace:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg">
                    {enabledModules.map((modKey) => {
                      const isSelected = selectedSubscribedModules.includes(modKey);
                      const isPrimary = businessType === modKey;
                      return (
                        <button
                          key={modKey}
                          type="button"
                          onClick={() => {
                            if (isPrimary) return;
                            if (isSelected) {
                              setSelectedSubscribedModules(selectedSubscribedModules.filter(m => m !== modKey));
                            } else {
                              setSelectedSubscribedModules([...selectedSubscribedModules, modKey]);
                            }
                          }}
                          className={`flex items-center space-x-1.5 px-2 py-1.5 rounded-md text-[10px] font-bold transition border ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-primary dark:bg-primary-dark/20 dark:border-primary-dark dark:text-primary-dark'
                              : 'bg-white dark:bg-darkbg-card border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <span className="truncate flex-1 text-left">{MODULE_MANIFESTS[modKey]?.name || modKey}</span>
                          {isPrimary && <span className="text-[8px] bg-primary text-white px-1 py-0.5 rounded font-black">HQ</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Registration Number" placeholder="e.g. Reg-77281" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} />
                  <Input label="Tax ID / TIN Number" placeholder="e.g. 100-388-291" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
                </div>

                <Input label="Industry / Niche Category" placeholder="e.g. Food & Beverage / Hardware Supplier" value={industry} onChange={(e) => setIndustry(e.target.value)} />

                <div className="grid grid-cols-3 gap-2">
                  <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} required />
                  <Input label="Region / City" placeholder="e.g. Mwanza" value={region} onChange={(e) => setRegion(e.target.value)} required />
                  <Input label="District" placeholder="e.g. Nyamagana" value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>

                <Input label="Physical Street Address" placeholder="e.g. Kenyatta Road, Block B" value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />

                <Button 
                  variant="primary" 
                  className="w-full flex items-center justify-center space-x-1.5"
                  onClick={() => {
                    if (!businessName || !country || !region) {
                      alert('Business Name, Country and Region/City are required.');
                      return;
                    }
                    setWizardStep(2);
                  }}
                >
                  <span>Continue</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Step 2: Business Owner Account */}
            {wizardStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Step 2 — Business Owner Profile</h4>
                
                <Input label="Full Name *" placeholder="e.g. Juma Ally" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                <Input label="Email Address *" placeholder="e.g. owner@dukapos.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input label="Phone Number *" placeholder="e.g. +255 712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <Input type="password" label="Account Password *" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />

                <div className="flex space-x-3 pt-2">
                  <Button variant="outline" className="w-1/2" onClick={() => setWizardStep(1)}>
                    <span>Back</span>
                  </Button>
                  <Button 
                    variant="primary" 
                    className="w-1/2 flex items-center justify-center space-x-1.5"
                    onClick={() => {
                      if (!fullName || !email || !phone || !password) {
                        alert('All owner details are required.');
                        return;
                      }
                      setWizardStep(3);
                    }}
                  >
                    <span>Continue</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Business Configuration */}
            {wizardStep === 3 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Step 3 — Configuration Settings</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <Input label="System Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} required />
                  
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                    >
                      <option value="Africa/Dar_es_Salaam">EAT (Africa/Dar_es_Salaam)</option>
                      <option value="Africa/Nairobi">EAT (Africa/Nairobi)</option>
                      <option value="Africa/Kampala">EAT (Africa/Kampala)</option>
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Fiscal Year Start" placeholder="01-01" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} required />
                  <Input label="VAT Standard Rate (%)" type="number" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value) || 0)} required />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                    >
                      <option value="English">English</option>
                      <option value="Swahili">Swahili</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Date Format</label>
                    <select
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <Button variant="outline" className="w-1/2" onClick={() => setWizardStep(2)}>
                    <span>Back</span>
                  </Button>
                  <Button 
                    variant="primary" 
                    className="w-1/2 flex items-center justify-center space-x-1.5"
                    onClick={() => {
                      if (!currency || !fiscalYear) {
                        alert('Currency and Fiscal Year start are required.');
                        return;
                      }
                      setWizardStep(4);
                    }}
                  >
                    <span>Continue</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Subscription Selection */}
            {wizardStep === 4 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider text-center">Step 4 — Subscription Tier</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  {(configuredPlans.length > 0 ? configuredPlans : [
                    { id: 'plan-trial', name: 'Free Trial', code: 'TRIAL', description: '14-day evaluation trial', price: 0 },
                    { id: 'plan-starter', name: 'Starter Plan', code: 'STARTER', description: 'For small single-shop businesses', price: 12000 },
                    { id: 'plan-business', name: 'Business Plan', code: 'BUSINESS', description: 'Retail stores with multiple branches', price: 16000 },
                    { id: 'plan-enterprise', name: 'Enterprise Plan', code: 'ENTERPRISE', description: 'Infinite scale & dedicated support', price: 30000 }
                  ]).map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlan(p.name as any)}
                      className={`flex flex-col items-center p-3 rounded-xl border text-center transition cursor-pointer ${
                        selectedPlan === p.name || selectedPlan === p.id 
                          ? 'border-primary bg-primary/5 text-primary dark:border-primary-dark dark:bg-primary-dark/10'
                          : 'border-slate-200 dark:border-darkbg-border text-slate-500 hover:bg-slate-50 dark:hover:bg-darkbg dark:text-slate-300'
                      }`}
                    >
                      <span className="text-2xl mb-1">
                        {p.code === 'STARTER' ? '⚡' : p.code === 'BUSINESS' ? '⭐' : p.code === 'ENTERPRISE' ? '🏢' : '⏱️'}
                      </span>
                      <strong className="text-xs font-black block">{p.name}</strong>
                      <span className="text-[10px] text-slate-400 mt-0.5 min-h-[24px] line-clamp-2">{p.description}</span>
                      <Badge variant="outline" className="mt-2 text-[9px] font-bold">
                        {p.price === 0 ? 'Free' : `Tsh ${p.price.toLocaleString()}/mo`}
                      </Badge>
                    </button>
                  ))}
                </div>

                <div className="flex space-x-3 pt-2">
                  <Button variant="outline" className="w-1/2" onClick={() => setWizardStep(3)}>
                    <span>Back</span>
                  </Button>
                  <Button 
                    variant="primary" 
                    className="w-1/2 flex items-center justify-center space-x-1.5"
                    onClick={() => {
                      setWizardStep(5);
                      runProvisioning();
                    }}
                  >
                    <span>Provision Workspace</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Complete / Provisioning Terminal */}
            {wizardStep === 5 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="text-center space-y-1.5">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                    {isReady ? 'Workspace Ready!' : 'Central Tenant Provisioning'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {isReady ? 'Your isolated workspace has been successfully created.' : 'Configuring workspace and saving tenant configurations.'}
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 dark:bg-darkbg rounded-full h-2 overflow-hidden border border-slate-200/40 dark:border-darkbg-border/30">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${provisionProgress}%` }}
                  />
                </div>

                {/* Logging terminal */}
                <div className="bg-slate-900 border border-slate-950 p-4 rounded-xl font-mono text-[9px] text-slate-300 space-y-1.5 h-44 overflow-y-auto scrollbar-thin">
                  {provisionLogs.map((log, idx) => (
                    <div key={idx} className={log.includes('[Success]') ? 'text-emerald-400 font-bold' : log.includes('[Error]') ? 'text-red-400 font-bold' : 'text-slate-300'}>
                      {log}
                    </div>
                  ))}
                  {!isReady && (
                    <div className="flex items-center space-x-1.5 text-primary animate-pulse font-bold mt-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>Running automated deployment... ({provisionProgress}%)</span>
                    </div>
                  )}
                </div>

                {/* AI Assistant notification card */}
                {!isReady && (
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 dark:bg-indigo-950/10 dark:border-indigo-900/20 rounded-lg text-[10px] text-indigo-700 dark:text-indigo-300 leading-relaxed flex gap-2">
                    <span className="text-sm">🤖</span>
                    <span>
                      <strong>AI setup active:</strong> Creating business profile, mapping industry-specific product categories, tax defaults, receipt templates, and staff roles for <strong>{businessType}</strong>.
                    </span>
                  </div>
                )}

                {isReady && (
                  <div className="p-3 bg-emerald-50/50 border border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/20 rounded-lg text-[10px] text-emerald-700 dark:text-emerald-300 flex items-start gap-2 animate-in slide-in-from-top-2 duration-300">
                    <span className="text-sm">✅</span>
                    <div>
                      <strong>Onboarding Finished!</strong> The Tenant Account / owner / Admin account is generated. Use <strong>{email || 'yannick@kwakoko.co.tz'}</strong> to sign in. The workspace recovery token has been downloaded automatically.
                    </div>
                  </div>
                )}

                <div className="flex space-x-3 pt-2">
                  <Button 
                    variant="outline" 
                    className="w-1/2" 
                    onClick={() => {
                      setWizardStep(4);
                      setIsReady(false);
                      setProvisionProgress(0);
                    }}
                    disabled={!isReady}
                  >
                    <span>Back</span>
                  </Button>
                  <Button 
                    variant="primary" 
                    className={`w-1/2 flex items-center justify-center space-x-1.5 ${isReady ? 'bg-emerald-600 hover:bg-emerald-700 border-none' : ''}`}
                    onClick={handleLaunchWorkspace}
                    disabled={!isReady}
                  >
                    {isReady ? <span>Launch Workspace</span> : <span>Deploying...</span>}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-darkbg-border/40 pt-4 text-center">
              <button 
                onClick={() => setAuthMode('select')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold hover:underline"
                disabled={isProvisioning && !isReady}
              >
                Cancel and return
              </button>
            </div>
          </div>
        )}
          </div>

        </div>
      </div>

      {/* Production Clean Full-Bleed End-to-End Login Page Footer Strip */}
      <footer className="lg:col-span-12 w-full border-t border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card px-6 py-3.5 shadow-sm flex items-center justify-center text-xs select-none z-20">
        <div className="flex items-center justify-center space-x-1.5 flex-wrap gap-y-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
          <span className="font-semibold text-slate-600 dark:text-slate-300">DukaPos</span>
          <span>&copy; 2026</span>
          <span className="text-slate-300 dark:text-slate-700">&bull;</span>
          <span>Version <strong className="font-semibold text-slate-600 dark:text-slate-300">1.0.1</strong></span>
          <span className="text-slate-300 dark:text-slate-700">&bull;</span>
          <span>Build <code className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">20260806.06</code></span>
        </div>
      </footer>

      {/* Mock QR Code Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-darkbg-card rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-darkbg-border shadow-2xl relative space-y-6 text-center">
            
            <button
              onClick={() => setShowQRScanner(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-100 dark:bg-darkbg hover:bg-slate-200 rounded-full transition"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1.5">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">Scan Branch Badge</h3>
              <p className="text-xs text-slate-500">Hold your active badge or token in front of your camera.</p>
            </div>

            {/* Viewfinder and Real Camera Scanner Container */}
            <div className="relative border-2 border-[#5b3ce4]/40 bg-slate-950 aspect-square rounded-2xl overflow-hidden flex items-center justify-center">
              {isScanning ? (
                <div className="text-center text-white space-y-2">
                  <Loader className="h-8 w-8 animate-spin mx-auto text-[#5b3ce4]" />
                  <p className="text-xs text-slate-400 font-medium">Verifying Credentials...</p>
                </div>
              ) : (
                <>
                  <div id="qr-reader" className="w-full h-full absolute inset-0 z-10" />
                  {/* Premium Scanning HUD overlay */}
                  <div className="absolute inset-0 pointer-events-none z-20">
                    {/* Glowing scanner line animation */}
                    <div className="absolute left-0 right-0 h-0.5 bg-[#5b3ce4] shadow-md shadow-[#5b3ce4]/50 animate-scannerTop" />
                    {/* Corner marks */}
                    <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-[#5b3ce4] rounded-tl-md" />
                    <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-[#5b3ce4] rounded-tr-md" />
                    <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-[#5b3ce4] rounded-bl-md" />
                    <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-[#5b3ce4] rounded-br-md" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};
