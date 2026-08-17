/**
 * KwakoPOS SaaS — Canonical Replica Checksum Engine (SHA-256)
 * 
 * Provides deterministic, content-based SHA-256 replica integrity calculation.
 * Guarantees that identical business records produce identical checksums across client and server,
 * regardless of insertion order, object key ordering, or runtime synchronization metadata.
 */

export const CHECKSUM_VERSION = 1;

export interface ReplicaChecksumResult {
  tenantId: string;
  schemaVersion: number;
  checksumVersion: number;
  checksum: string; // 'sha256:<64-hex>'
  recordCount: number;
  calculatedAt: number;
}

export class ReplicaChecksumError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ReplicaChecksumError';
    this.cause = cause;
  }
}

/**
 * Recursively canonicalizes data values:
 * - Sorts all object keys lexicographically
 * - Normalizes undefined and null to null
 * - Validates and normalizes finite numbers
 * - Maps arrays deterministically
 */
export function canonicalize(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize(obj[key]);
        return result;
      }, {});
  }

  return String(value);
}

/**
 * Computes SHA-256 hash formatted as 'sha256:<64-hex>'
 */
export async function sha256(input: string): Promise<string> {
  const gCrypto = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : null;
  if (gCrypto && gCrypto.subtle && typeof gCrypto.subtle.digest === 'function') {
    const data = new TextEncoder().encode(input);
    const digest = await gCrypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256:${hex}`;
  }

  // Node.js runtime fallback
  try {
    const nodeCryptoModule: any = await (new Function('return import("crypto")')());
    const hex = (nodeCryptoModule.default || nodeCryptoModule).createHash('sha256').update(input, 'utf8').digest('hex');
    return `sha256:${hex}`;
  } catch (err) {
    throw new ReplicaChecksumError('Cryptographic SHA-256 implementation unavailable', err);
  }
}

/**
 * Extracts business-relevant fields for Products (excluding volatile sync/UI states)
 */
export function canonicalProduct(record: any): Record<string, unknown> {
  return {
    id: String(record.id || ''),
    tenant_id: String(record.tenant_id || record.tenantId || ''),
    branch_id: record.branch_id || record.branchId ? String(record.branch_id || record.branchId) : null,
    name: String(record.name || '').trim(),
    sku: record.sku ? String(record.sku).trim() : null,
    barcode: record.barcode ? String(record.barcode).trim() : null,
    category: record.category ? String(record.category).trim() : null,
    categoryId: record.categoryId || record.category_id ? String(record.categoryId || record.category_id) : null,
    brand: record.brand ? String(record.brand).trim() : null,
    brandId: record.brandId || record.brand_id ? String(record.brandId || record.brand_id) : null,
    buyingPrice: Number(record.buyingPrice ?? record.buying_price ?? 0),
    sellingPrice: Number(record.sellingPrice ?? record.selling_price ?? record.price ?? 0),
    price: Number(record.price ?? record.selling_price ?? record.sellingPrice ?? 0),
    costPrice: Number(record.costPrice ?? record.cost_price ?? 0),
    wholesalePrice: Number(record.wholesalePrice ?? record.wholesale_price ?? 0),
    vipPrice: Number(record.vipPrice ?? record.vip_price ?? 0),
    onlinePrice: Number(record.onlinePrice ?? record.online_price ?? 0),
    hasVariants: Boolean(record.hasVariants ?? record.has_variants ?? false),
    status: record.status ? String(record.status) : 'Active',
    version: Number(record.version ?? 1),
    deletedAt: record.deletedAt ?? record.deleted_at ?? null,
  };
}

/**
 * Extracts business-relevant fields for Product Variants
 */
export function canonicalVariant(record: any): Record<string, unknown> {
  return {
    id: String(record.id || ''),
    productId: String(record.productId || record.product_id || ''),
    tenant_id: String(record.tenant_id || record.tenantId || ''),
    branch_id: record.branch_id || record.branchId ? String(record.branch_id || record.branchId) : null,
    sku: record.sku ? String(record.sku).trim() : null,
    barcode: record.barcode ? String(record.barcode).trim() : null,
    buyingPrice: Number(record.buyingPrice ?? record.buying_price ?? 0),
    sellingPrice: Number(record.sellingPrice ?? record.selling_price ?? record.price ?? 0),
    wholesalePrice: Number(record.wholesalePrice ?? record.wholesale_price ?? 0),
    vipPrice: Number(record.vipPrice ?? record.vip_price ?? 0),
    onlinePrice: Number(record.onlinePrice ?? record.online_price ?? 0),
    stock: Number(record.stock ?? 0),
    reservedStock: Number(record.reservedStock ?? record.reserved_stock ?? 0),
    reorderLevel: Number(record.reorderLevel ?? record.reorder_level ?? 0),
    status: record.status ? String(record.status) : 'Active',
    attributes: record.attributes ? canonicalize(record.attributes) : {},
    version: Number(record.version ?? 1),
    deletedAt: record.deletedAt ?? record.deleted_at ?? null,
  };
}

/**
 * Extracts business-relevant fields for Categories
 */
export function canonicalCategory(record: any): Record<string, unknown> {
  return {
    id: String(record.id || ''),
    tenant_id: String(record.tenant_id || record.tenantId || ''),
    branch_id: record.branch_id || record.branchId ? String(record.branch_id || record.branchId) : null,
    name: String(record.name || '').trim(),
    code: record.code ? String(record.code).trim() : null,
    description: record.description ? String(record.description).trim() : null,
    parent_id: record.parent_id || record.parentId ? String(record.parent_id || record.parentId) : null,
    status: record.status ? String(record.status) : 'Active',
    sync_version: Number(record.sync_version ?? record.syncVersion ?? 0),
    deletedAt: record.deletedAt ?? record.deleted_at ?? null,
  };
}

/**
 * Extracts business-relevant fields for Brands
 */
export function canonicalBrand(record: any): Record<string, unknown> {
  return {
    id: String(record.id || ''),
    tenant_id: String(record.tenant_id || record.tenantId || ''),
    branch_id: record.branch_id || record.branchId ? String(record.branch_id || record.branchId) : null,
    name: String(record.name || '').trim(),
    code: record.code ? String(record.code).trim() : null,
    description: record.description ? String(record.description).trim() : null,
    status: record.status ? String(record.status) : 'Active',
    sync_version: Number(record.sync_version ?? record.syncVersion ?? 0),
    deletedAt: record.deletedAt ?? record.deleted_at ?? null,
  };
}

/**
 * Generates deterministic canonical checksum from business datasets
 */
export async function calculateCanonicalChecksum(
  tenantId: string,
  products: any[] = [],
  variants: any[] = [],
  categories: any[] = [],
  brands: any[] = [],
  schemaVersion: number = 8
): Promise<ReplicaChecksumResult> {
  try {
    const records = [
      ...products.map((record) => ({
        entity: 'products',
        id: String(record.id),
        data: canonicalProduct(record),
      })),
      ...variants.map((record) => ({
        entity: 'productVariants',
        id: String(record.id),
        data: canonicalVariant(record),
      })),
      ...categories.map((record) => ({
        entity: 'categories',
        id: String(record.id),
        data: canonicalCategory(record),
      })),
      ...brands.map((record) => ({
        entity: 'brands',
        id: String(record.id),
        data: canonicalBrand(record),
      })),
    ];

    // Deterministic sorting by entityType and entityId
    records.sort((a, b) => {
      const left = `${a.entity}:${a.id}`;
      const right = `${b.entity}:${b.id}`;
      return left.localeCompare(right);
    });

    const canonicalPayload = {
      checksumVersion: CHECKSUM_VERSION,
      tenantId: String(tenantId),
      schemaVersion: Number(schemaVersion),
      records: records.map((r) => ({
        entity: r.entity,
        id: r.id,
        data: canonicalize(r.data),
      })),
    };

    const serialized = JSON.stringify(canonicalize(canonicalPayload));
    const digest = await sha256(serialized);

    return {
      tenantId,
      schemaVersion,
      checksumVersion: CHECKSUM_VERSION,
      checksum: digest,
      recordCount: records.length,
      calculatedAt: Date.now(),
    };
  } catch (err) {
    throw new ReplicaChecksumError(`Failed to calculate deterministic replica checksum for tenant ${tenantId}`, err);
  }
}
