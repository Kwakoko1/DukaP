import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, type BusinessProfile as BPType, type Branch } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { tenantIdentifierService } from '../../services/tenantIdentifierService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Dialog } from '../UI/custom-ui';
import {
  Building, User, Shield, CreditCard, Sliders, FileText,
  AlertTriangle, Eye, Upload, Map, Sparkles, RefreshCw, Check, Zap, Plus, Edit, Trash2
} from 'lucide-react';

export const BusinessProfile: React.FC = () => {
  const { currentTenant, role, hasPermission, user } = useAuth();

  // Guard: Check View Permission
  const canView = hasPermission('business_profile.view') || ['Super Admin', 'Business Owner', 'Tenant Owner', 'Business Administrator'].includes(role);
  const canEdit = hasPermission('business_profile.edit') || ['Super Admin', 'Business Owner', 'Tenant Owner'].includes(role);

  // Active sub-tab inside Business Profile view
  const [subTab, setSubTab] = useState<'general' | 'branding' | 'financials' | 'operations' | 'compliance' | 'security'>('general');

  // Load Business Profile from IndexedDB
  const profileFromDb = useLiveQuery(() =>
    db.businessProfiles.where('tenantId').equals(currentTenant.id).first()
  );

  // Live branches from IndexedDB
  const liveBranches = useLiveQuery(
    () => db.branches.where('tenant_id').equals(currentTenant?.id || '').toArray(),
    [currentTenant?.id]
  ) || [];

  // Seed default branches into IndexedDB if empty
  useEffect(() => {
    const seedDefaultBranches = async () => {
      if (!currentTenant?.id) return;
      const existing = await db.branches.where('tenant_id').equals(currentTenant.id).toArray();
      if (existing.length === 0) {
        if (currentTenant.id === 'tenant-admin-system') {
          await db.branches.bulkPut([
            {
              id: 'branch-dar-hq',
              tenant_id: 'tenant-admin-system',
              branch_code: 'HQ-01',
              name: 'Primary Branch',
              location: 'Platform Central HQ',
              status: 'Active',
              is_headquarters: true,
              created_at: Date.now()
            }
          ]);
        } else {
          const tAny = currentTenant as any;
          const districtStr = (tAny.district || '').trim();
          const regionStr = (tAny.region || '').trim();
          const addressStr = (tAny.address || '').trim();

          let hqName = '';
          if (districtStr && regionStr) {
            hqName = `${districtStr}, ${regionStr} HQ`;
          } else if (districtStr) {
            hqName = `${districtStr} HQ`;
          } else if (regionStr) {
            hqName = `${regionStr} HQ`;
          } else {
            hqName = `${currentTenant.name || 'Main'} HQ`;
          }

          const locParts = [addressStr, districtStr, regionStr].filter(Boolean);
          const hqLocation = locParts.length > 0 ? locParts.join(', ') : 'Central HQ';

          await db.branches.bulkPut([
            {
              id: `br-${currentTenant.id}-hq`,
              tenant_id: currentTenant.id,
              branch_code: 'HQ-01',
              name: hqName,
              location: hqLocation,
              status: 'Active',
              is_headquarters: true,
              created_at: Date.now()
            }
          ]);
        }
      }
    };
    seedDefaultBranches();
  }, [currentTenant?.id, (currentTenant as any)?.region, (currentTenant as any)?.district, (currentTenant as any)?.address, currentTenant?.name]);

  // Branch Editor Modal States
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [bName, setBName] = useState('');
  const [bCode, setBCode] = useState('');
  const [bLocation, setBLocation] = useState('');
  const [bStatus, setBStatus] = useState<'Active' | 'Inactive'>('Active');
  const [bIsHq, setBIsHq] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);

  const openAddBranchModal = () => {
    setEditingBranch(null);
    setBName('');
    setBCode(`BR-${Math.floor(100 + Math.random() * 900)}`);
    setBLocation('');
    setBStatus('Active');
    setBIsHq(false);
    setIsBranchModalOpen(true);
  };

  const openEditBranchModal = (br: Branch) => {
    setEditingBranch(br);
    setBName(br.name);
    setBCode(tenantIdentifierService.getReadableBranchCode(br));
    setBLocation(br.location || '');
    setBStatus(br.status || 'Active');
    setBIsHq(Boolean(br.is_headquarters));
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName.trim() || !bCode.trim() || !currentTenant?.id) return;
    setIsSavingBranch(true);
    try {
      if (bIsHq) {
        const otherBranches = await db.branches.where('tenant_id').equals(currentTenant.id).toArray();
        for (const ob of otherBranches) {
          if (ob.is_headquarters) {
            await db.branches.put({ ...ob, is_headquarters: false });
          }
        }
      }

      if (editingBranch) {
        await db.branches.put({
          ...editingBranch,
          name: bName.trim(),
          branch_code: bCode.trim().toUpperCase(),
          location: bLocation.trim(),
          status: bStatus,
          is_headquarters: bIsHq
        });
      } else {
        const newBranchId = `branch-${currentTenant.id}-${Date.now()}`;
        await db.branches.put({
          id: newBranchId,
          tenant_id: currentTenant.id,
          branch_code: bCode.trim().toUpperCase(),
          name: bName.trim(),
          location: bLocation.trim(),
          status: bStatus,
          is_headquarters: bIsHq,
          created_at: Date.now()
        });
      }
      setIsBranchModalOpen(false);
    } catch (err) {
      console.error('Failed to save branch:', err);
      alert('Failed to save branch details.');
    } finally {
      setIsSavingBranch(false);
    }
  };

  const handleDeleteBranch = async (br: Branch) => {
    if (br.is_headquarters) {
      alert('⚠️ Cannot delete the Headquarters/Default branch.');
      return;
    }
    if (!confirm(`Are you sure you want to delete branch "${br.name}" (${tenantIdentifierService.getReadableBranchCode(br)})?`)) return;
    try {
      await db.branches.delete(br.id);
    } catch (err) {
      console.error('Failed to delete branch:', err);
    }
  };

  // Form State
  const [form, setForm] = useState<Partial<BPType>>({});
  const [addressQuery, setAddressQuery] = useState('');
  const [isSimulatingAddress, setIsSimulatingAddress] = useState(false);
  const [receiptPreviewLogo, setReceiptPreviewLogo] = useState<string | null>(null);

  // Local document upload state simulator
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { name: string; size: string; date: number }>>({});

  useEffect(() => {
    if (profileFromDb) {
      setForm(profileFromDb);
      if (profileFromDb.logoUrl) {
        setReceiptPreviewLogo(profileFromDb.logoUrl);
      }
      // Populate docs if they were simulated or stored
      const mockDocs: any = {};
      if (profileFromDb.registrationNumber) {
        mockDocs['incorporation'] = { name: 'cert_of_incorporation.pdf', size: '1.2 MB', date: Date.now() - 30 * 24 * 60 * 60 * 1000 };
      }
      if (profileFromDb.tin) {
        mockDocs['tin'] = { name: 'tin_certificate.pdf', size: '840 KB', date: Date.now() - 30 * 24 * 60 * 60 * 1000 };
      }
      if (profileFromDb.vatNumber) {
        mockDocs['vat'] = { name: 'vat_registration_cert.pdf', size: '920 KB', date: Date.now() - 30 * 24 * 60 * 60 * 1000 };
      }
      setUploadedDocs(mockDocs);
    }
  }, [profileFromDb]);

  // Expiry dates helper
  const licenses = useMemo(() => {
    const NOW = Date.now();
    const DAY = 86400000;
    return [
      { name: 'Business License', expiry: form.licenseTradeExpiry || (NOW + 15 * DAY), status: '' },
      { name: 'Pharmacy Permit', expiry: form.licensePharmacyExpiry || (NOW - 5 * DAY), status: '' },
      { name: 'Food Safety Permit', expiry: form.licenseFoodExpiry || (NOW + 45 * DAY), status: '' }
    ];
  }, [form]);

  // Compliance checker (detect missing docs)
  const missingDocs = useMemo(() => {
    const missing: string[] = [];
    if (!uploadedDocs['incorporation']) missing.push('Certificate of Incorporation');
    if (!uploadedDocs['tin']) missing.push('TIN Certificate');
    if (!uploadedDocs['vat'] && form.taxEnabled) missing.push('VAT Certificate');
    if (!uploadedDocs['license']) missing.push('Business License');
    return missing;
  }, [uploadedDocs, form.taxEnabled]);

  // Expiry notification alerts (within 30 days)
  const expiryAlerts = useMemo(() => {
    const alerts: string[] = [];
    const NOW = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    licenses.forEach(lic => {
      const remaining = lic.expiry - NOW;
      if (remaining < 0) {
        alerts.push(`⛔ EXPIRED: ${lic.name} expired ${Math.abs(Math.round(remaining / (24 * 60 * 60 * 1000)))} days ago!`);
      } else if (remaining <= THIRTY_DAYS) {
        alerts.push(`⚠️ EXPIRING SOON: ${lic.name} expires in ${Math.round(remaining / (24 * 60 * 60 * 1000))} days.`);
      }
    });

    return alerts;
  }, [licenses]);

  // TIN and VAT format validators
  const tinError = useMemo(() => {
    if (!form.tin) return '';
    const cleanTin = form.tin.replace(/[-\s]/g, '');
    if (!/^\d{9}$/.test(cleanTin)) {
      return '❌ TIN must be exactly 9 digits (Tanzanian format).';
    }
    return '';
  }, [form.tin]);

  const vatError = useMemo(() => {
    if (!form.vatNumber) return '';
    if (form.vatNumber.length < 8 || form.vatNumber.length > 15) {
      return '❌ VAT Number must be between 8 and 15 alphanumeric characters.';
    }
    return '';
  }, [form.vatNumber]);

  // Simulate Address Autocomplete
  const handleSimulateAddress = () => {
    if (!addressQuery.trim()) return;
    setIsSimulatingAddress(true);
    setTimeout(() => {
      const q = addressQuery.toLowerCase();
      let region = 'Dar es Salaam';
      let district = 'Ilala';
      let ward = 'Kariakoo';
      let street = 'Msimbazi Street';
      let lat = -6.8194;
      let lng = 39.2736;

      if (q.includes('posta') || q.includes('kivukoni')) {
        region = 'Dar es Salaam';
        district = 'Ilala';
        ward = 'Kivukoni';
        street = 'Sokoine Drive';
        lat = -6.8163;
        lng = 39.2903;
      } else if (q.includes('njiro') || q.includes('arusha')) {
        region = 'Arusha';
        district = 'Arusha City';
        ward = 'Njiro';
        street = 'Njiro Road';
        lat = -3.3984;
        lng = 36.6991;
      } else if (q.includes('sombetini')) {
        region = 'Arusha';
        district = 'Arusha City';
        ward = 'Sombetini';
        street = 'Sombetini Road';
        lat = -3.3731;
        lng = 36.6853;
      } else if (q.includes('msasani') || q.includes('slipway')) {
        region = 'Dar es Salaam';
        district = 'Kinondoni';
        ward = 'Msasani';
        street = 'Slipway Road';
        lat = -6.7483;
        lng = 39.2811;
      }

      setForm(prev => ({
        ...prev,
        region,
        district,
        ward,
        street,
        latitude: lat,
        longitude: lng,
        postalAddress: `P.O. Box 1024, ${ward}, ${region}`
      }));
      setIsSimulatingAddress(false);
      alert(`📍 Suggested Location Details loaded for "${addressQuery}"!`);
    }, 800);
  };

  // Recommends industry settings on boarding
  const handleLoadIndustryDefaults = (industry: string) => {
    if (!canEdit) return;
    let updates: Partial<BPType> = {};

    switch (industry) {
      case 'Retail':
        updates = {
          industry: 'Retail',
          taxEnabled: true,
          vatRate: 18,
          currency: 'TZS',
          dateFormat: 'DD/MM/YYYY',
          timezone: 'Africa/Dar_es_Salaam',
          receiptHeader: `${form.businessName || 'DUKAPOS SHOP'}\nRetail Outlet\nTIN: ${form.tin || '999-999-999'}`,
          receiptFooter: 'Thank you for shopping!\nPowered by DukaPos',
          defaultWarehouseId: 'wh-main'
        };
        break;
      case 'Restaurant':
        updates = {
          industry: 'Restaurant',
          taxEnabled: true,
          vatRate: 18,
          currency: 'TZS',
          dateFormat: 'DD/MM/YYYY',
          timezone: 'Africa/Dar_es_Salaam',
          receiptHeader: `${form.businessName || 'BONGO RESTAURANT'}\nWelcome & Bon Appétit!\nTel: ${form.phone || '0754 000 000'}`,
          receiptFooter: '10% Service Charge Included.\nThank you for dining with us!',
          defaultWarehouseId: 'wh-kitchen'
        };
        break;
      case 'Pharmacy':
        updates = {
          industry: 'Pharmacy',
          taxEnabled: false,
          vatRate: 0,
          currency: 'TZS',
          dateFormat: 'DD/MM/YYYY',
          timezone: 'Africa/Dar_es_Salaam',
          receiptHeader: `${form.businessName || 'ARUSHA PHARMACY'}\nRegistered Chemist & Pharmacy\nTIN: ${form.tin || '999-999-999'}`,
          receiptFooter: 'Prescribed medicines are non-returnable.\nGet well soon!',
          defaultWarehouseId: 'wh-dispensary'
        };
        break;
      case 'SACCO':
        updates = {
          industry: 'SACCO',
          taxEnabled: false,
          vatRate: 0,
          currency: 'TZS',
          dateFormat: 'DD/MM/YYYY',
          timezone: 'Africa/Dar_es_Salaam',
          receiptHeader: `${form.businessName || 'VICOBA UNION'}\nSACCO / Microfinance Ledger\nTIN: ${form.tin || '999-999-999'}`,
          receiptFooter: 'Save for your future today.\nVicoba Financial Union',
          defaultWarehouseId: 'wh-vault'
        };
        break;
      default:
        updates = {
          industry: 'Retail',
          taxEnabled: true,
          vatRate: 18
        };
    }

    setForm(prev => ({
      ...prev,
      ...updates
    }));
    alert(`💡 Configured recommended defaults for "${industry}" module!`);
  };

  // Document Upload simulator
  const handleUploadDoc = (docType: string) => {
    if (!canEdit) return;
    const files: Record<string, string> = {
      incorporation: 'certificate_of_incorporation_signed.pdf',
      tin: 'tin_certificate_tanzania.pdf',
      vat: 'vat_registration_cert_vrn.pdf',
      license: 'business_license_2026.pdf'
    };

    setUploadedDocs(prev => ({
      ...prev,
      [docType]: {
        name: files[docType] || 'document.pdf',
        size: '1.1 MB',
        date: Date.now()
      }
    }));
    alert(`✅ Uploaded document: ${files[docType] || 'document.pdf'}`);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (tinError || vatError) {
      alert('Cannot save: please resolve validation errors first.');
      return;
    }

    try {
      const id = profileFromDb?.id || `bp-${Date.now()}`;
      await db.businessProfiles.put({
        ...(profileFromDb || {}),
        ...form,
        id,
        tenantId: currentTenant.id,
        updatedAt: Date.now()
      } as BPType);

      // Log audit trail
      await db.auditLogs.add({
        id: `audit-bp-${Date.now()}`,
        tenant_id: currentTenant.id,
        user_id: user?.id || 'usr-anon',
        user_name: user?.name || 'Unknown Operator',
        action: 'UPDATE_BUSINESS_PROFILE',
        entity: 'businessProfiles',
        entity_id: id,
        metadata: { businessName: form.businessName },
        created_at: Date.now()
      });

      alert('🎉 Business Profile saved successfully!');
    } catch (e: any) {
      console.error(e);
      alert('Failed to save profile: ' + e.message);
    }
  };

  if (!canView) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-sans">
        <Shield className="mx-auto h-12 w-12 text-red-400 mb-2" />
        <h3 className="text-lg font-bold">Access Denied</h3>
        <p className="text-xs">You do not have permission to view the Business Profile module.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-4 font-sans text-xs">
      {/* ── Sub-Sidebar tab list ── */}
      <div className="md:col-span-1 space-y-1">
        <button
          onClick={() => setSubTab('general')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-2.5 border transition-all ${subTab === 'general' ? 'bg-primary border-primary text-white shadow' : 'bg-white dark:bg-darkbg-card dark:border-darkbg-border/60 hover:bg-slate-50 dark:hover:bg-darkbg text-slate-700 dark:text-slate-300 border-slate-200'}`}
        >
          <Building size={14} /> Identity & Contact
        </button>
        <button
          onClick={() => setSubTab('branding')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-2.5 border transition-all ${subTab === 'branding' ? 'bg-primary border-primary text-white shadow' : 'bg-white dark:bg-darkbg-card dark:border-darkbg-border/60 hover:bg-slate-50 dark:hover:bg-darkbg text-slate-700 dark:text-slate-300 border-slate-200'}`}
        >
          <Sparkles size={14} /> Branding & AI Profile
        </button>
        <button
          onClick={() => setSubTab('financials')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-2.5 border transition-all ${subTab === 'financials' ? 'bg-primary border-primary text-white shadow' : 'bg-white dark:bg-darkbg-card dark:border-darkbg-border/60 hover:bg-slate-50 dark:hover:bg-darkbg text-slate-700 dark:text-slate-300 border-slate-200'}`}
        >
          <CreditCard size={14} /> Tax & Financials
        </button>
        <button
          onClick={() => setSubTab('operations')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-2.5 border transition-all ${subTab === 'operations' ? 'bg-primary border-primary text-white shadow' : 'bg-white dark:bg-darkbg-card dark:border-darkbg-border/60 hover:bg-slate-50 dark:hover:bg-darkbg text-slate-700 dark:text-slate-300 border-slate-200'}`}
        >
          <Sliders size={14} /> Operations & Branches
        </button>
        <button
          onClick={() => setSubTab('compliance')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-2.5 border transition-all ${subTab === 'compliance' ? 'bg-primary border-primary text-white shadow' : 'bg-white dark:bg-darkbg-card dark:border-darkbg-border/60 hover:bg-slate-50 dark:hover:bg-darkbg text-slate-700 dark:text-slate-300 border-slate-200'}`}
        >
          <FileText size={14} /> Compliance & Docs
          {missingDocs.length > 0 && (
            <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-ping" />
          )}
        </button>
        <button
          onClick={() => setSubTab('security')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-2.5 border transition-all ${subTab === 'security' ? 'bg-primary border-primary text-white shadow' : 'bg-white dark:bg-darkbg-card dark:border-darkbg-border/60 hover:bg-slate-50 dark:hover:bg-darkbg text-slate-700 dark:text-slate-300 border-slate-200'}`}
        >
          <Shield size={14} /> SaaS & Security Settings
        </button>

        {/* Industry onboarding recommendations quick bar */}
        {canEdit && (
          <div className="mt-5 p-3 rounded-xl border border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg-card/40 space-y-2">
            <p className="font-black text-slate-600 dark:text-slate-400 text-[10px] uppercase tracking-wider">Load Recommended Defaults</p>
            <div className="grid grid-cols-2 gap-1.5">
              {['Retail', 'Restaurant', 'Pharmacy', 'SACCO'].map(ind => (
                <button
                  key={ind}
                  onClick={() => handleLoadIndustryDefaults(ind)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200/50 bg-white hover:bg-slate-50 dark:border-darkbg-border dark:bg-darkbg text-slate-700 dark:text-slate-300 font-bold transition flex items-center justify-center gap-1"
                >
                  <Zap size={10} className="text-amber-500" /> {ind}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sub-Tab Configuration panel ── */}
      <div className="md:col-span-3 space-y-5">
        {/* Expiring Alerts / Missing Docs Banners */}
        {(expiryAlerts.length > 0 || missingDocs.length > 0) && (
          <div className="space-y-2">
            {expiryAlerts.map((alert, i) => (
              <div key={i} className="p-3.5 rounded-xl border border-red-200 dark:border-red-950/40 bg-red-50 dark:bg-red-950/10 text-red-700 dark:text-red-400 font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>{alert}</span>
              </div>
            ))}
            {missingDocs.length > 0 && (
              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-950/40 bg-amber-50 dark:bg-amber-950/10 text-amber-700 dark:text-amber-400 font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 animate-bounce" />
                <div>
                  <p>⚠️ Missing compliance documents:</p>
                  <p className="text-[10px] mt-0.5 opacity-80">{missingDocs.join(', ')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <Card>
          <CardHeader className="border-b border-slate-100 dark:border-darkbg-border/30 pb-3">
            <CardTitle>
              {subTab === 'general' && 'Business Identity & Contact Details'}
              {subTab === 'branding' && 'Company Branding & AI Profile'}
              {subTab === 'financials' && 'Tax Structure & Banking Accounts'}
              {subTab === 'operations' && 'Branch Controls & System Integrations'}
              {subTab === 'compliance' && 'Compliance Documents & Licenses'}
              {subTab === 'security' && 'SaaS Parameters & Account Security'}
            </CardTitle>
            <CardDescription>
              {subTab === 'general' && 'Configure registration numbers, TIN, and physical and owner details.'}
              {subTab === 'branding' && 'Configure logos, theme colors, and AI automation recommendations.'}
              {subTab === 'financials' && 'Set currencies, VAT rules, and bank/mobile money channels.'}
              {subTab === 'operations' && 'Manage operational branches, hours, and hardware interfaces.'}
              {subTab === 'compliance' && 'Verify permits, licenses, and official incorporation attachments.'}
              {subTab === 'security' && 'Audit logs, allowed devices, and authentication policies.'}
            </CardDescription>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 px-2.5 py-1 rounded-lg font-bold border border-indigo-200/60 dark:border-indigo-900/40 flex items-center gap-1">
                🆔 Tenant ID: {tenantIdentifierService.getReadableTenantId(currentTenant)}
              </span>
              {currentTenant.business_code && (
                <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-1 rounded-lg font-bold border border-emerald-200/60 dark:border-emerald-900/40 flex items-center gap-1">
                  🏢 Business Code: {currentTenant.business_code}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            
            {/* SUBTAB 1: GENERAL IDENTITY */}
            {subTab === 'general' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Business Legal Name *</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={form.businessName || ''}
                      onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Trading Name</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={form.tradingName || ''}
                      onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Business Registration Number</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={form.registrationNumber || ''}
                      onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Business Type</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      placeholder="e.g. Sole Proprietorship, Limited Company"
                      value={form.businessType || ''}
                      onChange={e => setForm(p => ({ ...p, businessType: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">TIN / Tax Number *</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      placeholder="e.g. 123456789"
                      value={form.tin || ''}
                      onChange={e => setForm(p => ({ ...p, tin: e.target.value }))}
                      className={`h-9 w-full rounded-lg border bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none ${tinError ? 'border-red-400 focus:ring-1 focus:ring-red-400' : 'border-slate-200'}`}
                    />
                    {tinError && <p className="text-[10px] text-red-500 font-bold mt-1">{tinError}</p>}
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">VAT Registration Number (VRN)</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      placeholder="e.g. VRN-112233A"
                      value={form.vatNumber || ''}
                      onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))}
                      className={`h-9 w-full rounded-lg border bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none ${vatError ? 'border-red-400 focus:ring-1 focus:ring-red-400' : 'border-slate-200'}`}
                    />
                    {vatError && <p className="text-[10px] text-red-500 font-bold mt-1">{vatError}</p>}
                  </div>
                </div>

                {/* Simulated Maps Autocomplete address section */}
                <div className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1"><Map size={13} className="text-primary" /> Auto-complete Address via Maps</label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      disabled={!canEdit}
                      placeholder="Type a location (e.g. Posta Kivukoni, Msasani Slipway, Njiro Arusha)"
                      value={addressQuery}
                      onChange={e => setAddressQuery(e.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 focus:outline-none font-medium"
                    />
                    <Button
                      onClick={handleSimulateAddress}
                      disabled={!canEdit || isSimulatingAddress}
                      variant="primary"
                      className="h-9 text-xs flex items-center gap-1.5"
                    >
                      {isSimulatingAddress ? <RefreshCw size={12} className="animate-spin" /> : 'Search Map'}
                    </Button>
                  </div>
                  
                  <div className="grid gap-3 sm:grid-cols-4 mt-3">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold">Country</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.country || ''}
                        onChange={e => setForm(p => ({ ...p, country: e.target.value }))}
                        className="h-8 w-full rounded border border-slate-200 dark:border-darkbg-border dark:bg-darkbg px-1.5 mt-0.5 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold">Region</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.region || ''}
                        onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
                        className="h-8 w-full rounded border border-slate-200 dark:border-darkbg-border dark:bg-darkbg px-1.5 mt-0.5 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold">District</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.district || ''}
                        onChange={e => setForm(p => ({ ...p, district: e.target.value }))}
                        className="h-8 w-full rounded border border-slate-200 dark:border-darkbg-border dark:bg-darkbg px-1.5 mt-0.5 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold">Ward</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.ward || ''}
                        onChange={e => setForm(p => ({ ...p, ward: e.target.value }))}
                        className="h-8 w-full rounded border border-slate-200 dark:border-darkbg-border dark:bg-darkbg px-1.5 mt-0.5 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-slate-400 font-bold">Street & Building</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.street || ''}
                        onChange={e => setForm(p => ({ ...p, street: e.target.value }))}
                        className="h-8 w-full rounded border border-slate-200 dark:border-darkbg-border dark:bg-darkbg px-1.5 mt-0.5 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold">Latitude</label>
                      <input
                        type="number"
                        disabled={!canEdit}
                        value={form.latitude || 0}
                        onChange={e => setForm(p => ({ ...p, latitude: Number(e.target.value) }))}
                        className="h-8 w-full rounded border border-slate-200 dark:border-darkbg-border dark:bg-darkbg px-1.5 mt-0.5 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold">Longitude</label>
                      <input
                        type="number"
                        disabled={!canEdit}
                        value={form.longitude || 0}
                        onChange={e => setForm(p => ({ ...p, longitude: Number(e.target.value) }))}
                        className="h-8 w-full rounded border border-slate-200 dark:border-darkbg-border dark:bg-darkbg px-1.5 mt-0.5 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Primary Phone</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={form.phone || ''}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Primary Email</label>
                    <input
                      type="email"
                      disabled={!canEdit}
                      value={form.email || ''}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Website URL</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={form.website || ''}
                      onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Owner Information Section */}
                <div className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <h4 className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-1"><User size={13} className="text-primary" /> Owner Information</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Full Name</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.ownerName || ''}
                        onChange={e => setForm(p => ({ ...p, ownerName: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">National ID Number</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.ownerNationalId || ''}
                        onChange={e => setForm(p => ({ ...p, ownerNationalId: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Mobile Number</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.ownerMobileNumber || ''}
                        onChange={e => setForm(p => ({ ...p, ownerMobileNumber: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 2: BRANDING & SOCIAL & AI */}
            {subTab === 'branding' && (
              <div className="space-y-5">
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Left Column: Form Branding details */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="font-bold text-slate-700 dark:text-slate-300">Company Logo URL</label>
                        <div className="flex gap-2 mt-1">
                          <input
                            type="text"
                            disabled={!canEdit}
                            placeholder="https://..."
                            value={form.logoUrl || ''}
                            onChange={e => {
                              setForm(p => ({ ...p, logoUrl: e.target.value }));
                              setReceiptPreviewLogo(e.target.value);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 focus:outline-none"
                          />
                          <Button
                            onClick={() => {
                              const sampleLogo = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=100&h=100&fit=crop&q=80';
                              setForm(p => ({ ...p, logoUrl: sampleLogo }));
                              setReceiptPreviewLogo(sampleLogo);
                              alert('Sample DukaPos logo loaded!');
                            }}
                            disabled={!canEdit}
                            variant="outline"
                            className="h-9 shrink-0 px-2.5 font-bold"
                          >
                            Sample Logo
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 dark:text-slate-300">Favicon Icon URL</label>
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={form.favicon || ''}
                          onChange={e => setForm(p => ({ ...p, favicon: e.target.value }))}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 mt-1 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 dark:text-slate-300">Theme Hex Color</label>
                        <div className="flex gap-2 mt-1">
                          <input
                            type="color"
                            disabled={!canEdit}
                            value={form.themeColor || '#4f46e5'}
                            onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))}
                            className="h-9 w-10 border border-slate-200 rounded cursor-pointer p-0 bg-transparent"
                          />
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={form.themeColor || '#4f46e5'}
                            onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 dark:text-slate-300">Secondary Hex Color</label>
                        <div className="flex gap-2 mt-1">
                          <input
                            type="color"
                            disabled={!canEdit}
                            value={form.secondaryColor || '#06b6d4'}
                            onChange={e => setForm(p => ({ ...p, secondaryColor: e.target.value }))}
                            className="h-9 w-10 border border-slate-200 rounded cursor-pointer p-0 bg-transparent"
                          />
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={form.secondaryColor || '#06b6d4'}
                            onChange={e => setForm(p => ({ ...p, secondaryColor: e.target.value }))}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4 space-y-3">
                      <h4 className="font-black text-slate-800 dark:text-white flex items-center gap-1"><Sparkles size={13} className="text-primary" /> AI Profile (Personalization Engine)</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="font-bold text-slate-600 dark:text-slate-400">Business Size</label>
                          <select
                            disabled={!canEdit}
                            value={form.aiBusinessSize || 'Small'}
                            onChange={e => setForm(p => ({ ...p, aiBusinessSize: e.target.value }))}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 focus:outline-none"
                          >
                            <option value="Micro">Micro (Solo / Family shop)</option>
                            <option value="Small">Small Business (1-5 staff)</option>
                            <option value="Medium">Medium Enterprise (6-30 staff)</option>
                            <option value="Large">Large Enterprise (31+ staff)</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-bold text-slate-600 dark:text-slate-400">Total Employees</label>
                          <input
                            type="number"
                            disabled={!canEdit}
                            value={form.aiEmployeesCount || 0}
                            onChange={e => setForm(p => ({ ...p, aiEmployeesCount: Number(e.target.value) || 0 }))}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-600 dark:text-slate-400">Average Daily Sales (Tsh.)</label>
                          <input
                            type="number"
                            disabled={!canEdit}
                            value={form.aiDailySales || 0}
                            onChange={e => setForm(p => ({ ...p, aiDailySales: Number(e.target.value) || 0 }))}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 focus:outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-600 dark:text-slate-400">Peak Trading Hours</label>
                          <input
                            type="text"
                            disabled={!canEdit}
                            placeholder="e.g. 17:00 - 20:00"
                            value={form.aiPeakHours || ''}
                            onChange={e => setForm(p => ({ ...p, aiPeakHours: e.target.value }))}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Live Receipt branding preview */}
                  <div className="md:col-span-1 border border-slate-200 dark:border-darkbg-border/60 bg-slate-50 dark:bg-darkbg rounded-xl p-4 flex flex-col items-center">
                    <h5 className="font-bold text-slate-700 dark:text-slate-300 mb-3 text-center uppercase tracking-wider text-[10px]">Live Receipt Preview</h5>
                    <div className="w-full bg-white dark:bg-white text-slate-800 p-4 rounded shadow-md border-t-8 border-dashed border-slate-300 font-mono text-[9px] leading-relaxed max-w-[200px]">
                      {receiptPreviewLogo ? (
                        <div className="flex justify-center mb-2">
                          <img src={receiptPreviewLogo} alt="Receipt Logo" className="h-8 w-8 object-contain rounded-full" />
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-300 rounded p-1 mb-2 text-center text-[7px] text-slate-400">
                          [No Logo Selected]
                        </div>
                      )}
                      
                      <div className="text-center font-bold uppercase text-[10px] leading-tight">
                        {form.businessName || 'MY BUSINESS CO.'}
                      </div>
                      
                      {form.receiptHeader ? (
                        <pre className="text-center font-mono text-[7px] mt-1 whitespace-pre-line text-slate-600 leading-tight">
                          {form.receiptHeader}
                        </pre>
                      ) : (
                        <div className="text-center text-[7px] text-slate-400 my-1">
                          [Default Header]
                        </div>
                      )}
                      
                      <div className="border-t border-dashed border-slate-300 my-2" />
                      
                      <div className="flex justify-between">
                        <span>1x Premium Item</span>
                        <span>15,000</span>
                      </div>
                      <div className="flex justify-between">
                        <span>2x Variant Pack</span>
                        <span>30,000</span>
                      </div>
                      <div className="flex justify-between font-bold mt-1 text-[10px]">
                        <span>TOTAL</span>
                        <span>45,000 TZS</span>
                      </div>
                      
                      <div className="border-t border-dashed border-slate-300 my-2" />
                      
                      {form.receiptFooter ? (
                        <pre className="text-center font-mono text-[7px] whitespace-pre-line text-slate-600 leading-tight">
                          {form.receiptFooter}
                        </pre>
                      ) : (
                        <div className="text-center text-[7px] text-slate-400 mt-1">
                          Thank you for your business!
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 3: TAX & FINANCIALS */}
            {subTab === 'financials' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">VAT Status</label>
                    <select
                      disabled={!canEdit}
                      value={String(form.taxEnabled ?? false)}
                      onChange={e => setForm(p => ({ ...p, taxEnabled: e.target.value === 'true' }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                    >
                      <option value="true">Enabled (Apply default VAT to sales)</option>
                      <option value="false">Disabled (Tax-exempt / Zero-rated)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Standard VAT Rate (%)</label>
                    <input
                      type="number"
                      disabled={!canEdit || !form.taxEnabled}
                      value={form.vatRate || 0}
                      onChange={e => setForm(p => ({ ...p, vatRate: Number(e.target.value) || 0 }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Default Currency</label>
                    <select
                      disabled={!canEdit}
                      value={form.currency || 'TZS'}
                      onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                    >
                      <option value="TZS">TZS (Tanzanian Shilling)</option>
                      <option value="KES">KES (Kenyan Shilling)</option>
                      <option value="USD">USD (US Dollar)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">System Timezone</label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={form.timezone || 'Africa/Dar_es_Salaam'}
                      onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4 space-y-3">
                  <h4 className="font-black text-slate-800 dark:text-white flex items-center gap-1"><CreditCard size={13} className="text-primary" /> Banking & Mobile Money Integration</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Bank Name</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        placeholder="e.g. CRDB Bank Plc"
                        value={form.bankName || ''}
                        onChange={e => setForm(p => ({ ...p, bankName: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Account Name</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.bankAccountName || ''}
                        onChange={e => setForm(p => ({ ...p, bankAccountName: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Account Number</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.bankAccountNumber || ''}
                        onChange={e => setForm(p => ({ ...p, bankAccountNumber: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3 mt-3">
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">M-Pesa Merchant Code</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.mpesaMerchantCode || ''}
                        onChange={e => setForm(p => ({ ...p, mpesaMerchantCode: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Airtel Money Merchant Code</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.airtelMerchantCode || ''}
                        onChange={e => setForm(p => ({ ...p, airtelMerchantCode: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Tigo Pesa Merchant Code</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.tigoMerchantCode || ''}
                        onChange={e => setForm(p => ({ ...p, tigoMerchantCode: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 4: OPERATIONS & BRANCHES */}
            {subTab === 'operations' && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-black text-slate-800 dark:text-white m-0">Branches & Outlets</h4>
                    <Button
                      onClick={openAddBranchModal}
                      disabled={!canEdit}
                      variant="primary"
                      className="h-8 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={13} /> Add New Branch
                    </Button>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-darkbg border border-slate-200/50 dark:border-darkbg-border/40 rounded-xl space-y-2">
                    <div className="grid grid-cols-12 text-[10px] uppercase font-black text-slate-400 pb-1 border-b border-slate-200/30">
                      <span className="col-span-2">Branch Code</span>
                      <span className="col-span-4">Branch Name</span>
                      <span className="col-span-3">Location</span>
                      <span className="col-span-2">Status</span>
                      <span className="col-span-1 text-right">Actions</span>
                    </div>
                    {liveBranches.map((b) => (
                      <div key={b.id} className="grid grid-cols-12 items-center py-1.5 text-xs">
                        <span className="col-span-2 font-mono font-bold text-primary">{tenantIdentifierService.getReadableBranchCode(b)}</span>
                        <span className="col-span-4 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          {b.name}
                          {b.is_headquarters && (
                            <span className="text-[9px] bg-indigo-50 text-primary border border-indigo-200 px-1.5 py-0.5 rounded font-bold">Default HQ</span>
                          )}
                        </span>
                        <span className="col-span-3 text-slate-500 truncate">{b.location || '—'}</span>
                        <span className="col-span-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === 'Active'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {b.status || 'Active'}
                          </span>
                        </span>
                        <div className="col-span-1 flex items-center justify-end gap-1">
                          <button
                            title="Edit Branch Details"
                            onClick={() => openEditBranchModal(b)}
                            disabled={!canEdit}
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                          >
                            <Edit size={14} />
                          </button>
                          {!b.is_headquarters && (
                            <button
                              title="Delete Branch"
                              onClick={() => handleDeleteBranch(b)}
                              disabled={!canEdit}
                              className="p-1 text-slate-500 hover:text-red-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {liveBranches.length === 0 && (
                      <div className="text-center py-4 text-xs text-slate-400 italic">
                        No branches registered. Click "+ Add New Branch" to create one.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Daily Opening Time</label>
                    <input
                      type="time"
                      disabled={!canEdit}
                      value={form.openingTime || '08:00'}
                      onChange={e => setForm(p => ({ ...p, openingTime: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Daily Closing Time</label>
                    <input
                      type="time"
                      disabled={!canEdit}
                      value={form.closingTime || '22:00'}
                      onChange={e => setForm(p => ({ ...p, closingTime: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4 space-y-3">
                  <h4 className="font-black text-slate-800 dark:text-white">Third-Party Integrations</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">EFD Device Model</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        placeholder="e.g. Incotex 181 EFD"
                        value={form.integrationEfdDevice || ''}
                        onChange={e => setForm(p => ({ ...p, integrationEfdDevice: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">SMS Gateway Provider</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        placeholder="e.g. Beem SMS, NextSMS"
                        value={form.integrationSmsProvider || ''}
                        onChange={e => setForm(p => ({ ...p, integrationSmsProvider: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 5: COMPLIANCE & DOCS */}
            {subTab === 'compliance' && (
              <div className="space-y-5">
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white mb-2">Compliance Document Registry</h4>
                  <p className="text-[10px] text-slate-400 mb-3">Upload required regulatory attachments to clear platform validation flags.</p>
                  
                  <div className="grid gap-3">
                    {[
                      { key: 'incorporation', name: 'Certificate of Incorporation', required: true },
                      { key: 'tin', name: 'TIN Certificate', required: true },
                      { key: 'vat', name: 'VAT Registration Certificate (VRN)', required: form.taxEnabled },
                      { key: 'license', name: 'Business Trade License', required: true }
                    ].map(doc => {
                      const u = uploadedDocs[doc.key];
                      return (
                        <div key={doc.key} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg-card/20">
                          <div>
                            <span className="font-bold text-slate-700 dark:text-slate-200">{doc.name}</span>
                            {doc.required && <span className="ml-1 text-red-500 font-bold">*</span>}
                            {u ? (
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{u.name} ({u.size}) · Uploaded {new Date(u.date).toLocaleDateString()}</p>
                            ) : (
                              <p className="text-[10px] text-red-400 font-bold mt-0.5">⚠️ Missing Document</p>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            {u && (
                              <Button
                                onClick={() => alert(`Viewing file: ${u.name}`)}
                                variant="outline"
                                className="h-8 text-[10px] font-bold flex items-center gap-1"
                              >
                                <Eye size={12} /> View
                              </Button>
                            )}
                            <Button
                              onClick={() => handleUploadDoc(doc.key)}
                              disabled={!canEdit}
                              variant={u ? 'outline' : 'primary'}
                              className="h-8 text-[10px] font-bold flex items-center gap-1"
                            >
                              <Upload size={12} /> {u ? 'Replace' : 'Upload'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <h4 className="font-black text-slate-800 dark:text-white mb-2">Platform Business Permits</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">TFDA / Medical License Code</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        placeholder="e.g. TFDA-DAR-00192"
                        value={form.licenseMedical || ''}
                        onChange={e => setForm(p => ({ ...p, licenseMedical: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Pharmacy License Permit</label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.licensePharmacy || ''}
                        onChange={e => setForm(p => ({ ...p, licensePharmacy: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 6: SECURITY & SAAS DETAILS */}
            {subTab === 'security' && (
              <div className="space-y-4 text-xs font-semibold">
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white mb-2">Subscription & SaaS Limits</h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="bg-slate-50 dark:bg-darkbg p-3.5 rounded-xl border border-slate-100 dark:border-darkbg-border/30 text-center">
                      <span className="text-[10px] text-slate-400 font-bold block">Current Plan</span>
                      <span className="text-sm font-black text-primary block mt-1 uppercase">{currentTenant.plan} Plan</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-darkbg p-3.5 rounded-xl border border-slate-100 dark:border-darkbg-border/30 text-center">
                      <span className="text-[10px] text-slate-400 font-bold block">Tenant Status</span>
                      <span className="text-sm font-black text-emerald-600 block mt-1 uppercase">{currentTenant.status || 'Active'}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-darkbg p-3.5 rounded-xl border border-slate-100 dark:border-darkbg-border/30 text-center">
                      <span className="text-[10px] text-slate-400 font-bold block">Registered Branches</span>
                      <span className="text-sm font-black text-slate-800 dark:text-slate-200 block mt-1">2 / 5 Branches</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
                  <h4 className="font-black text-slate-800 dark:text-white mb-3">Security & Access Audits</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Two-Factor Authentication (2FA)</label>
                      <select
                        disabled={!canEdit}
                        value={String(form.ownerNationalId ? 'true' : 'false')}
                        onChange={() => alert('Change Two-Factor authentication in User Account settings.')}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      >
                        <option value="false">Disabled (PIN access only)</option>
                        <option value="true">Enabled (Enforce Google Authenticator OTP)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 dark:text-slate-400">Allowed Devices</label>
                      <select
                        disabled={!canEdit}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg px-2 mt-1 focus:outline-none"
                      >
                        <option value="ALL">Any terminal device (Trusted login keys only)</option>
                        <option value="PINNED">Restricted (Allow only pinned device IDs)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save Buttons at bottom */}
            {canEdit && (
              <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-darkbg-border/30 pt-4 mt-6">
                <Button
                  onClick={() => setForm(profileFromDb || {})}
                  variant="outline"
                  className="h-10 text-xs font-bold"
                >
                  Discard Changes
                </Button>
                <Button
                  onClick={handleSave}
                  variant="primary"
                  className="h-10 text-xs font-bold px-6 flex items-center gap-1.5"
                >
                  <Check size={14} /> Save Profile Details
                </Button>
              </div>
            )}

          </CardContent>
        </Card>
      </div>

      {/* Branch Edit / Create Modal */}
      <Dialog
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        title={editingBranch ? `Edit Branch: ${editingBranch.name}` : "Create New Operational Branch"}
        description="Manage branch location details, code, and headquarters status."
      >
        <form onSubmit={handleSaveBranch} className="space-y-4 pt-2 font-sans">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Branch Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Arusha Retail Branch, Mwanza City Store"
              value={bName}
              onChange={e => setBName(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Branch Code *</label>
              <input
                type="text"
                required
                placeholder="e.g. ARU-DEP, MWZ-01"
                value={bCode}
                onChange={e => setBCode(e.target.value.toUpperCase())}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <select
                value={bStatus}
                onChange={e => setBStatus(e.target.value as any)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-2 text-xs focus:outline-none"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Location / Street Address</label>
            <input
              type="text"
              placeholder="e.g. Njiro, Arusha"
              value={bLocation}
              onChange={e => setBLocation(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="branch-hq-check"
              checked={bIsHq}
              onChange={e => setBIsHq(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="branch-hq-check" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              Set as Headquarters / Primary Business Branch
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/30">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBranchModalOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSavingBranch}
              className="h-9 px-4 text-xs font-bold"
            >
              {isSavingBranch ? 'Saving...' : (editingBranch ? 'Update Branch' : 'Create Branch')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
