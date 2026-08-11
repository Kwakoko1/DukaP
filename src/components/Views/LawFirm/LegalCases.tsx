import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LegalCase } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { 
  Gavel, Plus, Search, ShieldAlert, AlertTriangle, 
  CheckCircle2
} from 'lucide-react';
import { Badge } from '../../UI/custom-ui';
import { performConflictCheck, logConflictCheckAcknowledgment, type ConflictCheckResult } from '../../../services/lawFirm/conflictCheckEngine';
import { logCaseTimeline } from '../../../services/lawFirm/legalAuditEngine';

export const LegalCases: React.FC = () => {
  const { currentTenant, user } = useAuth();
  const tenantId = currentTenant?.id || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState<'CONFLICT_CHECK' | 'CASE_DETAILS'>('CONFLICT_CHECK');

  // Form State
  const [partySearched, setPartySearched] = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [opposingParty, setOpposingParty] = useState('');
  const [courtName, setCourtName] = useState('High Court of Tanzania');
  const [judgeName, setJudgeName] = useState('');
  const [filingNumber, setFilingNumber] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>('Medium');
  const [confidentiality, setConfidentiality] = useState<'Standard' | 'Confidential' | 'Highly Confidential'>('Standard');
  const [ackNotes, setAckNotes] = useState('');

  // Conflict Check Result State
  const [conflictResult, setConflictResult] = useState<ConflictCheckResult | null>(null);
  const [isConflictChecked, setIsConflictChecked] = useState(false);

  const cases = useLiveQuery(async () => {
    if (!tenantId) return [];
    const all = await db.legalCases.where('tenant_id').equals(tenantId).toArray();
    return all.filter(c => !c.is_deleted);
  }, [tenantId]) || [];

  const clients = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalClients.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const filteredCases = useMemo(() => {
    if (!searchTerm.trim()) return cases;
    const q = searchTerm.toLowerCase();
    return cases.filter(c => 
      c.title.toLowerCase().includes(q) || 
      c.case_number.toLowerCase().includes(q) ||
      (c.client_name && c.client_name.toLowerCase().includes(q)) ||
      (c.opposing_party && c.opposing_party.toLowerCase().includes(q))
    );
  }, [cases, searchTerm]);

  const handleRunConflictCheck = async () => {
    if (!partySearched.trim()) {
      alert('Please enter party or company name for conflict checking.');
      return;
    }
    const res = await performConflictCheck(tenantId, partySearched, caseTitle);
    setConflictResult(res);
    setIsConflictChecked(true);
  };

  const handleProceedToCaseDetails = () => {
    if (!isConflictChecked) {
      alert('Conflict Check must be performed first.');
      return;
    }
    setStep('CASE_DETAILS');
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseTitle.trim() || !clientId) {
      alert('Case Title and Client are required.');
      return;
    }

    const selectedClient = clients.find(c => c.id === clientId);
    const caseNum = `MAT-${Date.now().toString().slice(-6)}`;

    const newCase: LegalCase = {
      id: `case_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      case_number: caseNum,
      title: caseTitle,
      client_id: clientId,
      client_name: selectedClient?.name || 'Client',
      opposing_party: opposingParty,
      court_name: courtName,
      judge_name: judgeName,
      filing_number: filingNumber,
      status: 'OPEN',
      priority,
      confidentiality_level: confidentiality,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    await db.legalCases.add(newCase);

    // Audit conflict check acknowledgment
    if (conflictResult) {
      await logConflictCheckAcknowledgment(
        tenantId,
        caseTitle,
        partySearched,
        conflictResult,
        user?.email || 'lawyer@dukapos.co.tz',
        ackNotes || 'Conflict search completed and cleared for case intake.'
      );
    }

    // Timeline event
    await logCaseTimeline(tenantId, newCase.id, user?.name || 'Advocate', 'CASE_CREATED', `Case #${caseNum} ("${caseTitle}") opened for client ${selectedClient?.name}.`);

    setIsModalOpen(false);
    setStep('CONFLICT_CHECK');
    setPartySearched('');
    setCaseTitle('');
    setClientId('');
    setOpposingParty('');
    setConflictResult(null);
    setIsConflictChecked(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Gavel className="h-5 w-5 text-indigo-600" />
            Legal Cases & Litigation Matters
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Comprehensive matter management with pre-intake conflict checks and case timelines.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0"
        >
          <Plus size={15} />
          <span>Open New Case (Conflict Check)</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by case title, matter #, client, or opposing party..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5 pl-6">Matter #</th>
                <th className="p-3.5">Case Title</th>
                <th className="p-3.5">Client Name</th>
                <th className="p-3.5">Opposing Party</th>
                <th className="p-3.5">Court / Jurisdiction</th>
                <th className="p-3.5">Priority</th>
                <th className="p-3.5 pr-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    No active legal cases found.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-3.5 pl-6 font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                      #{c.case_number}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      {c.title}
                    </td>
                    <td className="p-3.5 text-slate-700 dark:text-slate-300 font-medium">
                      {c.client_name || 'Walk-in'}
                    </td>
                    <td className="p-3.5 text-slate-500">
                      {c.opposing_party ? `vs ${c.opposing_party}` : '—'}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-400">
                      {c.court_name || 'High Court'}
                    </td>
                    <td className="p-3.5">
                      <Badge variant={c.priority === 'Urgent' || c.priority === 'High' ? 'danger' : 'outline'} className="text-[10px]">
                        {c.priority}
                      </Badge>
                    </td>
                    <td className="p-3.5 pr-6 text-right">
                      <Badge variant={c.status === 'OPEN' || c.status === 'IN_PROGRESS' ? 'success' : 'default'} className="text-[10px]">
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intake & Conflict Check Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="text-indigo-600 h-5 w-5" />
                Case Intake — {step === 'CONFLICT_CHECK' ? 'Step 1: Conflict of Interest Search' : 'Step 2: Case Details'}
              </h2>
            </div>

            {step === 'CONFLICT_CHECK' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Party / Opposing Company to Search *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. John Doe, Tanzania Revenue Authority, Acme Ltd"
                      value={partySearched}
                      onChange={(e) => setPartySearched(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleRunConflictCheck}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                    >
                      Run Search
                    </button>
                  </div>
                </div>

                {conflictResult && (
                  <div className={`p-4 rounded-xl border text-xs ${
                    conflictResult.hasConflict ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      {conflictResult.hasConflict ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                      <span>{conflictResult.hasConflict ? 'Conflict Identified' : 'Zero Conflicts Found'}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">{conflictResult.description}</p>
                  </div>
                )}

                {isConflictChecked && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Conflict Acknowledgment & Clearance Notes</label>
                    <textarea
                      rows={2}
                      placeholder="Notes on why it is safe to proceed or conflict clearance authorization..."
                      value={ackNotes}
                      onChange={(e) => setAckNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!isConflictChecked}
                    onClick={handleProceedToCaseDetails}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white disabled:opacity-50"
                  >
                    Proceed to Matter Details &rarr;
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateCase} className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Case / Matter Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Land Dispute vs City Council"
                    value={caseTitle}
                    onChange={(e) => setCaseTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
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
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Opposing Party</label>
                    <input
                      type="text"
                      placeholder="Opposing advocate/party"
                      value={opposingParty}
                      onChange={(e) => setOpposingParty(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Court Name</label>
                    <input
                      type="text"
                      value={courtName}
                      onChange={(e) => setCourtName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Presiding Judge / Magistrate</label>
                    <input
                      type="text"
                      placeholder="e.g. Hon. Justice..."
                      value={judgeName}
                      onChange={(e) => setJudgeName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Filing / Ref #</label>
                    <input
                      type="text"
                      placeholder="Civil Case #..."
                      value={filingNumber}
                      onChange={(e) => setFilingNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs bg-white dark:bg-darkbg-card"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Confidentiality</label>
                    <select
                      value={confidentiality}
                      onChange={(e) => setConfidentiality(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs bg-white dark:bg-darkbg-card"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Confidential">Confidential</option>
                      <option value="Highly Confidential">Highly Confidential</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('CONFLICT_CHECK')}
                    className="text-xs font-bold text-slate-500 hover:underline"
                  >
                    &larr; Back to Conflict Check
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white"
                    >
                      Open Case Matter
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
