import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LegalTask } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { CheckSquare, Plus, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../UI/custom-ui';

export const LegalTasks: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [caseId, setCaseId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const tasks = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalTasks.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const cases = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalCases.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      alert('Task Title and Due Date are required.');
      return;
    }

    const newTask: LegalTask = {
      id: `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      case_id: caseId,
      title,
      description,
      due_date: dueDate,
      status: 'TODO',
      priority,
      created_at: Date.now()
    };

    await db.legalTasks.add(newTask);
    setIsModalOpen(false);
    setTitle('');
    setDescription('');
    setDueDate('');
  };

  const handleToggleTaskStatus = async (task: LegalTask) => {
    const nextStatus = task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    await db.legalTasks.update(task.id, { status: nextStatus });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-indigo-600" />
            Legal Tasks & Workflows
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pleading drafts, affidavit preparations, court service follow-ups, and paralegal tasks.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0"
        >
          <Plus size={15} />
          <span>Assign Legal Task</span>
        </button>
      </div>

      {/* Task List Table */}
      <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5 pl-6">Status</th>
                <th className="p-3.5">Task Title</th>
                <th className="p-3.5">Priority</th>
                <th className="p-3.5">Due Date</th>
                <th className="p-3.5 pr-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                    No legal tasks assigned.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-3.5 pl-6">
                      <button
                        onClick={() => handleToggleTaskStatus(t)}
                        className={`p-1 rounded-lg border ${
                          t.status === 'COMPLETED' ? 'bg-emerald-500 text-white border-emerald-600' : 'border-slate-300 text-slate-400'
                        }`}
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      <span className={t.status === 'COMPLETED' ? 'line-through text-slate-400' : ''}>
                        {t.title}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <Badge variant={t.priority === 'High' ? 'danger' : 'outline'} className="text-[10px]">
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                      {new Date(t.due_date).toLocaleDateString()}
                    </td>
                    <td className="p-3.5 pr-6 text-right font-bold text-indigo-600">
                      {t.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Assign Legal Task</h2>
            
            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Draft Affidavit of Service"
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
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
                  </select>
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
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white"
                >
                  Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
