import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LegalRetainer } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { DollarSign, Clock, Wallet } from 'lucide-react';
import { Badge } from '../../UI/custom-ui';
import { createTimeEntry } from '../../../services/lawFirm/legalBillingEngine';

export const LegalBilling: React.FC = () => {
  const { currentTenant, user } = useAuth();
  const tenantId = currentTenant?.id || '';

  const [activeTab, setActiveTab] = useState<'TIME_TRACKING' | 'RETAINERS'>('TIME_TRACKING');
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [isRetainerModalOpen, setIsRetainerModalOpen] = useState(false);

  // Time Entry Form
  const [caseId, setCaseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [hourlyRate, setHourlyRate] = useState(150000); // TZS 150,000 / hr default
  const [description, setDescription] = useState('');

  // Retainer Form
  const [clientId, setClientId] = useState('');
  const [depositAmount, setDepositAmount] = useState(1000000); // TZS 1,000,000 default
  const [minThreshold, setMinThreshold] = useState(300000); // TZS 300,000 default threshold

  const timeEntries = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalTimeEntries.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const retainers = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalRetainers.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const cases = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalCases.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const clients = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalClients.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const handleCreateTimeEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || durationMinutes <= 0) {
      alert('Case and valid Duration are required.');
      return;
    }

    const newEntry = createTimeEntry(
      tenantId,
      caseId,
      user?.id || 'lawyer-1',
      user?.name || 'Advocate',
      date,
      Number(durationMinutes),
      Number(hourlyRate),
      description
    );

    await db.legalTimeEntries.add(newEntry);
    setIsTimeModalOpen(false);
    setDescription('');
  };

  const handleCreateRetainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || depositAmount <= 0) {
      alert('Client and Deposit Amount are required.');
      return;
    }

    const existing = retainers.find(r => r.client_id === clientId);
    if (existing) {
      const newBal = existing.current_balance + Number(depositAmount);
      await db.legalRetainers.update(existing.id, {
        total_deposited: existing.total_deposited + Number(depositAmount),
        current_balance: newBal,
        status: newBal < existing.minimum_threshold ? 'Low Balance' : 'Active',
        updated_at: Date.now()
      });
    } else {
      const newRetainer: LegalRetainer = {
        id: `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenant_id: tenantId,
        client_id: clientId,
        total_deposited: Number(depositAmount),
        current_balance: Number(depositAmount),
        minimum_threshold: Number(minThreshold),
        status: 'Active',
        updated_at: Date.now()
      };
      await db.legalRetainers.add(newRetainer);
    }

    setIsRetainerModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-indigo-600" />
            Legal Billing, Time Entries & Retainers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Hourly time tracking, billable calculations, client retainer accounts, and threshold monitoring.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsTimeModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0"
          >
            <Clock size={15} />
            <span>Log Time Entry</span>
          </button>

          <button
            onClick={() => setIsRetainerModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0"
          >
            <Wallet size={15} />
            <span>Deposit Retainer</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-darkbg-border pb-3">
        <button
          onClick={() => setActiveTab('TIME_TRACKING')}
          className={`px-4 py-2 rounded-xl text-xs font-bold ${activeTab === 'TIME_TRACKING' ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600'}`}
        >
          Time Tracking Logs ({timeEntries.length})
        </button>
        <button
          onClick={() => setActiveTab('RETAINERS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold ${activeTab === 'RETAINERS' ? 'bg-purple-600 text-white' : 'bg-white border text-slate-600'}`}
        >
          Client Retainer Accounts ({retainers.length})
        </button>
      </div>

      {/* TAB 1: TIME TRACKING */}
      {activeTab === 'TIME_TRACKING' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5 pl-6">Date</th>
                  <th className="p-3.5">Lawyer</th>
                  <th className="p-3.5">Description</th>
                  <th className="p-3.5">Duration</th>
                  <th className="p-3.5">Hourly Rate</th>
                  <th className="p-3.5">Billable Amount</th>
                  <th className="p-3.5 pr-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
                {timeEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                      No time entries logged yet. Click &quot;Log Time Entry&quot;.
                    </td>
                  </tr>
                ) : (
                  timeEntries.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-3.5 pl-6 font-mono text-slate-500">{t.date}</td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">{t.lawyer_name}</td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-300">{t.description || 'Legal consultation/work'}</td>
                      <td className="p-3.5 font-semibold text-slate-700">{t.duration_minutes} mins</td>
                      <td className="p-3.5 text-slate-500 font-mono">TZS {t.hourly_rate.toLocaleString()}</td>
                      <td className="p-3.5 font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                        TZS {(t.billable_amount || 0).toLocaleString()}
                      </td>
                      <td className="p-3.5 pr-6 text-right">
                        <Badge variant={t.is_billed ? 'success' : 'outline'} className="text-[10px]">
                          {t.is_billed ? 'BILLED' : 'UNBILLED'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RETAINERS */}
      {activeTab === 'RETAINERS' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5 pl-6">Client</th>
                  <th className="p-3.5">Total Deposited</th>
                  <th className="p-3.5">Current Balance</th>
                  <th className="p-3.5">Minimum Threshold</th>
                  <th className="p-3.5 pr-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
                {retainers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                      No client retainer accounts created yet. Click &quot;Deposit Retainer&quot;.
                    </td>
                  </tr>
                ) : (
                  retainers.map((r) => {
                    const client = clients.find(c => c.id === r.client_id);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="p-3.5 pl-6 font-bold text-slate-900 dark:text-white">
                          {client?.name || 'Client'}
                        </td>
                        <td className="p-3.5 font-mono text-slate-600">TZS {r.total_deposited.toLocaleString()}</td>
                        <td className="p-3.5 font-extrabold font-mono text-purple-600 dark:text-purple-400">
                          TZS {r.current_balance.toLocaleString()}
                        </td>
                        <td className="p-3.5 font-mono text-slate-400">TZS {r.minimum_threshold.toLocaleString()}</td>
                        <td className="p-3.5 pr-6 text-right">
                          <Badge variant={r.status === 'Low Balance' ? 'danger' : 'success'} className="text-[10px]">
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Time Modal */}
      {isTimeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Log Lawyer Time Entry</h2>
            
            <form onSubmit={handleCreateTimeEntry} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Case Matter *</label>
                <select
                  required
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs bg-white dark:bg-darkbg-card"
                >
                  <option value="">Select Case Matter...</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>#{c.case_number} — {c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Date Logged *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Duration (Minutes) *</label>
                  <input
                    type="number"
                    required
                    min={15}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Hourly Rate (TZS) *</label>
                  <input
                    type="number"
                    required
                    step={10000}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Description / Work Completed</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Legal research & drafting affidavit..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTimeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white"
                >
                  Save Time Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Retainer Modal */}
      {isRetainerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Deposit Client Retainer</h2>
            
            <form onSubmit={handleCreateRetainer} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Client *</label>
                <select
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs bg-white dark:bg-darkbg-card"
                >
                  <option value="">Select Client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Deposit Amount (TZS) *</label>
                  <input
                    type="number"
                    required
                    step={100000}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Min Threshold Alert (TZS)</label>
                  <input
                    type="number"
                    step={50000}
                    value={minThreshold}
                    onChange={(e) => setMinThreshold(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRetainerModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white"
                >
                  Deposit to Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
