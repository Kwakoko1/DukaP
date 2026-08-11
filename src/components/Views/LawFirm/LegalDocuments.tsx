import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LegalDocument } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { FileText, Upload } from 'lucide-react';
import { Badge } from '../../UI/custom-ui';

export const LegalDocuments: React.FC = () => {
  const { currentTenant, user } = useAuth();
  const tenantId = currentTenant?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'Pleadings' | 'Contracts' | 'Affidavits' | 'Court Filings' | 'Evidence' | 'Correspondence' | 'Invoices' | 'Other'>('Pleadings');
  const [caseId, setCaseId] = useState('');
  const [confidentiality, setConfidentiality] = useState<'Internal' | 'Client Visible' | 'Confidential'>('Internal');

  const documents = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalDocuments.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const cases = useLiveQuery(async () => {
    if (!tenantId) return [];
    return await db.legalCases.where('tenant_id').equals(tenantId).toArray();
  }, [tenantId]) || [];

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !caseId) {
      alert('Document Title and Case are required.');
      return;
    }

    const newDoc: LegalDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      case_id: caseId,
      title,
      category,
      version: 1,
      uploaded_by: user?.name || 'Advocate',
      confidentiality,
      created_at: Date.now()
    };

    await db.legalDocuments.add(newDoc);
    setIsModalOpen(false);
    setTitle('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Legal Document Vault & Versioning
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Encrypted file repository for pleadings, affidavits, contracts, and court filings.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0"
        >
          <Upload size={15} />
          <span>Upload Legal Document</span>
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.length === 0 ? (
          <div className="col-span-full bg-white dark:bg-darkbg-card p-12 text-center text-slate-400 italic text-xs rounded-2xl border border-slate-200 dark:border-darkbg-border">
            No legal documents uploaded yet.
          </div>
        ) : (
          documents.map((d) => (
            <div key={d.id} className="bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] font-mono">
                  v{d.version}.0 &bull; {d.category}
                </Badge>
                <Badge variant={d.confidentiality === 'Confidential' ? 'danger' : 'default'} className="text-[9px]">
                  {d.confidentiality}
                </Badge>
              </div>

              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{d.title}</h3>
                <div className="text-[10px] text-slate-400 mt-1">Uploaded by {d.uploaded_by}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Upload Legal Document</h2>
            
            <form onSubmit={handleUploadDocument} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Document Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plaint / Written Statement of Defence"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs bg-white dark:bg-darkbg-card"
                >
                  <option value="Pleadings">Pleadings</option>
                  <option value="Contracts">Contracts</option>
                  <option value="Affidavits">Affidavits</option>
                  <option value="Court Filings">Court Filings</option>
                  <option value="Evidence">Evidence</option>
                  <option value="Correspondence">Correspondence</option>
                  <option value="Other">Other</option>
                </select>
              </div>

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
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Confidentiality Level</label>
                <select
                  value={confidentiality}
                  onChange={(e) => setConfidentiality(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs bg-white dark:bg-darkbg-card"
                >
                  <option value="Internal">Internal Firm Only</option>
                  <option value="Client Visible">Client Visible</option>
                  <option value="Confidential">Confidential / Court Sealed</option>
                </select>
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
                  Save Document Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
