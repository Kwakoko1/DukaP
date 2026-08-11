import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { PharmacyPatient } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Users, Plus, Search, X, User, Phone,
  AlertTriangle, Activity, Edit3, BadgeCheck
} from 'lucide-react';

export const Patients: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId  = currentBranch?.id || '';

  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<PharmacyPatient | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'prescriptions' | 'history'>('profile');

  const [form, setForm] = useState({
    name: '', gender: 'Male' as 'Male' | 'Female' | 'Other',
    date_of_birth: '', phone: '', email: '', address: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    blood_group: '', nhif_number: '', insurance_member_no: '',
    allergies: '', chronic_diseases: '', notes: '',
  });
  const [editMode, setEditMode] = useState(false);

  const patients = useLiveQuery(() =>
    db.pharmacyPatients.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );

  const prescriptions = useLiveQuery(() =>
    db.prescriptions.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );

  const filtered = useMemo(() => {
    const list = patients || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.phone || '').includes(q) ||
      p.patient_code.toLowerCase().includes(q) ||
      (p.nhif_number || '').toLowerCase().includes(q)
    );
  }, [patients, search]);

  const selectedPrescriptions = useMemo(() =>
    selected ? (prescriptions || []).filter(rx => rx.patient_name === selected.name) : [],
    [selected, prescriptions]
  );

  const genPatientCode = () => `PAT-${Date.now().toString().slice(-6)}`;

  const handleSave = async () => {
    if (!form.name) return;
    const now = Date.now();
    const data: PharmacyPatient = {
      id: editMode && selected ? selected.id : `pat-${now}`,
      tenant_id: tenantId,
      branch_id: branchId,
      patient_code: editMode && selected ? selected.patient_code : genPatientCode(),
      name: form.name,
      gender: form.gender,
      date_of_birth: form.date_of_birth || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      emergency_contact_name: form.emergency_contact_name || undefined,
      emergency_contact_phone: form.emergency_contact_phone || undefined,
      blood_group: form.blood_group || undefined,
      nhif_number: form.nhif_number || undefined,
      insurance_member_no: form.insurance_member_no || undefined,
      allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
      chronic_diseases: form.chronic_diseases ? form.chronic_diseases.split(',').map(s => s.trim()).filter(Boolean) : [],
      notes: form.notes || undefined,
      status: 'Active',
      created_at: editMode && selected ? selected.created_at : now,
      updated_at: now,
    };
    await db.pharmacyPatients.put(data);
    setShowForm(false);
    setEditMode(false);
    setSelected(null);
    resetForm();
  };

  const resetForm = () => setForm({ name: '', gender: 'Male', date_of_birth: '', phone: '', email: '',
    address: '', emergency_contact_name: '', emergency_contact_phone: '', blood_group: '',
    nhif_number: '', insurance_member_no: '', allergies: '', chronic_diseases: '', notes: '' });

  const openEdit = (p: PharmacyPatient) => {
    setForm({
      name: p.name, gender: p.gender || 'Male', date_of_birth: p.date_of_birth || '',
      phone: p.phone || '', email: p.email || '', address: p.address || '',
      emergency_contact_name: p.emergency_contact_name || '',
      emergency_contact_phone: p.emergency_contact_phone || '',
      blood_group: p.blood_group || '', nhif_number: p.nhif_number || '',
      insurance_member_no: p.insurance_member_no || '',
      allergies: (p.allergies || []).join(', '),
      chronic_diseases: (p.chronic_diseases || []).join(', '),
      notes: p.notes || '',
    });
    setSelected(p);
    setEditMode(true);
    setShowForm(true);
  };

  const inp = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500';
  const lbl = 'block text-xs text-slate-400 mb-1 font-medium';

  const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-400" /> Patient Registry
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {(patients || []).length} registered patients · {(patients || []).filter(p => p.nhif_number).length} with NHIF
          </p>
        </div>
        <button onClick={() => { setEditMode(false); resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" /> Register Patient
        </button>
      </div>

      <div className="flex gap-4 flex-col xl:flex-row">
        {/* Patient List */}
        <div className="flex-1 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, patient code, NHIF #…"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
          </div>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No patients found</p>
                <p className="text-xs mt-1">Register your first patient to begin tracking prescriptions and history</p>
              </div>
            ) : filtered.map(p => (
              <div key={p.id}
                onClick={() => { setSelected(p); setActiveTab('profile'); }}
                className={`bg-slate-900/60 border rounded-2xl p-4 cursor-pointer hover:border-slate-600 transition-colors ${selected?.id === p.id ? 'border-sky-500/50 bg-sky-900/10' : 'border-slate-800'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                      ${p.gender === 'Male' ? 'bg-sky-500/20 text-sky-400' : p.gender === 'Female' ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-700 text-slate-400'}`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200 font-semibold text-sm">{p.name}</span>
                        {p.nhif_number && <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                        <span>{p.patient_code}</span>
                        {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                        {p.blood_group && <span className="text-red-400 font-bold">{p.blood_group}</span>}
                      </div>
                      {(p.allergies || []).length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3 text-red-400" />
                          <span className="text-xs text-red-400">Allergic: {(p.allergies || []).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-slate-300">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Patient Detail Panel */}
        {selected && (
          <div className="xl:w-96 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-800">
              {(['profile', 'prescriptions', 'history'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-3 text-xs font-semibold capitalize transition-colors ${
                    activeTab === t ? 'text-sky-400 border-b-2 border-sky-400' : 'text-slate-500 hover:text-slate-300'
                  }`}>{t}</button>
              ))}
            </div>

            {activeTab === 'profile' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold
                    ${selected.gender === 'Male' ? 'bg-sky-500/20 text-sky-400' : 'bg-pink-500/20 text-pink-400'}`}>
                    {selected.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-slate-100 font-bold">{selected.name}</p>
                    <p className="text-slate-500 text-xs">{selected.patient_code} · {selected.gender}</p>
                    {selected.blood_group && <p className="text-red-400 text-xs font-bold mt-0.5">Blood: {selected.blood_group}</p>}
                  </div>
                </div>
                {[
                  ['DOB', selected.date_of_birth || '—'],
                  ['Phone', selected.phone || '—'],
                  ['Email', selected.email || '—'],
                  ['Address', selected.address || '—'],
                  ['NHIF No.', selected.nhif_number || 'Not enrolled'],
                  ['Insurance No.', selected.insurance_member_no || '—'],
                  ['Emergency Contact', selected.emergency_contact_name ? `${selected.emergency_contact_name} (${selected.emergency_contact_phone || '—'})` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-slate-500">{k}</span>
                    <span className="text-slate-300 max-w-[60%] text-right">{v}</span>
                  </div>
                ))}
                {(selected.allergies || []).length > 0 && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <p className="text-red-400 text-xs font-bold mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> ALLERGIES</p>
                    <p className="text-red-300 text-xs">{(selected.allergies || []).join(', ')}</p>
                  </div>
                )}
                {(selected.chronic_diseases || []).length > 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-amber-400 text-xs font-bold mb-1 flex items-center gap-1"><Activity className="h-3 w-3" /> CHRONIC CONDITIONS</p>
                    <p className="text-amber-300 text-xs">{(selected.chronic_diseases || []).join(', ')}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'prescriptions' && (
              <div className="p-4 space-y-2">
                {selectedPrescriptions.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-8">No prescriptions linked to this patient</p>
                ) : selectedPrescriptions.map(rx => (
                  <div key={rx.id} className="bg-slate-800/60 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 text-xs font-semibold">{rx.prescription_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-400`}>{rx.status}</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1">Dr. {rx.doctor_name || '—'} · {rx.prescription_date}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="p-4">
                <p className="text-center text-slate-500 text-sm py-8">Purchase history will appear here once dispensing records are linked</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Patient Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <h3 className="text-slate-100 font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-sky-400" /> {editMode ? 'Edit Patient' : 'Register New Patient'}
              </h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={lbl}>Full Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} placeholder="Patient full name" />
                </div>
                <div>
                  <label className={lbl}>Gender</label>
                  <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value as any }))} className={inp}>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inp} placeholder="+255..." />
                </div>
                <div>
                  <label className={lbl}>Blood Group</label>
                  <select value={form.blood_group} onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))} className={inp}>
                    <option value="">Unknown</option>
                    {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>NHIF Number</label>
                  <input value={form.nhif_number} onChange={e => setForm(f => ({ ...f, nhif_number: e.target.value }))} className={inp} placeholder="NHIF card number" />
                </div>
                <div>
                  <label className={lbl}>Insurance Member No.</label>
                  <input value={form.insurance_member_no} onChange={e => setForm(f => ({ ...f, insurance_member_no: e.target.value }))} className={inp} placeholder="Member number" />
                </div>
              </div>
              <div>
                <label className={lbl}>Allergies (comma-separated)</label>
                <input value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} className={inp} placeholder="e.g. Penicillin, Aspirin, Sulfa" />
              </div>
              <div>
                <label className={lbl}>Chronic Diseases (comma-separated)</label>
                <input value={form.chronic_diseases} onChange={e => setForm(f => ({ ...f, chronic_diseases: e.target.value }))} className={inp} placeholder="e.g. Diabetes, Hypertension" />
              </div>
              <div>
                <label className={lbl}>Emergency Contact</label>
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} className={inp} placeholder="Contact name" />
                  <input value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} className={inp} placeholder="Contact phone" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSave}
                  className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-sm">
                  {editMode ? 'Update Patient' : 'Register Patient'}
                </button>
                <button onClick={() => { setShowForm(false); resetForm(); }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
