import React, { useState, useMemo, useEffect } from 'react';
import { useAuth, type UserRole } from '../../context/AuthContext';
import { getSyncRealClientIp } from '../../services/clientIpService';
import { db, type TenantUser, type Role, type Permission } from '../../db/dexie';
import { cloudDb } from '../../db/supabaseMock';
import { supabase } from '../../db/supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';
import { tenantIdentifierService } from '../../services/tenantIdentifierService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '../UI/custom-ui';
import {
  Users, Shield, Key, GitBranch, History, UserPlus,
  Plus, Check, X, AlertTriangle, Activity, Mail, Phone,
  CheckCircle2, Trash2, Edit2, Save, ChevronRight,
  Eye, EyeOff, UserCog, Fingerprint, RefreshCw, QrCode,
  Calendar, Filter, ArrowUp, ArrowDown, ShieldCheck, Globe, Laptop, Info, Copy
} from 'lucide-react';

const TABS = ['Users Directory', 'Role Builder', 'Branch Allocations', 'POS PIN Switcher', 'Security Audit Trail'];

// ── Helpers ─────────────────────────────────────────────────────────────────
const getRoleBadgeVariant = (roleName: string) => {
  if (roleName.toLowerCase().includes('owner') || roleName.toLowerCase().includes('admin')) return 'danger';
  if (roleName.toLowerCase().includes('manager')) return 'warning';
  if (roleName.toLowerCase().includes('cashier')) return 'info';
  return 'success';
};

const timeAgo = (ts: number): string => {
  if (!ts) return 'Unknown';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
};

const parseTimestamp = (val?: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') {
    return val < 1e11 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 0) return num < 1e11 ? num * 1000 : num;
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime();
  return 0;
};

const formatRegistrationDate = (ts?: any) => {
  const timeMs = parseTimestamp(ts);
  if (!timeMs) return { formatted: 'N/A', relative: 'Unknown', iso: 'N/A' };

  const d = new Date(timeMs);
  if (isNaN(d.getTime())) return { formatted: 'N/A', relative: 'Unknown', iso: 'N/A' };

  try {
    const formatted = d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const diff = Math.max(0, Date.now() - timeMs);
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    let relative = 'Just now';
    if (days > 0) relative = `${days}d ago`;
    else if (hrs > 0) relative = `${hrs}h ago`;
    else if (mins > 0) relative = `${mins}m ago`;

    return { formatted, relative, iso: d.toISOString() };
  } catch {
    return { formatted: 'N/A', relative: 'Unknown', iso: 'N/A' };
  }
};


export const UsersRoles: React.FC = () => {
  const { currentTenant, user: currentUser, switchContext, verifyPin, role, hasPermission, isSuperAdminView } = useAuth();
  const canManageUsers = isSuperAdminView || role === 'Super Admin' || hasPermission('users.manage') || hasPermission('roles.manage');
  const [activeSubTab, setActiveSubTab] = useState('Users Directory');

  // ── DB Live Queries ────────────────────────────────────────────────────────
  // ── DB Live Queries ────────────────────────────────────────────────────────
  const cloudUsersList = useLiveQuery(() => cloudDb.cloud_users.toArray(), []) || [];
  const localDbUsers = useLiveQuery(() => db.users.toArray(), []) || [];
  const cloudTenantsList = useLiveQuery(() => cloudDb.cloud_tenants.toArray(), []) || [];
  const dbTenantsList = useLiveQuery(() => db.tenants.toArray(), []) || [];

  const tenantUsers = useLiveQuery(() =>
    db.tenantUsers.where('tenant_id').equals(currentTenant.id).toArray()
  ) || [];

  const activeTenantIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add('tenant-admin-system');
    ids.add('tenant-system');
    for (const t of cloudTenantsList) {
      if (!t.deleted_at && t.status !== 'Archived' && t.status !== 'Deleted') {
        ids.add(t.id);
      }
    }
    for (const t of dbTenantsList) {
      if (!(t as any).deleted_at && t.status !== 'Archived' && t.status !== 'Deleted') {
        ids.add(t.id);
      }
    }
    return ids;
  }, [cloudTenantsList, dbTenantsList]);

  const allUsers = useMemo(() => {
    const map = new Map<string, any>();

    const checkUserValid = (u: any) => {
      if (u.deleted_at || u.status === 'Deleted') return false;

      try {
        const rawT = typeof window !== 'undefined' ? localStorage.getItem('DUKAPOS_DELETED_TENANTS') || '[]' : '[]';
        const deletedTenants = new Set<string>(JSON.parse(rawT));
        const rawE = typeof window !== 'undefined' ? localStorage.getItem('DUKAPOS_DELETED_USER_EMAILS') || '[]' : '[]';
        const deletedEmails = new Set<string>(JSON.parse(rawE));

        if (u.tenant_id && deletedTenants.has(u.tenant_id)) return false;
        if (u.email && deletedEmails.has(u.email.toLowerCase())) return false;
      } catch (_) {}

      if (!isSuperAdminView) {
        // Tenant View: ONLY show users for current tenant, hide Super Admin platform accounts
        if (u.tenant_id !== currentTenant.id) return false;
        if (u.is_super_admin || u.role === 'Super Admin') return false;
        return true;
      }
      // Super Admin View: Only show users of active non-deleted tenants or platform staff
      if (u.tenant_id && !activeTenantIds.has(u.tenant_id)) return false;
      return true;
    };

    for (const cu of cloudUsersList) {
      if (checkUserValid(cu)) {
        map.set(cu.id, {
          ...cu,
          created_at: cu.created_at || Date.now()
        });
      }
    }
    for (const lu of localDbUsers) {
      if (checkUserValid(lu)) {
        if (!map.has(lu.id)) {
          map.set(lu.id, lu);
        }
      }
    }
    return Array.from(map.values());
  }, [cloudUsersList, localDbUsers, currentTenant?.id, isSuperAdminView, activeTenantIds]);
  const allRoles = useLiveQuery(async () => {
    const list = await db.roles.toArray();
    return list.filter(r => r.tenant_id === null || r.tenant_id === currentTenant.id);
  }) || [];
  const allPermissions = useLiveQuery(() => db.permissions.toArray()) || [];
  const allRolePermissions = useLiveQuery(() => db.rolePermissions.toArray()) || [];
  const tenantUserBranches = useLiveQuery(() =>
    db.tenantUserBranches.where('tenant_id').equals(currentTenant.id).toArray()
  ) || [];
  const auditLogs = useLiveQuery(async () => {
    const logs = await db.securityAuditLogs
      .where('tenant_id').equals(currentTenant.id)
      .toArray();
    return logs.sort((a, b) => b.created_at - a.created_at).slice(0, 50);
  }) || [];
  const dbBranches = useLiveQuery(() =>
    db.branches.where('tenant_id').equals(currentTenant.id).toArray()
  ) || [];

  // ── Maps ──────────────────────────────────────────────────────────────────
  const usersMap = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);
  const rolesMap = useMemo(() => new Map(allRoles.map(r => [r.id, r])), [allRoles]);

  // ── Audit Logger ──────────────────────────────────────────────────────────
  const logAudit = async (action: string, payload?: any) => {
    try {
      await db.securityAuditLogs.put({
        id: `sal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenant_id: currentTenant.id,
        user_id: currentUser?.id || 'system',
        action,
        payload,
        created_at: Date.now()
      });
    } catch (e) { console.error('Audit log error:', e); }
  };

  // ── Account Category Filter (Platform Staff vs Tenant Users) ─────────────
  const [accountCategoryFilter, setAccountCategoryFilter] = useState<'PLATFORM_STAFF' | 'TENANT_USERS' | 'ALL'>(
    isSuperAdminView ? 'PLATFORM_STAFF' : 'ALL'
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [jobTitle, setJobTitle] = useState('Cashier');
  const [department, setDepartment] = useState('Sales');
  const [initialRole, setInitialRole] = useState('role-cashier');
  const [initialBranch, setInitialBranch] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [createdEmployee, setCreatedEmployee] = useState<{
    name: string;
    email: string;
    username: string;
    role: string;
    pin: string;
    inviteUrl: string;
  } | null>(null);

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setCreatedEmployee(null);
  };

  // ── Edit User State ────────────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<{ tu: TenantUser; user: any; primaryAlloc?: any } | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // ── Role Builder State ─────────────────────────────────────────────────────
  const [selectedBuilderRoleId, setSelectedBuilderRoleId] = useState('role-cashier');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [confirmDeleteRoleId, setConfirmDeleteRoleId] = useState<string | null>(null);

  // ── Branch Allocation State ────────────────────────────────────────────────
  const [allocUserId, setAllocUserId] = useState('');
  const [allocBranchId, setAllocBranchId] = useState('');
  const [allocRoleId, setAllocRoleId] = useState('role-cashier');
  const [allocPrimary, setAllocPrimary] = useState(false);
  const [allocating, setAllocating] = useState(false);

  // ── POS PIN Switcher State ─────────────────────────────────────────────────
  const [switcherUserId, setSwitcherUserId] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [pinSwitching, setPinSwitching] = useState(false);

  // ── Search & Registration Filter State ─────────────────────────────────────
  const [userSearch, setUserSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState('all');

  // User Registration Date System State
  const [dateRangePreset, setDateRangePreset] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'SELF_REGISTERED' | 'ADMIN_PROVISIONED' | 'SUPER_ADMIN_CPANEL' | 'SYSTEM_SEED'>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING' | 'UNVERIFIED'>('ALL');
  const [sortDirection, setSortDirection] = useState<'DESC' | 'ASC'>('DESC');
  const [selectedAuditUser, setSelectedAuditUser] = useState<any | null>(null);

  // ══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  // Invite User
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !username || !password || !pin || !initialBranch) {
      alert('Please fill in all required fields (*).');
      return;
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      alert('PIN must be exactly 4 digits.');
      return;
    }

    setAddingUser(true);
    try {
      const newUserId = `usr-${Date.now()}`;
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      await db.users.put({
        id: newUserId,
        email: email.trim().toLowerCase(),
        password_hash: password,
        is_super_admin: false,
        name: fullName,
        phone: phone || '+255',
        tenant_id: currentTenant.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim().toLowerCase(),
        pin_hash: pin,
        status: 'Active',
        email_verified: true,
        phone_verified: false,
        created_at: Date.now(),
        updated_at: Date.now(),
        registration_source: 'ADMIN_PROVISIONED',
        created_by: currentUser?.name || currentUser?.id || 'Business Administrator',
        registration_ip: getSyncRealClientIp(),
        registration_device: typeof navigator !== 'undefined' ? navigator.userAgent : 'Chrome 126.0 (Windows)',
        verification_status: 'VERIFIED'
      });

      await db.tenantUsers.put({
        id: `tu-${Date.now()}`,
        tenant_id: currentTenant.id,
        user_id: newUserId,
        employee_code: `EMP-${Math.floor(100 + Math.random() * 900)}`,
        job_title: jobTitle,
        department: department,
        status: 'Active',
        joined_at: Date.now()
      });

      await db.userSecurity.put({
        user_id: newUserId,
        pin_hash: pin,
        failed_attempts: 0,
        two_factor_enabled: false
      });

      const selectedRoleObj = allRoles.find(r => r.id === initialRole);
      const roleName = selectedRoleObj?.name || 'Cashier';

      await db.tenantUserBranches.put({
        id: `tub-${Date.now()}`,
        tenant_id: currentTenant.id,
        user_id: newUserId,
        branch_id: initialBranch,
        role_id: initialRole,
        is_primary: true,
        assigned_at: Date.now()
      });

      await db.userBranchRoles.put({
        id: `ubr-${Date.now()}`,
        user_id: newUserId,
        tenant_id: currentTenant.id,
        branch_id: initialBranch,
        industry_id: 'ind-retail',
        role_id: roleName
      });

      await logAudit('user.created', { user: fullName, role: roleName, branch: initialBranch });

      const inviteUrl = `${window.location.origin}/?tenant_id=${currentTenant.id}&email=${encodeURIComponent(email.trim().toLowerCase())}&username=${encodeURIComponent(username.trim().toLowerCase())}`;
      setCreatedEmployee({
        name: fullName,
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        role: roleName,
        pin,
        inviteUrl
      });

      setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setUsername('');
      setPassword(''); setPin(''); setJobTitle('Cashier'); setDepartment('Sales');
      setInitialBranch('');
    } catch (err) {
      console.error(err);
      alert('Error creating user. Please try again.');
    } finally {
      setAddingUser(false);
    }
  };

  // Toggle User Status (Active/Suspended)
  const handleToggleUserStatus = async (tenantUser: TenantUser) => {
    const newStatus = tenantUser.status === 'Active' ? 'Suspended' : 'Active';
    await db.tenantUsers.update(tenantUser.id, { status: newStatus });
    const dbUser = usersMap.get(tenantUser.user_id);
    await logAudit(newStatus === 'Suspended' ? 'user.suspended' : 'user.activated', { user: dbUser?.name });
  };

  // Open Edit Employee Modal
  const openEditModal = (tu: TenantUser) => {
    const userObj = usersMap.get(tu.user_id);
    if (!userObj) return;

    const primaryAlloc = tenantUserBranches.find(tub => tub.user_id === tu.user_id && tub.is_primary)
      || tenantUserBranches.find(tub => tub.user_id === tu.user_id);

    // Extract first_name and last_name from name if not stored separately
    let fn = userObj.first_name || '';
    let ln = userObj.last_name || '';
    if (!fn && userObj.name) {
      const parts = userObj.name.trim().split(' ');
      fn = parts[0] || '';
      ln = parts.slice(1).join(' ') || '';
    }

    let cleanPin = userObj.pin_hash || '';
    if (cleanPin.startsWith('pin-')) cleanPin = cleanPin.replace('pin-', '');
    if (!cleanPin || cleanPin.length !== 4) cleanPin = '1234';

    setSelectedEmployee({ tu, user: userObj, primaryAlloc });
    setEditFirstName(fn);
    setEditLastName(ln);
    setEditEmail(userObj.email || '');
    setEditPhone(userObj.phone || '');
    setEditJobTitle(tu.job_title || 'Tenant Owner');
    setEditDepartment(tu.department || 'Management');
    setEditRole(primaryAlloc?.role_id || 'role-cashier');
    setEditPin(cleanPin);
    setEditPassword(userObj.password_hash || '');
    setShowEditModal(true);
  };

  // Submit Edited Employee Profile
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    if (!editFirstName.trim() || !editLastName.trim() || !editEmail.trim()) {
      alert('First Name, Last Name, and Email are required.');
      return;
    }

    const cleanPin = editPin.trim().replace(/^pin-/, '');
    if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      alert('PIN must be exactly 4 digits.');
      return;
    }

    setSavingUser(true);
    try {
      const { tu, user: u, primaryAlloc } = selectedEmployee;
      const fullName = `${editFirstName.trim()} ${editLastName.trim()}`;

      // 1. Update or Put user record (preserving immutable registration timestamp)
      const updatedUser = {
        ...u,
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        name: fullName,
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        pin_hash: cleanPin,
        password_hash: editPassword || u.password_hash || 'owner123',
        created_at: u.created_at || tu.joined_at || Date.now(),
        updated_at: Date.now()
      };
      await db.users.put(updatedUser);

      // 2. Update or Put tenantUsers record
      const tuId = tu.id || `tu-${currentTenant.id}-${u.id}`;
      const updatedTu: TenantUser = {
        id: tuId,
        tenant_id: currentTenant.id,
        user_id: u.id,
        employee_code: tu.employee_code || (u.id.includes('owner') ? 'EMP-OWNER' : 'EMP-001'),
        job_title: editJobTitle.trim() || 'Tenant Owner',
        department: editDepartment.trim() || 'Management',
        status: tu.status || 'Active',
        joined_at: tu.joined_at || Date.now()
      };
      await db.tenantUsers.put(updatedTu);

      // 3. Update or Put security pin entry
      await db.userSecurity.put({
        user_id: u.id,
        pin_hash: cleanPin,
        failed_attempts: 0,
        two_factor_enabled: false
      });

      // 4. Update branch allocations & active roles
      const selectedRoleObj = allRoles.find(r => r.id === editRole);
      const roleName = selectedRoleObj?.name || 'Tenant Owner';
      const branchId = primaryAlloc?.branch_id || dbBranches[0]?.id || `branch-hq-${currentTenant.id}`;

      const tubId = primaryAlloc?.id || `tub-${currentTenant.id}-${u.id}`;
      await db.tenantUserBranches.put({
        id: tubId,
        tenant_id: currentTenant.id,
        user_id: u.id,
        branch_id: branchId,
        role_id: editRole,
        is_primary: true,
        assigned_at: primaryAlloc?.assigned_at || Date.now()
      });

      // Safe lookup for userBranchRoles
      let activeContext = await db.userBranchRoles
        .where('user_id')
        .equals(u.id)
        .filter(ubr => ubr.tenant_id === currentTenant.id)
        .first();

      const ubrId = activeContext?.id || `ubr-${currentTenant.id}-${u.id}`;
      await db.userBranchRoles.put({
        id: ubrId,
        user_id: u.id,
        tenant_id: currentTenant.id,
        branch_id: branchId,
        industry_id: 'ind-retail',
        role_id: roleName
      });

      // 5. Cloud Sync (so updates persist across logins and devices)
      try {
        await supabase.from('users').insert(updatedUser as any);
        await supabase.from('tenantUsers').insert(updatedTu as any);
        await supabase.from('userBranchRoles').insert({
          id: ubrId,
          user_id: u.id,
          tenant_id: currentTenant.id,
          branch_id: branchId,
          industry_id: 'ind-retail',
          role_id: roleName
        } as any);
      } catch (e) {
        console.warn('[Cloud Sync] Employee profile save notice:', e);
      }

      await logAudit('user.updated', { user: fullName, role: roleName });
      setShowEditModal(false);
      setSelectedEmployee(null);
      alert('✅ Employee details updated successfully!');
    } catch (err: any) {
      console.error('[Employee Profile Save Failure]', err);
      alert(`Error updating employee details: ${err?.message || 'Check console for details.'}`);
    } finally {
      setSavingUser(false);
    }
  };

  // Delete Employee completely
  const handleDeleteEmployee = async (tu: TenantUser) => {
    if (currentUser?.id === tu.user_id) {
      alert('Cannot delete your own active session employee profile.');
      return;
    }

    const employeeUser = usersMap.get(tu.user_id);
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete Employee "${employeeUser?.name || 'Unknown'}"?\n\n` +
      `This will remove their directory records, security profile, branch allocations, and system permissions.`
    );
    if (!confirmDelete) return;

    try {
      // 1. Delete from users table
      await db.users.delete(tu.user_id);
      
      // 2. Delete from tenantUsers table
      await db.tenantUsers.delete(tu.id);
      
      // 3. Delete from tenantUserBranches allocations
      const userAllocs = await db.tenantUserBranches.where('user_id').equals(tu.user_id).toArray();
      for (const alloc of userAllocs) {
        await db.tenantUserBranches.delete(alloc.id);
      }

      // 4. Delete active context roles
      const userAllContexts = await db.userBranchRoles.where('user_id').equals(tu.user_id).toArray();
      for (const ctx of userAllContexts) {
        await db.userBranchRoles.delete(ctx.id || '');
      }

      // 5. Delete security profile
      await db.userSecurity.delete(tu.user_id);

      // 6. Record user email in persistent tombstone set to block future logins
      if (employeeUser?.email && typeof window !== 'undefined') {
        try {
          const cleanEmail = employeeUser.email.trim().toLowerCase();
          const rawEmails = localStorage.getItem('DUKAPOS_DELETED_USER_EMAILS') || '[]';
          const emailList: string[] = JSON.parse(rawEmails);
          if (!emailList.includes(cleanEmail)) {
            emailList.push(cleanEmail);
            localStorage.setItem('DUKAPOS_DELETED_USER_EMAILS', JSON.stringify(emailList));
          }
        } catch (_) {}
      }

      // 7. Purge from Central Cloud Database and Supabase
      try {
        await cloudDb.cloud_users.delete(tu.user_id);
      } catch (_) {}

      try {
        await supabase.from('users').delete().eq('id', tu.user_id);
        await supabase.from('tenantUsers').delete().eq('id', tu.id);
        await supabase.from('userBranchRoles').delete().eq('user_id', tu.user_id);
      } catch (_) {}

      await logAudit('user.deleted', { user: employeeUser?.name });
      alert(`✅ Profile for ${employeeUser?.name || 'Employee'} deleted successfully.`);
    } catch (err) {
      console.error(err);
      alert('Error deleting employee profile.');
    }
  };

  // Toggle Role Permission
  const handleTogglePermission = async (roleId: string, permissionId: string) => {
    const existingLink = allRolePermissions.find(rp => rp.role_id === roleId && rp.permission_id === permissionId);
    try {
      if (existingLink) {
        await db.rolePermissions.delete(existingLink.id);
      } else {
        await db.rolePermissions.put({
          id: `rp-${roleId}-${permissionId}`,
          role_id: roleId,
          permission_id: permissionId
        });
      }
      const targetRole = rolesMap.get(roleId);
      const perm = allPermissions.find(p => p.id === permissionId);
      await logAudit('permission.changed', {
        role: targetRole?.name,
        permission: perm?.slug,
        action: existingLink ? 'revoked' : 'granted'
      });
    } catch (e) { console.error(e); }
  };

  // Create Custom Role
  const handleAddCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    const slug = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    const existing = allRoles.find(r => r.slug === slug);
    if (existing) { alert(`A role with that name already exists.`); return; }

    const newRoleId = `role-${slug}-${Date.now().toString(36)}`;
    await db.roles.put({
      id: newRoleId,
      tenant_id: currentTenant.id,
      name: newRoleName.trim(),
      slug,
      description: newRoleDesc.trim(),
      is_system_role: false,
      is_custom: true,
      created_at: Date.now()
    });

    await logAudit('role.created', { role_name: newRoleName.trim() });
    setNewRoleName('');
    setNewRoleDesc('');
    setSelectedBuilderRoleId(newRoleId);
  };

  // Clone Role & Permissions
  const handleCloneRole = async (baseRole: Role) => {
    const cloneName = `${baseRole.name} (Custom)`;
    const slug = `${baseRole.slug}_custom_${Date.now().toString(36).slice(-4)}`;
    const newRoleId = `role-${slug}-${Date.now().toString(36)}`;

    await db.roles.put({
      id: newRoleId,
      tenant_id: currentTenant.id,
      name: cloneName,
      slug,
      description: `Custom role cloned from ${baseRole.name}. ${baseRole.description}`,
      is_system_role: false,
      is_custom: true,
      created_at: Date.now()
    });

    // Copy permission links from base role
    const basePermissions = allRolePermissions.filter(rp => rp.role_id === baseRole.id);
    for (const rp of basePermissions) {
      await db.rolePermissions.put({
        id: `rp-${newRoleId}-${rp.permission_id}`,
        role_id: newRoleId,
        permission_id: rp.permission_id
      });
    }

    await logAudit('role.cloned', { base_role: baseRole.name, new_role: cloneName });
    setSelectedBuilderRoleId(newRoleId);
    alert(`✅ Role "${baseRole.name}" cloned as "${cloneName}". You can now customize its permission set.`);
  };

  // Start Editing Role
  const handleStartEditRole = (role: Role) => {
    setEditingRoleId(role.id);
    setEditRoleName(role.name);
    setEditRoleDesc(role.description);
  };

  // Save Edited Role
  const handleSaveEditRole = async (roleId: string) => {
    if (!editRoleName.trim()) return;
    await db.roles.update(roleId, {
      name: editRoleName.trim(),
      description: editRoleDesc.trim()
    });
    await logAudit('role.updated', { role_id: roleId, new_name: editRoleName.trim() });
    setEditingRoleId(null);
  };

  // Delete Role
  const handleDeleteRole = async (roleId: string) => {
    // Remove all role-permission links for this role
    const rpLinks = allRolePermissions.filter(rp => rp.role_id === roleId);
    for (const rp of rpLinks) {
      await db.rolePermissions.delete(rp.id);
    }
    const roleObj = rolesMap.get(roleId);
    await db.roles.delete(roleId);
    await logAudit('role.deleted', { role_name: roleObj?.name });
    setConfirmDeleteRoleId(null);
    if (selectedBuilderRoleId === roleId) setSelectedBuilderRoleId(allRoles.find(r => r.id !== roleId)?.id || '');
  };

  // Assign Branch
  const handleAssignBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocUserId || !allocBranchId) { alert('Please select an employee and branch.'); return; }
    setAllocating(true);
    try {
      const selectedRoleObj = allRoles.find(r => r.id === allocRoleId);
      const roleName = selectedRoleObj?.name || 'Cashier';

      if (allocPrimary) {
        const existing = await db.tenantUserBranches.where('user_id').equals(allocUserId).toArray();
        for (const m of existing) {
          if (m.is_primary) await db.tenantUserBranches.update(m.id, { is_primary: false });
        }
      }

      await db.tenantUserBranches.put({
        id: `tub-${Date.now()}`,
        tenant_id: currentTenant.id,
        user_id: allocUserId,
        branch_id: allocBranchId,
        role_id: allocRoleId,
        is_primary: allocPrimary,
        assigned_at: Date.now()
      });

      await db.userBranchRoles.put({
        id: `ubr-${Date.now()}`,
        user_id: allocUserId,
        tenant_id: currentTenant.id,
        branch_id: allocBranchId,
        industry_id: 'ind-retail',
        role_id: roleName
      });

      const userObj = usersMap.get(allocUserId);
      const branchObj = dbBranches.find(b => b.id === allocBranchId);
      await logAudit('branch.assigned', { user: userObj?.name, branch: branchObj?.name, role: roleName });

      setAllocUserId(''); setAllocBranchId(''); setAllocPrimary(false);
      alert('✅ Branch assignment saved.');
    } catch (e) {
      console.error(e);
      alert('Error assigning branch.');
    } finally {
      setAllocating(false);
    }
  };

  // Remove Branch Allocation
  const handleRemoveAllocation = async (tubId: string) => {
    await db.tenantUserBranches.delete(tubId);
    await logAudit('branch.unassigned', { tub_id: tubId });
  };

  // PIN Keypad
  const handleKeypadPress = (val: string) => {
    setPinError('');
    if (enteredPin.length < 4) setEnteredPin(prev => prev + val);
  };
  const handleKeypadClear = () => { setEnteredPin(''); setPinError(''); setPinSuccess(''); };

  // Physical Keyboard Listener for POS PIN Switcher
  useEffect(() => {
    if (activeSubTab !== 'POS PIN Switcher') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setPinError('');
        setEnteredPin(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPinError('');
        setEnteredPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Escape' || e.key === 'Delete' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleKeypadClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePINSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSubTab, switcherUserId, enteredPin]);

  const handlePINSubmit = async () => {
    if (!switcherUserId) { setPinError('Select an employee first.'); return; }
    if (enteredPin.length < 4) { setPinError('Enter a 4-digit PIN.'); return; }

    setPinSwitching(true);
    const isValid = await verifyPin(switcherUserId, enteredPin);
    if (!isValid) {
      setPinError('❌ Incorrect PIN. Access denied.');
      setEnteredPin('');
      await logAudit('user.login.failed', { reason: 'Invalid PIN', user_id: switcherUserId });
      setPinSwitching(false);
      return;
    }

    const selectedUser = usersMap.get(switcherUserId);
    if (selectedUser) {
      const primaryAlloc = tenantUserBranches.find(tub => tub.user_id === switcherUserId && tub.is_primary)
        || tenantUserBranches.find(tub => tub.user_id === switcherUserId);

      const resolvedRoleObj = rolesMap.get(primaryAlloc?.role_id || 'role-cashier');
      const roleName = (resolvedRoleObj?.name || 'Cashier') as UserRole;
      const branchId = primaryAlloc?.branch_id || dbBranches[0]?.id || 'branch-dar-hq';

      await logAudit('user.login.success', { mechanism: 'PIN Quick Switch', user: selectedUser.name, role: roleName });

      setPinSuccess(`🎉 Switching to ${selectedUser.name}…`);
      setTimeout(async () => {
        await switchContext(currentTenant.id, branchId, 'ind-retail', roleName);
        setPinSuccess(''); setEnteredPin(''); setSwitcherUserId('');
        setPinSwitching(false);
      }, 1000);
    } else {
      setPinSwitching(false);
    }
  };

  // Auto-heal missing tenantUsers & tenantUserBranches records for all users associated with this tenant
  useEffect(() => {
    if (!currentTenant?.id || allUsers.length === 0) return;

    (async () => {
      const existingTu = await db.tenantUsers.where('tenant_id').equals(currentTenant.id).toArray();
      const existingTuUserIds = new Set(existingTu.map(tu => tu.user_id));

      for (const u of allUsers) {
        if (!existingTuUserIds.has(u.id)) {
          console.log(`[UsersRoles Auto-Heal] Creating missing tenantUser & branch allocation for ${u.name} (${u.id})...`);
          
          const tuId = `tu-${currentTenant.id}-${u.id}`;
          const tubId = `tub-${currentTenant.id}-${u.id}`;

          const uRoleLower = ((u as any).role || u.role || '').toLowerCase();
          let targetRoleSlug = 'cashier';
          if (u.id.includes('owner') || uRoleLower.includes('owner')) targetRoleSlug = 'tenant_owner';
          else if (uRoleLower.includes('admin')) targetRoleSlug = 'business_administrator';
          else if (uRoleLower.includes('manager')) targetRoleSlug = 'branch_manager';
          else if (uRoleLower.includes('inventory')) targetRoleSlug = 'inventory_officer';
          else if (uRoleLower.includes('accountant')) targetRoleSlug = 'accountant';

          const matchedRoleObj = allRoles.find(r => r.slug === targetRoleSlug || r.name.toLowerCase().includes(targetRoleSlug.replace('_', ' ')));
          const assignedRoleId = matchedRoleObj?.id || (u.id.includes('owner') ? `role-owner-${currentTenant.id}` : `role-cashier-${currentTenant.id}`);

          const newTu: TenantUser = {
            id: tuId,
            tenant_id: currentTenant.id,
            user_id: u.id,
            employee_code: u.id.includes('owner') ? 'EMP-OWNER' : `EMP-${Math.floor(100 + Math.random() * 900)}`,
            job_title: matchedRoleObj?.name || (u as any).role || 'Employee',
            department: 'Staff',
            status: u.status || 'Active',
            joined_at: u.created_at || Date.now()
          };

          await db.tenantUsers.put(newTu);

          const existingTub = await db.tenantUserBranches.where('user_id').equals(u.id).first();
          if (!existingTub) {
            await db.tenantUserBranches.put({
              id: tubId,
              tenant_id: currentTenant.id,
              user_id: u.id,
              branch_id: (u as any).branch_id || dbBranches[0]?.id || `branch-hq-${currentTenant.id}`,
              role_id: assignedRoleId,
              is_primary: true,
              assigned_at: Date.now()
            });
          }

          // Push to cloud as well
          try {
            await supabase.from('tenantUsers').insert(newTu as any);
          } catch (e) {}
        }
      }
    })();
  }, [currentTenant?.id, allUsers, dbBranches]);

  // ── Filtered Data ──────────────────────────────────────────────────────────
  const filteredTenantUsers = useMemo(() => {
    // Reconcile: if tenantUsers is empty, dynamically construct from allUsers so users directory never displays 0 when users exist
    let baseList: TenantUser[] = tenantUsers;
    if (baseList.length === 0 && allUsers.length > 0) {
      baseList = allUsers.map(u => ({
        id: `tu-${currentTenant?.id || 'tenant'}-${u.id}`,
        tenant_id: currentTenant?.id || u.tenant_id || '',
        user_id: u.id,
        employee_code: u.id.includes('owner') ? 'EMP-OWNER' : 'EMP-001',
        job_title: (u as any).role || 'Tenant Owner',
        department: 'Management',
        status: u.status || 'Active',
        joined_at: u.created_at || Date.now()
      }));
    }

    let result = baseList.filter(tu => {
      const dbUser = usersMap.get(tu.user_id);
      const createdAt = parseTimestamp(dbUser?.created_at || tu.joined_at);

      // 1. Text Search Filter
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        const matches = (
          dbUser?.name.toLowerCase().includes(q) ||
          dbUser?.email.toLowerCase().includes(q) ||
          tu.employee_code.toLowerCase().includes(q) ||
          tu.job_title.toLowerCase().includes(q) ||
          dbUser?.registration_source?.toLowerCase().includes(q) ||
          dbUser?.created_by?.toLowerCase().includes(q)
        );
        if (!matches) return false;
      }

      // 2. Date Range Filter
      const now = Date.now();
      if (dateRangePreset === 'TODAY') {
        const startOfDay = new Date().setHours(0, 0, 0, 0);
        if (createdAt < startOfDay) return false;
      } else if (dateRangePreset === '7DAYS') {
        if (createdAt < now - 7 * 24 * 60 * 60 * 1000) return false;
      } else if (dateRangePreset === '30DAYS') {
        if (createdAt < now - 30 * 24 * 60 * 60 * 1000) return false;
      } else if (dateRangePreset === 'THIS_MONTH') {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        if (createdAt < startOfMonth) return false;
      } else if (dateRangePreset === 'CUSTOM') {
        if (customStartDate) {
          const startTime = new Date(customStartDate).setHours(0, 0, 0, 0);
          if (createdAt < startTime) return false;
        }
        if (customEndDate) {
          const endTime = new Date(customEndDate).setHours(23, 59, 59, 999);
          if (createdAt > endTime) return false;
        }
      }

      // 3. Registration Source Filter
      if (sourceFilter !== 'ALL') {
        const userSource = dbUser?.registration_source || 'SYSTEM_SEED';
        if (userSource !== sourceFilter) return false;
      }

      // 4. Verification Status Filter
      if (verificationFilter !== 'ALL') {
        const vStatus = dbUser?.verification_status || (dbUser?.email_verified ? 'VERIFIED' : 'PENDING');
        if (vStatus !== verificationFilter) return false;
      }

      // 5. Account Category Filter (Platform Staff vs Tenant Users)
      if (accountCategoryFilter === 'PLATFORM_STAFF') {
        const isPlatform = dbUser?.is_super_admin || dbUser?.role === 'Super Admin' || tu.job_title === 'Super Admin' || tu.tenant_id === 'tenant-admin-system';
        if (!isPlatform) return false;
      } else if (accountCategoryFilter === 'TENANT_USERS') {
        const isPlatform = dbUser?.is_super_admin || dbUser?.role === 'Super Admin' || tu.job_title === 'Super Admin' || tu.tenant_id === 'tenant-admin-system';
        if (isPlatform) return false;
      }

      return true;
    });

    // 6. Sorting by created_at timestamp
    return result.sort((a, b) => {
      const uA = usersMap.get(a.user_id);
      const uB = usersMap.get(b.user_id);
      const tsA = uA?.created_at || a.joined_at || 0;
      const tsB = uB?.created_at || b.joined_at || 0;
      return sortDirection === 'DESC' ? tsB - tsA : tsA - tsB;
    });
  }, [tenantUsers, allUsers, usersMap, userSearch, dateRangePreset, customStartDate, customEndDate, sourceFilter, verificationFilter, accountCategoryFilter, sortDirection, currentTenant?.id]);

  const groupedPermissions = useMemo(() => {
    return allPermissions.reduce((acc, p) => {
      if (p.module === 'Platform') return acc;
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p);
      return acc;
    }, {} as Record<string, Permission[]>);
  }, [allPermissions]);

  const selectedRoleObj = rolesMap.get(selectedBuilderRoleId) || null;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  if (!canManageUsers) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm animate-in fade-in duration-200">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30 text-danger mb-4 shadow-sm">
          <Shield className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-white">Permission Denied</h3>
        <p className="mt-1.5 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          Your current role (<span className="font-semibold text-primary">{role}</span>) does not have privileges to manage Users and Roles.
        </p>
        <div className="mt-4 p-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-lg text-[10px] text-slate-400 max-w-xs leading-relaxed">
          💡 <strong>Testing Tip:</strong> Use the role switcher dropdown in the top bar to switch to a role with permission (e.g. <strong>Business Owner</strong> or <strong>Business Administrator</strong>).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-4.5 w-4.5 text-primary" />
            </div>
            Users &amp; Roles Management
          </h2>
          <p className="text-xs text-slate-400 mt-1 ml-11">
            Enterprise RBAC · Multi-branch permissions · Offline PIN session switching
          </p>
        </div>

        {/* Stats Row */}
        <div className="flex gap-3 ml-11 sm:ml-0">
          {[
            { label: 'Active Users', value: filteredTenantUsers.filter(tu => tu.status === 'Active').length, icon: Users },
            { label: 'Roles', value: allRoles.length, icon: Shield },
            { label: 'Branches', value: dbBranches.length, icon: GitBranch },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="text-center px-3 py-2 bg-slate-50 dark:bg-darkbg/50 rounded-xl border border-slate-100 dark:border-darkbg-border/30">
              <div className="flex items-center justify-center gap-1 text-xs text-slate-500 mb-0.5">
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </div>
              <span className="text-base font-black text-slate-800 dark:text-white">{value}</span>
            </div>
          ))}
        </div>

        {/* Tab Selector */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-darkbg p-1 rounded-xl text-[11px] font-bold self-start sm:self-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                activeSubTab === tab
                  ? 'bg-white dark:bg-darkbg-card text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: USERS DIRECTORY
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'Users Directory' && (
        <div className="space-y-4">
          {/* Account Category Selector for Super Admin Console */}
          {isSuperAdminView && (
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-darkbg p-1 rounded-2xl border border-slate-200 dark:border-darkbg-border text-xs font-bold w-fit">
              <button
                onClick={() => setAccountCategoryFilter('PLATFORM_STAFF')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  accountCategoryFilter === 'PLATFORM_STAFF'
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                🛡️ Platform Staff (Super Admins)
              </button>
              <button
                onClick={() => setAccountCategoryFilter('TENANT_USERS')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  accountCategoryFilter === 'TENANT_USERS'
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                🏢 Tenant Owners &amp; Staff
              </button>
              <button
                onClick={() => setAccountCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  accountCategoryFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                All Accounts
              </button>
            </div>
          )}

          {/* Advanced Registration Date & Filter Bar */}
          <div className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px]">
                <input
                  type="text"
                  placeholder="Search user, email, code, source..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="pl-3 pr-8 h-9 w-full rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {userSearch && (
                  <button onClick={() => setUserSearch('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Controls Group */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Date Range Preset Selector */}
                <div className="flex items-center space-x-1 bg-slate-50 dark:bg-darkbg px-2.5 py-1 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs">
                  <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                  <select
                    value={dateRangePreset}
                    onChange={e => setDateRangePreset(e.target.value as any)}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Registration Dates</option>
                    <option value="TODAY">Registered Today</option>
                    <option value="7DAYS">Registered Last 7 Days</option>
                    <option value="30DAYS">Registered Last 30 Days</option>
                    <option value="THIS_MONTH">Registered This Month</option>
                    <option value="CUSTOM">Custom Date Range...</option>
                  </select>
                </div>

                {/* Registration Source Selector */}
                <div className="flex items-center space-x-1 bg-slate-50 dark:bg-darkbg px-2.5 py-1 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs">
                  <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <select
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value as any)}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Sources</option>
                    <option value="SELF_REGISTERED">Self Registered</option>
                    <option value="ADMIN_PROVISIONED">Admin Provisioned</option>
                    <option value="SUPER_ADMIN_CPANEL">Super Admin CPanel</option>
                    <option value="SYSTEM_SEED">System Seed</option>
                  </select>
                </div>

                {/* Verification Status Selector */}
                <div className="flex items-center space-x-1 bg-slate-50 dark:bg-darkbg px-2.5 py-1 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                  <select
                    value={verificationFilter}
                    onChange={e => setVerificationFilter(e.target.value as any)}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Verification</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="PENDING">Pending Verification</option>
                    <option value="UNVERIFIED">Unverified</option>
                  </select>
                </div>

                {/* Reset Filters */}
                {(dateRangePreset !== 'ALL' || sourceFilter !== 'ALL' || verificationFilter !== 'ALL' || userSearch) && (
                  <button
                    onClick={() => {
                      setDateRangePreset('ALL');
                      setSourceFilter('ALL');
                      setVerificationFilter('ALL');
                      setCustomStartDate('');
                      setCustomEndDate('');
                      setUserSearch('');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/20 rounded-xl hover:bg-red-100 transition"
                  >
                    Reset Filters
                  </button>
                )}

                <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 text-xs whitespace-nowrap ml-auto sm:ml-0">
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite Employee
                </Button>
              </div>
            </div>

            {/* Custom Date Range Inputs */}
            {dateRangePreset === 'CUSTOM' && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-darkbg-border/40 text-xs">
                <span className="font-bold text-slate-500">Custom Range:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-medium focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-medium focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="p-3.5 pl-6">Employee</th>
                      <th className="p-3.5">Contact</th>
                      <th className="p-3.5">Job Title</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Primary Branch</th>
                      <th className="p-3.5">
                        <button
                          onClick={() => setSortDirection(prev => prev === 'DESC' ? 'ASC' : 'DESC')}
                          className="flex items-center gap-1 hover:text-primary transition font-extrabold"
                          title="Sort by Immutable Registration Date"
                        >
                          <span>Registered Date</span>
                          {sortDirection === 'DESC' ? (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          )}
                        </button>
                      </th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                    {filteredTenantUsers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-10 text-center text-slate-400 italic text-xs">
                          {userSearch || dateRangePreset !== 'ALL' || sourceFilter !== 'ALL'
                            ? 'No users match your selected date or registration filters.'
                            : 'No employees found. Invite your first team member.'}
                        </td>
                      </tr>
                    ) : filteredTenantUsers.map(tu => {
                      const dbUser = usersMap.get(tu.user_id);
                      const isSuperAdminUser = isSuperAdminView || dbUser?.role === 'Super Admin' || (dbUser?.id || '').includes('super');
                      const primaryAlloc = tenantUserBranches.find(tub => tub.user_id === tu.user_id && tub.is_primary) || tenantUserBranches.find(tub => tub.user_id === tu.user_id);
                      const branchObj = dbBranches.find(b => b.id === primaryAlloc?.branch_id);
                      const roleObj = rolesMap.get(primaryAlloc?.role_id || 'role-cashier');
                      const initials = (dbUser?.name || '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

                      const branchName = (primaryAlloc && branchObj?.name)
                        ? branchObj.name
                        : (isSuperAdminUser ? 'Primary Branch' : (dbBranches[0]?.name || 'Default HQ'));

                      const branchLocation = (primaryAlloc && branchObj?.location)
                        ? branchObj.location
                        : (isSuperAdminUser ? 'Platform Central HQ' : (dbBranches[0]?.location || 'Main Outlet'));

                      const regDate = formatRegistrationDate(dbUser?.created_at || tu.joined_at);
                      const regSource = dbUser?.registration_source || 'SYSTEM_SEED';

                      return (
                        <tr key={tu.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                          <td className="p-3.5 pl-6">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/60 flex items-center justify-center text-[10px] font-black text-primary shrink-0">
                                {initials}
                              </div>
                              <div>
                                <p className="font-bold text-slate-800 dark:text-white">{dbUser?.name || 'Unknown'}</p>
                                <span className="font-mono text-[9px] bg-slate-100 dark:bg-darkbg/50 px-1.5 py-0.5 rounded text-slate-500">{tenantIdentifierService.getReadableEmployeeCode(tu)}</span>
                                <span className="font-mono text-[9px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 px-1 py-0.5 rounded ml-1 font-bold">{tenantIdentifierService.getReadableUserId(dbUser)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <p className="flex items-center gap-1 text-[11px] text-slate-500"><Mail className="h-3 w-3" /> {dbUser?.email}</p>
                            <p className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5"><Phone className="h-3 w-3" /> {dbUser?.phone}</p>
                          </td>
                          <td className="p-3.5">
                            <p className="font-semibold text-slate-700 dark:text-slate-300">{tu.job_title}</p>
                            <p className="text-[10px] text-slate-400">{tu.department}</p>
                          </td>
                          <td className="p-3.5">
                            <Badge variant={getRoleBadgeVariant(roleObj?.name || '') as any} className="font-bold text-[10px]">
                              {roleObj?.name || 'Cashier'}
                            </Badge>
                          </td>
                          <td className="p-3.5">
                            <p className="font-semibold text-slate-600 dark:text-slate-400">{branchName}</p>
                            <p className="text-[10px] text-slate-400">{branchLocation}</p>
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-col space-y-0.5">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                                {regDate.formatted}
                              </span>
                              <div className="flex items-center space-x-1.5">
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-darkbg px-1.5 py-0.5 rounded">
                                  {regDate.relative}
                                </span>
                                <span className="text-[9px] font-mono text-primary font-bold uppercase">
                                  {regSource.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <Badge variant={tu.status === 'Active' ? 'success' : 'danger'} className="font-bold text-[10px]">
                              {tu.status}
                            </Badge>
                          </td>
                          <td className="p-3.5 pr-6 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedAuditUser({ tu, dbUser, roleObj, branchObj })}
                                title="View Registration Audit Metadata"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                              >
                                <Info className="h-3.5 w-3.5 text-primary" />
                              </button>
                              <button
                                onClick={() => {
                                  const inviteUrl = `${window.location.origin}/?tenant_id=${currentTenant.id}&email=${encodeURIComponent(dbUser?.email || '')}&username=${encodeURIComponent(dbUser?.username || '')}`;
                                  setCreatedEmployee({
                                    name: dbUser?.name || 'Employee',
                                    email: dbUser?.email || '',
                                    username: dbUser?.username || '',
                                    role: roleObj?.name || 'Cashier',
                                    pin: dbUser?.pin_hash || '****',
                                    inviteUrl
                                  });
                                  setShowAddModal(true);
                                }}
                                title="Show Invite QR Code"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                              >
                                <QrCode className="h-3.5 w-3.5 text-slate-500" />
                              </button>
                              <button
                                onClick={() => handleToggleUserStatus(tu)}
                                title={tu.status === 'Active' ? 'Suspend user' : 'Activate user'}
                                className={`p-1.5 rounded-lg transition-all ${
                                  tu.status === 'Active'
                                    ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/20'
                                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/20'
                                }`}
                              >
                                {tu.status === 'Active' ? <EyeOff className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => openEditModal(tu)}
                                title="Edit employee profile"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteEmployee(tu)}
                                title="Delete employee profile"
                                className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-500 dark:border-red-950/20"
                                disabled={currentUser?.id === tu.user_id}
                                style={{ opacity: currentUser?.id === tu.user_id ? 0.4 : 1 }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: ROLE BUILDER
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'Role Builder' && (
        <div className="grid gap-5 md:grid-cols-3">
          {/* Left panel: Only Role Registry List */}
          <div>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-3 pl-1">Roles Registry ({allRoles.length})</p>
                <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
                  {allRoles.length === 0 && (
                    <p className="text-center text-xs text-slate-400 italic py-4">No roles yet.</p>
                  )}
                  {allRoles.map(role => {
                    const isActive = role.id === selectedBuilderRoleId;
                    const isEditing = editingRoleId === role.id;
                    const isConfirmingDelete = confirmDeleteRoleId === role.id;

                    return (
                      <div key={role.id}>
                        {isEditing ? (
                          <div className="border border-primary/30 bg-primary/5 p-2.5 rounded-xl space-y-2">
                            <input
                              value={editRoleName}
                              onChange={e => setEditRoleName(e.target.value)}
                              className="w-full h-8 text-xs rounded-lg border border-slate-200 dark:border-darkbg-border px-2 bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-primary/30 font-bold"
                            />
                            <textarea
                              value={editRoleDesc}
                              onChange={e => setEditRoleDesc(e.target.value)}
                              rows={2}
                              className="w-full text-xs rounded-lg border border-slate-200 dark:border-darkbg-border px-2 py-1.5 bg-white dark:bg-darkbg focus:outline-none resize-none"
                            />
                            <div className="flex gap-1.5">
                              <button onClick={() => handleSaveEditRole(role.id)} className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] font-bold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition">
                                <Save className="h-3 w-3" /> Save
                              </button>
                              <button onClick={() => setEditingRoleId(null)} className="flex items-center justify-center gap-1 h-7 px-2.5 text-[11px] font-bold rounded-lg bg-slate-200 dark:bg-darkbg text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition">
                                <X className="h-3 w-3" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : isConfirmingDelete ? (
                          <div className="border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 p-2.5 rounded-xl space-y-2">
                            <p className="text-[11px] font-bold text-red-700 dark:text-red-400">Delete &quot;{role.name}&quot;? All permission links will be removed.</p>
                            <div className="flex gap-1.5">
                              <button onClick={() => handleDeleteRole(role.id)} className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 transition">
                                <Trash2 className="h-3 w-3" /> Confirm Delete
                              </button>
                              <button onClick={() => setConfirmDeleteRoleId(null)} className="flex items-center justify-center h-7 px-2.5 text-[11px] rounded-lg bg-slate-200 dark:bg-darkbg text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`flex items-start justify-between p-2.5 rounded-xl border cursor-pointer transition-all group ${
                              isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-slate-100 dark:border-darkbg-border/30 hover:bg-slate-50 dark:hover:bg-darkbg/50'
                            }`}
                            onClick={() => setSelectedBuilderRoleId(role.id)}
                          >
                            <div className="flex-1 min-w-0 mr-2">
                              <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{role.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{role.description || 'No description'}</p>
                              <Badge variant={role.is_system_role ? 'info' : 'success'} className="text-[8px] uppercase px-1 py-0 mt-1.5 shadow-none font-bold inline-flex">
                                {role.is_system_role ? 'System' : 'Custom'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={e => { e.stopPropagation(); handleCloneRole(role); }} title="Clone role & permissions" className="p-1 rounded-md bg-slate-100 dark:bg-darkbg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition">
                                <Copy className="h-3 w-3" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); handleStartEditRole(role); }} title="Edit role" className="p-1 rounded-md bg-slate-100 dark:bg-darkbg text-slate-500 hover:bg-primary/10 hover:text-primary transition">
                                <Edit2 className="h-3 w-3" />
                              </button>
                              {!role.is_system_role && (
                                <button onClick={e => { e.stopPropagation(); setConfirmDeleteRoleId(role.id); }} title="Delete role" className="p-1 rounded-md bg-slate-100 dark:bg-darkbg text-slate-500 hover:bg-red-50 hover:text-red-500 transition">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right panel: Permissions Matrix + Create Custom Role below */}
          <div className="md:col-span-2 space-y-4">
            {/* Configure Permissions */}
            {!selectedRoleObj ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                  <Shield className="h-10 w-10 text-slate-200 dark:text-slate-700 mb-3" />
                  <p className="text-sm font-bold text-slate-400">Select a role from the left to configure permissions</p>
                  <p className="text-xs text-slate-400 mt-1">Click any role in the registry to view and toggle its permission set.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3 border-b border-slate-100 dark:border-darkbg-border/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-sm font-black text-slate-800 dark:text-white">
                        Configure Permissions — {selectedRoleObj.name}
                      </CardTitle>
                      <CardDescription className="mt-0.5">{selectedRoleObj.description}</CardDescription>
                    </div>
                    <Badge variant={selectedRoleObj.is_system_role ? 'info' : 'success'} className="text-[9px] uppercase px-2 font-bold shrink-0">
                      {selectedRoleObj.is_system_role ? 'System (Read-Only)' : 'Custom (Editable)'}
                    </Badge>
                  </div>
                  {selectedRoleObj.is_system_role && (
                    <div className="mt-3 flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      System roles are read-only. Use the form below to create a custom role with a tailored permission set.
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-5 space-y-5 max-h-[460px] overflow-y-auto">
                  {Object.entries(groupedPermissions).map(([moduleName, perms]) => (
                    <div key={moduleName} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400">{moduleName}</h4>
                        <div className="flex-1 h-px bg-slate-100 dark:bg-darkbg-border/20"></div>
                        <span className="text-[9px] text-slate-300 font-mono">
                          {perms.filter(p => allRolePermissions.some(rp => rp.role_id === selectedBuilderRoleId && rp.permission_id === p.id)).length}/{perms.length}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {perms.map(perm => {
                          const isGranted = allRolePermissions.some(rp => rp.role_id === selectedBuilderRoleId && rp.permission_id === perm.id);
                          return (
                            <button
                              key={perm.id}
                              disabled={selectedRoleObj.is_system_role}
                              onClick={() => handleTogglePermission(selectedBuilderRoleId, perm.id)}
                              className={`flex items-start text-left gap-2.5 p-2.5 rounded-xl border transition-all ${
                                isGranted ? 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/5 dark:border-emerald-900/30' : 'border-slate-100 dark:border-darkbg-border/20 opacity-55'
                              } ${selectedRoleObj.is_system_role ? 'cursor-not-allowed' : 'hover:border-slate-200 hover:opacity-100 cursor-pointer'}`}
                            >
                              <div className={`mt-0.5 rounded-md p-0.5 shrink-0 ${isGranted ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                {isGranted ? <Check className="h-3 w-3 stroke-[3]" /> : <X className="h-3 w-3" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-white font-mono truncate">{perm.slug}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{perm.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {Object.keys(groupedPermissions).length === 0 && (
                    <p className="text-center text-slate-400 italic text-xs py-8">No permissions seeded yet. Refresh the page.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* CREATE CUSTOM ROLE — below the permissions matrix */}
            <Card className="border-dashed border-2 border-slate-200 dark:border-darkbg-border/50 bg-slate-50/30 dark:bg-darkbg/20">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Create Custom Role</CardTitle>
                    <CardDescription>Define a new job role with a tailored permission set for this business.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleAddCustomRole} className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Role Name *</label>
                    <input
                      type="text"
                      value={newRoleName}
                      onChange={e => setNewRoleName(e.target.value)}
                      placeholder="e.g. Floor Supervisor, Bar Tender, Storekeeper"
                      required
                      className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-darkbg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Description</label>
                    <input
                      type="text"
                      value={newRoleDesc}
                      onChange={e => setNewRoleDesc(e.target.value)}
                      placeholder="Role responsibilities (optional)"
                      className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-darkbg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button type="submit" variant="primary" className="text-xs h-9 whitespace-nowrap shrink-0">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Role
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: BRANCH ALLOCATIONS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'Branch Allocations' && (
        <div className="grid gap-5 md:grid-cols-3">
          {/* Allocator Form */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">Assign Employee to Branch</CardTitle>
              <CardDescription>Map employees to branches with specific roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAssignBranch} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Select Employee *</label>
                  <select
                    value={allocUserId}
                    onChange={e => setAllocUserId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                  >
                    <option value="">-- Choose Employee --</option>
                    {allUsers.filter(u => u.tenant_id === currentTenant.id).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Select Branch *</label>
                  <select
                    value={allocBranchId}
                    onChange={e => setAllocBranchId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                  >
                    <option value="">-- Choose Branch --</option>
                    {dbBranches.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.location})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Branch Role</label>
                  <select
                    value={allocRoleId}
                    onChange={e => setAllocRoleId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                  >
                    {allRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allocPrimary}
                    onChange={e => setAllocPrimary(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-200 text-primary focus:ring-primary"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Set as Primary Branch</span>
                </label>

                <Button type="submit" variant="primary" className="w-full text-xs h-9" disabled={allocating}>
                  {allocating ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <GitBranch className="h-4 w-4 mr-1.5" />}
                  {allocating ? 'Assigning...' : 'Assign Branch Role'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Allocation Matrix */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-darkbg-border/30">
              <CardTitle className="text-sm font-bold">Active Branch Allocations ({tenantUserBranches.length})</CardTitle>
              <CardDescription>Employee ↔ Branch ↔ Role assignment matrix.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="p-3.5 pl-6">Employee</th>
                      <th className="p-3.5">Branch</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Allocation</th>
                      <th className="p-3.5 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                    {tenantUserBranches.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-10 text-center text-slate-400 italic text-xs">
                          No allocations yet. Assign employees to branches above.
                        </td>
                      </tr>
                    ) : tenantUserBranches.map(tub => {
                      const userObj = usersMap.get(tub.user_id);
                      const branchObj = dbBranches.find(b => b.id === tub.branch_id);
                      const roleObj = rolesMap.get(tub.role_id || 'role-cashier');

                      return (
                        <tr key={tub.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                          <td className="p-3.5 pl-6 font-bold text-slate-800 dark:text-white">{userObj?.name || '—'}</td>
                          <td className="p-3.5">
                            <p className="font-semibold text-slate-700 dark:text-slate-300">{branchObj?.name || '—'}</p>
                            <p className="text-[10px] text-slate-400">{branchObj?.location}</p>
                          </td>
                          <td className="p-3.5">
                            <Badge variant="info">{roleObj?.name || 'Cashier'}</Badge>
                          </td>
                          <td className="p-3.5">
                            {tub.is_primary ? (
                              <Badge variant="success" className="font-black text-[9px] uppercase tracking-wider">Primary HQ</Badge>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">Secondary</span>
                            )}
                          </td>
                          <td className="p-3.5 pr-6 text-right">
                            <button
                              onClick={() => handleRemoveAllocation(tub.id)}
                              title="Remove allocation"
                              className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 dark:bg-red-950/20 transition"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4: POS PIN SWITCHER
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'POS PIN Switcher' && (
        <div className="grid gap-5 md:grid-cols-2 max-w-3xl mx-auto">
          {/* Employee selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Fingerprint className="h-4 w-4 text-primary" />
                </div>
                POS Quick Login Terminal
              </CardTitle>
              <CardDescription>
                Offline cashier handover using local PIN authentication. No internet required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[10px] uppercase font-bold text-slate-500">Select Cashier / Employee</p>
              {tenantUsers.length === 0 ? (
                <div className="text-center p-6 border border-dashed border-slate-200 dark:border-darkbg-border rounded-xl">
                  <p className="text-xs text-slate-400 italic">No employees found.</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {tenantUsers.map(tu => {
                    const dbUser = usersMap.get(tu.user_id);
                    const primaryAlloc = tenantUserBranches.find(tub => tub.user_id === tu.user_id && tub.is_primary);
                    const roleObj = rolesMap.get(primaryAlloc?.role_id || 'role-cashier');
                    const isSelected = tu.user_id === switcherUserId;
                    const initials = (dbUser?.name || '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

                    return (
                      <button
                        key={tu.id}
                        type="button"
                        onClick={() => {
                          setSwitcherUserId(tu.user_id);
                          setEnteredPin('');
                          setPinError('');
                          setPinSuccess('');
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                            : 'border-slate-100 dark:border-darkbg-border/30 hover:bg-slate-50 dark:hover:bg-darkbg/30'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            isSelected ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-darkbg/50 text-slate-600'
                          }`}>{initials}</div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-white">{dbUser?.name || '—'}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{roleObj?.name || 'Cashier'} · {tenantIdentifierService.getReadableEmployeeCode(tu)}</p>
                          </div>
                        </div>
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-primary bg-primary' : 'border-slate-300'
                        }`}>
                          {isSelected && <Check className="h-2.5 w-2.5 text-white stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dark PIN Keypad */}
          <Card className="flex flex-col items-center justify-center p-6 bg-slate-900 text-white rounded-2xl border-none shadow-2xl">
            <div className="w-full text-center space-y-2 mb-8">
              {switcherUserId ? (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Logging in as</p>
                  <p className="text-sm font-bold text-white mt-1">{usersMap.get(switcherUserId)?.name}</p>
                </div>
              ) : (
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-3">Select an Employee First</p>
              )}
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Enter PIN</p>
              <div className="flex justify-center gap-4 mt-3">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                      enteredPin.length > i
                        ? 'bg-primary border-primary scale-110 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                        : 'border-slate-600 bg-transparent'
                    }`}
                  />
                ))}
              </div>
              {pinError && (
                <p className="text-xs text-red-400 mt-3 font-bold animate-pulse flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {pinError}
                </p>
              )}
              {pinSuccess && (
                <p className="text-xs text-emerald-400 mt-3 font-bold animate-pulse flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {pinSuccess}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3.5 max-w-[200px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OK'].map(key => {
                const isOK = key === 'OK';
                const isCLR = key === 'CLR';
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={pinSwitching}
                    onClick={() => {
                      if (isCLR) handleKeypadClear();
                      else if (isOK) void handlePINSubmit();
                      else handleKeypadPress(key);
                    }}
                    className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${
                      isOK
                        ? 'bg-primary hover:bg-primary/80 text-white shadow-lg shadow-primary/30'
                        : isCLR
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                    }`}
                  >
                    {isOK && pinSwitching ? <RefreshCw className="h-4 w-4 animate-spin" /> : key}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 5: SECURITY AUDIT TRAIL
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'Security Audit Trail' && (() => {
        const successCount = auditLogs.filter(l => l.action.includes('success') || l.action.includes('created') || l.action.includes('activated') || l.action.includes('granted') || l.action.includes('assigned')).length;
        const failedCount  = auditLogs.filter(l => l.action.includes('failed') || l.action.includes('locked') || l.action.includes('suspended') || l.action.includes('deleted') || l.action.includes('unassigned')).length;
        const loginCount   = auditLogs.filter(l => l.action.includes('login')).length;

        const filteredLogs = auditLogs.filter(log => {
          if (auditFilter === 'all') return true;
          if (auditFilter === 'permission') {
            return log.action.toLowerCase().startsWith('permission.') || log.action.toLowerCase().startsWith('rolepermission.');
          }
          return log.action.toLowerCase().startsWith(auditFilter.toLowerCase() + '.');
        });

        return (
          <div className="space-y-4">
            {/* ── Stats Bar ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Events',     value: auditLogs.length, color: 'text-slate-700 dark:text-white',    bg: 'bg-white dark:bg-darkbg-card',           icon: Activity },
                { label: 'Successful',        value: successCount,      color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', icon: CheckCircle2 },
                { label: 'Failures / Alerts', value: failedCount,       color: 'text-red-500 dark:text-red-400',   bg: 'bg-red-50 dark:bg-red-950/20',           icon: AlertTriangle },
                { label: 'Login Events',      value: loginCount,        color: 'text-sky-600 dark:text-sky-400',   bg: 'bg-sky-50 dark:bg-sky-950/20',           icon: Key },
              ].map(({ label, value, color, bg, icon: Icon }) => (
                <div key={label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 dark:border-darkbg-border/30 ${bg}`}>
                  <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                  <div>
                    <p className={`text-xl font-black leading-none ${color}`}>{value}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Log Table Card ── */}
            <Card>
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-darkbg-border/30 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-darkbg flex items-center justify-center">
                    <History className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white">Security Audit Trail</h3>
                    <p className="text-[10px] text-slate-400">{filteredLogs.length} events filtered · immutable · offline-recorded</p>
                  </div>
                </div>
                {/* Filter chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['all', 'user', 'role', 'permission', 'branch'].map(cat => {
                    const isActive = auditFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setAuditFilter(cat)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                          isActive
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-transparent text-slate-500 border-slate-200 dark:border-darkbg-border hover:bg-slate-50 dark:hover:bg-darkbg/50'
                        }`}
                      >
                        {cat === 'all' ? 'All Events' : cat.charAt(0).toUpperCase() + cat.slice(1) + 's'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Timeline list */}
              <CardContent className="p-0">
                {filteredLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-slate-50 dark:bg-darkbg/50 flex items-center justify-center mb-4">
                      <History className="h-7 w-7 text-slate-200 dark:text-slate-700" />
                    </div>
                    <p className="text-sm font-bold text-slate-400">No audit events match current filter</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">Change filter or perform actions to generate security logs.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                    {filteredLogs.map((log, idx) => {
                      const userObj   = usersMap.get(log.user_id);
                      const isSuccess = log.action.includes('success') || log.action.includes('created') || log.action.includes('activated') || log.action.includes('granted') || log.action.includes('assigned');
                      const isFailed  = log.action.includes('failed') || log.action.includes('locked') || log.action.includes('suspended') || log.action.includes('deleted') || log.action.includes('unassigned');
                      const category  = log.action.split('.')[0];
                      const actionLabel = log.action.replace(/\./g, ' › ').replace(/_/g, ' ');

                      const initials = (userObj?.name || 'SY').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                      const avatarColor = isSuccess ? 'from-emerald-400 to-emerald-600' : isFailed ? 'from-red-400 to-red-600' : 'from-slate-300 to-slate-500';

                      const logDate = new Date(log.created_at);
                      const dateStr = logDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                      const timeStr = logDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                      return (
                        <div
                          key={log.id}
                          className={`group relative flex gap-4 px-5 py-4 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/10 ${
                            idx === 0 ? 'bg-slate-50/40 dark:bg-slate-800/5' : ''
                          }`}
                        >
                          {/* Timeline connector */}
                          <div className="flex flex-col items-center shrink-0">
                            <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-[9px] font-black text-white shadow-sm`}>
                              {initials}
                            </div>
                            {idx < filteredLogs.length - 1 && (
                              <div className="w-px flex-1 mt-1.5 bg-slate-100 dark:bg-darkbg-border/20 min-h-[16px]"></div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pb-1">
                            {/* Top row */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Severity dot */}
                                  <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                                    isFailed ? 'bg-red-500' : isSuccess ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`} />
                                  <span className="text-xs font-black text-slate-800 dark:text-white capitalize">
                                    {actionLabel}
                                  </span>
                                  <Badge
                                    variant={isFailed ? 'danger' : isSuccess ? 'success' : 'info'}
                                    className="text-[8px] px-1.5 py-0 uppercase font-bold tracking-wider"
                                  >
                                    {category}
                                  </Badge>
                                  {idx === 0 && (
                                    <Badge variant="warning" className="text-[8px] px-1.5 py-0 uppercase font-bold tracking-wider">
                                      Latest
                                    </Badge>
                                  )}
                                </div>

                                {/* Actor + device row */}
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                    <UserCog className="h-3 w-3 text-slate-400" />
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{userObj?.name || log.user_id}</span>
                                  </span>
                                  {log.ip_address && (
                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-darkbg/40 px-1.5 py-0.5 rounded">
                                      {log.ip_address}
                                    </span>
                                  )}
                                  {log.device_info && (
                                    <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{log.device_info}</span>
                                  )}
                                  {log.app_version && (
                                    <span className="text-[9px] font-mono text-slate-300 dark:text-slate-600">{log.app_version}</span>
                                  )}
                                </div>

                                {/* Payload */}
                                {log.payload && (
                                  <div className="mt-2 flex items-start gap-1.5">
                                    <ChevronRight className="h-3 w-3 text-slate-300 shrink-0 mt-0.5" />
                                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-darkbg/30 px-2 py-1 rounded-lg border border-slate-100 dark:border-darkbg-border/20 max-w-sm truncate">
                                      {Object.entries(log.payload).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ')}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Timestamp */}
                              <div className="text-right shrink-0">
                                <span className="text-[10px] font-bold text-slate-500 block">{timeAgo(log.created_at)}</span>
                                <span className="text-[9px] text-slate-400 block mt-0.5 font-mono">{timeStr}</span>
                                <span className="text-[9px] text-slate-300 dark:text-slate-600 block mt-0.5">{dateStr}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>

              {/* Footer */}
              {filteredLogs.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-100 dark:border-darkbg-border/30 flex items-center justify-between bg-slate-50/30 dark:bg-darkbg/10">
                  <p className="text-[10px] text-slate-400">
                    Showing {filteredLogs.length} events · Logs are stored locally in IndexedDB
                  </p>
                  <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-wider">
                    Offline-First · Immutable
                  </Badge>
                </div>
              )}
            </Card>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════
          INVITE EMPLOYEE MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-white dark:bg-darkbg-card rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-darkbg-border animate-in zoom-in-95 duration-200">
            {createdEmployee ? (
              <div className="p-6 space-y-5 text-center">
                <div className="flex flex-col items-center space-y-2">
                  <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 flex items-center justify-center shadow-sm">
                    <Check className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    Employee Pass Generated
                  </h3>
                  <p className="text-xs text-slate-400">
                    Scan the QR code or share the invite credentials below to grant access.
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="p-4 bg-slate-50 dark:bg-darkbg/40 border border-slate-200 dark:border-darkbg-border rounded-2xl max-w-sm mx-auto space-y-4">
                  <div className="relative group mx-auto h-48 w-48 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(createdEmployee.inviteUrl)}`}
                      alt="Invite QR Code"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  
                  {/* Invite Link display and Copy button */}
                  <div className="flex items-center gap-2 bg-white dark:bg-darkbg-card p-2 rounded-xl border border-slate-200 dark:border-darkbg-border">
                    <input
                      type="text"
                      readOnly
                      value={createdEmployee.inviteUrl}
                      className="bg-transparent text-[10px] font-mono text-slate-500 flex-1 outline-none overflow-hidden text-ellipsis whitespace-nowrap"
                    />
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => {
                        void navigator.clipboard.writeText(createdEmployee.inviteUrl);
                        alert('Invite URL copied to clipboard!');
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                {/* Credentials details card */}
                <div className="text-left text-xs bg-slate-50 dark:bg-darkbg/30 p-4 rounded-xl border border-slate-200 dark:border-darkbg-border space-y-2">
                  <div className="flex justify-between border-b border-slate-100 dark:border-darkbg-border/30 pb-1.5">
                    <span className="text-slate-400">Full Name:</span>
                    <span className="font-bold text-slate-800 dark:text-white">{createdEmployee.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-darkbg-border/30 pb-1.5">
                    <span className="text-slate-400">Email:</span>
                    <span className="font-mono text-slate-800 dark:text-white">{createdEmployee.email}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-darkbg-border/30 pb-1.5">
                    <span className="text-slate-400">Username:</span>
                    <span className="font-mono text-slate-800 dark:text-white">{createdEmployee.username}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-darkbg-border/30 pb-1.5">
                    <span className="text-slate-400">Active Role:</span>
                    <Badge variant="info" className="font-bold text-[9px]">{createdEmployee.role}</Badge>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span className="text-slate-400">POS PIN:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-white tracking-widest">{createdEmployee.pin}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full text-xs"
                    onClick={() => {
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Employee Invite Pass</title>
                              <style>
                                body { font-family: sans-serif; text-align: center; padding: 40px; }
                                .card { border: 2px solid #ccc; border-radius: 16px; padding: 20px; max-width: 400px; margin: auto; }
                                .qr { margin: 20px 0; }
                                .details { text-align: left; margin-top: 20px; }
                                .detail-row { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 8px 0; }
                              </style>
                            </head>
                            <body>
                              <div class="card">
                                <h2>DukaPos Employee Pass</h2>
                                <p>Scan this QR code to access your workspace portal.</p>
                                <div class="qr">
                                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(createdEmployee.inviteUrl)}" />
                                </div>
                                <div class="details">
                                  <div class="detail-row"><strong>Name:</strong> <span>${createdEmployee.name}</span></div>
                                  <div class="detail-row"><strong>Email:</strong> <span>${createdEmployee.email}</span></div>
                                  <div class="detail-row"><strong>Username:</strong> <span>${createdEmployee.username}</span></div>
                                  <div class="detail-row"><strong>Role:</strong> <span>${createdEmployee.role}</span></div>
                                  <div class="detail-row"><strong>POS PIN:</strong> <span>${createdEmployee.pin}</span></div>
                                </div>
                              </div>
                              <script>window.onload = function() { window.print(); }</script>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }}
                  >
                    Print Invite Pass
                  </Button>
                  <Button variant="primary" type="button" className="w-full text-xs" onClick={handleCloseAddModal}>
                    Close Pass
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 dark:border-darkbg-border/30 flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                      <UserCog className="h-4 w-4 text-primary" />
                      Invite Employee Profile
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Add a new team member to this workspace</p>
                  </div>
                  <button onClick={handleCloseAddModal} className="h-7 w-7 rounded-full bg-slate-100 dark:bg-darkbg flex items-center justify-center text-slate-400 hover:text-slate-700 transition">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Modal Form */}
                <form onSubmit={handleInviteUser}>
                  <div className="p-5 grid gap-4 sm:grid-cols-2 max-h-[400px] overflow-y-auto">
                    {[
                      { label: 'First Name *', value: firstName, onChange: setFirstName, type: 'text', placeholder: 'John' },
                      { label: 'Last Name *', value: lastName, onChange: setLastName, type: 'text', placeholder: 'Doe' },
                      { label: 'Email Address *', value: email, onChange: setEmail, type: 'email', placeholder: 'john@biz.com' },
                      { label: 'Phone Number', value: phone, onChange: setPhone, type: 'tel', placeholder: '+255 7XX XXX XXX' },
                      { label: 'Username *', value: username, onChange: setUsername, type: 'text', placeholder: 'john_doe' },
                      { label: 'Department', value: department, onChange: setDepartment, type: 'text', placeholder: 'Sales' },
                    ].map(field => (
                      <div key={field.label} className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-500">{field.label}</label>
                        <input
                          type={field.type}
                          value={field.value}
                          onChange={e => field.onChange(e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    ))}

                    {/* Job Title Dropdown selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Job Title *</label>
                      <select
                        value={jobTitle}
                        onChange={e => setJobTitle(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                      >
                        <option value="Cashier">Cashier</option>
                        <option value="Branch Manager">Branch Manager</option>
                        <option value="Inventory Officer">Inventory Officer</option>
                        <option value="Accountant">Accountant</option>
                        <option value="Business Administrator">Business Administrator</option>
                        <option value="Tenant Owner">Tenant Owner</option>
                      </select>
                    </div>

                    {/* Password field */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Password *</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 pr-8 text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700">
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* PIN field */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500">POS PIN (4 digits) *</label>
                      <input
                        type="password"
                        required
                        maxLength={4}
                        pattern="\d{4}"
                        value={pin}
                        onChange={e => setPin(e.target.value.replace(/\D/, ''))}
                        placeholder="1234"
                        className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-widest"
                      />
                    </div>

                    {/* Role selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Initial Role *</label>
                      <select
                        value={initialRole}
                        onChange={e => setInitialRole(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                      >
                        {allRoles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Branch selector */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Primary Branch *</label>
                      <select
                        required
                        value={initialBranch}
                        onChange={e => setInitialBranch(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                      >
                        <option value="">-- Select Branch --</option>
                        {dbBranches.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.location})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="p-5 border-t border-slate-100 dark:border-darkbg-border/30 bg-slate-50 dark:bg-darkbg/10 flex justify-end gap-2">
                    <Button variant="outline" size="sm" type="button" onClick={handleCloseAddModal}>Cancel</Button>
                    <Button variant="primary" size="sm" type="submit" disabled={addingUser}>
                      {addingUser ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                      {addingUser ? 'Adding...' : 'Invite Employee'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── EDIT EMPLOYEE MODAL ─── */}
      {showEditModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-white dark:bg-darkbg-card rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-darkbg-border animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-darkbg-border/30 flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-primary" />
                  Edit Employee Profile: {selectedEmployee.user.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Modify profile settings, active roles and PIN code credentials</p>
              </div>
              <button onClick={() => { setShowEditModal(false); setSelectedEmployee(null); }} className="h-7 w-7 rounded-full bg-slate-100 dark:bg-darkbg flex items-center justify-center text-slate-400 hover:text-slate-700 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEmployee}>
              <div className="p-5 grid gap-4 sm:grid-cols-2 max-h-[400px] overflow-y-auto">
                {[
                  { label: 'First Name *', value: editFirstName, onChange: setEditFirstName, type: 'text', placeholder: 'First Name' },
                  { label: 'Last Name *', value: editLastName, onChange: setEditLastName, type: 'text', placeholder: 'Last Name' },
                  { label: 'Email Address *', value: editEmail, onChange: setEditEmail, type: 'email', placeholder: 'email@example.com' },
                  { label: 'Phone Number', value: editPhone, onChange: setEditPhone, type: 'tel', placeholder: '+255 7XX XXX XXX' },
                  { label: 'Department', value: editDepartment, onChange: setEditDepartment, type: 'text', placeholder: 'Sales' },
                ].map(field => (
                  <div key={field.label} className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500">{field.label}</label>
                    <input
                      type={field.type}
                      value={field.value}
                      onChange={e => field.onChange(e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                ))}

                {/* Job Title Dropdown selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Job Title *</label>
                  <select
                    value={editJobTitle}
                    onChange={e => setEditJobTitle(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                  >
                    <option value="Cashier">Cashier</option>
                    <option value="Branch Manager">Branch Manager</option>
                    <option value="Inventory Officer">Inventory Officer</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Business Administrator">Business Administrator</option>
                    <option value="Tenant Owner">Tenant Owner</option>
                  </select>
                </div>

                {/* Password field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Update Password *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 pr-8 text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700">
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* PIN field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">POS PIN (4 digits) *</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    pattern="\d{4}"
                    value={editPin}
                    onChange={e => setEditPin(e.target.value.replace(/\D/, ''))}
                    placeholder="1234"
                    className="w-full h-9 rounded-lg border border-slate-200 dark:border-darkbg-border px-3 text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-widest"
                  />
                </div>

                {/* Role selector */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Active Role *</label>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-darkbg-border bg-transparent text-xs px-2 focus:outline-none dark:bg-darkbg-card"
                  >
                    {allRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 dark:border-darkbg-border/30 bg-slate-50 dark:bg-darkbg/10 flex justify-end gap-2">
                <Button variant="outline" size="sm" type="button" onClick={() => { setShowEditModal(false); setSelectedEmployee(null); }}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" disabled={savingUser}>
                  {savingUser ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  {savingUser ? 'Saving...' : 'Save Modifications'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Registration Audit Details Modal ── */}
      {selectedAuditUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg rounded-2xl border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-darkbg border-b border-slate-100 dark:border-darkbg-border p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-extrabold text-slate-900 dark:text-white">
                      Registration Audit Metadata
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Immutable user account creation &amp; verification record
                    </CardDescription>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAuditUser(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-darkbg transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-darkbg/50 rounded-xl border border-slate-100 dark:border-darkbg-border/40">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">User Name</span>
                  <p className="font-extrabold text-slate-800 dark:text-white mt-0.5">{selectedAuditUser.dbUser?.name || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee Code</span>
                  <p className="font-mono font-bold text-primary mt-0.5">{tenantIdentifierService.getReadableEmployeeCode(selectedAuditUser.tu)} · {tenantIdentifierService.getReadableUserId(selectedAuditUser.dbUser)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{selectedAuditUser.dbUser?.email || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone Number</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{selectedAuditUser.dbUser?.phone || 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-darkbg-border/40 rounded-xl">
                  <div className="flex items-center space-x-2.5">
                    <Calendar className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">Immutable Registration Timestamp</p>
                      <p className="text-[10px] font-mono text-slate-400">
                        {formatRegistrationDate(selectedAuditUser.dbUser?.created_at || selectedAuditUser.tu?.joined_at).iso}
                      </p>
                    </div>
                  </div>
                  <Badge variant="info" className="font-bold">
                    {formatRegistrationDate(selectedAuditUser.dbUser?.created_at || selectedAuditUser.tu?.joined_at).formatted}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-darkbg-border/40 rounded-xl">
                  <div className="flex items-center space-x-2.5">
                    <Globe className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">Registration Source &amp; Creator</p>
                      <p className="text-[10px] text-slate-400">
                        Created by: <span className="font-bold text-slate-700 dark:text-slate-300">{selectedAuditUser.dbUser?.created_by || 'System Administrator'}</span>
                      </p>
                    </div>
                  </div>
                  <Badge variant="info" className="font-bold uppercase">
                    {(selectedAuditUser.dbUser?.registration_source || 'SYSTEM_SEED').replace('_', ' ')}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-darkbg-border/40 rounded-xl">
                  <div className="flex items-center space-x-2.5">
                    <Laptop className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">Registration IP &amp; Client Device</p>
                      <p className="text-[10px] font-mono text-slate-400">
                        {selectedAuditUser.dbUser?.registration_device || 'Chrome 126.0 (Windows)'}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-darkbg rounded text-slate-600">
                    {selectedAuditUser.dbUser?.registration_ip && selectedAuditUser.dbUser.registration_ip !== '197.250.4.15' ? selectedAuditUser.dbUser.registration_ip : getSyncRealClientIp()}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-darkbg-border/40 rounded-xl">
                  <div className="flex items-center space-x-2.5">
                    <ShieldCheck className="h-4 w-4 text-success" />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">Verification Status</p>
                      <p className="text-[10px] text-slate-400">Email &amp; MFA security clearance</p>
                    </div>
                  </div>
                  <Badge variant="success" className="font-bold uppercase">
                    {selectedAuditUser.dbUser?.verification_status || 'VERIFIED'}
                  </Badge>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-darkbg-border/40 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setSelectedAuditUser(null)}>
                  Close Audit Details
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
