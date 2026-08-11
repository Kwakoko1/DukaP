import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LegalHearing } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Calendar, Plus, Clock, MapPin } from 'lucide-react';
import { Badge } from '../../UI/custom-ui';

export const LegalCalendar: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [eventType, setEventType] = useState<'HEARING' | 'MENTION' | 'FILING_DEADLINE' | 'MEDIATION' | 'CONFERENCE'>('HEARING');
  const [title, setTitle] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('High Court of Tanzania (Commercial Division)');
  const [judgeName, setJudgeName] = useState('');

  const hearings = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalHearings.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const cases = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalCases.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const handleCreateHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dateTime) {
      alert('Event Title and Date/Time are required.');
      return;
    }

    const newHearing: LegalHearing = {
      id: `hrg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      case_id: caseId,
      event_type: eventType,
      title,
      date_time: dateTime,
      location,
      judge_name: judgeName,
      status: 'Scheduled',
      created_at: Date.now()
    };

    await db.legalHearings.add(newHearing);
    setIsModalOpen(false);
    setTitle('');
    setDateTime('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-emerald-600" />
            Court Calendar & Filing Deadlines
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Court hearing appearances, mentions, and filing deadline alerts.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0"
        >
          <Plus size={15} />
          <span>Schedule Court Event</span>
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hearings.length === 0 ? (
          <div className="col-span-full bg-white dark:bg-darkbg-card p-12 text-center text-slate-400 italic text-xs rounded-2xl border border-slate-200 dark:border-darkbg-border">
            No court hearings or deadlines scheduled. Click &quot;Schedule Court Event&quot; to add one.
          </div>
        ) : (
          hearings.map((h) => (
            <div key={h.id} className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={h.event_type === 'FILING_DEADLINE' ? 'danger' : 'outline'} className="text-[10px] uppercase font-mono">
                  {h.event_type}
                </Badge>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Clock size={12} />
                  {new Date(h.date_time).toLocaleDateString()}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{h.title}</h3>
                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin size={11} />
                  <span>{h.location || 'High Court of Tanzania'}</span>
                </div>
              </div>

              {h.judge_name && (
                <div className="text-[10px] text-slate-400 font-mono">
                  Presiding Judge: {h.judge_name}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Schedule Court Event</h2>
            
            <form onSubmit={handleCreateHearing} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs bg-white dark:bg-darkbg-card"
                >
                  <option value="HEARING">Court Hearing</option>
                  <option value="MENTION">Mention</option>
                  <option value="FILING_DEADLINE">Filing Deadline</option>
                  <option value="MEDIATION">Mediation Session</option>
                  <option value="CONFERENCE">Pre-Trial Conference</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hearing of Chamber Application"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Case / Matter</label>
                <select
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
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Court / Location</label>
                <input
                  type="text"
                  placeholder="e.g. High Court Room 4"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Judge / Magistrate</label>
                  <input
                    type="text"
                    placeholder="Judge name"
                    value={judgeName}
                    onChange={(e) => setJudgeName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white"
                >
                  Save Court Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
