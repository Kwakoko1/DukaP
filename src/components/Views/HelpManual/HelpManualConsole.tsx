import React, { useState, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getAccessibleManualTopics } from '../../../services/helpManualService';
import { 
  BookOpen, Search, Lock, ShieldCheck, Printer, 
  AlertTriangle, Sparkles
} from 'lucide-react';
import { Badge } from '../../UI/custom-ui';

export const HelpManualConsole: React.FC = () => {
  const { user, role, isSuperAdminView } = useAuth();
  const userRole = (role as string) || 'Cashier';
  const isOwner = userRole.toUpperCase().includes('OWNER') || userRole.toUpperCase().includes('ADMIN');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Filter topics by Role Access Guard
  const accessibleTopics = useMemo(() => {
    return getAccessibleManualTopics(userRole, isSuperAdminView, isOwner);
  }, [userRole, isSuperAdminView, isOwner]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    accessibleTopics.forEach(t => set.add(t.category));
    return Array.from(set);
  }, [accessibleTopics]);

  // Filter topics by Search Term & Category
  const filteredTopics = useMemo(() => {
    return accessibleTopics.filter(topic => {
      const matchesCat = selectedCategory === 'ALL' || topic.category === selectedCategory;
      if (!matchesCat) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        topic.title.toLowerCase().includes(q) ||
        topic.description.toLowerCase().includes(q) ||
        topic.category.toLowerCase().includes(q) ||
        topic.steps.some(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      );
    });
  }, [accessibleTopics, selectedCategory, searchTerm]);

  const handlePrintManual = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl border border-slate-800 text-white shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold flex items-center gap-2">
              DukaPOS Operations & User Manual
              <Badge variant="outline" className="text-indigo-300 border-indigo-500/40 text-[10px] uppercase font-mono">
                {isSuperAdminView ? 'PLATFORM SUPER ADMIN' : userRole}
              </Badge>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Role-gated operational workflows, register procedures, and compliance documentation.
            </p>
          </div>
        </div>

        <button
          onClick={handlePrintManual}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition shrink-0 print:hidden"
        >
          <Printer size={15} />
          <span>Print Role Manual</span>
        </button>
      </div>

      {/* Security Role Access Badge */}
      <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>
            Logged in as <strong className="font-extrabold">{user?.name || 'Staff User'}</strong> ({userRole}). Showing {accessibleTopics.length} manual modules authorized for your security clearance.
          </span>
        </div>
        {!isOwner && !isSuperAdminView && (
          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
            <Lock size={12} />
            <span>Managerial & Finance manuals locked</span>
          </div>
        )}
      </div>

      {/* Search & Category Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search manual workflows, step-by-step guides, or procedures..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              selectedCategory === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300'
            }`}
          >
            All Accessible ({accessibleTopics.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
                selectedCategory === cat ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Manual Topics Content Grid */}
      <div className="space-y-6">
        {filteredTopics.length === 0 ? (
          <div className="bg-white dark:bg-darkbg-card p-12 text-center text-slate-400 italic text-xs rounded-2xl border border-slate-200 dark:border-darkbg-border">
            No manual chapters found matching search criteria or role authorization.
          </div>
        ) : (
          filteredTopics.map((topic) => (
            <div key={topic.id} className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-darkbg-border pb-3">
                <div>
                  <Badge variant="outline" className="text-[10px] font-mono uppercase mb-1">
                    {topic.category}
                  </Badge>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{topic.title}</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">{topic.description}</p>
                </div>
              </div>

              {/* Step-by-Step Workflow List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {topic.steps.map((step) => (
                  <div key={step.stepNumber} className="p-3.5 bg-slate-50 dark:bg-darkbg/40 rounded-xl border border-slate-200/60 dark:border-darkbg-border space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
                        {step.stepNumber}
                      </span>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-white">{step.title}</h4>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pl-7">
                      {step.description}
                    </p>
                    {step.tip && (
                      <div className="ml-7 p-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 rounded-lg text-[10px] font-semibold flex items-center gap-1">
                        <Sparkles size={12} className="shrink-0" />
                        <span>Tip: {step.tip}</span>
                      </div>
                    )}
                    {step.warning && (
                      <div className="ml-7 p-2 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 rounded-lg text-[10px] font-semibold flex items-center gap-1">
                        <AlertTriangle size={12} className="shrink-0" />
                        <span>Warning: {step.warning}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
