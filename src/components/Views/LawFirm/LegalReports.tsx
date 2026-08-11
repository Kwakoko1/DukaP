import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { BarChart3 } from 'lucide-react';

export const LegalReports: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || '';

  const cases = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalCases.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const timeEntries = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalTimeEntries.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const totalBillableFees = timeEntries.reduce((sum, t) => sum + (t.billable_amount || 0), 0);
  const totalHoursWorked = Math.round(timeEntries.reduce((sum, t) => sum + (t.duration_minutes || 0), 0) / 60);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          Legal Practice Analytics & Outcomes
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Litigation performance, billable hours breakdown, and client revenue distribution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Billable Hours</div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{totalHoursWorked} hrs</div>
          <div className="text-xs text-slate-500">{timeEntries.length} logged time entries</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Legal Fees</div>
          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">TZS {totalBillableFees.toLocaleString()}</div>
          <div className="text-xs text-slate-500">Calculated billable fees</div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Litigation Rate</div>
          <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{cases.length} Matters</div>
          <div className="text-xs text-slate-500">Total matters managed</div>
        </div>
      </div>
    </div>
  );
};
