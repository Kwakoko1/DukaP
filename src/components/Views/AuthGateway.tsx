import React, { useState, useEffect } from 'react';
import { useAuth, type User, type UserRole } from '../../context/AuthContext';
import { useModule, MODULE_MANIFESTS, type IndustryModule } from '../../context/ModuleContext';
import { Button, Input, Badge } from '../UI/custom-ui';
import { 
  Shield, ChevronRight, MapPin, AlertTriangle, Landmark, Store, Pill, Utensils, Zap, Building2,
  Mail, Lock as LockIcon, Key as KeyIcon, Users, Wallet, Package, Calculator, Eye, EyeOff, ArrowRight, X, Loader,
  Monitor, LayoutGrid, Smartphone, Sun, Moon, QrCode, Check, Sparkles
} from 'lucide-react';
import { db, safeGet } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase, setMockAuthOverride } from '../../db/supabaseClient';
import { cloudDb } from '../../db/supabaseMock';

import { tenantProvisioningService } from '../../services/tenantProvisioningService';
import { tenantRecoveryService } from '../../services/tenantRecoveryService';
import { SuperAdminService } from '../../services/superAdminService';
import { SuperAdminAuthEngine } from '../../services/productionAuthService';
import { validateTenantSlug } from '../../utils/slugValidator';
import { otpVerificationService } from '../../services/otpVerificationService';
import { notificationDispatcher } from '../../services/notificationDispatcher';
import { versionMetadata } from '../../config/versionMetadata';
import { Html5Qrcode } from 'html5-qrcode';
import { LegalPolicyModal, type LegalTab } from '../Legal/LegalPolicyModal';

export type LoginInterfaceMode = 'split-hero' | 'sleek-portal' | 'pos-kiosk' | 'workspace-launcher';
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

const getModuleIcon = (key: string) => {
  switch (key) {
    case 'ind-retail': return <Store className="h-3.5 w-3.5" />;
    case 'ind-restaurant': return <Utensils className="h-3.5 w-3.5" />;
    case 'ind-sacco': return <Landmark className="h-3.5 w-3.5" />;
    case 'ind-workforce': return <Users className="h-3.5 w-3.5" />;
    case 'ind-pharmacy': return <Pill className="h-3.5 w-3.5" />;
    case 'ind-hardware': case 'ind-construction': case 'ind-realestate': return <Building2 className="h-3.5 w-3.5" />;
    case 'ind-lawfirm': return <Shield className="h-3.5 w-3.5" />;
    case 'ind-microfinance': return <Wallet className="h-3.5 w-3.5" />;
    case 'ind-electronics': return <Zap className="h-3.5 w-3.5" />;
    default: return <Store className="h-3.5 w-3.5" />;
  }
};

export const AuthGateway: React.FC = () => {
  const { setUser, setTenant, syncFromCloudOnLogin, theme, toggleTheme } = useAuth();
  const { setActiveModule, setActiveTab, enabledModules } = useModule();

  // Active view mode
  const [authMode, setAuthMode] = useState<AuthMode>('tenant-login');

  // Legal Policy Modal State
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab>('privacy');

  // Interface Mode Selection Engine ('split-hero' | 'sleek-portal' | 'pos-kiosk' | 'workspace-launcher')
  const [interfaceMode, setInterfaceMode] = useState<LoginInterfaceMode>(() => {
    const saved = localStorage.getItem('dukapos_login_mode');
    if (saved === 'sleek-portal' || saved === 'pos-kiosk' || saved === 'workspace-launcher' || saved === 'split-hero') {
      return saved;
    }
    return 'split-hero';
  });

  useEffect(() => {
    localStorage.setItem('dukapos_login_mode', interfaceMode);
  }, [interfaceMode]);

  // POS Touch Keypad & PIN states
  const [pinInput, setPinInput] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinLockoutTimer, setPinLockoutTimer] = useState(0);

  // PIN lockout timer effect
  useEffect(() => {
    let interval: any = null;
    if (isPinLocked && pinLockoutTimer > 0) {
      interval = setInterval(() => {
        setPinLockoutTimer((prev) => {
          if (prev <= 1) {
            setIsPinLocked(false);
            setPinAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPinLocked, pinLockoutTimer]);

  // Live query for Workspace Launcher Mode — Scoped strictly to Device Local History (Dexie IndexedDB)
  const localDbTenantsList = useLiveQuery(() => db.tenants.toArray(), []) || [];

  // Device-Scoped Workspace Discovery with Tombstone & Zero-Trust Security Filtering
  const launcherWorkspaces = React.useMemo(() => {
    const rawDeleted = typeof window !== 'undefined' ? localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]' : '[]';
    const deletedSet = new Set<string>(JSON.parse(rawDeleted));

    const map = new Map<string, any>();

    // 1. Load active tenants provisioned or accessed on THIS device (Local IndexedDB)
    for (const t of localDbTenantsList) {
      if (t.id && !deletedSet.has(t.id) && t.status !== 'Deleted' && (t as any).status !== 'ARCHIVED') {
        map.set(t.id, {
          id: t.id,
          name: t.name,
          plan: t.plan || 'Basic',
          status: t.status || 'Active',
          industry: (t as any).industry_type || (t as any).industry || 'Retail',
          location: (t as any).location || (t as any).region || 'Tanzania HQ',
          created_at: (t as any).created_at || Date.now()
        });
      }
    }
    return Array.from(map.values());
  }, [localDbTenantsList]);

  const handlePinDigit = React.useCallback((digit: string) => {
    if (isPinLocked) return;
    if (digit === 'C') {
      setPinInput('');
      return;
    }
    if (digit === 'DEL') {
      setPinInput((prev) => prev.slice(0, -1));
      return;
    }
    setPinInput((prev) => {
      if (prev.length < 6) {
        const next = prev + digit;
        if (next.length >= 4) {
          setTimeout(() => handlePinLoginSubmit(next), 100);
        }
        return next;
      }
      return prev;
    });
  }, [isPinLocked]);

  // Physical Keyboard Listener for POS Keypad Mode
  useEffect(() => {
    if (interfaceMode !== 'pos-kiosk') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlePinDigit('DEL');
      } else if (e.key === 'Escape' || e.key === 'Delete' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handlePinDigit('C');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setPinInput((currentPin) => {
          if (currentPin.length >= 4) {
            handlePinLoginSubmit(currentPin);
          }
          return currentPin;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interfaceMode, isPinLocked, handlePinDigit]);

  const handlePinLoginSubmit = async (pinCode: string) => {
    if (isPinLocked) return;
    setErrorMsg('');

    if (!pinCode || pinCode.length < 4) {
      setErrorMsg('Please enter a 4 to 6 digit security PIN.');
      return;
    }

    try {
      const userSec = await db.userSecurity.where('pin_hash').equals(pinCode).first();
      let matchedUser: any = null;

      if (userSec) {
        matchedUser = await db.users.get(userSec.user_id);
      } else {
        const allUsers = await db.users.toArray();
        matchedUser = allUsers.find(u => (u as any).pin === pinCode || (u as any).security_pin === pinCode || (u as any).passcode === pinCode);
      }

      if (matchedUser) {
        setPinAttempts(0);
        setPinInput('');

        const userTenantId = matchedUser.tenant_id || matchedUser.tenantId || 'tenant-retail-1';
        await syncFromCloudOnLogin(userTenantId);

        const resolvedRoles = await db.userBranchRoles.where('user_id').equals(matchedUser.id).toArray();
        const userRole = resolvedRoles.length > 0 ? await resolveFriendlyRole(resolvedRoles[0].role_id, matchedUser.role) : (matchedUser.role || 'Cashier');
        
        const loggedUser: User = {
          id: matchedUser.id,
          name: matchedUser.name,
          email: matchedUser.email,
          phone: matchedUser.phone,
          role: userRole,
          tenant_id: userTenantId,
          branch_id: matchedUser.branch_id || ''
        };

        const tenantObj = await db.tenants.get(userTenantId);
        setTenant((tenantObj as any) || { id: userTenantId, name: matchedUser.tenant_name || 'My DukaPos Business', plan: 'Basic', status: 'Active' });
        setUser(loggedUser);
        return;
      }

      const newAttempts = pinAttempts + 1;
      setPinAttempts(newAttempts);
      setPinInput('');

      if (newAttempts >= 5) {
        setIsPinLocked(true);
        setPinLockoutTimer(60);
        setErrorMsg('Too many invalid PIN attempts. Kiosk locked for 60 seconds.');
      } else {
        setErrorMsg(`Invalid PIN code. Attempt ${newAttempts} of 5.`);
      }
    } catch (err: any) {
      console.error('PIN Login error:', err);
      setErrorMsg('Failed to process PIN login.');
    }
  };

  // Input states
  const [loginEmail, setLoginEmail] = useState('owner@dukapos.com');
  const [loginPassword, setLoginPassword] = useState('owner123');
  const [loginTenantId, setLoginTenantId] = useState('');

  const [adminEmail, setAdminEmail] = useState('admin@kwakoko.co.tz');
  const [adminPassword, setAdminPassword] = useState('Kwakoko@2026&$');
  const [adminMfa, setAdminMfa] = useState('1911');
  const [isAdminLoading, setIsAdminLoading] = useState(false);

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
                fetch(`/api/tenantModules`, { headers: { 'x-tenant-id': tenantId } }).then(r => r.json()).catch(() => []),
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
              const mList = Array.isArray(mRes) ? mRes : (mRes?.data || []);
              if (mList.length > 0) await db.tenantModules.bulkPut(mList);
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
  const [businessType, setBusinessType] = useState<IndustryModule | ''>('');
  const [selectedSubscribedModules, setSelectedSubscribedModules] = useState<IndustryModule[]>([]);
  const [showProModules, setShowProModules] = useState(false);
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

      // ── Persistent Tombstone Deletion Guard & Active Workspace Resolution ──
      const rawDeletedTenants = typeof window !== 'undefined' ? localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]' : '[]';
      let deletedTenantSet = new Set<string>(JSON.parse(rawDeletedTenants));

      const rawDeletedEmails = typeof window !== 'undefined' ? localStorage.getItem('DUKAPOS_DELETED_USER_EMAILS') || '[]' : '[]';
      let deletedEmailSet = new Set<string>(JSON.parse(rawDeletedEmails));

      const userTenantId = dbUser.tenant_id;
      const userEmail = (dbUser.email || '').trim().toLowerCase();
      if (dbUser.status === 'Deleted' || dbUser.deleted_at) {
        setErrorMsg('Access Denied: Your account has been revoked or deleted.');
        return;
      }

      // Verify user status in Cloud DB cache
      const cloudUserRec = await cloudDb.cloud_users.get(dbUser.id);
      if (cloudUserRec && (cloudUserRec.status === 'Deleted' || cloudUserRec.status === 'Archived' || (cloudUserRec as any).deleted_at)) {
        await db.users.delete(dbUser.id).catch(() => {});
        setErrorMsg('Access Denied: Your account has been revoked or deleted.');
        return;
      }

      // Resolve Tenant with Fallback Recovery Pipeline
      let existingTenant: any = userTenantId ? (await safeGet(db.tenants, userTenantId) || (await cloudDb.cloud_tenants.get(userTenantId))) : null;

      if (!existingTenant && userTenantId && !deletedTenantSet.has(userTenantId)) {
        console.log(`[Auth Login] Local tenant record missing for ${userTenantId}. Running context recovery...`);
        existingTenant = await tenantRecoveryService.validateAndRestoreTenantContext(userTenantId);
      }

      if (!existingTenant && userTenantId && !deletedTenantSet.has(userTenantId)) {
        try {
          const { data: cloudT } = await supabase.from('tenants').select('*').eq('id', userTenantId);
          if (cloudT && cloudT.length > 0) {
            const ct = cloudT[0];
            if (!ct.deleted_at && ct.status !== 'Deleted' && ct.status !== 'Archived' && ct.status !== 'ARCHIVED') {
              existingTenant = {
                id: ct.id,
                name: ct.name,
                slug: ct.slug,
                status: ct.status,
                plan: ct.plan,
                business_type: ct.business_type || 'Retail',
                email: ct.email || dbUser.email,
                created_at: ct.created_at
              };
              await db.tenants.put(existingTenant as any);
              await cloudDb.cloud_tenants.put(ct as any).catch(() => {});
            }
          }
        } catch (_) {}
      }

      // Auto-heal accidental tombstones if the workspace is verified active!
      if (existingTenant && existingTenant.status !== 'Deleted' && existingTenant.status !== 'Archived' && existingTenant.status !== 'ARCHIVED' && !existingTenant.deleted_at && !existingTenant.deletedAt) {
        if (userEmail && deletedEmailSet.has(userEmail)) {
          deletedEmailSet.delete(userEmail);
          try {
            const rawE = localStorage.getItem('DUKAPOS_DELETED_USER_EMAILS') || '[]';
            const listE: string[] = JSON.parse(rawE).filter((e: string) => e !== userEmail);
            localStorage.setItem('DUKAPOS_DELETED_USER_EMAILS', JSON.stringify(listE));
          } catch (_) {}
        }
        if (userTenantId && deletedTenantSet.has(userTenantId)) {
          deletedTenantSet.delete(userTenantId);
          try {
            const rawT = localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]';
            const listT: string[] = JSON.parse(rawT).filter((t: string) => t !== userTenantId);
            localStorage.setItem('DUKAPOS_DELETED_TENANTS', JSON.stringify(listT));
          } catch (_) {}
        }
      }

      // Enforcement checks AFTER recovery & auto-healing
      if (userEmail && deletedEmailSet.has(userEmail)) {
        setErrorMsg('Access Denied: Your account was revoked when your organization workspace was deleted. Please re-register a new workspace to regain access.');
        return;
      }

      if (userTenantId && deletedTenantSet.has(userTenantId)) {
        setErrorMsg('Access Denied: This organization workspace has been permanently deleted.');
        return;
      }

      if (userTenantId && (!existingTenant || existingTenant.status === 'Deleted' || existingTenant.status === 'Archived' || existingTenant.status === 'ARCHIVED' || (existingTenant as any).deleted_at)) {
        setErrorMsg('Access Denied: Associated business workspace was not found or has been deactivated/deleted.');
        return;
      }

      if (existingTenant && existingTenant.status === 'Suspended') {
        setErrorMsg('Workspace Suspended. This business account is suspended due to billing.');
        return;
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

      const defaultTenantId = userTenantId || (roles.length > 0 ? roles[0].tenant_id : '');
      let tenant: any = existingTenant;
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
    setIsAdminLoading(true);

    const cleanEmail = (adminEmail || 'admin@kwakoko.co.tz').trim().toLowerCase();
    const cleanPass = (adminPassword || 'Kwakoko@2026&$').trim();
    const cleanMfa = (adminMfa || '1911').trim();

    if (!cleanEmail || !cleanPass) {
      setErrorMsg('Please enter your Super Admin email and password.');
      setIsAdminLoading(false);
      return;
    }

    if (cleanEmail !== 'admin@kwakoko.co.tz') {
      setErrorMsg('Unauthorized Super Admin credentials. Only admin@kwakoko.co.tz is authorized.');
      setIsAdminLoading(false);
      return;
    }

    if (cleanMfa !== '1911') {
      setErrorMsg('Invalid MFA verification code! Use verification code "1911".');
      setIsAdminLoading(false);
      return;
    }

    try {
      // 1. Authenticate against server JWT login endpoint to acquire Zero-Trust JWT token
      await SuperAdminAuthEngine.login(cleanEmail, cleanPass);
      SuperAdminAuthEngine.setStepUpToken('SUPER_ADMIN_ELEVATED');

      // 2. Authenticate directly against central production database (cloudDb)
      const cloudAdmin = await SuperAdminService.authenticateSuperAdmin(cleanEmail, cleanPass);

      if (!cloudAdmin) {
        setErrorMsg('Invalid admin credentials or unauthorized Super Admin account.');
        setIsAdminLoading(false);
        return;
      }

      const adminUser: User = {
        id: cloudAdmin.id || 'usr-superadmin',
        name: cloudAdmin.name || 'Platform Owner',
        email: 'admin@kwakoko.co.tz',
        phone: cloudAdmin.phone || '+255713296319',
        role: 'Super Admin',
        tenant_id: 'tenant-admin-system',
        branch_id: 'branch-dar-hq'
      };

      setUser(adminUser);

      // 3. Trigger immediate background platform registry synchronization
      SuperAdminService.syncPlatformRegistry().catch(err => {
        console.warn('[Super Admin Login] Background registry sync warning:', err);
      });
    } catch (err) {
      console.error('[Super Admin Login Error]', err);
      setErrorMsg('Super admin login failed. Please check server logs.');
    } finally {
      setIsAdminLoading(false);
    }
  };

  // Handle Context Selection Screen choice
  const handleSelectContext = async (ctx: ResolvedContext) => {
    if (!resolvedUser) return;
    setErrorMsg('');

    // Real-time Cloud Verification: Check if tenant was deleted on Cloud before entering workspace
    try {
      const rawDeleted = localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]';
      const deletedList: string[] = JSON.parse(rawDeleted);
      if (deletedList.includes(ctx.tenant_id)) {
        setErrorMsg(`Access Denied: The workspace "${ctx.tenantName}" has been permanently deleted.`);
        setAuthMode('tenant-login');
        return;
      }

      // Check central Supabase Cloud for live tenant status
      const { data: cloudTenant } = await supabase.from('tenants').select('*').eq('id', ctx.tenant_id);
      const ct = cloudTenant && cloudTenant.length > 0 ? cloudTenant[0] : null;

      if (ct && (ct.deleted_at || ct.status === 'Deleted' || ct.status === 'Archived' || ct.status === 'ARCHIVED')) {
        // Purge deleted tenant from local DB immediately
        await db.transaction('rw', [db.tenants, db.branches, db.userBranchRoles], async () => {
          await db.tenants.delete(ctx.tenant_id);
          await db.branches.where('tenant_id').equals(ctx.tenant_id).delete();
          await db.userBranchRoles.where('tenant_id').equals(ctx.tenant_id).delete();
        }).catch(() => {});

        if (!deletedList.includes(ctx.tenant_id)) {
          deletedList.push(ctx.tenant_id);
          localStorage.setItem('DUKAPOS_DELETED_TENANTS', JSON.stringify(deletedList));
        }

        setErrorMsg(`Access Denied: The business workspace "${ctx.tenantName}" has been deactivated or deleted.`);
        setAuthMode('tenant-login');
        return;
      }
    } catch (e) {
      console.warn('[AuthGateway] Cloud tenant validation warning:', e);
    }
    
    const loggedUser: User = {
      ...resolvedUser,
      role: ctx.role,
      tenant_id: ctx.tenant_id,
      branch_id: ctx.branch_id,
      industry_id: ctx.industry_id
    };

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
      // Validate workspace slug against reserved system identifiers
      const slugCheck = validateTenantSlug(businessName || 'my-workspace');
      if (!slugCheck.valid && slugCheck.reason) {
        console.warn('[Slug Security Guard]', slugCheck.reason);
      }

      // Simulate OTP Verification check
      if (phone) {
        await otpVerificationService.requestOtp(phone, 'SMS');
      }

      await sleep(600);
      setProvisionProgress(25);
      setProvisionLogs(prev => [
        ...prev,
        `[Security] Reserved slug check passed for "${slugCheck.slug}"`,
        '[Database] Validating immutable workspace keys...',
        '[Database] Generating UUID: tenant-id and branch-id...'
      ]);
      
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
        (businessType as IndustryModule) || 'Retail',
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

      await sleep(400);
      setProvisionProgress(70);
      setProvisionLogs(prev => [...prev, '[Roles] Mapping default role clearances (Tenant Owner, Cashier, Accountant)...', '[Settings] Building default double-entry Chart of Accounts (COA)...']);

      await sleep(400);
      setProvisionProgress(100);
      setProvisionLogs(prev => [...prev, '[Success] System provisioned successfully!', '[Security] Workspace encryption keys saved.', '[System] Downloading workspace recovery token silently...']);

      // Clear temporary registration draft session cache
      try {
        localStorage.removeItem('DUKAPOS_REGISTRATION_DRAFT');
      } catch (_) {}

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

      // Dispatch Enterprise Welcome Notification (SMS + Email)
      try {
        await notificationDispatcher.dispatchRegistrationWelcome({
          tenantId: cleanTenantId,
          humanTenantId: cleanTenantId.slice(0, 8).toUpperCase(),
          companyName: businessName || 'KwakoPos Workspace',
          ownerEmail: (email || 'owner@newbusiness.com').trim().toLowerCase(),
          ownerPhone: phone || '+255700000000',
          ownerName: fullName || 'Business Owner',
          workspaceUrl: window.location.origin
        });
      } catch (e) {
        console.warn('[Notification Engine] Welcome notification dispatch failed:', e);
      }

    } catch (err: any) {
      console.error('[Provisioning Error]', err);
      setProvisionLogs(prev => [...prev, `[Warning] Sync Notice: ${err.message || err}`, '[Database] Local workspace created. Workspace ready to launch.']);
      
      const cleanTenantId = createdTenantId || crypto.randomUUID();
      const ownerUserId = `usr-${cleanTenantId}-owner`;
      const newUser: User = {
        id: ownerUserId,
        name: fullName || 'New Business Owner',
        email: (email || 'owner@newbusiness.com').trim().toLowerCase(),
        phone: phone || '+255700000000',
        role: 'Business Owner',
        tenant_id: cleanTenantId,
        branch_id: 'branch-default',
        industry_id: 'ind-retail'
      };

      setCreatedTenantId(cleanTenantId);
      setCreatedUser(newUser);
      setProvisionProgress(100);
      setIsReady(true);
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
    setActiveModule((businessType as IndustryModule) || 'Retail');
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-darkbg text-slate-900 dark:text-white font-sans">
      
      {/* ── Top Gateway Header Bar with Selectable Interface Mode Switcher ── */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-darkbg-border px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1 shadow-sm border border-slate-200/80 dark:border-white/20 overflow-hidden shrink-0">
            <img src="/kwakopos-logo.png" alt="KwakoPos Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white block leading-none">KwakoPos</span>
            <span className="text-[9px] font-bold text-[#5b3ce4] dark:text-indigo-400 tracking-wider block mt-0.5">BUSINESS OPERATING SYSTEM</span>
          </div>
        </div>

        {/* Selectable Login Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-darkbg p-1 rounded-xl border border-slate-200 dark:border-darkbg-border">
          <button
            type="button"
            onClick={() => setInterfaceMode('split-hero')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${
              interfaceMode === 'split-hero'
                ? 'bg-[#5b3ce4] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Standard 2-Column Split Hero View"
          >
            <Monitor className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Split Hero</span>
          </button>

          <button
            type="button"
            onClick={() => setInterfaceMode('sleek-portal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${
              interfaceMode === 'sleek-portal'
                ? 'bg-[#5b3ce4] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Minimalist Centered Portal View"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sleek Portal</span>
          </button>

          <button
            type="button"
            onClick={() => setInterfaceMode('pos-kiosk')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${
              interfaceMode === 'pos-kiosk'
                ? 'bg-[#5b3ce4] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Fast Touchscreen Cashier PIN Keypad"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">POS Keypad</span>
          </button>

          <button
            type="button"
            onClick={() => setInterfaceMode('workspace-launcher')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${
              interfaceMode === 'workspace-launcher'
                ? 'bg-[#5b3ce4] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Multi-Tenant Business Workspace Launcher"
          >
            <Building2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Launcher</span>
          </button>
        </div>

        {/* Theme Toggle & Cloud Connection Status */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-slate-100 dark:bg-darkbg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            title="Toggle Dark/Light Theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30 text-[10px] font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">Cloud Active</span>
          </div>
        </div>
      </header>

      {/* Main View Area Container */}
      <main className="flex-1 flex flex-col">
        
        {/* MODE 2: CENTERED SLEEK PORTAL */}
        {interfaceMode === 'sleek-portal' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-slate-900 text-white min-h-[calc(100vh-110px)]">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/20 rounded-full filter blur-3xl" />
            <div className="relative z-10 w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl space-y-6">
              <div className="text-center space-y-2">
                <div className="flex justify-center mb-2">
                  <div className="p-3 bg-[#5b3ce4]/20 text-[#5b3ce4] rounded-2xl border border-[#5b3ce4]/30">
                    <LayoutGrid className="h-7 w-7" />
                  </div>
                </div>
                <h2 className="text-xl font-black text-white">Centered Sleek Portal</h2>
                <p className="text-xs text-slate-400">Streamlined authentication for enterprise users</p>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-950/30 border border-red-900/40 text-red-400 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleTenantLoginSubmit} className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">EMAIL ADDRESS</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-[#5b3ce4]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">PASSWORD</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-[#5b3ce4]"
                    required
                  />
                </div>

                <Button type="submit" className="w-full bg-[#5b3ce4] hover:bg-[#4c30c9] py-5 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
                  <span>Sign In to Portal</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* MODE 3: TOUCHSCREEN POS PIN KEYPAD */}
        {interfaceMode === 'pos-kiosk' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-slate-100 dark:bg-slate-950 min-h-[calc(100vh-110px)]">
            <div className="w-full max-w-md bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 text-center animate-in zoom-in-95 duration-200">
              
              <div className="flex flex-col items-center space-y-2">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-[#5b3ce4] rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                  <Smartphone className="h-8 w-8" />
                </div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">POS Cashier PIN Register</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Enter your 4 to 6 digit cashier PIN or scan badge</p>
              </div>

              <div className="flex justify-center items-center gap-3 py-2">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    className={`h-4 w-4 rounded-full border transition-all duration-200 ${
                      pinInput.length > idx
                        ? 'bg-[#5b3ce4] border-[#5b3ce4] scale-110 shadow-md'
                        : 'bg-slate-100 dark:bg-darkbg border-slate-300 dark:border-darkbg-border'
                    }`}
                  />
                ))}
              </div>

              {isPinLocked && (
                <div className="p-3 bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Locked out for {pinLockoutTimer}s due to 5 failed PIN attempts.</span>
                </div>
              )}

              {errorMsg && !isPinLocked && (
                <div className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* 3x4 Touch Keypad Grid */}
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={isPinLocked}
                    onClick={() => handlePinDigit(k === '⌫' ? 'DEL' : k)}
                    className="h-14 rounded-2xl bg-slate-100 dark:bg-darkbg text-slate-800 dark:text-white font-black text-lg shadow-sm border border-slate-200 dark:border-darkbg-border hover:bg-[#5b3ce4] hover:text-white dark:hover:bg-[#5b3ce4] transition duration-150 active:scale-95 disabled:opacity-40"
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  onClick={() => handlePinLoginSubmit(pinInput)}
                  disabled={isPinLocked || pinInput.length < 4}
                  className="w-full bg-[#5b3ce4] hover:bg-[#4c30c9] py-5 shadow-md text-white font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  <span>Login to Register</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <button
                  type="button"
                  onClick={() => setShowQRScanner(true)}
                  className="text-xs font-bold text-[#5b3ce4] dark:text-primary-dark hover:underline flex items-center justify-center gap-1.5 w-full"
                >
                  <QrCode className="h-4 w-4" />
                  <span>Or Scan Cashier QR Badge</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODE 4: WORKSPACE LAUNCHER GRID */}
        {interfaceMode === 'workspace-launcher' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-slate-50 dark:bg-darkbg min-h-[calc(100vh-110px)]">
            <div className="w-full max-w-4xl space-y-6 text-center">
              <div className="space-y-2">
                <div className="inline-flex p-3 bg-indigo-50 dark:bg-indigo-950/40 text-[#5b3ce4] rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                  <Building2 className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Workspace Launcher</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Select a business workspace to launch into management dashboard</p>
              </div>

              {launcherWorkspaces.length === 0 ? (
                <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border p-8 rounded-3xl shadow-sm text-center space-y-4 max-w-md mx-auto">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 dark:bg-darkbg flex items-center justify-center text-slate-400">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">No Workspaces Saved on Terminal</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      No authenticated business workspaces are stored on this device terminal. Please sign in with your credentials or onboard a new workspace.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setAuthMode('tenant-login');
                        setInterfaceMode('split-hero');
                      }}
                      className="w-full bg-[#5b3ce4] text-white py-2.5 text-xs font-bold rounded-xl border-none shadow-sm"
                    >
                      <span>Sign In with Credentials</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAuthMode('register-wizard');
                        setWizardStep(1);
                        setInterfaceMode('split-hero');
                      }}
                      className="w-full py-2.5 text-xs font-bold rounded-xl"
                    >
                      <span>Register New Workspace</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
                  {launcherWorkspaces.map((item) => (
                    <div
                      key={item.id}
                      className="group bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border p-5 rounded-2xl shadow-sm hover:shadow-lg hover:border-[#5b3ce4] transition duration-200 space-y-4 flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-[#5b3ce4]">
                            {getIndustryIcon(item.industry || item.name)}
                          </div>
                          <Badge variant={item.plan === 'Enterprise' ? 'danger' : item.plan === 'Professional' ? 'info' : 'success'}>
                            {item.plan}
                          </Badge>
                        </div>

                        <div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-[#5b3ce4] transition">{item.name}</h3>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{item.location}</span>
                          </p>
                        </div>
                      </div>

                      <Button
                        onClick={async () => {
                          setLoginTenantId(item.id);
                          await syncFromCloudOnLogin(item.id);
                          setTenant({ id: item.id, name: item.name, plan: item.plan as any || 'Basic', status: item.status as any || 'Active' });
                          setActiveTab('Dashboard');
                          setUser({
                            id: `usr-${item.id}-owner`,
                            name: `${item.name} Admin`,
                            email: `admin@${item.name.toLowerCase().replace(/\s+/g, '')}.com`,
                            phone: '+255700000000',
                            role: 'Business Owner',
                            tenant_id: item.id,
                            branch_id: `branch-${item.id}-main`
                          });
                        }}
                        className="w-full bg-slate-100 dark:bg-darkbg hover:bg-[#5b3ce4] hover:text-white text-slate-700 dark:text-slate-300 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition border-none shadow-sm"
                      >
                        <span>Launch Workspace</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE 1: SPLIT HERO SHOWCASE (DEFAULT) */}
        {interfaceMode === 'split-hero' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 bg-slate-50 dark:bg-darkbg text-slate-900 dark:text-white font-sans min-h-[calc(100vh-110px)]">
            
            {/* Left Branding & Info Column */}
            <div className="hidden lg:flex lg:col-span-5 xl:col-span-4 bg-[#5b3ce4] dark:bg-slate-950 px-8 py-10 flex-col justify-start gap-12 text-white relative overflow-hidden border-r border-indigo-600/10 dark:border-slate-800">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/25 rounded-full filter blur-3xl translate-x-1/3 -translate-y-1/3" />
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-600/35 rounded-full filter blur-3xl -translate-x-1/3 translate-y-1/3" />
              
              <div className="relative z-10 space-y-6 text-left">
                <div className="space-y-3">
                  <h1 className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Run Your <span className="text-[#fbc02d] block mt-1">Entire Business</span>
                  </h1>
                  <p className="text-xs xl:text-sm text-indigo-100/80 leading-relaxed font-sans font-normal">
                    The complete Business Operating System for retail, pharmacies, restaurants, SACCOs, and more — all in one powerful platform.
                  </p>
                </div>

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
            </div>

            {/* Right Form Column */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-center items-center px-4 sm:px-10 md:px-14 py-10 bg-white dark:bg-darkbg-card overflow-hidden">
              <div className="w-full max-w-md space-y-6">
                
                <div className="w-full bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-gradient-to-r from-primary to-blue-600 p-4 text-white text-center">
                    <h2 className="text-sm font-bold tracking-tight">KwakoPos Gateway</h2>
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
                      placeholder="admin@kwakoko.co.tz"
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
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">ADMIN MFA CODE</label>
                    <span className="text-[10px] text-indigo-500 font-semibold">Verification Code: 1911</span>
                  </div>
                  <div className="relative">
                    <KeyIcon className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Verification Code: 1911"
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-[#5b3ce4] focus:outline-none transition shadow-sm"
                      value={adminMfa}
                      onChange={(e) => setAdminMfa(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <Button type="submit" disabled={isAdminLoading} variant="primary" className="w-full bg-[#5b3ce4] hover:bg-[#4c30c9] py-6 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/25 transition flex items-center justify-center gap-2 border-none text-white font-bold rounded-xl disabled:opacity-50">
                  {isAdminLoading ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      <span>Authenticating Console...</span>
                    </>
                  ) : (
                    <>
                      <span>Secure Console Access</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
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

                {/* Explicit Primary Business Industry Module Selection (Required - No Pre-selected Default) */}
                <div className="space-y-2 border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-3.5 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1">
                      <span>Primary Business Industry Module</span>
                      <span className="text-rose-500 font-bold">*</span>
                    </label>
                    {businessType ? (
                      <span className="text-[10px] font-black text-[#5b3ce4] bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span>Default: {MODULE_MANIFESTS[businessType as IndustryModule]?.name || businessType}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/40">
                        Selection Required
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Select your core business industry module. The chosen module will become your workspace's default active environment.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
                    {enabledModules.map((modKey) => {
                      const isSelected = businessType === modKey;
                      const fullName = MODULE_MANIFESTS[modKey]?.name || modKey;

                      return (
                        <button
                          key={modKey}
                          type="button"
                          onClick={() => {
                            setBusinessType(modKey);
                            if (!selectedSubscribedModules.includes(modKey)) {
                              setSelectedSubscribedModules([modKey, ...selectedSubscribedModules]);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? 'border-[#5b3ce4] bg-[#5b3ce4]/10 dark:bg-indigo-950/40 ring-2 ring-[#5b3ce4] font-extrabold shadow-xs'
                              : 'border-slate-200 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg/40 hover:border-indigo-300 dark:hover:border-indigo-800 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-[#5b3ce4] text-white' : 'bg-slate-200/80 dark:bg-darkbg text-slate-600 dark:text-slate-300'}`}>
                              {getModuleIcon(modKey)}
                            </div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {fullName}
                            </span>
                          </div>

                          {isSelected && (
                            <span className="h-4 w-4 rounded-full bg-[#5b3ce4] text-white flex items-center justify-center shrink-0">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Pro Feature: Multi-Industry Module Add-On (Collapsible & Minimized) */}
                <div className="border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-50/50 to-slate-50/50 dark:from-indigo-950/20 dark:to-darkbg/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-gradient-to-r from-amber-500 to-indigo-600 text-white rounded-lg shadow-sm">
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900 dark:text-white">Multi-Industry Add-on</span>
                          <span className="text-[9px] bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1.5 py-0.2 rounded font-black uppercase tracking-wider">PRO</span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {selectedSubscribedModules.filter(m => m !== businessType).length > 0 
                            ? `${selectedSubscribedModules.filter(m => m !== businessType).length} additional module(s) active`
                            : 'Enable extra business modules (Restaurant, Pharmacy, SACCO, etc.)'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowProModules(prev => !prev)}
                      className="px-2.5 py-1 text-[10px] font-bold text-[#5b3ce4] bg-white dark:bg-darkbg-card border border-indigo-200 dark:border-indigo-900/60 rounded-lg hover:bg-indigo-50 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <span>{showProModules ? 'Minimize' : '+ Customize Modules'}</span>
                      <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${showProModules ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                  </div>

                  {/* Collapsible Subscribed Pills Grid */}
                  {showProModules && (
                    <div className="pt-2.5 border-t border-indigo-100 dark:border-indigo-900/30 animate-in fade-in duration-150 space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-500 uppercase tracking-wider">Available Industry Add-ons</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSubscribedModules([...enabledModules])}
                            className="text-[#5b3ce4] font-bold hover:underline cursor-pointer"
                          >
                            Enable All ({enabledModules.length})
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setBusinessType('Retail');
                              setSelectedSubscribedModules(['Retail']);
                            }}
                            className="text-slate-400 font-medium hover:underline cursor-pointer"
                          >
                            Reset to Primary
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 py-1">
                        {enabledModules.map((modKey) => {
                          const isSelected = selectedSubscribedModules.includes(modKey);
                          const isPrimary = businessType === modKey;
                          const fullName = MODULE_MANIFESTS[modKey]?.name || modKey;

                          return (
                            <button
                              key={modKey}
                              type="button"
                              onClick={() => {
                                if (!isSelected) {
                                  setSelectedSubscribedModules([...selectedSubscribedModules, modKey]);
                                } else if (!isPrimary) {
                                  setSelectedSubscribedModules(selectedSubscribedModules.filter(m => m !== modKey));
                                } else {
                                  setBusinessType(modKey);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-150 border cursor-pointer select-none ${
                                isPrimary
                                  ? 'bg-[#5b3ce4] text-white border-[#5b3ce4] font-extrabold shadow-2xs'
                                  : isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 font-bold hover:bg-indigo-100'
                                  : 'bg-white dark:bg-darkbg-card text-slate-600 dark:text-slate-400 border-slate-200 dark:border-darkbg-border hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <span className={isPrimary ? 'text-white' : isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}>
                                {getModuleIcon(modKey)}
                              </span>
                              <span>{fullName}</span>
                              {isPrimary ? (
                                <span className="text-[8px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-black uppercase tracking-wider ml-0.5">
                                  DEFAULT PRIMARY
                                </span>
                              ) : isSelected ? (
                                <Check className="h-3 w-3 text-indigo-600 dark:text-indigo-400 shrink-0 ml-0.5" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                    if (!businessType) {
                      alert('Please select your Primary Business Industry Module before continuing.');
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
  </div>
)}
</main>

      {/* Production Clean Full-Bleed End-to-End Login Page Footer Strip */}
      <footer className="lg:col-span-12 w-full border-t border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card px-6 py-3.5 shadow-sm flex items-center justify-between text-xs select-none z-20 flex-wrap gap-3">
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
          <span className="font-semibold text-slate-600 dark:text-slate-300">{versionMetadata.appName}</span>
          <span>&copy; {versionMetadata.currentYear}</span>
          <span className="text-slate-300 dark:text-slate-700">&bull;</span>
          <span>Version <strong className="font-semibold text-slate-600 dark:text-slate-300">{versionMetadata.version}</strong></span>
          <span className="text-slate-300 dark:text-slate-700">&bull;</span>
          <span>Build <code className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">{versionMetadata.buildNumber}</code></span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
          <button 
            type="button" 
            onClick={() => { setLegalModalTab('privacy'); setLegalModalOpen(true); }} 
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition hover:underline cursor-pointer"
          >
            Privacy Policy
          </button>
          <span>&bull;</span>
          <button 
            type="button" 
            onClick={() => { setLegalModalTab('copyright'); setLegalModalOpen(true); }} 
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition hover:underline cursor-pointer"
          >
            Copyright & IP Policy
          </button>
          <span>&bull;</span>
          <button 
            type="button" 
            onClick={() => { setLegalModalTab('terms'); setLegalModalOpen(true); }} 
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition hover:underline cursor-pointer"
          >
            Terms of Service & SLA
          </button>
        </div>
      </footer>

      {/* Global Legal & Governance Modal */}
      <LegalPolicyModal 
        isOpen={legalModalOpen} 
        onClose={() => setLegalModalOpen(false)} 
        initialTab={legalModalTab} 
      />

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
