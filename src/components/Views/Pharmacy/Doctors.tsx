import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { PharmacyDoctor } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Stethoscope, Plus, Search, X, Edit3, FileText, BadgeCheck, Activity
} from 'lucide-react';

const SPECIALTIES = [
  'General Medicine', 'Internal Medicine', 'Pediatrics', 'Obstetrics & Gynecology',
  'Surgery', 'Orthopedics', 'Cardiology', 'Neurology', 'Oncology',
  'Dermatology', 'Ophthalmology', 'ENT', 'Psychiatry', 'Radiology', 'Other'
];

export const Doctors: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id || '';

  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', registration_number: '', specialty: 'General Medicine',
    hospital: '', clinic: '', phone: '', email: '', address: '', notes: '',
  });

  const doctors = useLiveQuery(() =>
    db.pharmacyDoctors.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );
  const prescriptions = useLiveQuery(() =>
    db.prescriptions.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );

  const filtered = useMemo(() => {
    const list = doctors || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.registration_number.toLowerCase().includes(q) ||
      (d.specialty || '').toLowerCase().includes(q) ||
      (d.hospital || '').toLowerCase().includes(q)
    );
  }, [doctors, search]);

  const rxCountByDoctor = useMemo(() => {
    const map: Record<string, number> = {};
    (prescriptions || []).forEach(rx => {
      const k = rx.doctor_name || '';
      if (k) map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [prescriptions]);

  const topDoctors = useMemo(() => {
    return [...(doctors || [])].sort((a, b) =>
      (rxCountByDoctor[b.name] || 0) - (rxCountByDoctor[a.name] || 0)
    ).slice(0, 3);
  }, [doctors, rxCountByDoctor]);

  const handleSave = async () => {
    if (!form.name || !form.registration_number) return;
    const now = Date.now();
    const data: PharmacyDoctor = {
      id: editId || `doc-${now}`,
      tenant_id: tenantId,
      registration_number: form.registration_number,
      name: form.name,
      specialty: form.specialty || undefined,
      hospital: form.hospital || undefined,
      clinic: form.clinic || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      notes: form.notes || undefined,
      status: 'Active',
      created_at: now,
      updated_at: now,
    };
    await db.pharmacyDoctors.put(data);
    setShowForm(false);
    setEditId(null);
    resetForm();
  };

  const resetForm = () => setForm({ name: '', registration_number: '', specialty: 'General Medicine',
    hospital: '', clinic: '', phone: '', email: '', address: '', notes: '' });

  const openEdit = (d: PharmacyDoctor) => {
    setForm({ name: d.name, registration_number: d.registration_number, specialty: d.specialty || 'General Medicine',
      hospital: d.hospital || '', clinic: d.clinic || '', phone: d.phone || '',
      email: d.email || '', address: d.address || '', notes: d.notes || '' });
    setEditId(d.id);
    setShowForm(true);
  };

  const inp = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500';
  const lbl = 'block text-xs text-slate-400 mb-1 font-medium';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-rose-400" /> Doctors & Healthcare Providers
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">{(doctors || []).length} registered doctors</p>
        </div>
        <button onClick={() => { setEditId(null); resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Doctor
        </button>
      </div>

      {/* Top Prescribers */}
      {topDoctors.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-wider">Top Prescribers</p>
          <div className="grid grid-cols-3 gap-3">
            {topDoctors.map((d, i) => (
              <div key={d.id} className="text-center p-3 bg-slate-800/60 rounded-xl">
                <div className="text-2xl font-bold text-rose-400">#{i + 1}</div>
                <div className="text-slate-200 text-sm font-semibold mt-1">{d.name}</div>
                <div className="text-slate-500 text-xs">{d.specialty || '—'}</div>
                <div className="text-emerald-400 text-xs mt-1">{rxCountByDoctor[d.name] || 0} prescriptions</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, registration #, specialty, hospital…"
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500" />
      </div>

      {/* Doctors Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
          <Stethoscope className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No doctors registered</p>
          <p className="text-xs mt-1">Add doctor profiles to link them to prescriptions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(d => (
            <div key={d.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold">
                    {d.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-200 font-semibold text-sm">{d.name}</span>
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <p className="text-slate-500 text-xs">{d.registration_number}</p>
                  </div>
                </div>
                <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-slate-300">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1.5 text-xs">
                {d.specialty && (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Activity className="h-3 w-3" /> {d.specialty}
                  </div>
                )}
                {d.hospital && <p className="text-slate-500">🏥 {d.hospital}</p>}
                {d.phone && <p className="text-slate-500">📞 {d.phone}</p>}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {rxCountByDoctor[d.name] || 0} prescriptions
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {d.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900">
              <h3 className="text-slate-100 font-semibold">{editId ? 'Edit Doctor' : 'Add Doctor'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={lbl}>Full Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} placeholder="Dr. Full Name" />
                </div>
                <div>
                  <label className={lbl}>Registration # *</label>
                  <input value={form.registration_number} onChange={e => setForm(f => ({ ...f, registration_number: e.target.value }))} className={inp} placeholder="Medical Board Reg #" />
                </div>
                <div>
                  <label className={lbl}>Specialty</label>
                  <select value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} className={inp}>
                    {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Hospital</label>
                  <input value={form.hospital} onChange={e => setForm(f => ({ ...f, hospital: e.target.value }))} className={inp} placeholder="Hospital name" />
                </div>
                <div>
                  <label className={lbl}>Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inp} placeholder="+255..." />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSave} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold text-sm">
                  {editId ? 'Update' : 'Add Doctor'}
                </button>
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm">
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
