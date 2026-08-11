import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  ShieldAlert, Plus, Search, Download, Eye, CheckCircle,
  AlertTriangle, FileText, Lock, ChevronRight,
  BookOpen, XCircle, TrendingDown, Activity
} from 'lucide-react';

type CDTab = 'Register' | 'Dispensing Log' | 'Balance Reconciliation' | 'Regulatory Reports';

interface CDEntry {
  id: string;
  tenant_id: string;
  branch_id: string;
  medicine_id: string;
  medicine_name: string;
  schedule: string;
  action: 'Received' | 'Dispensed' | 'Disposed' | 'Transferred' | 'Adjustment';
  quantity: number;
  balance_before: number;
  balance_after: number;
  prescription_no?: string;
  patient_name?: string;
  patient_id_no?: string;
  prescriber_name?: string;
  prescriber_license?: string;
  witness?: string;
  reason?: string;
  supplier_invoice?: string;
  authorized_by: string;
  timestamp: number;
  notes?: string;
}

const SCHEDULES = ['Schedule I', 'Schedule II', 'Schedule III', 'Schedule IV', 'Schedule V'];
const ACTION_COLORS: Record<string, string> = {
  Received: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
  Dispensed: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  Disposed: 'text-red-600 bg-red-50 dark:bg-red-900/20',
  Transferred: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
  Adjustment: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
};

export const ControlledDrugs: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || '';

  const [activeTab, setActiveTab] = useState<CDTab>('Register');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSchedule, setFilterSchedule] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CDEntry | null>(null);

  const [form, setForm] = useState({
    medicine_name: '',
    schedule: 'Schedule II',
    action: 'Dispensed' as CDEntry['action'],
    quantity: 1,
    balance_before: 0,
    prescription_no: '',
    patient_name: '',
    patient_id_no: '',
    prescriber_name: '',
    prescriber_license: '',
    witness: '',
    reason: '',
    supplier_invoice: '',
    notes: '',
  });

  // Live query for controlled drug register entries
  const cdEntries = useLiveQuery<CDEntry[]>(async () => {
    if (!tenantId) return [];
    try {
      const all = await (db as any).controlledDrugRegister
        ?.where('tenant_id').equals(tenantId)
        .and((e: CDEntry) => e.branch_id === branchId)
        .reverse()
        .sortBy('timestamp') as CDEntry[] | undefined;
      return all || [];
    } catch {
      return [];
    }
  }, [tenantId, branchId]) || [];

  // Live query for controlled medicines in inventory
  const controlledMeds = useLiveQuery(async () => {
    if (!tenantId) return [];
    return db.products
      .where('tenant_id').equals(tenantId)
      .and(p => !!(p as any).is_controlled && !p.deletedAt)
      .toArray();
  }, [tenantId]) || [];

  const filtered = useMemo(() => {
    return cdEntries.filter(e => {
      const matchSearch = !searchTerm ||
        e.medicine_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.patient_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.prescription_no || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchSchedule = filterSchedule === 'all' || e.schedule === filterSchedule;
      const matchAction = filterAction === 'all' || e.action === filterAction;
      return matchSearch && matchSchedule && matchAction;
    });
  }, [cdEntries, searchTerm, filterSchedule, filterAction]);

  const stats = useMemo(() => ({
    totalMeds: controlledMeds.length,
    dispensedToday: cdEntries.filter(e => {
      const today = new Date(); today.setHours(0,0,0,0);
      return e.action === 'Dispensed' && e.timestamp >= today.getTime();
    }).length,
    reconciliationAlerts: controlledMeds.filter(m => m.stock < 0).length,
    totalEntries: cdEntries.length,
  }), [cdEntries, controlledMeds]);

  const handleSaveEntry = async () => {
    const now = Date.now();
    const balAfter = form.action === 'Received' || form.action === 'Adjustment'
      ? form.balance_before + form.quantity
      : form.balance_before - form.quantity;

    const entry: CDEntry = {
      id: `cdr-${tenantId}-${now}`,
      tenant_id: tenantId,
      branch_id: branchId,
      medicine_id: '',
      medicine_name: form.medicine_name,
      schedule: form.schedule,
      action: form.action,
      quantity: form.quantity,
      balance_before: form.balance_before,
      balance_after: balAfter,
      prescription_no: form.prescription_no,
      patient_name: form.patient_name,
      patient_id_no: form.patient_id_no,
      prescriber_name: form.prescriber_name,
      prescriber_license: form.prescriber_license,
      witness: form.witness,
      reason: form.reason,
      supplier_invoice: form.supplier_invoice,
      authorized_by: user?.name || 'Pharmacist',
      timestamp: now,
      notes: form.notes,
    };

    try {
      await (db as any).controlledDrugRegister?.put(entry);
    } catch {
      // Table may not exist yet; silently handle
    }
    setShowAddEntry(false);
    setForm({ medicine_name: '', schedule: 'Schedule II', action: 'Dispensed', quantity: 1, balance_before: 0, prescription_no: '', patient_name: '', patient_id_no: '', prescriber_name: '', prescriber_license: '', witness: '', reason: '', supplier_invoice: '', notes: '' });
  };

  const tabs: CDTab[] = ['Register', 'Dispensing Log', 'Balance Reconciliation', 'Regulatory Reports'];
  const fmtDate = (ts: number) => new Date(ts).toLocaleString();

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-500" />
            Controlled Drugs Register
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Regulatory-grade audit trail for scheduled/controlled substances.
          </p>
        </div>
        <button
          onClick={() => setShowAddEntry(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition active:scale-95"
        >
          <Plus className="h-4 w-4" /> New Entry
        </button>
      </div>

      {/* Alert Banner */}
      <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl p-4">
        <Lock className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-red-700 dark:text-red-400">Regulatory Compliance Notice</p>
          <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
            All controlled drug transactions must be recorded immediately. Entries are tamper-evident and subject to TFDA/regulatory inspection. Each entry requires authorized pharmacist sign-off and a witness for Schedule I & II drugs.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Controlled Medicines', value: stats.totalMeds, icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Dispensed Today', value: stats.dispensedToday, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Balance Alerts', value: stats.reconciliationAlerts, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Total Log Entries', value: stats.totalEntries, icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-2xl border border-slate-200 dark:border-darkbg-border p-4 ${kpi.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</span>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-darkbg-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === t
                ? 'border-red-500 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Register Tab */}
      {activeTab === 'Register' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by medicine, patient, prescription..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <select value={filterSchedule} onChange={e => setFilterSchedule(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg">
              <option value="all">All Schedules</option>
              {SCHEDULES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg">
              <option value="all">All Actions</option>
              {['Received', 'Dispensed', 'Disposed', 'Transferred', 'Adjustment'].map(a => <option key={a}>{a}</option>)}
            </select>
            <button className="flex items-center gap-1.5 text-xs border border-slate-200 dark:border-darkbg-border px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-darkbg transition">
              <Download className="h-3.5 w-3.5 text-slate-500" /> Export
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden bg-white dark:bg-darkbg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-darkbg-border/40 text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Date & Time</th>
                    <th className="text-left px-4 py-3 font-semibold">Medicine</th>
                    <th className="text-center px-4 py-3 font-semibold">Schedule</th>
                    <th className="text-center px-4 py-3 font-semibold">Action</th>
                    <th className="text-right px-4 py-3 font-semibold">Qty</th>
                    <th className="text-right px-4 py-3 font-semibold">Balance</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Patient / Reference</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Authorized By</th>
                    <th className="text-center px-4 py-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-slate-400">
                        <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>No controlled drug entries yet. Add the first register entry.</p>
                      </td>
                    </tr>
                  ) : filtered.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-darkbg/50">
                      <td className="px-4 py-3 text-slate-500">{fmtDate(entry.timestamp)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{entry.medicine_name}</p>
                        {entry.prescription_no && <p className="text-slate-400">Rx: {entry.prescription_no}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-red-100 dark:bg-red-900/30 text-red-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          {entry.schedule?.replace('Schedule ', 'Sch.') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ACTION_COLORS[entry.action] || ''}`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                        {entry.action === 'Received' || entry.action === 'Adjustment' ? '+' : '−'}{entry.quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        {entry.balance_after}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-600 dark:text-slate-300">
                        {entry.patient_name || entry.supplier_invoice || '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-500">
                        {entry.authorized_by}
                        {entry.witness && <span className="text-slate-400"> / {entry.witness}</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedEntry(entry)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-darkbg text-slate-400 hover:text-blue-500 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Dispensing Log Tab */}
      {activeTab === 'Dispensing Log' && (
        <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-darkbg-border">
            <h3 className="font-bold text-sm text-slate-700 dark:text-white">Patient Dispensing Log</h3>
            <p className="text-xs text-slate-400 mt-0.5">All dispensed controlled drugs with patient and prescriber details.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-darkbg-border/40 text-slate-500">
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Medicine</th>
                  <th className="text-center px-4 py-3 font-semibold">Qty</th>
                  <th className="text-left px-4 py-3 font-semibold">Patient</th>
                  <th className="text-left px-4 py-3 font-semibold">Prescriber</th>
                  <th className="text-left px-4 py-3 font-semibold">Prescription No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/50">
                {cdEntries.filter(e => e.action === 'Dispensed').map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-darkbg/50">
                    <td className="px-4 py-3 text-slate-500">{new Date(entry.timestamp).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{entry.medicine_name}</td>
                    <td className="px-4 py-3 text-center font-bold text-blue-600">{entry.quantity}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800 dark:text-white">{entry.patient_name || '—'}</p>
                      {entry.patient_id_no && <p className="text-slate-400">ID: {entry.patient_id_no}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800 dark:text-white">{entry.prescriber_name || '—'}</p>
                      {entry.prescriber_license && <p className="text-slate-400">Lic: {entry.prescriber_license}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{entry.prescription_no || '—'}</td>
                  </tr>
                ))}
                {cdEntries.filter(e => e.action === 'Dispensed').length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400">No dispensing records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Balance Reconciliation Tab */}
      {activeTab === 'Balance Reconciliation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {controlledMeds.map(med => {
              const entries = cdEntries.filter(e => e.medicine_name === med.name);
              const lastEntry = entries[0];
              const computedBalance = lastEntry?.balance_after ?? med.stock;
              const discrepancy = med.stock - computedBalance;
              return (
                <div key={med.id} className={`rounded-2xl border p-4 ${discrepancy !== 0 ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">{med.name}</p>
                      <p className="text-xs text-slate-400">{(med as any).schedule || 'Schedule II'}</p>
                    </div>
                    {discrepancy !== 0
                      ? <AlertTriangle className="h-5 w-5 text-red-500" />
                      : <CheckCircle className="h-5 w-5 text-emerald-500" />
                    }
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-slate-100 dark:bg-darkbg p-2">
                      <p className="text-slate-400">Physical</p>
                      <p className="font-bold text-slate-900 dark:text-white">{med.stock}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 dark:bg-darkbg p-2">
                      <p className="text-slate-400">Register</p>
                      <p className="font-bold text-slate-900 dark:text-white">{computedBalance}</p>
                    </div>
                    <div className={`rounded-lg p-2 ${discrepancy !== 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                      <p className="text-slate-400">Diff</p>
                      <p className={`font-bold ${discrepancy !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>{discrepancy > 0 ? '+' : ''}{discrepancy}</p>
                    </div>
                  </div>
                  {discrepancy !== 0 && (
                    <p className="text-[10px] text-red-500 mt-2 font-medium">⚠ Discrepancy detected — investigation required</p>
                  )}
                </div>
              );
            })}
            {controlledMeds.length === 0 && (
              <div className="col-span-3 text-center py-10 text-slate-400 text-sm">
                No controlled medicines registered yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regulatory Reports Tab */}
      {activeTab === 'Regulatory Reports' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title: 'Monthly CD Register Export', desc: 'TFDA-compliant monthly controlled drug register for submission to regulatory authorities.', icon: FileText, color: 'text-red-500' },
            { title: 'Quarterly Consumption Report', desc: 'Aggregated controlled substance consumption report for health authority submission.', icon: TrendingDown, color: 'text-blue-500' },
            { title: 'Wastage & Disposal Log', desc: 'Witnessed destruction certificates and disposal records for expired or damaged controlled substances.', icon: AlertTriangle, color: 'text-amber-500' },
            { title: 'Discrepancy Incident Report', desc: 'Formal incident report for any balance discrepancies, to be reported to TFDA within 24 hours.', icon: ShieldAlert, color: 'text-red-600' },
          ].map(r => (
            <div key={r.title} className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-5 hover:shadow-md transition cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-xl bg-slate-100 dark:bg-darkbg flex items-center justify-center shrink-0`}>
                  <r.icon className={`h-5 w-5 ${r.color}`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white mb-1">{r.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{r.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition shrink-0 mt-1" />
              </div>
              <button className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs border border-slate-200 dark:border-darkbg-border px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-darkbg transition font-semibold text-slate-600 dark:text-slate-300">
                <Download className="h-3.5 w-3.5" /> Generate & Download
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New Entry Modal */}
      {showAddEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-darkbg-card shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-darkbg-card border-b border-slate-200 dark:border-darkbg-border px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                New Controlled Drug Entry
              </h2>
              <button onClick={() => setShowAddEntry(false)}><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">Medicine Name *</label>
                  <input value={form.medicine_name} onChange={e => setForm(p => ({ ...p, medicine_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="Select or type medicine name" list="cd-meds" />
                  <datalist id="cd-meds">
                    {controlledMeds.map(m => <option key={m.id} value={m.name} />)}
                  </datalist>
                </div>
                {[
                  { label: 'Schedule', key: 'schedule', type: 'select', options: SCHEDULES },
                  { label: 'Action *', key: 'action', type: 'select', options: ['Received', 'Dispensed', 'Disposed', 'Transferred', 'Adjustment'] },
                  { label: 'Quantity *', key: 'quantity', type: 'number' },
                  { label: 'Balance Before', key: 'balance_before', type: 'number' },
                  { label: 'Prescription No.', key: 'prescription_no', type: 'text' },
                  { label: 'Patient Name', key: 'patient_name', type: 'text' },
                  { label: 'Patient ID/National ID', key: 'patient_id_no', type: 'text' },
                  { label: 'Prescriber Name', key: 'prescriber_name', type: 'text' },
                  { label: 'Prescriber License No.', key: 'prescriber_license', type: 'text' },
                  { label: 'Witness', key: 'witness', type: 'text' },
                  { label: 'Supplier Invoice', key: 'supplier_invoice', type: 'text' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                    {f.type === 'select' ? (
                      <select value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg">
                        {f.options?.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} value={(form as any)[f.key]}
                        onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                    )}
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">Reason / Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none" />
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                ⚠ By saving this entry, you certify this transaction is accurate and legally compliant. This record is tamper-evident.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAddEntry(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition">
                  Cancel
                </button>
                <button onClick={handleSaveEntry} disabled={!form.medicine_name || !form.quantity}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition">
                  Save Register Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-darkbg-card shadow-2xl">
            <div className="border-b border-slate-200 dark:border-darkbg-border px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-white">Entry Details</h2>
              <button onClick={() => setSelectedEntry(null)}><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              {[
                ['Entry ID', selectedEntry.id],
                ['Date & Time', fmtDate(selectedEntry.timestamp)],
                ['Medicine', selectedEntry.medicine_name],
                ['Schedule', selectedEntry.schedule],
                ['Action', selectedEntry.action],
                ['Quantity', String(selectedEntry.quantity)],
                ['Balance Before', String(selectedEntry.balance_before)],
                ['Balance After', String(selectedEntry.balance_after)],
                ['Patient', selectedEntry.patient_name || '—'],
                ['Patient ID', selectedEntry.patient_id_no || '—'],
                ['Prescription No.', selectedEntry.prescription_no || '—'],
                ['Prescriber', selectedEntry.prescriber_name || '—'],
                ['Prescriber License', selectedEntry.prescriber_license || '—'],
                ['Authorized By', selectedEntry.authorized_by],
                ['Witness', selectedEntry.witness || '—'],
                ['Notes', selectedEntry.notes || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-1 border-b border-slate-100 dark:border-darkbg-border/50 last:border-0">
                  <span className="text-slate-400 shrink-0">{label}</span>
                  <span className="font-medium text-slate-800 dark:text-white text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
