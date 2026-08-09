import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, recordStockMovement } from '../../db/dexie';
import type { 
  Supplier, PurchaseOrder, Warehouse, POItem, 
  SupplierContact, GoodsReceipt, GRNItem, SupplierInvoice, 
  SupplierLedgerEntry, SupplierPayment 
} from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Button, Badge, Dialog, Input
} from '../UI/custom-ui';
import { useToast } from '../UI/Toast';

import {
  Truck, ShoppingCart, Warehouse as WarehouseIcon, Plus, Edit3,
  Search, CheckCircle, Clock, XCircle,
  PackageCheck, MapPin, Phone, User,
  TrendingUp, DollarSign, FileText, Eye, X,
  RefreshCw, ArrowRight, Check, AlertCircle, Coins,
  History, EyeOff, Lock
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => `Tsh. ${(n || 0).toLocaleString()}`;
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' });

const PO_STATUS_CONFIG: Record<PurchaseOrder['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' | 'info'; icon: React.ReactNode }> = {
  Draft:     { label: 'Draft',     variant: 'outline',  icon: <FileText className="h-3 w-3" /> },
  Submitted: { label: 'Submitted', variant: 'info',     icon: <Clock className="h-3 w-3" /> },
  Approved:  { label: 'Approved',  variant: 'warning',  icon: <CheckCircle className="h-3 w-3" /> },
  Sent:      { label: 'Sent',      variant: 'info',     icon: <Truck className="h-3 w-3" /> },
  Partial:   { label: 'Partial',   variant: 'warning',  icon: <RefreshCw className="h-3 w-3" /> },
  Completed: { label: 'Completed', variant: 'success',  icon: <PackageCheck className="h-3 w-3" /> },
  Cancelled: { label: 'Cancelled', variant: 'danger',   icon: <XCircle className="h-3 w-3" /> },
};

const SUP_STATUS_CONFIG: Record<Supplier['status'], { variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' | 'info' }> = {
  Active:     { variant: 'success' },
  Inactive:   { variant: 'outline' },
  Blacklisted:{ variant: 'danger' },
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// ─── Empty State ─────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }> = ({ icon, title, desc, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-4">
      {icon}
    </div>
    <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{title}</p>
    <p className="text-xs text-slate-400 max-w-xs mb-4">{desc}</p>
    {action}
  </div>
);

// ─── TIN / VRN Tax Validators ────────────────────────────────────────────────
const validateTin = (tin?: string): { valid: boolean; text: string; color: string } => {
  if (!tin) return { valid: false, text: '⚠ Missing TIN', color: 'text-amber-500' };
  const clean = tin.replace(/-/g, '');
  if (/^\d{9}$/.test(clean)) return { valid: true, text: '✓ TIN Valid', color: 'text-emerald-500' };
  return { valid: false, text: '⚠ Invalid TIN (9 digits)', color: 'text-red-500' };
};

const validateVrn = (vrn?: string): { valid: boolean; text: string; color: string } => {
  if (!vrn) return { valid: false, text: '⚠ Missing VRN', color: 'text-slate-400 dark:text-slate-500' };
  const clean = vrn.replace(/-/g, '');
  if (/^\d{8}[A-Z]$/i.test(clean)) return { valid: true, text: '✓ VRN Valid', color: 'text-emerald-500' };
  return { valid: false, text: '⚠ Invalid VRN', color: 'text-red-500' };
};


// ─── SUPPLIERS TAB ────────────────────────────────────────────────────────────

const SuppliersTab: React.FC = () => {
  const { currentTenant, currentBranch } = useAuth();
  const toast = useToast();
  const suppliers = useLiveQuery(
    () => currentTenant?.id ? db.suppliers.where('tenant_id').equals(currentTenant.id).toArray() : [],
    [currentTenant?.id]
  ) || [];
  const contacts = useLiveQuery(
    () => currentTenant?.id ? db.supplierContacts.where('tenant_id').equals(currentTenant.id).toArray() : [],
    [currentTenant?.id]
  ) || [];

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>({});
  const [localContacts, setLocalContacts] = useState<Partial<SupplierContact>[]>([]);
  const [viewTarget, setViewTarget] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalTab, setModalTab] = useState<'basic' | 'compliance' | 'payment'>('basic');

  const supplierContactsMap = useMemo(() => {
    const map: Record<string, SupplierContact[]> = {};
    contacts.forEach(c => {
      if (!map[c.supplier_id]) map[c.supplier_id] = [];
      map[c.supplier_id].push(c);
    });
    return map;
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.supplier_code.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.trading_name || '').toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const totalOutstanding = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.current_balance || 0), 0);
  }, [suppliers]);

  const totalCreditLimit = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.credit_limit || 0), 0);
  }, [suppliers]);

  const creditUtilPercent = totalCreditLimit > 0 ? Math.round((totalOutstanding / totalCreditLimit) * 100) : 0;

  const openAdd = () => {
    setEditTarget(null);
    setForm({
      supplier_code: `SUP-${String(suppliers.length + 1).padStart(3, '0')}`,
      status: 'Active',
      preferred_currency: 'TZS',
      payment_terms_days: 30,
      credit_limit: 0,
      current_balance: 0,
      country: 'Tanzania',
      city: 'Dar es Salaam',
    });
    setLocalContacts([{ name: '', phone: '', position: 'Sales Manager', is_primary: true }]);
    setModalTab('basic');
    setShowModal(true);
  };

  const openEdit = async (s: Supplier) => {
    setEditTarget(s);
    setForm({ ...s });
    const cList = await db.supplierContacts.where('supplier_id').equals(s.id).toArray();
    setLocalContacts(cList.length > 0 ? cList : [{ name: '', phone: '', position: 'Sales Manager', is_primary: true }]);
    setModalTab('basic');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditTarget(null); setForm({}); setLocalContacts([]); };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.phone?.trim()) return;
    setSaving(true);
    try {
      const supplierId = editTarget ? editTarget.id : generateId('sup');
      const supplierData: Supplier = {
        id: supplierId,
        supplier_code: form.supplier_code || `SUP-${Date.now().toString().slice(-4)}`,
        name: form.name!.trim(),
        trading_name: form.trading_name?.trim() || undefined,
        category: form.category || 'General',
        tin_number: form.tin_number?.trim() || undefined,
        vrn_number: form.vrn_number?.trim() || undefined,
        phone: form.phone!.trim(),
        whatsapp: form.whatsapp?.trim() || undefined,
        email: form.email?.trim() || undefined,
        country: form.country || 'Tanzania',
        region: form.region?.trim() || undefined,
        city: form.city || 'Dar es Salaam',
        address: form.address?.trim() || undefined,
        preferred_currency: form.preferred_currency || 'TZS',
        payment_terms_days: Number(form.payment_terms_days || 0),
        credit_limit: Number(form.credit_limit || 0),
        current_balance: editTarget ? editTarget.current_balance : 0,
        mpesa_number: form.mpesa_number?.trim() || undefined,
        tigopesa_number: form.tigopesa_number?.trim() || undefined,
        airtel_money_number: form.airtel_money_number?.trim() || undefined,
        bank_account: form.bank_account?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        tenant_id: currentTenant.id,
        branch_id: currentBranch.id,
        status: form.status || 'Active',
        created_at: editTarget ? editTarget.created_at : Date.now(),
        updated_at: Date.now(),
      };

      await db.transaction('rw', [db.suppliers, db.supplierContacts], async () => {
        await db.suppliers.put(supplierData);
        // Delete old contacts
        await db.supplierContacts.where('supplier_id').equals(supplierId).delete();
        // Insert new ones
        const validContacts = localContacts
          .filter(c => c.name?.trim() && c.phone?.trim())
          .map(c => ({
            id: c.id || generateId('sc'),
            supplier_id: supplierId,
            tenant_id: currentTenant.id,
            name: c.name!.trim(),
            position: c.position || '',
            phone: c.phone!.trim(),
            email: c.email || '',
            is_primary: !!c.is_primary,
            created_at: c.created_at || Date.now()
          }));
        if (validContacts.length > 0) {
          await db.supplierContacts.bulkPut(validContacts);
        }
      });

      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (supplier: Supplier, newStatus: Supplier['status']) => {
    const statusText = newStatus === 'Active' ? 'reactivate' : newStatus.toLowerCase();
    const confirmed = await toast.confirm({
      title: `${statusText.charAt(0).toUpperCase() + statusText.slice(1)} supplier?`,
      message: `Are you sure you want to ${statusText} "${supplier.name}"?`,
      confirmLabel: statusText.charAt(0).toUpperCase() + statusText.slice(1),
      variant: newStatus === 'Active' ? 'primary' : 'warning'
    });
    if (confirmed) {
      await db.suppliers.update(supplier.id, { status: newStatus, updated_at: Date.now() });
    }
  };

  const addContactRow = () => {
    setLocalContacts(p => [...p, { name: '', phone: '', position: 'Sales Representative', is_primary: false }]);
  };

  const removeContactRow = (idx: number) => {
    setLocalContacts(p => p.filter((_, i) => i !== idx));
  };

  const updateContactField = (idx: number, field: keyof SupplierContact, val: any) => {
    setLocalContacts(p => p.map((c, i) => {
      if (i !== idx) return c;
      if (field === 'is_primary' && val === true) {
        // Only one primary contact allowed
        return { ...c, [field]: val };
      }
      return { ...c, [field]: val };
    }).map((c, i) => {
      if (field === 'is_primary' && val === true && i !== idx) {
        return { ...c, is_primary: false };
      }
      return c;
    }));
  };

  const supplierLedgerEntries = useLiveQuery(async () => {
    if (!viewTarget) return [];
    return await db.supplierLedger.where('supplier_id').equals(viewTarget.id).sortBy('created_at');
  }, [viewTarget]) || [];

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Suppliers', value: suppliers.length, icon: <Truck className="h-4 w-4" />, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/20' },
          { label: 'Active', value: suppliers.filter(s => s.status === 'Active').length, icon: <CheckCircle className="h-4 w-4" />, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
          { label: 'Outstanding Balance', value: fmt(totalOutstanding), icon: <DollarSign className="h-4 w-4" />, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/20' },
          { label: 'Credit Utilisation', value: `${creditUtilPercent}%`, icon: <TrendingUp className="h-4 w-4" />, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20' },
        ].map((stat, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide truncate">{stat.label}</p>
                <p className="text-sm font-black text-slate-800 dark:text-white truncate">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Directory Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Supplier Relationship Directory</CardTitle>
            <CardDescription>Manage active vendor profiles, Tax TIN/VRNs, and mobile payment numbers</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search code or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary dark:border-darkbg-border dark:bg-darkbg"
              />
            </div>
            <Button size="sm" onClick={openAdd} className="flex items-center gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Add Supplier
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-6 w-6" />}
              title="No suppliers found"
              desc={search ? `No results for "${search}"` : 'Evolve contacts into rich suppliers to log Procurement & Goods Receipts.'}
              action={!search ? <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add Supplier</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/70 dark:bg-darkbg/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-3.5 pl-5">Code / Supplier</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Primary Contact</th>
                    <th className="p-3.5 text-center">TRA Compliance</th>
                    <th className="p-3.5">Balance</th>
                    <th className="p-3.5">Limit</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                  {filtered.map(s => {
                    const primaryC = supplierContactsMap[s.id]?.find(c => c.is_primary) || supplierContactsMap[s.id]?.[0];
                    const tinInfo = validateTin(s.tin_number);
                    const vrnInfo = validateVrn(s.vrn_number);

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors group">
                        <td className="p-3.5 pl-5">
                          <p className="font-mono text-[10px] text-slate-400 font-bold">{s.supplier_code}</p>
                          <p className="font-bold text-slate-800 dark:text-white mt-0.5">{s.name}</p>
                          {s.trading_name && <p className="text-[10px] italic text-slate-400">t/a {s.trading_name}</p>}
                        </td>
                        <td className="p-3.5">
                          <Badge variant="outline">{s.category}</Badge>
                        </td>
                        <td className="p-3.5">
                          {primaryC ? (
                            <div>
                              <p className="font-semibold text-slate-700 dark:text-slate-300">{primaryC.name}</p>
                              <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="h-2.5 w-2.5" /> {primaryC.phone}</p>
                            </div>
                          ) : (
                            <p className="text-slate-400">—</p>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-col gap-1 items-center justify-center">
                            <span className={`text-[10px] font-bold ${tinInfo.color}`}>{tinInfo.text}</span>
                            {s.vrn_number && <span className={`text-[10px] font-bold ${vrnInfo.color}`}>{vrnInfo.text}</span>}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className={`font-black ${s.current_balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {fmt(s.current_balance)}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-500 font-medium">
                          {s.credit_limit > 0 ? fmt(s.credit_limit) : 'No Limit'}
                        </td>
                        <td className="p-3.5">
                          <Badge variant={SUP_STATUS_CONFIG[s.status].variant}>{s.status}</Badge>
                        </td>
                        <td className="p-3.5 pr-5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setViewTarget(s)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                              title="View details & Ledger"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(s)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition-colors"
                              title="Edit Supplier"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            {s.status === 'Active' ? (
                              <button
                                onClick={() => handleDeactivate(s, 'Inactive')}
                                className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/20 text-slate-400 hover:text-amber-600 transition-colors"
                                title="Deactivate"
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeactivate(s, 'Active')}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-400 hover:text-emerald-600 transition-colors"
                                title="Activate"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {s.status !== 'Blacklisted' && (
                              <button
                                onClick={() => handleDeactivate(s, 'Blacklisted')}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600 transition-colors"
                                title="Blacklist"
                              >
                                <Lock className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Supplier Dialog */}
      <Dialog
        isOpen={showModal}
        onClose={closeModal}
        title={editTarget ? `Edit Supplier Master — ${form.name}` : 'Create Supplier Master Record'}
        description="Every supplier profile requires multi-tenant registration parameters."
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name?.trim() || !form.phone?.trim()}>
              {saving ? 'Writing records...' : editTarget ? 'Save Changes' : 'Create Supplier'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Internal Tab Bar */}
          <div className="flex border-b border-slate-200 dark:border-darkbg-border text-xs">
            {[
              { id: 'basic', label: 'Basic Profile & Contacts' },
              { id: 'compliance', label: 'TRA Tax Compliance' },
              { id: 'payment', label: 'Payments & Credit Info' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setModalTab(tab.id as any)}
                className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
                  modalTab === tab.id
                    ? 'border-primary text-primary dark:text-primary-dark font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Form Fields */}
          {modalTab === 'basic' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Supplier Code *" value={form.supplier_code || ''} onChange={e => setForm(p => ({ ...p, supplier_code: e.target.value }))} placeholder="SUP-001" />
                <Input label="Category *" value={form.category || 'General'} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Pharmaceuticals" />
                <div className="col-span-2">
                  <Input label="Supplier Name *" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Legitimate business legal name" />
                </div>
                <Input label="Trading Name (DBA)" value={form.trading_name || ''} onChange={e => setForm(p => ({ ...p, trading_name: e.target.value }))} placeholder="Name printed on receipts" />
                <Input label="Contact Mobile *" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+255 7XX XXX XXX" />
                <Input label="WhatsApp Number" value={form.whatsapp || ''} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="+255 7XX XXX XXX" />
                <Input label="Email Address" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="supplier@orders.com" />
                <Input label="City" value={form.city || 'Dar es Salaam'} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
                <Input label="Region" value={form.region || 'Dar es Salaam'} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} />
                <div className="col-span-2">
                  <Input label="Physical Address" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Street, block number" />
                </div>
              </div>

              {/* Multiple Contacts Inline List */}
              <div className="border border-slate-200 dark:border-darkbg-border rounded-lg overflow-hidden mt-2">
                <div className="bg-slate-50 dark:bg-darkbg/30 px-3 py-2 border-b border-slate-200 dark:border-darkbg-border flex items-center justify-between">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Staff Representatives / Contacts</p>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={addContactRow}>
                    <Plus className="h-3 w-3 mr-1" /> Add Contact
                  </Button>
                </div>
                <div className="p-3 space-y-2">
                  {localContacts.map((c, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Representative Name"
                        value={c.name || ''}
                        onChange={e => updateContactField(i, 'name', e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-darkbg-border dark:bg-darkbg-card"
                      />
                      <input
                        type="text"
                        placeholder="Role / Position"
                        value={c.position || ''}
                        onChange={e => updateContactField(i, 'position', e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-darkbg-border dark:bg-darkbg-card"
                      />
                      <input
                        type="text"
                        placeholder="Phone Number"
                        value={c.phone || ''}
                        onChange={e => updateContactField(i, 'phone', e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-darkbg-border dark:bg-darkbg-card"
                      />
                      <label className="flex items-center gap-1 text-[10px] text-slate-500 font-bold shrink-0">
                        <input
                          type="checkbox"
                          checked={!!c.is_primary}
                          onChange={e => updateContactField(i, 'is_primary', e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-primary"
                        />
                        Primary
                      </label>
                      <button onClick={() => removeContactRow(i)} className="p-1 hover:text-red-500 text-slate-300">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {modalTab === 'compliance' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-400">Ensure TIN and VRN are correct for TRA electronic reporting integrations.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input label="TIN Number (TRA)" value={form.tin_number || ''} onChange={e => setForm(p => ({ ...p, tin_number: e.target.value }))} placeholder="e.g. 112233445" />
                  {form.tin_number && (
                    <p className={`text-[10px] mt-1 font-bold ${validateTin(form.tin_number).color}`}>
                      {validateTin(form.tin_number).text}
                    </p>
                  )}
                </div>
                <div>
                  <Input label="VRN Number (TRA VAT)" value={form.vrn_number || ''} onChange={e => setForm(p => ({ ...p, vrn_number: e.target.value }))} placeholder="e.g. 40012345H" />
                  {form.vrn_number && (
                    <p className={`text-[10px] mt-1 font-bold ${validateVrn(form.vrn_number).color}`}>
                      {validateVrn(form.vrn_number).text}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {modalTab === 'payment' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Credit Limit Amount (Tsh)" type="number" value={form.credit_limit || 0} onChange={e => setForm(p => ({ ...p, credit_limit: Number(e.target.value) }))} />
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Payment Terms</label>
                  <select
                    value={form.payment_terms_days || 30}
                    onChange={e => setForm(p => ({ ...p, payment_terms_days: Number(e.target.value) }))}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-darkbg-border dark:bg-darkbg-card focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value={0}>Cash on Delivery (COD)</option>
                    <option value={7}>Net 7 Days</option>
                    <option value={14}>Net 14 Days</option>
                    <option value={30}>Net 30 Days</option>
                    <option value={60}>Net 60 Days</option>
                  </select>
                </div>
                <Input label="M-Pesa Lipa / Paybill" value={form.mpesa_number || ''} onChange={e => setForm(p => ({ ...p, mpesa_number: e.target.value }))} />
                <Input label="Tigo Pesa Number" value={form.tigopesa_number || ''} onChange={e => setForm(p => ({ ...p, tigopesa_number: e.target.value }))} />
                <Input label="Airtel Money Number" value={form.airtel_money_number || ''} onChange={e => setForm(p => ({ ...p, airtel_money_number: e.target.value }))} />
                <Input label="Bank Account Details" value={form.bank_account || ''} onChange={e => setForm(p => ({ ...p, bank_account: e.target.value }))} placeholder="e.g. NMB - 01502..." />
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Internal Relationship Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Log private notes regarding terms or reliability"
                    value={form.notes || ''}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-darkbg-border dark:bg-darkbg-card focus:outline-none resize-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* View Supplier details modal with chronological ledger */}
      <Dialog
        isOpen={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title={viewTarget ? `${viewTarget.supplier_code} — ${viewTarget.name}` : ''}
        size="lg"
        footer={<Button variant="outline" size="sm" onClick={() => setViewTarget(null)}>Close Profile</Button>}
      >
        {viewTarget && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white">Supplier Master Record</h4>
                <p className="text-xs text-slate-400 mt-1">{viewTarget.address || viewTarget.city}, {viewTarget.country}</p>
              </div>
              <Badge variant={SUP_STATUS_CONFIG[viewTarget.status].variant}>{viewTarget.status}</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-lg">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">TIN</p>
                <p className={`font-semibold ${validateTin(viewTarget.tin_number).color}`}>{viewTarget.tin_number || 'Missing'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-lg">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">VRN</p>
                <p className={`font-semibold ${validateVrn(viewTarget.vrn_number).color}`}>{viewTarget.vrn_number || 'Missing'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-lg">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Credit Limit</p>
                <p className="font-semibold text-slate-700 dark:text-slate-200">{viewTarget.credit_limit > 0 ? fmt(viewTarget.credit_limit) : 'No Limit'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-lg">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Outstanding Balance</p>
                <p className={`font-black ${viewTarget.current_balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{fmt(viewTarget.current_balance)}</p>
              </div>
            </div>

            {/* Mobile money and bank accounts */}
            <div className="bg-slate-50 dark:bg-darkbg p-4 rounded-xl space-y-2">
              <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Settlement Channels</h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {viewTarget.mpesa_number && <p className="text-slate-600 dark:text-slate-400"><strong className="text-slate-800 dark:text-white">M-Pesa Lipa:</strong> {viewTarget.mpesa_number}</p>}
                {viewTarget.tigopesa_number && <p className="text-slate-600 dark:text-slate-400"><strong className="text-slate-800 dark:text-white">Tigo Pesa:</strong> {viewTarget.tigopesa_number}</p>}
                {viewTarget.airtel_money_number && <p className="text-slate-600 dark:text-slate-400"><strong className="text-slate-800 dark:text-white">Airtel Money:</strong> {viewTarget.airtel_money_number}</p>}
                {viewTarget.bank_account && <p className="text-slate-600 dark:text-slate-400"><strong className="text-slate-800 dark:text-white">Bank Info:</strong> {viewTarget.bank_account}</p>}
              </div>
            </div>

            {/* Contacts */}
            <div className="border border-slate-200 dark:border-darkbg-border rounded-xl p-4">
              <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Registered Representatives</h5>
              {supplierContactsMap[viewTarget.id]?.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-darkbg-border/20 text-xs">
                  {supplierContactsMap[viewTarget.id].map(c => (
                    <div key={c.id} className="py-2 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-700 dark:text-slate-200">{c.name} {c.is_primary && <span className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 px-1 py-0.2 rounded ml-1 font-black">Primary</span>}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{c.position}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-600 dark:text-slate-400">{c.phone}</p>
                        {c.email && <p className="text-[10px] text-slate-400">{c.email}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No representatives configured.</p>
              )}
            </div>

            {/* Chronological Accounts Payable Ledger */}
            <div className="border border-slate-200 dark:border-darkbg-border rounded-xl overflow-hidden">
              <div className="bg-slate-50 dark:bg-darkbg/30 px-4 py-2.5 border-b border-slate-200 dark:border-darkbg-border flex justify-between items-center">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Supplier Ledger (Chronological Entries)</p>
                <span className="text-[10px] font-mono text-slate-400">Total Entries: {supplierLedgerEntries.length}</span>
              </div>
              <div className="p-0">
                {supplierLedgerEntries.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 italic text-center">No ledger entries logged. Create a Purchase Order & GRN to log financial debts.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100 dark:border-darkbg-border/30 text-[10px] font-bold text-slate-400">
                        <th className="p-2.5 pl-4">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Reference</th>
                        <th className="p-2.5 text-right">Debit (Owed)</th>
                        <th className="p-2.5 text-right">Credit (Paid)</th>
                        <th className="p-2.5 text-right pr-4">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                      {supplierLedgerEntries.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 pl-4 text-slate-500">{fmtDate(e.created_at)}</td>
                          <td className="p-2.5">
                            <span className={`font-semibold ${e.transaction_type === 'Invoice' ? 'text-red-500' : 'text-emerald-500'}`}>{e.transaction_type}</span>
                          </td>
                          <td className="p-2.5">
                            <p className="font-semibold text-slate-700 dark:text-slate-300">{e.description || '—'}</p>
                            <p className="text-[9px] font-mono text-slate-400">{e.reference_type} #{e.reference_id}</p>
                          </td>
                          <td className="p-2.5 text-right font-semibold text-red-500">{e.debit > 0 ? fmt(e.debit) : '—'}</td>
                          <td className="p-2.5 text-right font-semibold text-emerald-500">{e.credit > 0 ? fmt(e.credit) : '—'}</td>
                          <td className="p-2.5 text-right pr-4 font-black text-slate-800 dark:text-white">{fmt(e.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};


// ─── PURCHASE ORDERS TAB ─────────────────────────────────────────────────────

const PurchaseOrdersTab: React.FC<{ onViewGRNRequest: (po: PurchaseOrder) => void }> = ({ onViewGRNRequest }) => {
  const { currentTenant, currentBranch } = useAuth();
  const toast = useToast();
  const allPOs = useLiveQuery(
    () => currentTenant?.id ? db.purchaseOrders.where('tenant_id').equals(currentTenant.id).toArray() : [],
    [currentTenant?.id]
  ) || [];
  const suppliers = useLiveQuery(
    () => currentTenant?.id ? db.suppliers.where('tenant_id').equals(currentTenant.id).toArray() : [],
    [currentTenant?.id]
  ) || [];
  const products = useLiveQuery(
    () => currentTenant?.id ? db.products.where('tenant_id').equals(currentTenant.id).toArray() : [],
    [currentTenant?.id]
  ) || [];
  const variants = useLiveQuery(
    () => currentTenant?.id ? db.productVariants.where('tenant_id').equals(currentTenant.id).toArray() : [],
    [currentTenant?.id]
  ) || [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [showNewPO, setShowNewPO] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [isVatEnabled, setIsVatEnabled] = useState(true);

  // Searchable Product dropdown selection inside PO Creator
  const [productQuery, setProductQuery] = useState('');

  const [newPO, setNewPO] = useState<{
    supplier_id: string;
    notes: string;
    expected_delivery: string;
    items: POItem[];
  }>({ supplier_id: '', notes: '', expected_delivery: '', items: [] });

  const [newItem, setNewItem] = useState<Partial<POItem>>({ qty_ordered: 1, unit_cost: 0 });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allPOs
      .filter(po => statusFilter === 'All' || po.status === statusFilter)
      .filter(po =>
        po.po_number.toLowerCase().includes(q) ||
        po.supplier_name.toLowerCase().includes(q)
      )
      .sort((a, b) => b.created_at - a.created_at);
  }, [allPOs, search, statusFilter]);

  const stats = useMemo(() => ({
    total: allPOs.length,
    pending: allPOs.filter(p => ['Draft', 'Submitted', 'Approved'].includes(p.status)).length,
    received: allPOs.filter(p => p.status === 'Completed').length,
    totalValue: allPOs.reduce((sum, p) => sum + p.total, 0),
  }), [allPOs]);

  // Product Selection helper autocomplete
  const autocompletes = useMemo(() => {
    if (!productQuery) return [];
    const q = productQuery.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 5);
  }, [products, productQuery]);

  const selectProduct = (pId: string) => {
    const prod = products.find(p => p.id === pId);
    if (!prod) return;
    const vList = variants.filter(v => v.productId === prod.id);

    setNewItem({
      product_id: prod.id,
      product_name: prod.name,
      sku: vList[0]?.sku || `SKU-${prod.id.slice(-4).toUpperCase()}`,
      qty_ordered: 1,
      unit_cost: prod.buyingPrice || 0,
      total_cost: prod.buyingPrice || 0
    });
    setProductQuery(prod.name);
  };

  const addLineItem = () => {
    if (!newItem.product_name?.trim() || !newItem.sku?.trim()) return;
    const item: POItem = {
      product_id: newItem.product_id || generateId('prod'),
      product_name: newItem.product_name!,
      sku: newItem.sku!,
      qty_ordered: newItem.qty_ordered || 1,
      qty_received: 0,
      unit_cost: newItem.unit_cost || 0,
      total_cost: (newItem.qty_ordered || 1) * (newItem.unit_cost || 0),
    };
    setNewPO(p => ({ ...p, items: [...p.items, item] }));
    setNewItem({ qty_ordered: 1, unit_cost: 0 });
    setProductQuery('');
  };

  const removeLineItem = (idx: number) => {
    setNewPO(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  const poSubtotal = newPO.items.reduce((sum, i) => sum + i.total_cost, 0);
  const poTax = isVatEnabled ? Math.round(poSubtotal * 0.18) : 0;
  const poTotal = poSubtotal + poTax;

  const savePO = async (status: PurchaseOrder['status']) => {
    if (!newPO.supplier_id || newPO.items.length === 0) return;
    const supplier = suppliers.find(s => s.id === newPO.supplier_id);
    if (!supplier) return;
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const poNum = `PO-${year}-${String(allPOs.length + 1).padStart(3, '0')}`;
      const po: PurchaseOrder = {
        id: generateId('po'),
        po_number: poNum,
        supplier_id: newPO.supplier_id,
        supplier_name: supplier.name,
        status,
        payment_status: 'Unpaid',
        items: newPO.items,
        subtotal: poSubtotal,
        tax_amount: poTax,
        total: poTotal,
        notes: newPO.notes,
        expected_delivery: newPO.expected_delivery ? new Date(newPO.expected_delivery).getTime() : undefined,
        ordered_by: 'usr-owner', // Defaulting to owner
        tenant_id: currentTenant.id,
        branch_id: currentBranch.id,
        created_at: Date.now(),
      };
      await db.purchaseOrders.put(po);
      setShowNewPO(false);
      setNewPO({ supplier_id: '', notes: '', expected_delivery: '', items: [] });
      setNewItem({ qty_ordered: 1, unit_cost: 0 });
    } finally {
      setSaving(false);
    }
  };

  const advancePOStatus = async (po: PurchaseOrder, targetStatus: PurchaseOrder['status']) => {
    await db.purchaseOrders.update(po.id, {
      status: targetStatus,
      ...(targetStatus === 'Approved' ? { approved_at: Date.now(), approved_by: 'usr-owner' } : {}),
      ...(targetStatus === 'Completed' ? { completed_at: Date.now() } : {})
    });
  };

  const cancelPO = async (id: string) => {
    const confirmed = await toast.confirm({
      title: 'Cancel purchase order?',
      message: 'This purchase order will be marked as cancelled. Stock will not be adjusted.',
      confirmLabel: 'Cancel Order',
      variant: 'warning'
    });
    if (confirmed) {
      await db.purchaseOrders.update(id, { status: 'Cancelled' });
    }
  };

  const statusOptions = ['All', 'Draft', 'Submitted', 'Approved', 'Sent', 'Partial', 'Completed', 'Cancelled'];

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total POs', value: stats.total, icon: <FileText className="h-4 w-4" />, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/20' },
          { label: 'Pending', value: stats.pending, icon: <Clock className="h-4 w-4" />, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20' },
          { label: 'Completed', value: stats.received, icon: <PackageCheck className="h-4 w-4" />, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
          { label: 'Total PO Value', value: fmt(stats.totalValue), icon: <TrendingUp className="h-4 w-4" />, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/20' },
        ].map((s, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-xl ${s.bg} ${s.color} flex items-center justify-center shrink-0`}>{s.icon}</div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide truncate">{s.label}</p>
                <p className="text-sm font-black text-slate-800 dark:text-white truncate">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* PO List Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Purchase Orders (Procurement)</CardTitle>
            <CardDescription>Track supplier purchase requests through the full authorization pipeline</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search PO number..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 w-40 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary dark:border-darkbg-border dark:bg-darkbg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-darkbg-border dark:bg-darkbg"
            >
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button size="sm" onClick={() => setShowNewPO(true)} className="flex items-center gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" /> New PO
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-6 w-6" />}
              title="No purchase orders"
              desc={search || statusFilter !== 'All' ? 'No POs match your filters.' : 'Draft a new Purchase Order to request items from active suppliers.'}
              action={(!search && statusFilter === 'All') ? <Button size="sm" onClick={() => setShowNewPO(true)}><Plus className="h-3.5 w-3.5 mr-1" />New Purchase Order</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/70 dark:bg-darkbg/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-3.5 pl-5">PO Number</th>
                    <th className="p-3.5">Supplier</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5 text-center">Items</th>
                    <th className="p-3.5">Total</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                  {filtered.map(po => {
                    const cfg = PO_STATUS_CONFIG[po.status];
                    return (
                      <tr key={po.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors group">
                        <td className="p-3.5 pl-5">
                          <span className="font-mono font-black text-slate-800 dark:text-white">{po.po_number}</span>
                        </td>
                        <td className="p-3.5">
                          <p className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[160px]">{po.supplier_name}</p>
                        </td>
                        <td className="p-3.5 text-slate-500">{fmtDate(po.created_at)}</td>
                        <td className="p-3.5 text-center">
                          <span className="font-bold text-slate-700 dark:text-slate-300">{po.items.length}</span>
                        </td>
                        <td className="p-3.5 font-black text-slate-800 dark:text-white">{fmt(po.total)}</td>
                        <td className="p-3.5">
                          <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
                            {cfg.icon} {cfg.label}
                          </Badge>
                        </td>
                        <td className="p-3.5 pr-5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setViewPO(po)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
                              title="View details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {po.status === 'Draft' && (
                              <button
                                onClick={() => advancePOStatus(po, 'Submitted')}
                                className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/20 text-slate-400 hover:text-sky-500 transition-colors"
                                title="Submit PO"
                              >
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {po.status === 'Submitted' && (
                              <button
                                onClick={() => advancePOStatus(po, 'Approved')}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-400 hover:text-emerald-500 transition-colors"
                                title="Approve PO"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {po.status === 'Approved' && (
                              <button
                                onClick={() => advancePOStatus(po, 'Sent')}
                                className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-slate-400 hover:text-indigo-500 transition-colors"
                                title="Mark Sent to Supplier"
                              >
                                <Truck className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {po.status === 'Sent' && (
                              <button
                                onClick={() => onViewGRNRequest(po)}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-400 hover:text-emerald-600 transition-colors"
                                title="Receive Goods (GRN)"
                              >
                                <PackageCheck className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['Draft', 'Submitted'].includes(po.status) && (
                              <button
                                onClick={() => cancelPO(po.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-500 transition-colors"
                                title="Cancel PO"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New PO Dialog */}
      <Dialog
        isOpen={showNewPO}
        onClose={() => setShowNewPO(false)}
        title="Compose Purchase Order"
        description="Select an active supplier, add items with updated cost rates, and select VAT configurations."
        size="xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowNewPO(false)} disabled={saving}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={() => savePO('Draft')} disabled={saving || !newPO.supplier_id || newPO.items.length === 0}>
              Save as Draft
            </Button>
            <Button size="sm" onClick={() => savePO('Submitted')} disabled={saving || !newPO.supplier_id || newPO.items.length === 0}>
              {saving ? 'Submitting...' : 'Submit PO'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Supplier *</label>
              <select
                value={newPO.supplier_id}
                onChange={e => setNewPO(p => ({ ...p, supplier_id: e.target.value }))}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-darkbg-border dark:bg-darkbg-card focus:outline-none"
              >
                <option value="">— Select Active Supplier —</option>
                {suppliers.filter(s => s.status === 'Active').map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.supplier_code})</option>
                ))}
              </select>
            </div>
            <Input
              label="Expected Delivery Date"
              type="date"
              value={newPO.expected_delivery}
              onChange={e => setNewPO(p => ({ ...p, expected_delivery: e.target.value }))}
            />
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={isVatEnabled}
                  onChange={e => setIsVatEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary"
                />
                Apply 18% VAT (TRA Standard Rate)
              </label>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Internal Remarks</label>
              <textarea
                rows={2}
                placeholder="Log internal details or delivery instructions"
                value={newPO.notes}
                onChange={e => setNewPO(p => ({ ...p, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-darkbg-border dark:bg-darkbg-card focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Add Line Items Autocomplete Form */}
          <div className="border border-slate-200 dark:border-darkbg-border rounded-xl p-4 space-y-3 bg-slate-50/50">
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Procure Product</p>
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5 relative">
                <Input
                  label="Search Inventory Product"
                  placeholder="Type product name to search..."
                  value={productQuery}
                  onChange={e => setProductQuery(e.target.value)}
                />
                {autocompletes.length > 0 && (
                  <div className="absolute left-0 right-0 top-16 bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-lg shadow-lg z-20 overflow-hidden divide-y divide-slate-100">
                    {autocompletes.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p.id)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs flex justify-between"
                      >
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{p.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Stock: {p.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <Input label="SKU (Auto-Generated)" value={newItem.sku || ''} readOnly className="bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono cursor-not-allowed" />
              </div>
              <div className="col-span-2">
                <Input label="Quantity" type="number" min={1} value={newItem.qty_ordered || 1} onChange={e => setNewItem(p => ({ ...p, qty_ordered: Number(e.target.value) }))} />
              </div>
              <div className="col-span-2">
                <Input label="Cost (Tsh)" type="number" min={0} value={newItem.unit_cost || 0} onChange={e => setNewItem(p => ({ ...p, unit_cost: Number(e.target.value) }))} />
              </div>
              <div className="col-span-1">
                <Button
                  onClick={addLineItem}
                  disabled={!newItem.product_name?.trim() || !newItem.sku?.trim()}
                  className="h-10 w-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Added list */}
            {newPO.items.length > 0 && (
              <div className="overflow-x-auto border-t border-slate-200 pt-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase">
                      <th className="pb-2 text-left">Product / SKU</th>
                      <th className="pb-2 text-center">Qty Ordered</th>
                      <th className="pb-2 text-right">Unit Cost</th>
                      <th className="pb-2 text-right">Total Cost</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {newPO.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2">
                          <p className="font-bold text-slate-800 dark:text-white">{item.product_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="py-2 text-center font-bold">{item.qty_ordered}</td>
                        <td className="py-2 text-right text-slate-500">{fmt(item.unit_cost)}</td>
                        <td className="py-2 text-right font-black text-slate-800 dark:text-white">{fmt(item.total_cost)}</td>
                        <td className="py-2 text-center">
                          <button onClick={() => removeLineItem(idx)} className="text-slate-400 hover:text-red-500">
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PO Summary */}
          {newPO.items.length > 0 && (
            <div className="bg-slate-50 dark:bg-darkbg rounded-xl p-4 space-y-2 text-xs border border-slate-200/50">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-semibold">{fmt(poSubtotal)}</span></div>
              {isVatEnabled && <div className="flex justify-between text-slate-500"><span>VAT (18%)</span><span className="font-semibold">{fmt(poTax)}</span></div>}
              <div className="flex justify-between text-slate-800 dark:text-white font-black text-sm border-t border-slate-200 dark:border-darkbg-border pt-2">
                <span>Estimated Grand Total</span><span>{fmt(poTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* View PO Details Modal */}
      <Dialog
        isOpen={!!viewPO}
        onClose={() => setViewPO(null)}
        title={viewPO ? `Purchase Order ${viewPO.po_number}` : ''}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {viewPO && ['Draft', 'Submitted'].includes(viewPO.status) && (
                <Button variant="danger" size="sm" onClick={() => { cancelPO(viewPO.id); setViewPO(null); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel PO
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewPO(null)}>Close</Button>
              {viewPO && viewPO.status === 'Sent' && (
                <Button size="sm" onClick={() => { onViewGRNRequest(viewPO); setViewPO(null); }}>
                  <PackageCheck className="h-3.5 w-3.5 mr-1" /> Receive Goods
                </Button>
              )}
            </div>
          </div>
        }
      >
        {viewPO && (
          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400">Supplier Account</p>
                <p className="font-bold text-slate-800 dark:text-white text-sm">{viewPO.supplier_name}</p>
              </div>
              <Badge variant={PO_STATUS_CONFIG[viewPO.status].variant}>{viewPO.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-darkbg p-3 rounded-lg">
              <p className="text-slate-500"><strong>Ordered Date:</strong> {fmtDate(viewPO.created_at)}</p>
              {viewPO.expected_delivery && <p className="text-slate-500"><strong>Expected Delivery:</strong> {fmtDate(viewPO.expected_delivery)}</p>}
              <p className="text-slate-500"><strong>Payment Status:</strong> <span className="font-bold text-primary">{viewPO.payment_status}</span></p>
              <p className="text-slate-500"><strong>Ordered By:</strong> {viewPO.ordered_by}</p>
            </div>

            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:bg-darkbg/30 text-[10px] font-bold uppercase text-slate-400">
                  <th className="p-2">Product / SKU</th>
                  <th className="p-2 text-center">Qty Ordered</th>
                  <th className="p-2 text-center">Qty Received</th>
                  <th className="p-2 text-right">Unit Cost</th>
                  <th className="p-2 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {viewPO.items.map((item, i) => (
                  <tr key={i}>
                    <td className="p-2">
                      <p className="font-bold text-slate-800 dark:text-white">{item.product_name}</p>
                      <p className="text-[9px] font-mono text-slate-400">{item.sku}</p>
                    </td>
                    <td className="p-2 text-center font-bold">{item.qty_ordered}</td>
                    <td className="p-2 text-center text-slate-500">{item.qty_received}</td>
                    <td className="p-2 text-right text-slate-500">{fmt(item.unit_cost)}</td>
                    <td className="p-2 text-right font-black text-slate-800 dark:text-white">{fmt(item.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="bg-slate-50 dark:bg-darkbg rounded-xl p-4 space-y-1 text-right">
              <p className="text-slate-500">Subtotal: <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(viewPO.subtotal)}</span></p>
              <p className="text-slate-500">VAT (18%): <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(viewPO.tax_amount)}</span></p>
              <p className="text-base font-black text-slate-800 dark:text-white border-t border-slate-200 dark:border-darkbg-border pt-1">Grand Total: {fmt(viewPO.total)}</p>
            </div>

            {viewPO.notes && (
              <p className="italic text-slate-500 bg-slate-50 dark:bg-darkbg p-3 rounded-lg">"{viewPO.notes}"</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
};


// ─── GOODS RECEIVING TAB (GRN) ────────────────────────────────────────────────

const GoodsReceivingTab: React.FC<{
  grnTargetPO: PurchaseOrder | null;
  onCloseGRN: () => void;
}> = ({ grnTargetPO, onCloseGRN }) => {
  const { currentTenant, currentBranch } = useAuth();
  const allGRNs = useLiveQuery(() => db.goodsReceipts.where('tenant_id').equals(currentTenant.id).toArray()) || [];
  const warehouses = useLiveQuery(() => db.warehouses.where('tenant_id').equals(currentTenant.id).toArray()) || [];

  const [search, setSearch] = useState('');
  const [viewGRN, setViewGRN] = useState<GoodsReceipt | null>(null);

  // GRN execution state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});
  const [grnNotes, setGrnNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Pre-fill quantities when PO changes
  React.useEffect(() => {
    if (grnTargetPO) {
      const initialQtys: Record<string, number> = {};
      grnTargetPO.items.forEach(item => {
        initialQtys[item.product_id] = item.qty_ordered - item.qty_received;
      });
      setReceivedQtys(initialQtys);
      setInvoiceNumber('');
      setWarehouseId(warehouses[0]?.id || '');
      setGrnNotes('');
    }
  }, [grnTargetPO, warehouses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allGRNs.filter(g =>
      g.grn_number.toLowerCase().includes(q) ||
      g.supplier_name.toLowerCase().includes(q) ||
      (g.invoice_number || '').toLowerCase().includes(q)
    ).sort((a, b) => b.created_at - a.created_at);
  }, [allGRNs, search]);

  const handleSaveGRN = async () => {
    if (!grnTargetPO) return;
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const grnNum = `GRN-${year}-${String(allGRNs.length + 1).padStart(3, '0')}`;
      const grnId = generateId('grn');

      const grnItems: GRNItem[] = grnTargetPO.items.map(item => {
        const qtyReceived = Math.min(item.qty_ordered - item.qty_received, receivedQtys[item.product_id] || 0);
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          qty_ordered: item.qty_ordered,
          qty_received: qtyReceived,
          unit_cost: item.unit_cost,
          total_cost: qtyReceived * item.unit_cost
        };
      });

      const totalReceivedValue = grnItems.reduce((sum, item) => sum + item.total_cost, 0);
      const vatAmount = grnTargetPO.tax_amount > 0 ? Math.round(totalReceivedValue * 0.18) : 0;
      const totalInvoiceAmount = totalReceivedValue + vatAmount;

      await db.transaction('rw', [
        db.goodsReceipts, db.purchaseOrders, db.supplierInvoices, 
        db.supplierLedger, db.suppliers, db.stockLedger, db.stockBalance,
        db.products, db.productVariants
      ], async () => {
        // 1. Create GRN
        const grn: GoodsReceipt = {
          id: grnId,
          grn_number: grnNum,
          purchase_order_id: grnTargetPO.id,
          supplier_id: grnTargetPO.supplier_id,
          supplier_name: grnTargetPO.supplier_name,
          invoice_number: invoiceNumber || undefined,
          received_by: 'usr-owner', // Default owner
          status: grnItems.some(i => i.qty_received < i.qty_ordered) ? 'Partial' : 'Completed',
          items: grnItems,
          total_received_value: totalReceivedValue,
          notes: grnNotes || undefined,
          tenant_id: currentTenant.id,
          branch_id: currentBranch.id,
          created_at: Date.now()
        };
        await db.goodsReceipts.put(grn);

        // 2. Log Stock Movements for each item received
        for (const item of grnItems) {
          if (item.qty_received > 0) {
            // Use dexie's recordStockMovement logic
            await recordStockMovement({
              tenant_id: currentTenant.id,
              branch_id: currentBranch.id,
              warehouse_id: warehouseId || 'warehouse-main',
              product_id: item.product_id,
              movement_type: 'PURCHASE_RECEIVE',
              reference_type: 'GRN',
              reference_id: grnNum,
              quantity_change: item.qty_received,
              unit_cost: item.unit_cost,
              total_cost: item.total_cost,
              user_id: 'usr-owner',
              device_id: 'dev-desktop-hq'
            });
          }
        }

        // 3. Create Accounts Payable Invoice if any goods were actually received
        let invoiceId = '';
        if (totalInvoiceAmount > 0) {
          invoiceId = generateId('sinv');
          const extInvoiceNum = invoiceNumber || `BILL-${grnNum}`;
          const invoice: SupplierInvoice = {
            id: invoiceId,
            invoice_number: extInvoiceNum,
            grn_id: grnId,
            purchase_order_id: grnTargetPO.id,
            supplier_id: grnTargetPO.supplier_id,
            supplier_name: grnTargetPO.supplier_name,
            amount: totalInvoiceAmount,
            paid_amount: 0,
            balance: totalInvoiceAmount,
            due_date: Date.now() + 30 * 86400000, // 30 days due date default
            status: 'Unpaid',
            tenant_id: currentTenant.id,
            branch_id: currentBranch.id,
            created_at: Date.now()
          };
          await db.supplierInvoices.put(invoice);

          // 4. Create Supplier Accounts Payable Ledger Entry
          const supplier = await db.suppliers.get(grnTargetPO.supplier_id);
          const currentBal = supplier ? supplier.current_balance || 0 : 0;
          const newBal = currentBal + totalInvoiceAmount;

          const ledgerEntry: SupplierLedgerEntry = {
            id: generateId('sled'),
            supplier_id: grnTargetPO.supplier_id,
            transaction_type: 'Invoice',
            debit: totalInvoiceAmount,
            credit: 0,
            running_balance: newBal,
            reference_type: 'GRN',
            reference_id: grnId,
            description: `Procured items on GRN ${grnNum} (Inv: ${extInvoiceNum})`,
            created_by: 'usr-owner',
            tenant_id: currentTenant.id,
            branch_id: currentBranch.id,
            created_at: Date.now()
          };
          await db.supplierLedger.put(ledgerEntry);

          // 5. Update Supplier Outstanding balance
          await db.suppliers.update(grnTargetPO.supplier_id, {
            current_balance: newBal,
            updated_at: Date.now()
          });
        }

        // 6. Update Purchase Order item quantities and status
        const updatedItems = grnTargetPO.items.map(item => {
          const addedQty = Math.min(item.qty_ordered - item.qty_received, receivedQtys[item.product_id] || 0);
          return {
            ...item,
            qty_received: item.qty_received + addedQty
          };
        });

        const isFullyReceived = updatedItems.every(i => i.qty_received >= i.qty_ordered);
        await db.purchaseOrders.update(grnTargetPO.id, {
          items: updatedItems,
          status: isFullyReceived ? 'Completed' : 'Partial',
          grn_id: grnId,
          completed_at: isFullyReceived ? Date.now() : undefined
        });
      });

      onCloseGRN();
    } finally {
      setSaving(false);
    }
  };

  const updateQtyReceived = (pId: string, val: number) => {
    setReceivedQtys(prev => ({ ...prev, [pId]: Math.max(0, val) }));
  };

  return (
    <div className="space-y-4">
      {/* List GRNs */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Goods Receiving Notes (GRNs)</CardTitle>
            <CardDescription>Track historical supplier deliveries and inventory additions</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search GRN or invoice..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary dark:border-darkbg-border dark:bg-darkbg"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<PackageCheck className="h-6 w-6" />}
              title="No goods receipts logged"
              desc="Deliveries are registered when you receive items from an Approved Purchase Order."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/70 dark:bg-darkbg/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-3.5 pl-5">GRN Number</th>
                    <th className="p-3.5">PO Number</th>
                    <th className="p-3.5">Supplier</th>
                    <th className="p-3.5">Invoice Ref</th>
                    <th className="p-3.5 text-center">Items Received</th>
                    <th className="p-3.5">Received Value</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                  {filtered.map(grn => (
                    <tr key={grn.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors group">
                      <td className="p-3.5 pl-5 font-bold font-mono text-slate-800 dark:text-white">{grn.grn_number}</td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400 font-mono">PO#{grn.purchase_order_id.slice(-6).toUpperCase()}</td>
                      <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">{grn.supplier_name}</td>
                      <td className="p-3.5 font-mono text-slate-500">{grn.invoice_number || '—'}</td>
                      <td className="p-3.5 text-center font-bold text-slate-700 dark:text-slate-300">{grn.items.length}</td>
                      <td className="p-3.5 font-black text-slate-800 dark:text-white">{fmt(grn.total_received_value)}</td>
                      <td className="p-3.5 text-slate-400">{fmtDate(grn.created_at)}</td>
                      <td className="p-3.5 pr-5 text-right">
                        <button
                          onClick={() => setViewGRN(grn)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
                          title="View GRN items"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receive Goods Dialog */}
      <Dialog
        isOpen={!!grnTargetPO}
        onClose={onCloseGRN}
        title={grnTargetPO ? `Log Goods Receiving Note — ${grnTargetPO.po_number}` : ''}
        description="Verify physical shipment quantities and assign destination warehouses."
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={onCloseGRN} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveGRN} disabled={saving || !warehouseId || Object.values(receivedQtys).every(q => q === 0)}>
              {saving ? 'Recording inventory ledger...' : 'Receive Shipment'}
            </Button>
          </>
        }
      >
        {grnTargetPO && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Destination Warehouse *</label>
                <select
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-darkbg-border dark:bg-darkbg-card focus:outline-none"
                >
                  <option value="">— Select Warehouse —</option>
                  {warehouses.filter(w => w.status === 'Active').map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>
              <Input
                label="Supplier Invoice Number"
                placeholder="TAXINV-XXXX"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
              />
              <div className="col-span-2">
                <Input
                  label="Delivery Notes / Comments"
                  placeholder="e.g. 2 boxes slightly crushed, overall OK."
                  value={grnNotes}
                  onChange={e => setGrnNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Line items verifier */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <p className="font-bold text-slate-700">Audit Quantities</p>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-100/50 text-[10px] font-bold uppercase text-slate-400">
                    <th className="p-2.5 pl-4">Item Details</th>
                    <th className="p-2.5 text-center">Ordered</th>
                    <th className="p-2.5 text-center">Awaiting</th>
                    <th className="p-2.5 text-center pr-4">Qty Received Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grnTargetPO.items.map(item => {
                    const awaiting = item.qty_ordered - item.qty_received;
                    return (
                      <tr key={item.product_id}>
                        <td className="p-2.5 pl-4">
                          <p className="font-bold text-slate-800">{item.product_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-600">{item.qty_ordered}</td>
                        <td className="p-2.5 text-center font-semibold text-amber-500">{awaiting}</td>
                        <td className="p-2.5 pr-4 text-center">
                          <input
                            type="number"
                            min={0}
                            max={awaiting}
                            value={receivedQtys[item.product_id] ?? 0}
                            onChange={e => updateQtyReceived(item.product_id, Number(e.target.value))}
                            className="w-20 text-center h-8 rounded border border-slate-300 px-2 font-black"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Dialog>

      {/* View GRN detail */}
      <Dialog
        isOpen={!!viewGRN}
        onClose={() => setViewGRN(null)}
        title={viewGRN ? `Delivery Note: ${viewGRN.grn_number}` : ''}
        size="md"
        footer={<Button size="sm" onClick={() => setViewGRN(null)}>Close</Button>}
      >
        {viewGRN && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg text-slate-600">
              <p><strong>Supplier:</strong> {viewGRN.supplier_name}</p>
              {viewGRN.invoice_number && <p><strong>Linked Invoice:</strong> {viewGRN.invoice_number}</p>}
              <p><strong>Received Date:</strong> {fmtDate(viewGRN.created_at)}</p>
              <p><strong>Approved By:</strong> {viewGRN.received_by}</p>
            </div>

            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 font-bold uppercase text-[9px] text-slate-400">
                  <th className="p-2">Item</th>
                  <th className="p-2 text-center">Qty Received</th>
                  <th className="p-2 text-right">Cost (Tsh)</th>
                </tr>
              </thead>
              <tbody>
                {viewGRN.items.map((item, i) => (
                  <tr key={i}>
                    <td className="p-2">
                      <p className="font-bold text-slate-800">{item.product_name}</p>
                      <p className="text-[9px] text-slate-400 font-mono">{item.sku}</p>
                    </td>
                    <td className="p-2 text-center font-bold text-emerald-600">{item.qty_received}</td>
                    <td className="p-2 text-right text-slate-600">{fmt(item.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {viewGRN.notes && (
              <p className="bg-amber-50 text-amber-700 p-2.5 rounded italic">"{viewGRN.notes}"</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
};


// ─── PAYMENTS & LEDGER TAB ───────────────────────────────────────────────────

const PaymentsLedgerTab: React.FC = () => {
  const { currentTenant, currentBranch } = useAuth();
  const suppliers = useLiveQuery(
    () => currentTenant?.id ? db.suppliers.where('tenant_id').equals(currentTenant.id).toArray() : [],
    [currentTenant?.id]
  ) || [];
  const invoices = useLiveQuery(() => db.supplierInvoices.where('tenant_id').equals(currentTenant.id).toArray()) || [];
  const payments = useLiveQuery(() => db.supplierPayments.where('tenant_id').equals(currentTenant.id).toArray()) || [];
  const ledger = useLiveQuery(() => db.supplierLedger.where('tenant_id').equals(currentTenant.id).toArray()) || [];

  const [subTab, setSubTab] = useState<'invoices' | 'payments' | 'ledger'>('invoices');
  const [search, setSearch] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTargetInvoice, setPayTargetInvoice] = useState<SupplierInvoice | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtered Ledgers
  const [selectedLedgerSupplier, setSelectedLedgerSupplier] = useState<string>('');

  // Payment Form state
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'Cash' | 'MobileMoney' | 'Bank' | 'Cheque'>('Cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Pre-fill amount when pay target opens
  React.useEffect(() => {
    if (payTargetInvoice) {
      setPayAmount(payTargetInvoice.balance);
      setPayRef('');
      setPayNotes('');
    }
  }, [payTargetInvoice]);

  const filteredInvoices = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(i =>
      i.invoice_number.toLowerCase().includes(q) ||
      i.supplier_name.toLowerCase().includes(q) ||
      i.status.toLowerCase().includes(q)
    ).sort((a, b) => b.created_at - a.created_at);
  }, [invoices, search]);

  const filteredPayments = useMemo(() => {
    const q = search.toLowerCase();
    return payments.filter(p =>
      p.payment_number.toLowerCase().includes(q) ||
      p.supplier_name.toLowerCase().includes(q) ||
      p.payment_method.toLowerCase().includes(q)
    ).sort((a, b) => b.created_at - a.created_at);
  }, [payments, search]);

  const currentLedgerEntries = useMemo(() => {
    if (!selectedLedgerSupplier) return [];
    return ledger.filter(l => l.supplier_id === selectedLedgerSupplier).sort((a, b) => a.created_at - b.created_at);
  }, [ledger, selectedLedgerSupplier]);

  const openPayInvoice = (inv: SupplierInvoice) => {
    setPayTargetInvoice(inv);
    setShowPayModal(true);
  };

  const handleSavePayment = async () => {
    if (!payTargetInvoice || payAmount <= 0) return;
    if (payAmount > payTargetInvoice.balance) {
      alert('Payment amount exceeds current invoice balance.');
      return;
    }

    setSaving(true);
    try {
      const payNum = `PAY-${Date.now().toString().slice(-6)}`;
      const paymentId = generateId('spay');

      await db.transaction('rw', [
        db.supplierPayments, db.supplierInvoices, 
        db.supplierLedger, db.suppliers, db.purchaseOrders
      ], async () => {
        // 1. Create Payment record
        const payment: SupplierPayment = {
          id: paymentId,
          payment_number: payNum,
          supplier_id: payTargetInvoice.supplier_id,
          supplier_name: payTargetInvoice.supplier_name,
          invoice_id: payTargetInvoice.id,
          amount: payAmount,
          payment_method: payRef ? payMethod : 'Cash',
          reference_number: payRef || undefined,
          notes: payNotes || undefined,
          created_by: 'usr-owner',
          tenant_id: currentTenant.id,
          branch_id: currentBranch.id,
          created_at: Date.now()
        };
        await db.supplierPayments.put(payment);

        // 2. Update Invoice
        const newPaid = payTargetInvoice.paid_amount + payAmount;
        const newBal = payTargetInvoice.amount - newPaid;
        const newStatus: SupplierInvoice['status'] = newBal === 0 ? 'Paid' : 'Partial';

        await db.supplierInvoices.update(payTargetInvoice.id, {
          paid_amount: newPaid,
          balance: newBal,
          status: newStatus
        });

        // 3. Update Purchase Order Payment status
        const po = await db.purchaseOrders.get(payTargetInvoice.purchase_order_id);
        if (po) {
          // If invoice is fully paid, check other invoices or set PO to Paid
          await db.purchaseOrders.update(payTargetInvoice.purchase_order_id, {
            payment_status: newStatus === 'Paid' ? 'Paid' : 'Partial'
          });
        }

        // 4. Update Supplier Accounts Payable Ledger Entry
        const supplier = await db.suppliers.get(payTargetInvoice.supplier_id);
        const currentSupBal = supplier ? supplier.current_balance || 0 : 0;
        const newSupBal = currentSupBal - payAmount;

        const ledgerEntry: SupplierLedgerEntry = {
          id: generateId('sled'),
          supplier_id: payTargetInvoice.supplier_id,
          transaction_type: 'Payment',
          debit: 0,
          credit: payAmount,
          running_balance: newSupBal,
          reference_type: 'PAYMENT',
          reference_id: paymentId,
          description: `Settled Invoice ${payTargetInvoice.invoice_number} via ${payMethod}`,
          created_by: 'usr-owner',
          tenant_id: currentTenant.id,
          branch_id: currentBranch.id,
          created_at: Date.now()
        };
        await db.supplierLedger.put(ledgerEntry);

        // 5. Update Supplier Outstanding balance
        await db.suppliers.update(payTargetInvoice.supplier_id, {
          current_balance: newSupBal,
          updated_at: Date.now()
        });
      });

      setShowPayModal(false);
      setPayTargetInvoice(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub Tabs */}
      <div className="flex gap-2 text-xs border-b border-slate-200 dark:border-darkbg-border">
        {[
          { id: 'invoices', label: 'Supplier Invoices (Bills)' },
          { id: 'payments', label: 'Payment Transactions' },
          { id: 'ledger', label: 'Account Statement / Ledger' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as any)}
            className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
              subTab === tab.id
                ? 'border-primary text-primary dark:text-primary-dark font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Invoice list */}
      {subTab === 'invoices' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Accounts Payable Bills</CardTitle>
              <CardDescription>Verify and record cash or mobile money payments against supplier invoices</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice or vendor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredInvoices.length === 0 ? (
              <EmptyState
                icon={<Coins className="h-6 w-6" />}
                title="No supplier invoices found"
                desc="Invoices appear automatically when a Goods Receiving Note (GRN) is completed."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/70 dark:bg-darkbg/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="p-3.5 pl-5">Invoice Ref</th>
                      <th className="p-3.5">Supplier</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Paid</th>
                      <th className="p-3.5">Balance Owed</th>
                      <th className="p-3.5">Due Date</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors group">
                        <td className="p-3.5 pl-5 font-bold font-mono text-slate-800 dark:text-white">{inv.invoice_number}</td>
                        <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">{inv.supplier_name}</td>
                        <td className="p-3.5 font-bold text-slate-600">{fmt(inv.amount)}</td>
                        <td className="p-3.5 text-emerald-600 font-semibold">{fmt(inv.paid_amount)}</td>
                        <td className="p-3.5 font-black text-red-500">{fmt(inv.balance)}</td>
                        <td className="p-3.5 text-slate-400">{inv.due_date ? fmtDate(inv.due_date) : 'COD'}</td>
                        <td className="p-3.5">
                          <Badge variant={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>{inv.status}</Badge>
                        </td>
                        <td className="p-3.5 pr-5 text-right">
                          {inv.status !== 'Paid' && (
                            <Button size="sm" className="h-7 text-[10px] px-2.5" onClick={() => openPayInvoice(inv)}>
                              Pay Bill
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payments tab */}
      {subTab === 'payments' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Cash & Mobile Money Transfers</CardTitle>
              <CardDescription>Reconcile recent payouts made to suppliers</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search payment ref..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredPayments.length === 0 ? (
              <EmptyState
                icon={<History className="h-6 w-6" />}
                title="No payment records registered"
                desc="Record payments against open invoices to log outbound cash transfers."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/70 dark:bg-darkbg/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="p-3.5 pl-5">Payment Ref</th>
                      <th className="p-3.5">Supplier</th>
                      <th className="p-3.5">Method</th>
                      <th className="p-3.5 font-mono">Reference Code</th>
                      <th className="p-3.5 text-right">Amount Paid</th>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5 pr-5">Logged By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                    {filteredPayments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3.5 pl-5 font-mono font-bold text-slate-800 dark:text-white">{p.payment_number}</td>
                        <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">{p.supplier_name}</td>
                        <td className="p-3.5">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">{p.payment_method}</span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-500">{p.reference_number || '—'}</td>
                        <td className="p-3.5 text-right font-black text-emerald-600">{fmt(p.amount)}</td>
                        <td className="p-3.5 text-slate-400">{fmtDate(p.created_at)}</td>
                        <td className="p-3.5 text-slate-500">{p.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ledger Account Statement tab */}
      {subTab === 'ledger' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap border-b-0">
            <div>
              <CardTitle>Accounts Payable Ledgers</CardTitle>
              <CardDescription>Select a supplier to inspect chronological debit/credit accounts</CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedLedgerSupplier}
                onChange={e => setSelectedLedgerSupplier(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 text-xs px-3 focus:outline-none"
              >
                <option value="">— Select Supplier Ledger —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.supplier_code})</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedLedgerSupplier ? (
              <EmptyState
                icon={<FileText className="h-6 w-6" />}
                title="Select a Supplier"
                desc="Choose a vendor from the dropdown above to display their accounting statement."
              />
            ) : currentLedgerEntries.length === 0 ? (
              <EmptyState
                icon={<AlertCircle className="h-6 w-6" />}
                title="No Ledger movements logged"
                desc="Purchase or settle items to initiate accounts payable entries."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/70 dark:bg-darkbg/20 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="p-3.5 pl-5">Date</th>
                      <th className="p-3.5">Description</th>
                      <th className="p-3.5">Reference Link</th>
                      <th className="p-3.5 text-right">Debit (Owed)</th>
                      <th className="p-3.5 text-right">Credit (Paid)</th>
                      <th className="p-3.5 text-right pr-5">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                    {currentLedgerEntries.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50/50">
                        <td className="p-3.5 pl-5 text-slate-400">{fmtDate(e.created_at)}</td>
                        <td className="p-3.5">
                          <p className="font-bold text-slate-800 dark:text-white">{e.description || '—'}</p>
                          <span className="text-[10px] text-slate-400 font-mono">Type: {e.transaction_type}</span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-500">
                          {e.reference_type} #{e.reference_id?.slice(-8).toUpperCase()}
                        </td>
                        <td className="p-3.5 text-right text-red-500 font-semibold">{e.debit > 0 ? fmt(e.debit) : '—'}</td>
                        <td className="p-3.5 text-right text-emerald-600 font-semibold">{e.credit > 0 ? fmt(e.credit) : '—'}</td>
                        <td className="p-3.5 text-right pr-5 font-black text-slate-800 dark:text-white">{fmt(e.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Record Payment Dialog */}
      <Dialog
        isOpen={showPayModal}
        onClose={() => { setShowPayModal(false); setPayTargetInvoice(null); }}
        title="Record Supplier Payment"
        description="Settle bills and offset current balance in the accounts payable ledger."
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowPayModal(false); setPayTargetInvoice(null); }} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSavePayment} disabled={saving || payAmount <= 0}>
              {saving ? 'Offsetting accounts payable...' : 'Record Payment'}
            </Button>
          </>
        }
      >
        {payTargetInvoice && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 dark:bg-darkbg p-3 rounded-lg text-slate-600">
              <p><strong>Supplier:</strong> {payTargetInvoice.supplier_name}</p>
              <p><strong>Invoice Code:</strong> {payTargetInvoice.invoice_number}</p>
              <p><strong>Remaining Invoice Balance:</strong> <strong className="text-red-500">{fmt(payTargetInvoice.balance)}</strong></p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Payment Amount (Tsh) *"
                type="number"
                max={payTargetInvoice.balance}
                value={payAmount}
                onChange={e => setPayAmount(Number(e.target.value))}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Payment Method *</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value as any)}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-darkbg-border dark:bg-darkbg-card focus:outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="MobileMoney">Mobile Money</option>
                  <option value="Bank">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div className="col-span-2">
                <Input
                  label="Transaction Reference Number (e.g. M-Pesa Code / Bank Ref)"
                  placeholder="e.g. RJ828XSHS or Bank TXN-99..."
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  label="Private Payment Notes"
                  placeholder="e.g. Settle partial balance with mobile transfer"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};


// ─── WAREHOUSES TAB ───────────────────────────────────────────────────────────

const WarehousesTab: React.FC = () => {
  const { currentTenant, currentBranch } = useAuth();
  const warehouses = useLiveQuery(() => db.warehouses.where('tenant_id').equals(currentTenant.id).toArray()) || [];

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<Partial<Warehouse>>({});
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditTarget(null); setForm({ status: 'Active' }); setShowModal(true); };
  const openEdit = (w: Warehouse) => { setEditTarget(w); setForm({ ...w }); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditTarget(null); setForm({}); };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.code?.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        await db.warehouses.update(editTarget.id, { ...form });
      } else {
        const wh: Warehouse = {
          id: generateId('wh'),
          name: form.name!,
          code: form.code!.toUpperCase(),
          location: form.location || '',
          manager_name: form.manager_name || '',
          phone: form.phone,
          capacity_sqm: form.capacity_sqm,
          tenant_id: currentTenant.id,
          branch_id: currentBranch.id,
          status: (form.status as Warehouse['status']) || 'Active',
          created_at: Date.now(),
        };
        await db.warehouses.put(wh);
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Warehouse Locations</h3>
          <p className="text-xs text-slate-400">{warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''} configured</p>
        </div>
        <Button size="sm" onClick={openAdd} className="flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Warehouse
        </Button>
      </div>

      {warehouses.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<WarehouseIcon className="h-6 w-6" />}
              title="No warehouses configured"
              desc="Add warehouse locations to enable multi-location inventory adjustments and receiving."
              action={<Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add Warehouse</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in">
          {warehouses.map(wh => (
            <Card key={wh.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${wh.status === 'Active' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      <WarehouseIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 dark:text-white text-sm truncate max-w-[140px]">{wh.name}</h4>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{wh.code}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(wh)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition-colors">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                    <span>{wh.location || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>{wh.manager_name || '—'}</span>
                  </div>
                  {wh.phone && (
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{wh.phone}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-darkbg-border/30 pt-3">
                  <div>
                    {wh.capacity_sqm && (
                      <p className="text-[10px] text-slate-400">
                        <span className="font-bold text-slate-600 dark:text-slate-300">{wh.capacity_sqm.toLocaleString()} m²</span> capacity
                      </p>
                    )}
                  </div>
                  <Badge variant={wh.status === 'Active' ? 'success' : 'outline'}>{wh.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Warehouse Dialog */}
      <Dialog
        isOpen={showModal}
        onClose={closeModal}
        title={editTarget ? `Edit — ${editTarget.name}` : 'Add New Warehouse'}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name?.trim() || !form.code?.trim()}>
              {saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Add Warehouse'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input label="Warehouse Name *" placeholder="e.g. Main Distribution Center" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <Input label="Warehouse Code *" placeholder="WH-DAR-01" value={form.code || ''} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
          <Input label="Manager Name" placeholder="Full name" value={form.manager_name || ''} onChange={e => setForm(p => ({ ...p, manager_name: e.target.value }))} />
          <div className="sm:col-span-2">
            <Input label="Location / Address" placeholder="Street, City, Region" value={form.location || ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
          </div>
          <Input label="Phone" placeholder="+255 7XX XXX XXX" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          <Input label="Capacity (m²)" type="number" placeholder="e.g. 2500" value={form.capacity_sqm ?? ''} onChange={e => setForm(p => ({ ...p, capacity_sqm: Number(e.target.value) }))} />
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Status</label>
            <select
              value={form.status || 'Active'}
              onChange={e => setForm(p => ({ ...p, status: e.target.value as Warehouse['status'] }))}
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-darkbg-border dark:bg-darkbg-card focus:outline-none"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </Dialog>
    </div>
  );
};


// ─── MAIN PURCHASING VIEW ─────────────────────────────────────────────────────

type PurchasingTab = 'suppliers' | 'purchase-orders' | 'goods-receiving' | 'payments-ledger' | 'warehouses';

interface PurchasingProps {
  initialTab?: PurchasingTab;
}

export const Purchasing: React.FC<PurchasingProps> = ({ initialTab = 'suppliers' }) => {
  const { role, hasPermission } = useAuth();
  const canManagePurchasing = hasPermission('purchase.create') || hasPermission('supplier.manage');
  const [activeTab, setActiveTab] = useState<PurchasingTab>(initialTab);
  const [grnTargetPO, setGrnTargetPO] = useState<PurchaseOrder | null>(null);

  const tabs: { id: PurchasingTab; label: string; icon: React.ReactNode }[] = [
    { id: 'suppliers',       label: 'Suppliers',       icon: <Truck className="h-3.5 w-3.5" /> },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: <ShoppingCart className="h-3.5 w-3.5" /> },
    { id: 'goods-receiving', label: 'Goods Receiving (GRN)', icon: <PackageCheck className="h-3.5 w-3.5" /> },
    { id: 'payments-ledger', label: 'Payments & Ledger', icon: <Coins className="h-3.5 w-3.5" /> },
    { id: 'warehouses',      label: 'Warehouses',      icon: <WarehouseIcon className="h-3.5 w-3.5" /> },
  ];

  const handleTriggerGRN = (po: PurchaseOrder) => {
    setGrnTargetPO(po);
    setActiveTab('goods-receiving');
  };

  if (!canManagePurchasing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm animate-in fade-in duration-200">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30 text-danger mb-4 shadow-sm">
          <Lock className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-white">Permission Denied</h3>
        <p className="mt-1.5 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          Your current role (<span className="font-semibold text-primary">{role}</span>) does not have privileges to access Purchasing and Supplies.
        </p>
        <div className="mt-4 p-3 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-lg text-[10px] text-slate-400 max-w-xs leading-relaxed">
          💡 <strong>Testing Tip:</strong> Use the role switcher dropdown in the top bar to switch to a role with permission (e.g. <strong>Business Owner</strong> or <strong>Branch Manager</strong>).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Procurement & Supplier Relations</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Offline-first Supplier Relationship Management, Electronic GRN Receiving, and Accounts Payable Ledgers.
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-darkbg p-1 rounded-xl w-fit text-xs font-semibold overflow-x-auto max-w-full">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all shrink-0 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-darkbg-card text-primary dark:text-primary-dark shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in duration-200">
        {activeTab === 'suppliers'       && <SuppliersTab />}
        {activeTab === 'purchase-orders' && <PurchaseOrdersTab onViewGRNRequest={handleTriggerGRN} />}
        {activeTab === 'goods-receiving' && (
          <GoodsReceivingTab
            grnTargetPO={grnTargetPO}
            onCloseGRN={() => setGrnTargetPO(null)}
          />
        )}
        {activeTab === 'payments-ledger' && <PaymentsLedgerTab />}
        {activeTab === 'warehouses'      && <WarehousesTab />}
      </div>
    </div>
  );
};
