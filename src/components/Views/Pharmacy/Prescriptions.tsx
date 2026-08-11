import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { Prescription } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  FileText, Plus, Search, X,
  ChevronRight, User, Stethoscope, Eye
} from 'lucide-react';

type RxStatus = 'Pending' | 'Verified' | 'Dispensing' | 'Partial' | 'Completed' | 'Expired' | 'Cancelled';
const STATUS_PIPELINE: RxStatus[] = ['Pending', 'Verified', 'Dispensing', 'Partial', 'Completed'];

function statusColor(s: string) {
  switch (s) {
    case 'Completed':  return 'bg-emerald-500/20 text-emerald-400';
    case 'Dispensing': return 'bg-sky-500/20 text-sky-400';
    case 'Verified':   return 'bg-indigo-500/20 text-indigo-400';
    case 'Partial':    return 'bg-amber-500/20 text-amber-400';
    case 'Pending':    return 'bg-yellow-500/20 text-yellow-400';
    case 'Expired':    return 'bg-red-500/20 text-red-400';
    case 'Cancelled':  return 'bg-slate-600 text-slate-400';
    default:           return 'bg-slate-700 text-slate-400';
  }
}

export const Prescriptions: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId  = currentBranch?.id || '';

  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState<RxStatus | 'All'>('All');
  const [showForm, setShowForm]   = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selected, setSelected] = useState<Prescription | null>(null);

  const [form, setForm] = useState({
    patient_name: '',
    doctor_name: '',
    hospital: '',
    diagnosis: '',
    prescription_date: new Date().toISOString().split('T')[0],
    expiry_date: '',
    notes: '',
    is_repeat: false,
    refills_allowed: 1 as number | string,
  });

  const [lineItems, setLineItems] = useState<Array<{ product_name: string; qty: number | string; instructions: string; frequency: string; duration: string }>>([
    { product_name: '', qty: '', instructions: '', frequency: '', duration: '' }
  ]);

  const prescriptions = useLiveQuery(() =>
    db.prescriptions.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );

  const filtered = useMemo(() => {
    let list = prescriptions || [];
    if (statusFilter !== 'All') list = list.filter(rx => rx.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(rx =>
        rx.prescription_number.toLowerCase().includes(q) ||
        (rx.patient_name || '').toLowerCase().includes(q) ||
        (rx.doctor_name || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.created_at - a.created_at);
  }, [prescriptions, statusFilter, search]);

  const kpis = useMemo(() => {
    const list = prescriptions || [];
    return {
      total: list.length,
      pending: list.filter(r => r.status === 'Pending').length,
      dispensing: list.filter(r => r.status === 'Dispensing' || r.status === 'Partial').length,
      completed: list.filter(r => r.status === 'Completed').length,
    };
  }, [prescriptions]);

  const genRxNumber = () => `RX-${Date.now().toString().slice(-8)}`;

  const handleSaveRx = async () => {
    if (!form.prescription_date) return;
    const now = Date.now();
    const rxId = `rx-${now}`;
    const rxNum = genRxNumber();

    await db.prescriptions.add({
      id: rxId,
      tenant_id: tenantId,
      branch_id: branchId,
      prescription_number: rxNum,
      patient_name: form.patient_name || undefined,
      doctor_name: form.doctor_name || undefined,
      hospital: form.hospital || undefined,
      diagnosis: form.diagnosis || undefined,
      prescription_date: form.prescription_date,
      expiry_date: form.expiry_date || undefined,
      notes: form.notes || undefined,
      is_repeat: form.is_repeat,
      refills_allowed: Number(form.refills_allowed) || 1,
      refills_used: 0,
      status: 'Pending',
      created_by: user?.id,
      created_at: now,
      updated_at: now,
    });

    for (const item of lineItems.filter(l => l.product_name)) {
      await db.prescriptionItems.add({
        id: `rxi-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prescription_id: rxId,
        tenant_id: tenantId,
        product_id: `prod-${item.product_name.toLowerCase().replace(/\s/g, '-')}`,
        product_name: item.product_name,
        quantity_prescribed: Number(item.qty) || 1,
        quantity_dispensed: 0,
        dosage_instructions: item.instructions || undefined,
        frequency: item.frequency || undefined,
        duration: item.duration || undefined,
        status: 'Pending',
        created_at: Date.now(),
      });
    }

    setShowForm(false);
    setForm({ patient_name: '', doctor_name: '', hospital: '', diagnosis: '',
      prescription_date: new Date().toISOString().split('T')[0], expiry_date: '', notes: '',
      is_repeat: false, refills_allowed: '1' });
    setLineItems([{ product_name: '', qty: '', instructions: '', frequency: '', duration: '' }]);
  };

  const handleAdvanceStatus = async (rx: Prescription) => {
    const pipeline: RxStatus[] = ['Pending', 'Verified', 'Dispensing', 'Completed'];
    const idx = pipeline.indexOf(rx.status as any);
    if (idx < 0 || idx >= pipeline.length - 1) return;
    const next = pipeline[idx + 1];
    await db.prescriptions.update(rx.id, { status: next, updated_at: Date.now() });
  };

  const inp = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500';
  const lbl = 'block text-xs text-slate-400 mb-1 font-medium';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-400" /> Prescriptions
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">Receive, verify, and dispense prescriptions with full audit trail</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" /> New Prescription
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Prescriptions', value: kpis.total,      color: 'text-slate-300', bg: 'bg-slate-800/60' },
          { label: 'Pending Verification', value: kpis.pending,   color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
          { label: 'Being Dispensed',      value: kpis.dispensing, color: 'text-sky-400',   bg: 'bg-sky-500/10 border-sky-500/20' },
          { label: 'Completed Today',      value: kpis.completed,  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-slate-800 rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline visual */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-wider">Prescription Workflow Pipeline</p>
        <div className="flex items-center gap-2 overflow-x-auto">
          {STATUS_PIPELINE.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ${statusColor(s)}`}>
                {i + 1}. {s}
              </div>
              {i < STATUS_PIPELINE.length - 1 && <ChevronRight className="h-4 w-4 text-slate-600 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by Rx #, patient, doctor…"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatus(e.target.value as any)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
          {(['All', ...STATUS_PIPELINE, 'Expired', 'Cancelled'] as const).map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Prescriptions List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No prescriptions found</p>
            <p className="text-xs mt-1">Record incoming prescriptions from doctors or walk-in patients</p>
          </div>
        ) : filtered.map(rx => (
          <div key={rx.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                  <FileText className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200 font-semibold text-sm">{rx.prescription_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(rx.status)}`}>{rx.status}</span>
                    {rx.is_repeat && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-400">REPEAT</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {rx.patient_name || 'Walk-in'}</span>
                    <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Dr. {rx.doctor_name || 'Unknown'}</span>
                    {rx.hospital && <span>{rx.hospital}</span>}
                    <span>{rx.prescription_date}</span>
                  </div>
                  {rx.diagnosis && <p className="text-xs text-slate-500 mt-0.5">Dx: {rx.diagnosis}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setSelected(rx); setShowDetail(true); }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
                {rx.status !== 'Completed' && rx.status !== 'Cancelled' && rx.status !== 'Expired' && (
                  <button onClick={() => handleAdvanceStatus(rx)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5" /> Advance
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* New Prescription Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <h3 className="text-slate-100 font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-400" /> New Prescription
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Patient & Doctor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Patient Name</label>
                  <input value={form.patient_name} onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))} className={inp} placeholder="Patient name or Walk-in" />
                </div>
                <div>
                  <label className={lbl}>Doctor Name</label>
                  <input value={form.doctor_name} onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))} className={inp} placeholder="Dr. Name" />
                </div>
                <div>
                  <label className={lbl}>Hospital / Clinic</label>
                  <input value={form.hospital} onChange={e => setForm(f => ({ ...f, hospital: e.target.value }))} className={inp} placeholder="Hospital / Clinic" />
                </div>
                <div>
                  <label className={lbl}>Diagnosis</label>
                  <input value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} className={inp} placeholder="Diagnosis (optional)" />
                </div>
                <div>
                  <label className={lbl}>Prescription Date *</label>
                  <input type="date" value={form.prescription_date} onChange={e => setForm(f => ({ ...f, prescription_date: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className={inp} />
                </div>
              </div>

              {/* Repeat Prescription */}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_repeat" checked={form.is_repeat} onChange={e => setForm(f => ({ ...f, is_repeat: e.target.checked }))} className="w-4 h-4 accent-indigo-500" />
                <label htmlFor="is_repeat" className="text-slate-300 text-sm">Repeat Prescription</label>
                {form.is_repeat && (
                  <input type="number" value={form.refills_allowed} onChange={e => setForm(f => ({ ...f, refills_allowed: e.target.value }))}
                    className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200" placeholder="Refills" />
                )}
              </div>

              {/* Medicine Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={lbl}>Medicines Prescribed</label>
                  <button onClick={() => setLineItems(l => [...l, { product_name: '', qty: '', instructions: '', frequency: '', duration: '' }])}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add Line
                  </button>
                </div>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-2 mb-2 items-center">
                    <div className="col-span-2">
                      <input value={item.product_name} onChange={e => setLineItems(l => l.map((x, i) => i === idx ? { ...x, product_name: e.target.value } : x))}
                        className={`${inp} text-xs`} placeholder="Medicine name" />
                    </div>
                    <input type="number" value={item.qty} onChange={e => setLineItems(l => l.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))}
                      className={`${inp} text-xs`} placeholder="Qty" />
                    <input value={item.instructions} onChange={e => setLineItems(l => l.map((x, i) => i === idx ? { ...x, instructions: e.target.value } : x))}
                      className={`${inp} text-xs`} placeholder="Instructions" />
                    <button onClick={() => setLineItems(l => l.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>

              <div>
                <label className={lbl}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${inp} resize-none`} rows={2} placeholder="Additional notes" />
              </div>

              <div className="flex gap-3">
                <button onClick={handleSaveRx}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm">
                  Save Prescription
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Prescription #{selected.prescription_number}</h3>
              <button onClick={() => setShowDetail(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <div className="text-xs space-y-1">
              <p><strong>Patient:</strong> {selected.patient_name || 'N/A'}</p>
              <p><strong>Doctor:</strong> {selected.doctor_name || 'N/A'} ({selected.hospital || 'Hospital'})</p>
              <p><strong>Diagnosis:</strong> {selected.diagnosis || 'None'}</p>
              <p><strong>Date:</strong> {selected.prescription_date} (Status: {selected.status})</p>
            </div>
            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button onClick={() => setShowDetail(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
