import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { LivestockTask } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Plus, Clock, Check, X, UserCheck } from 'lucide-react';

export const FarmTasks: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    farm_id: '',
    task_title: 'Morning Feed Distribution',
    task_type: 'Feeding' as LivestockTask['task_type'],
    priority: 'High' as LivestockTask['priority'],
    due_date: new Date().toISOString().split('T')[0],
    assigned_to: 'Farm Worker #1',
  });

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const tasks = useLiveQuery(() => db.livestockTasks.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.task_title || !form.farm_id) return;

    const newTask: LivestockTask = {
      id: `task-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_id: form.farm_id,
      task_title: form.task_title,
      task_type: form.task_type,
      priority: form.priority,
      due_date: form.due_date,
      assigned_to: form.assigned_to,
      status: 'Pending',
      created_at: Date.now(),
    };

    await db.livestockTasks.put(newTask);
    setShowModal(false);
  };

  const handleToggleStatus = async (taskId: string, currentStatus: LivestockTask['status']) => {
    const nextStatus = currentStatus === 'Completed' ? 'Pending' : 'Completed';
    await db.livestockTasks.update(taskId, { status: nextStatus });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Farm Task & Labor Dispatch</h2>
          <p className="text-xs text-slate-500">Assign daily tasks (feeding, milking, house cleaning, vaccination) to farm staff with checklists.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Dispatch Task
        </button>
      </div>

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tasks.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-white dark:bg-darkbg-card rounded-2xl border border-dashed border-slate-200 dark:border-darkbg-border">
            No active farm tasks. Click "Dispatch Task" to assign feeding or cleaning duties to workers.
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className={`p-4 rounded-2xl border bg-white dark:bg-darkbg-card transition shadow-xs ${task.status === 'Completed' ? 'border-slate-200 opacity-60' : 'border-slate-200 dark:border-darkbg-border hover:border-emerald-500'}`}
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                  {task.task_type}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${task.priority === 'High' || task.priority === 'Urgent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                  {task.priority} Priority
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2">{task.task_title}</h3>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <UserCheck className="h-3 w-3 text-slate-400" /> Assigned to: <strong>{task.assigned_to || 'Staff'}</strong>
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-darkbg-border/40 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Due: {task.due_date}
                </span>
                <button
                  onClick={() => handleToggleStatus(task.id, task.status)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 ${task.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                >
                  <Check className="h-3 w-3" /> {task.status}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dispatch Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateTask} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Dispatch Farm Task</h3>
              <button type="button" onClick={() => setShowModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm *</label>
              <select
                required
                className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={form.farm_id}
                onChange={e => setForm({ ...form, farm_id: e.target.value })}
              >
                <option value="">Select Farm...</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Task Title *</label>
              <input
                required
                className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={form.task_title}
                onChange={e => setForm({ ...form, task_title: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Dispatch</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
