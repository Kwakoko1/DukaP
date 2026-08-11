import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { InsuranceClaim } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Shield, Plus, X, Search, FileText
} from 'lucide-react';

type ClaimStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Paid' | 'Cancelled';
type InsuranceTab = 'providers' | 'claims' | 'nhif';

function claimStatusColor(s: ClaimStatus) {
  switch (s) {
    case 'Submitted': return 'bg-sky-500/20 text-sky-400';
    case 'Approved':  return 'bg-emerald-500/20 text-emerald-400';
    case 'Rejected':  return 'bg-red-500/20 text-red-400';
    case 'Paid':      return 'bg-violet-500/20 text-violet-400';
    case 'Draft':     return 'bg-slate-700 text-slate-400';
    case 'Cancelled': return 'bg-slate-700 text-slate-400';
    default:          return 'bg-slate-700 text-slate-400';
  }
}

export const Insurance: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId  = currentBranch?.id || '';

  const [activeTab, setActiveTab] = useState<InsuranceTab>('providers');
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimStatusFilter, setClaimFilter] = useState<ClaimStatus | 'All'>('All');
  const [search, setSearch] = useState('');

  const [provForm, setProvForm] = useState({
    name: '', code: '', type: 'Private' as 'NHIF' | 'Private' | 'Corporate' | 'Government',
    phone: '', email: '', coverage_percentage: '80', payment_terms_days: '30',
  });

  const [claimForm, setClaimForm] = useState({
    provider_id: '', patient_name: '', insurance_member_no: '',
    claim_amount: '', notes: '',
  });

  const providers = useLiveQuery(() =>
    db.insuranceProviders.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const claims = useLiveQuery(() =>
    db.insuranceClaims.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );

  const filteredClaims = useMemo(() => {
    let list = claims || [];
    if (claimStatusFilter !== 'All') list = list.filter(c => c.status === claimStatusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.patient_name || '').toLowerCase().includes(q) ||
        (c.claim_number || '').toLowerCase().includes(q) ||
        (c.provider_name || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.created_at - a.created_at);
  }, [claims, claimStatusFilter, search]);

  const nhifClaims = useMemo(() =>
    (claims || []).filter(c => {
      const prov = (providers || []).find(p => p.id === c.provider_id);
      return prov?.type === 'NHIF';
    }), [claims, providers]
  );

  const claimKpis = useMemo(() => {
    const list = claims || [];
    return {
      total: list.length,
      submitted: list.filter(c => c.status === 'Submitted').length,
      approved: list.filter(c => c.status === 'Approved').length,
      totalValue: list.reduce((s, c) => s + c.claim_amount, 0),
      approvedValue: list.filter(c => c.status === 'Approved' || c.status === 'Paid').reduce((s, c) => s + (c.approved_amount || c.claim_amount), 0),
    };
  }, [claims]);

  const handleSaveProvider = async () => {
    if (!provForm.name || !provForm.code) return;
    const now = Date.now();
    await db.insuranceProviders.add({
      id: `ins-${now}`,
      tenant_id: tenantId,
      name: provForm.name,
      code: provForm.code,
      type: provForm.type,
      phone: provForm.phone || undefined,
      email: provForm.email || undefined,
      coverage_percentage: Number(provForm.coverage_percentage) || 80,
      payment_terms_days: Number(provForm.payment_terms_days) || 30,
      status: 'Active',
      created_at: now,
      updated_at: now,
    });
    setShowProviderForm(false);
    setProvForm({ name: '', code: '', type: 'Private', phone: '', email: '', coverage_percentage: '80', payment_terms_days: '30' });
  };

  const handleSaveClaim = async () => {
    if (!claimForm.provider_id || !claimForm.claim_amount) return;
    const provider = (providers || []).find(p => p.id === claimForm.provider_id);
    const now = Date.now();
    await db.insuranceClaims.add({
      id: `claim-${now}`,
      tenant_id: tenantId,
      branch_id: branchId,
      provider_id: claimForm.provider_id,
      provider_name: provider?.name,
      patient_name: claimForm.patient_name || undefined,
      insurance_member_no: claimForm.insurance_member_no || undefined,
      claim_amount: Number(claimForm.claim_amount) || 0,
      notes: claimForm.notes || undefined,
      status: 'Draft',
      created_at: now,
      updated_at: now,
    });
    setShowClaimForm(false);
    setClaimForm({ provider_id: '', patient_name: '', insurance_member_no: '', claim_amount: '', notes: '' });
  };

  const handleSubmitClaim = async (claim: InsuranceClaim) => {
    await db.insuranceClaims.update(claim.id, { status: 'Submitted', submitted_at: Date.now(), updated_at: Date.now() });
  };
  const handleApproveClaim = async (claim: InsuranceClaim) => {
    await db.insuranceClaims.update(claim.id, { status: 'Approved', approved_amount: claim.claim_amount, approved_at: Date.now(), updated_at: Date.now() });
  };
  const handleMarkPaid = async (claim: InsuranceClaim) => {
    await db.insuranceClaims.update(claim.id, { status: 'Paid', paid_at: Date.now(), updated_at: Date.now() });
  };

  const inp = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500';
  const lbl = 'block text-xs text-slate-400 mb-1 font-medium';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-400" /> Insurance & NHIF Management
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">{(providers || []).length} providers · {(claims || []).length} claims</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowProviderForm(true)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700">
            <Plus className="h-3.5 w-3.5" /> Provider
          </button>
          <button onClick={() => setShowClaimForm(true)}
            className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Claim
          </button>
        </div>
      </div>

      {/* Claim KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Claims',      value: claimKpis.total,                          color: 'text-slate-300' },
          { label: 'Pending',           value: claimKpis.submitted,                       color: 'text-sky-400' },
          { label: 'Approved',          value: claimKpis.approved,                        color: 'text-emerald-400' },
          { label: 'Claims Value',      value: `TZS ${(claimKpis.totalValue/1000).toFixed(0)}K`, color: 'text-violet-400' },
          { label: 'Approved Value',    value: `TZS ${(claimKpis.approvedValue/1000).toFixed(0)}K`, color: 'text-teal-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-center">
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1">
        {([
          { id: 'providers', label: 'Insurance Providers' },
          { id: 'claims', label: 'Claims Management' },
          { id: 'nhif', label: 'NHIF Claims' },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}>{label}</button>
        ))}
      </div>

      {/* Providers Tab */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(providers || []).length === 0 ? (
            <div className="col-span-3 text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">No insurance providers configured</p>
              <p className="text-xs mt-1">Add NHIF, private insurers, and corporate accounts</p>
            </div>
          ) : (providers || []).map(p => (
            <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-slate-200 font-semibold text-sm">{p.name}</p>
                  <p className="text-slate-500 text-xs">{p.code} · {p.type}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  p.type === 'NHIF' ? 'bg-emerald-500/20 text-emerald-400' :
                  p.type === 'Corporate' ? 'bg-sky-500/20 text-sky-400' :
                  'bg-violet-500/20 text-violet-400'
                }`}>{p.type}</span>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                {p.coverage_percentage && <p>Coverage: <span className="text-teal-400 font-semibold">{p.coverage_percentage}%</span></p>}
                {p.payment_terms_days && <p>Payment terms: {p.payment_terms_days} days</p>}
                {p.phone && <p>📞 {p.phone}</p>}
                {p.email && <p>✉ {p.email}</p>}
              </div>
              <p className="text-xs mt-2 text-slate-500">
                {(claims || []).filter(c => c.provider_id === p.id).length} claims
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Claims Tab */}
      {activeTab === 'claims' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by patient, claim #, provider…"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500" />
            </div>
            <select value={claimStatusFilter} onChange={e => setClaimFilter(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
              {(['All', 'Draft', 'Submitted', 'Approved', 'Rejected', 'Paid', 'Cancelled'] as const).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {filteredClaims.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No claims found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredClaims.map(claim => (
                <div key={claim.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200 font-semibold text-sm">{claim.claim_number || `CLAIM-${claim.id.slice(-6)}`}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${claimStatusColor(claim.status as ClaimStatus)}`}>{claim.status}</span>
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {claim.provider_name} · {claim.patient_name || 'Unknown Patient'} · {claim.insurance_member_no || 'No Member #'}
                      </p>
                      <p className="text-violet-400 font-bold text-sm mt-1">TZS {claim.claim_amount.toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      {claim.status === 'Draft' && (
                        <button onClick={() => handleSubmitClaim(claim)}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold">
                          Submit
                        </button>
                      )}
                      {claim.status === 'Submitted' && (
                        <button onClick={() => handleApproveClaim(claim)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold">
                          Approve
                        </button>
                      )}
                      {claim.status === 'Approved' && (
                        <button onClick={() => handleMarkPaid(claim)}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold">
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NHIF Tab */}
      {activeTab === 'nhif' && (
        <div className="space-y-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <p className="text-emerald-400 font-semibold text-sm">NHIF Claims</p>
            <p className="text-slate-400 text-xs mt-1">
              {nhifClaims.length} NHIF claims · TZS {nhifClaims.reduce((s, c) => s + c.claim_amount, 0).toLocaleString()} total
            </p>
          </div>
          {nhifClaims.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No NHIF claims. Add an NHIF provider first, then link claims to it.
            </div>
          ) : nhifClaims.map(c => (
            <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-slate-200 font-medium text-sm">{c.patient_name || 'Unknown'}</p>
                <p className="text-slate-500 text-xs">NHIF # {c.insurance_member_no || '—'} · TZS {c.claim_amount.toLocaleString()}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${claimStatusColor(c.status as ClaimStatus)}`}>{c.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add Provider Modal */}
      {showProviderForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold">Add Insurance Provider</h3>
              <button onClick={() => setShowProviderForm(false)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className={lbl}>Provider Name *</label><input value={provForm.name} onChange={e => setProvForm(f => ({ ...f, name: e.target.value }))} className={inp} placeholder="e.g. NHIF Tanzania" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Code *</label><input value={provForm.code} onChange={e => setProvForm(f => ({ ...f, code: e.target.value }))} className={inp} placeholder="e.g. NHIF" /></div>
                <div><label className={lbl}>Type</label>
                  <select value={provForm.type} onChange={e => setProvForm(f => ({ ...f, type: e.target.value as any }))} className={inp}>
                    <option>NHIF</option><option>Private</option><option>Corporate</option><option>Government</option>
                  </select>
                </div>
                <div><label className={lbl}>Coverage %</label><input type="number" value={provForm.coverage_percentage} onChange={e => setProvForm(f => ({ ...f, coverage_percentage: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Payment Terms (days)</label><input type="number" value={provForm.payment_terms_days} onChange={e => setProvForm(f => ({ ...f, payment_terms_days: e.target.value }))} className={inp} /></div>
              </div>
              <div><label className={lbl}>Phone</label><input value={provForm.phone} onChange={e => setProvForm(f => ({ ...f, phone: e.target.value }))} className={inp} /></div>
              <div><label className={lbl}>Email</label><input value={provForm.email} onChange={e => setProvForm(f => ({ ...f, email: e.target.value }))} className={inp} /></div>
              <div className="flex gap-3">
                <button onClick={handleSaveProvider} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm">Save Provider</button>
                <button onClick={() => setShowProviderForm(false)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-semibold text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Claim Modal */}
      {showClaimForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold">New Insurance Claim</h3>
              <button onClick={() => setShowClaimForm(false)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className={lbl}>Insurance Provider *</label>
                <select value={claimForm.provider_id} onChange={e => setClaimForm(f => ({ ...f, provider_id: e.target.value }))} className={inp}>
                  <option value="">Select Provider</option>
                  {(providers || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Patient Name</label><input value={claimForm.patient_name} onChange={e => setClaimForm(f => ({ ...f, patient_name: e.target.value }))} className={inp} placeholder="Patient name" /></div>
              <div><label className={lbl}>Member / Card No.</label><input value={claimForm.insurance_member_no} onChange={e => setClaimForm(f => ({ ...f, insurance_member_no: e.target.value }))} className={inp} /></div>
              <div><label className={lbl}>Claim Amount (TZS) *</label><input type="number" value={claimForm.claim_amount} onChange={e => setClaimForm(f => ({ ...f, claim_amount: e.target.value }))} className={inp} /></div>
              <div><label className={lbl}>Notes</label><textarea value={claimForm.notes} onChange={e => setClaimForm(f => ({ ...f, notes: e.target.value }))} className={`${inp} resize-none`} rows={2} /></div>
              <div className="flex gap-3">
                <button onClick={handleSaveClaim} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm">Create Claim</button>
                <button onClick={() => setShowClaimForm(false)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-semibold text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
