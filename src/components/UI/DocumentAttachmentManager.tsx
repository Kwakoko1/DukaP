import React, { useState, useEffect, useRef } from 'react';
import { getEntityDocuments, uploadDocumentAttachment, softDeleteDocument } from '../../services/documentService';
import type { DocumentAttachment } from '../../db/dexie';
import { Paperclip, Upload, FileText, Trash2, Eye, Download, Lock, ShieldAlert } from 'lucide-react';

interface DocumentAttachmentManagerProps {
  tenantId: string;
  branchId?: string;
  module: DocumentAttachment['module'];
  entityType: string;
  entityId: string;
  title?: string;
  readOnly?: boolean;
}

export const DocumentAttachmentManager: React.FC<DocumentAttachmentManagerProps> = ({
  tenantId,
  branchId,
  module: modName,
  entityType,
  entityId,
  title = 'Document Attachments & Verification Lab',
  readOnly = false,
}) => {
  const [documents, setDocuments] = useState<DocumentAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentAttachment | null>(null);
  const [isConfidential, setIsConfidential] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    if (!tenantId || !entityId) return;
    setLoading(true);
    try {
      const docs = await getEntityDocuments(tenantId, entityType, entityId);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load attachments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, entityType, entityId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadDocumentAttachment({
          tenantId,
          branchId,
          module: modName,
          entityType,
          entityId,
          file: files[i],
          isConfidential,
        });
      }
      await fetchDocs();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Are you sure you want to remove this document attachment?')) return;
    await softDeleteDocument(docId);
    await fetchDocs();
    if (selectedDoc?.id === docId) setSelectedDoc(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-5 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border/40">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
            <Paperclip className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">{title}</h4>
            <p className="text-[10px] text-slate-400">Attach compliance records, vet lab results, photos & certificates</p>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
              />
              <Lock className="h-3 w-3 text-amber-500" />
              <span className="text-[10px]">Confidential</span>
            </label>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Attachment List Grid */}
      <div className="mt-4">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Loading attached documents...</div>
        ) : documents.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-darkbg-border/60 rounded-xl">
            <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">No documents attached yet.</p>
            <p className="text-[10px] text-slate-400 mt-1">Upload health certificates, lab test PDFs, invoices or photos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="group relative flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg/40 hover:border-indigo-300 dark:hover:border-indigo-700 transition"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="shrink-0 p-2 rounded-lg bg-white dark:bg-darkbg border border-slate-200 dark:border-darkbg-border text-slate-500">
                    <FileText className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{doc.file_name}</p>
                      {doc.is_confidential && <ShieldAlert className="h-3 w-3 text-amber-500 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-slate-400">{formatFileSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition">
                  {doc.data_base64 && (
                    <button
                      onClick={() => setSelectedDoc(doc)}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300"
                      title="Preview Document"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {doc.data_base64 && (
                    <a
                      href={doc.data_base64}
                      download={doc.file_name}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500"
                      title="Remove Attachment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border/40">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedDoc.file_name}</h3>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto my-4 flex items-center justify-center bg-slate-900 rounded-xl p-2 min-h-[300px]">
              {selectedDoc.file_type.startsWith('image/') ? (
                <img src={selectedDoc.data_base64} alt={selectedDoc.file_name} className="max-h-[60vh] object-contain rounded-lg" />
              ) : selectedDoc.file_type === 'application/pdf' ? (
                <iframe src={selectedDoc.data_base64} title={selectedDoc.file_name} className="w-full h-[60vh] rounded-lg border-0" />
              ) : (
                <div className="text-center text-slate-400 py-12">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-slate-500" />
                  <p className="text-xs">Preview not available for format <strong>{selectedDoc.file_type}</strong></p>
                  <a
                    href={selectedDoc.data_base64}
                    download={selectedDoc.file_name}
                    className="inline-block mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-darkbg-border/40">
              <span>Size: {formatFileSize(selectedDoc.file_size_bytes)}</span>
              <span>Uploaded by {selectedDoc.uploaded_by || 'User'} on {new Date(selectedDoc.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
