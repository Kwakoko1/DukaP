import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { 
  Scale, Users, Calendar, AlertCircle, 
  DollarSign, ShieldAlert, Clock, ChevronRight, Gavel
} from 'lucide-react';
import { Badge } from '../../UI/custom-ui';

export const LawFirmDashboard: React.FC<{ onNavigateTab: (tab: string) => void }> = ({ onNavigateTab }) => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || '';

  const cases = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalCases.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const clients = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalClients.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const hearings = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalHearings.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const tasks = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalTasks.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const retainers = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalRetainers.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const timeEntries = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalTimeEntries.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  // KPIs
  const activeCasesCount = useMemo(() => cases.filter(c => ['INTAKE', 'OPEN', 'IN_PROGRESS'].includes(c.status)).length, [cases]);
  const upcomingHearingsCount = useMemo(() => hearings.filter(h => h.status === 'Scheduled').length, [hearings]);
  const overdueTasksCount = useMemo(() => tasks.filter(t => t.status === 'OVERDUE' || (t.status !== 'COMPLETED' && new Date(t.due_date).getTime() < Date.now())).length, [tasks]);
  
  const totalRetainerBalance = useMemo(() => retainers.reduce((sum, r) => sum + (r.current_balance || 0), 0), [retainers]);
  const lowRetainersCount = useMemo(() => retainers.filter(r => r.status === 'Low Balance' || r.current_balance < r.minimum_threshold).length, [retainers]);

  const totalUnbilledFees = useMemo(() => timeEntries.filter(t => !t.is_billed).reduce((sum, t) => sum + (t.billable_amount || 0), 0), [timeEntries]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl border border-slate-800 text-white shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
            <Scale className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold flex items-center gap-2">
              Legal Practice Intelligence
              <Badge variant="outline" className="text-indigo-300 border-indigo-500/40 text-[10px] uppercase font-mono">LAW_FIRM</Badge>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Active litigation tracking, court hearing reminders, conflict checks, and legal retainer monitoring.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div 
          onClick={() => onNavigateTab('Cases')}
          className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm cursor-pointer hover:border-indigo-500/40 transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Cases</span>
            <Gavel size={16} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{activeCasesCount}</div>
          <div className="text-[10px] text-slate-500 mt-1">{cases.length} Total Matters</div>
        </div>

        <div 
          onClick={() => onNavigateTab('Clients')}
          className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm cursor-pointer hover:border-blue-500/40 transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Clients</span>
            <Users size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{clients.length}</div>
          <div className="text-[10px] text-slate-500 mt-1">Clients & Corporations</div>
        </div>

        <div 
          onClick={() => onNavigateTab('Court Calendar')}
          className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm cursor-pointer hover:border-emerald-500/40 transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Upcoming Hearings</span>
            <Calendar size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{upcomingHearingsCount}</div>
          <div className="text-[10px] text-slate-500 mt-1">Court Events Scheduled</div>
        </div>

        <div 
          onClick={() => onNavigateTab('Legal Tasks')}
          className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm cursor-pointer hover:border-amber-500/40 transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Overdue Tasks</span>
            <AlertCircle size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600">{overdueTasksCount}</div>
          <div className="text-[10px] text-slate-500 mt-1">Filing Deadlines Pending</div>
        </div>

        <div 
          onClick={() => onNavigateTab('Billing & Retainers')}
          className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm cursor-pointer hover:border-indigo-500/40 transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Unbilled Fees</span>
            <DollarSign size={16} className="text-indigo-600" />
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white">TZS {(totalUnbilledFees / 1000).toFixed(0)}K</div>
          <div className="text-[10px] text-slate-500 mt-1">Unbilled Time Entries</div>
        </div>

        <div 
          onClick={() => onNavigateTab('Billing & Retainers')}
          className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm cursor-pointer hover:border-purple-500/40 transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Retainer Balance</span>
            <ShieldAlert size={16} className={lowRetainersCount > 0 ? "text-red-500" : "text-purple-600"} />
          </div>
          <div className="text-lg font-extrabold text-purple-600 dark:text-purple-400">TZS {(totalRetainerBalance / 1000).toFixed(0)}K</div>
          <div className="text-[10px] text-[10px] text-slate-500 mt-1">
            {lowRetainersCount > 0 ? <span className="text-red-500 font-bold">{lowRetainersCount} Low Balances</span> : 'Retainers Healthy'}
          </div>
        </div>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Cases */}
        <div className="lg:col-span-2 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden p-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Gavel className="h-4 w-4 text-indigo-600" />
              Active Legal Cases / Matters
            </h2>
            <button
              onClick={() => onNavigateTab('Cases')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline"
            >
              <span>View All Matters</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {cases.length === 0 ? (
            <div className="py-12 text-center text-slate-400 italic text-xs">
              No legal cases opened yet. Click &quot;Cases&quot; to perform conflict check and open a matter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
              {cases.slice(0, 5).map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/20 px-2 rounded-xl transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400">#{c.case_number}</span>
                      <span className="font-bold text-xs text-slate-800 dark:text-white">{c.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Client: <span className="font-semibold text-slate-700 dark:text-slate-300">{c.client_name || 'N/A'}</span>
                      {c.opposing_party && <span className="ml-2 text-slate-400">vs {c.opposing_party}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === 'IN_PROGRESS' ? 'success' : 'default'} className="text-[10px]">
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Court Hearings */}
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden p-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              Court Calendar & Hearings
            </h2>
            <button
              onClick={() => onNavigateTab('Court Calendar')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline"
            >
              <span>Full Calendar</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {hearings.length === 0 ? (
            <div className="py-12 text-center text-slate-400 italic text-xs">
              No court hearings scheduled.
            </div>
          ) : (
            <div className="space-y-3">
              {hearings.slice(0, 4).map((h) => (
                <div key={h.id} className="p-3 rounded-xl bg-slate-50 dark:bg-darkbg/40 border border-slate-200/60 dark:border-darkbg-border space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[9px] uppercase">{h.event_type}</Badge>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(h.date_time).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="font-bold text-xs text-slate-800 dark:text-white">{h.title}</div>
                  <div className="text-[10px] text-slate-500">{h.location || 'High Court of Tanzania'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
