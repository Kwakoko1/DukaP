import { db } from '../db/dexie';
import type { DocumentAttachment } from '../db/dexie';

/**
 * Enterprise Document Handling Service
 * Provides multi-tenant offline attachment storage, base64 payload caching, and metadata search.
 */

export async function getEntityDocuments(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<DocumentAttachment[]> {
  if (!tenantId || !entityId) return [];
  const all = await db.documentAttachments
    .where('tenant_id')
    .equals(tenantId)
    .and((doc) => doc.entity_type === entityType && doc.entity_id === entityId && !doc.deleted_at)
    .toArray();
  return all.sort((a, b) => b.created_at - a.created_at);
}

export async function uploadDocumentAttachment(params: {
  tenantId: string;
  branchId?: string;
  module: DocumentAttachment['module'];
  entityType: string;
  entityId: string;
  file: File;
  isConfidential?: boolean;
  uploadedBy?: string;
}): Promise<DocumentAttachment> {
  const { tenantId, branchId, module: mod, entityType, entityId, file, isConfidential = false, uploadedBy = 'System User' } = params;

  // Convert File to Base64 data URL for offline storage
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const doc: DocumentAttachment = {
    id: docId,
    tenant_id: tenantId,
    branch_id: branchId,
    module: mod,
    entity_type: entityType,
    entity_id: entityId,
    file_name: file.name,
    file_type: file.type || 'application/octet-stream',
    file_size_bytes: file.size,
    storage_provider: 'local_indexeddb',
    storage_path: `indexeddb://${tenantId}/${entityType}/${entityId}/${docId}`,
    data_base64: base64Data,
    is_confidential: isConfidential,
    uploaded_by: uploadedBy,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.documentAttachments.put(doc);
  return doc;
}

export async function softDeleteDocument(docId: string): Promise<void> {
  const doc = await db.documentAttachments.get(docId);
  if (doc) {
    doc.deleted_at = Date.now();
    await db.documentAttachments.put(doc);
  }
}

export async function searchTenantDocuments(
  tenantId: string,
  query: string
): Promise<DocumentAttachment[]> {
  if (!tenantId || !query.trim()) return [];
  const q = query.toLowerCase();
  const all = await db.documentAttachments
    .where('tenant_id')
    .equals(tenantId)
    .and((d) => !d.deleted_at)
    .toArray();

  return all.filter(
    (d) =>
      d.file_name.toLowerCase().includes(q) ||
      d.entity_type.toLowerCase().includes(q) ||
      (d.ocr_extracted_text && d.ocr_extracted_text.toLowerCase().includes(q))
  );
}
