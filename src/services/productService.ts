import { db, type Product, type ProductVariant, type Category, type Brand, saveProductAndVariants, syncParentStock } from '../db/dexie';
import { cloudDb } from '../db/supabaseMock';
import { supabase } from '../db/supabaseClient';
import { handleDeleteEntity } from './crossTabSyncService';
import { getActiveSessionRaw } from '../utils/sessionStorage';

export interface UserContext {
  id: string;
  tenant_id: string;
  branch_id: string;
  role: string;
  name: string;
}

export function validateProductPermission(
  action: 'view' | 'create' | 'editPrice' | 'delete',
  role: string
): boolean {
  if (!role) return false;
  const cleanRole = role.trim().toLowerCase();

  // Super Admin, Business Owner & Tenant Owner have full unrestricted access
  if (
    cleanRole === 'super admin' ||
    cleanRole === 'business owner' ||
    cleanRole === 'tenant owner' ||
    cleanRole === 'tenant_owner' ||
    cleanRole.includes('owner') ||
    cleanRole.startsWith('role-owner')
  ) {
    return true;
  }
  
  if (action === 'delete') {
    return (
      cleanRole === 'business administrator' ||
      cleanRole.includes('admin')
    );
  }
  
  if (action === 'create' || action === 'editPrice') {
    return (
      cleanRole === 'business administrator' ||
      cleanRole === 'branch manager' ||
      cleanRole === 'inventory officer' ||
      cleanRole.includes('admin') ||
      cleanRole.includes('manager') ||
      cleanRole.includes('inventory')
    );
  }
  
  if (action === 'view') {
    return true;
  }
  
  return false;
}

// ─── Schema Mapper: camelCase <=> snake_case ────────────────────────────────
export function mapProductToLocal(prod: any): Product {
  const tenantId = prod.tenantId || prod.tenant_id || '';
  const branchId = prod.branchId || prod.branch_id || '';
  const resolvedBuyingPrice = prod.buyingPrice ?? prod.buying_price ?? prod.costPrice ?? prod.cost_price ?? prod.unit_cost ?? 0;
  const resolvedSellingPrice = prod.sellingPrice ?? prod.selling_price ?? prod.price ?? 0;
  const rawStock = prod.stock ?? prod.quantity ?? prod.current_quantity ?? 0;
  const resolvedStock = typeof rawStock === 'number' ? rawStock : (parseFloat(String(rawStock)) || 0);
  const resolvedHasVariants = prod.hasVariants ?? prod.has_variants ?? false;

  return {
    ...prod,
    tenant_id: tenantId,
    branch_id: branchId,
    tenantId,
    branchId,
    buyingPrice: resolvedBuyingPrice,
    costPrice: resolvedBuyingPrice,
    sellingPrice: resolvedSellingPrice,
    price: resolvedSellingPrice,
    stock: resolvedStock,
    hasVariants: resolvedHasVariants,
    has_variants: resolvedHasVariants,
    category: prod.category || prod.categoryId || '',
    module: prod.module || 'Retail',
    categoryId: prod.categoryId || prod.category,
    status: prod.status || 'Active',
    version: prod.version || 1,
    createdAt: prod.createdAt || prod.created_at || Date.now(),
    updatedAt: prod.updatedAt || prod.updated_at || Date.now(),
    createdBy: prod.createdBy || prod.created_by || 'usr-unknown',
    // CRITICAL: Never mark as SYNCED unless coming from the server with syncStatus already set
    syncStatus: prod.syncStatus || 'PENDING',
  } as Product;
}

export function mapProductToCloud(prod: Product): any {
  const tenantId = prod.tenantId || prod.tenant_id || '';
  const branchId = prod.branchId || prod.branch_id || '';
  const resolvedBuyingPrice = prod.buyingPrice ?? prod.costPrice ?? (prod as any).buying_price ?? (prod as any).cost_price ?? 0;
  const resolvedSellingPrice = prod.sellingPrice ?? prod.price ?? (prod as any).selling_price ?? 0;
  const resolvedHasVariants = prod.hasVariants ?? (prod as any).has_variants ?? false;

  return {
    id: prod.id,
    name: prod.name,
    categoryId: prod.categoryId || prod.category || '',
    category: prod.categoryId || prod.category || '',
    costPrice: resolvedBuyingPrice,
    buyingPrice: resolvedBuyingPrice,
    cost_price: resolvedBuyingPrice,
    buying_price: resolvedBuyingPrice,
    sellingPrice: resolvedSellingPrice,
    price: resolvedSellingPrice,
    selling_price: resolvedSellingPrice,
    stock: prod.stock || 0,
    expiryDate: prod.expiryDate,
    tenantId,
    branchId,
    tenant_id: tenantId,
    branch_id: branchId,
    module: prod.module || 'Retail',
    hasVariants: resolvedHasVariants,
    has_variants: resolvedHasVariants,
    brand: prod.brand,
    description: prod.description,
    supplier: prod.supplier,
    supplier_id: (prod as any).supplier_id,
    sku: prod.sku,
    barcode: prod.barcode,
    image: prod.image,
    image_url: (prod as any).image_url,
    attributes: prod.attributes,
    taxRate: (prod as any).taxRate,
    origin: (prod as any).origin || 'PRODUCTION',
    status: prod.status || 'Active',
    version: prod.version || 1,
    createdAt: prod.createdAt || (prod as any).created_at || Date.now(),
    updatedAt: prod.updatedAt || (prod as any).updated_at || Date.now(),
    created_at: prod.createdAt || (prod as any).created_at || Date.now(),
    updated_at: prod.updatedAt || (prod as any).updated_at || Date.now(),
    created_by: prod.createdBy || (prod as any).created_by || 'usr-unknown',
    createdBy: prod.createdBy || (prod as any).created_by || 'usr-unknown',
    updatedBy: prod.updatedBy,
    deletedAt: prod.deletedAt,
  };
}

/**
 * Attempts a direct write to the server for durability.
 * This is a fire-and-forget secondary path — the sync queue is the primary.
 * If this fails, the sync queue will handle it asynchronously.
 */
async function attemptDirectCloudWrite(
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: any,
  tenantId: string,
  userId: string
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'x-user-id': userId,
    };

    let isOk = false;
    if (action === 'DELETE') {
      const res = await fetch(`/api/products/${payload.id}`, {
        method: 'DELETE',
        headers,
        signal: controller.signal,
      }).catch(() => null);
      if (res && res.ok) isOk = true;
    } else {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => null);
      if (res && res.ok) isOk = true;
    }

    clearTimeout(timeoutId);

    if (isOk) return true;

    // Fallback: Direct write to Supabase cloud table
    if (action === 'DELETE') {
      const { error } = await supabase.from('products').delete().eq('id', payload.id);
      return !error;
    } else {
      const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
      return !error;
    }
  } catch {
    clearTimeout(timeoutId);
    try {
      if (action === 'DELETE') {
        const { error } = await supabase.from('products').delete().eq('id', payload.id);
        return !error;
      } else {
        const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
        return !error;
      }
    } catch {
      return false;
    }
  }
}

export class ProductService {
  // ─── Create Product ────────────────────────────────────────────────────────
  static async createProduct(
    input: Omit<Product, 'id' | 'updatedAt' | 'version' | 'syncStatus'>,
    user: UserContext,
    _isOnline: boolean
  ): Promise<Product> {
    if (!validateProductPermission('create', user.role)) {
      throw new Error(`Permission Denied: User role '${user.role}' cannot create products.`);
    }

    const tenantId = input.tenantId || input.tenant_id || user.tenant_id;
    const branchId = input.branchId || input.branch_id || user.branch_id;
    if (tenantId !== user.tenant_id) {
      throw new Error('Security Error: Tenant ID mismatch.');
    }

    const clientUUID = (input as any).id || (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `prod-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    const now = Date.now();
    const newProd: Product = {
      ...input,
      id: clientUUID,
      tenantId,
      branchId,
      tenant_id: tenantId,
      branch_id: branchId,
      module: input.module || 'Retail',
      categoryId: input.categoryId || input.category || '',
      costPrice: input.costPrice !== undefined ? input.costPrice : (input.buyingPrice || 0),
      sellingPrice: input.sellingPrice !== undefined ? input.sellingPrice : (input.price || 0),
      price: input.sellingPrice !== undefined ? input.sellingPrice : (input.price || 0),
      status: input.status || 'Active',
      origin: (input as any).origin || 'PRODUCTION',
      version: 1,
      createdAt: input.createdAt || now,
      updatedAt: now,
      createdBy: user.id,
      syncStatus: 'PENDING',
    };

    const mappedLocal = mapProductToLocal(newProd);
    await saveProductAndVariants(mappedLocal, []);

    // Auto-seed Category if new
    if (newProd.category && newProd.category.trim()) {
      const trimmedCat = newProd.category.trim();
      const existingCat = await db.categories.where('tenant_id').equals(tenantId).filter(c => c.name === trimmedCat).first();
      if (!existingCat) {
        await createCategory({ name: trimmedCat, tenant_id: tenantId }).catch(() => {});
      }
    }

    // Auto-seed Brand if new
    if (newProd.brand && newProd.brand.trim()) {
      const trimmedBrand = newProd.brand.trim();
      const existingBrand = await db.brands.where('tenant_id').equals(tenantId).filter(b => b.name === trimmedBrand).first();
      if (!existingBrand) {
        await createBrand({ name: trimmedBrand, tenant_id: tenantId }).catch(() => {});
      }
    }

    const rawQueued = await db.syncQueue
      .where('entityName').equals('products')
      .and(item => item.payload?.id === newProd.id && item.status === 'Pending')
      .last();
    if (rawQueued?.id !== undefined) {
      await db.syncQueue.update(rawQueued.id, {
        payload: mapProductToCloud(newProd),
      });
    } else {
      await db.syncQueue.add({
        actionType: 'INSERT',
        entityName: 'products',
        payload: mapProductToCloud(newProd),
        timestamp: now,
        status: 'Pending',
      });
    }

    await db.securityAuditLogs.put({
      id: `aud-${now}-${Math.random().toString(36).substring(2, 9)}`,
      tenant_id: tenantId,
      branch_id: branchId,
      user_id: user.id,
      action: 'PRODUCT_CREATED',
      created_at: now,
      details: `Created product '${newProd.name}' (${newProd.id})`,
    } as any);

    // Fire-and-forget background cloud sync (non-blocking for instant local persistence & UI responsiveness)
    attemptDirectCloudWrite('INSERT', mapProductToCloud(newProd), tenantId, user.id).then(async (success) => {
      if (success) {
        await db.products.update(newProd.id, { syncStatus: 'SYNCED', isSynced: 1 } as any);
        const rawItem = await db.syncQueue
          .where('entityName').equals('products')
          .and(item => item.payload?.id === newProd.id && item.status === 'Pending')
          .last();
        if (rawItem?.id !== undefined) {
          await db.syncQueue.delete(rawItem.id);
        }
      }
    }).catch(err => {
      console.warn('[ProductService] Background cloud write notice:', err);
    });

    return newProd;
  }

  // ─── Update Product ────────────────────────────────────────────────────────
  static async updateProduct(
    id: string,
    updates: Partial<Product>,
    user: UserContext,
    _isOnline: boolean
  ): Promise<Product> {
    const existing = await db.products.get(id);
    if (!existing) {
      throw new Error(`Product with ID '${id}' not found.`);
    }

    if (existing.tenant_id !== user.tenant_id) {
      throw new Error('Security Violation: Unauthorized product update.');
    }

    const isPriceChanging = updates.sellingPrice !== undefined || updates.costPrice !== undefined || updates.price !== undefined;
    const action = isPriceChanging ? 'editPrice' : 'create';
    if (!validateProductPermission(action, user.role)) {
      throw new Error(`Permission Denied: User role '${user.role}' cannot update this product attribute.`);
    }

    const now = Date.now();

    const updatedProd: Product = {
      ...existing,
      ...updates,
      tenant_id: existing.tenant_id,
      branch_id: existing.branch_id,
      tenantId: existing.tenantId || existing.tenant_id,
      branchId: existing.branchId || existing.branch_id,
      updatedAt: now,
      updatedBy: user.id,
      version: (existing.version || 1) + 1,
      syncStatus: 'PENDING',
    };

    const mappedLocal = mapProductToLocal(updatedProd);
    await db.products.put(mappedLocal);

    const auditAction = isPriceChanging ? 'PRODUCT_PRICE_CHANGED' : 'PRODUCT_UPDATED';
    await db.securityAuditLogs.put({
      id: `aud-${now}-${Math.random().toString(36).substring(2, 9)}`,
      tenant_id: user.tenant_id,
      branch_id: user.branch_id,
      user_id: user.id,
      action: auditAction,
      created_at: now,
      details: `Updated product '${existing.name}'. Price altered: ${isPriceChanging}`,
    } as any);

    await db.syncQueue.add({
      actionType: 'UPDATE',
      entityName: 'products',
      payload: mapProductToCloud(updatedProd),
      timestamp: now,
      status: 'Pending',
    });

    attemptDirectCloudWrite('UPDATE', mapProductToCloud(updatedProd), user.tenant_id, user.id)
      .then(success => {
        if (success) {
          db.products.update(updatedProd.id, { syncStatus: 'SYNCED', isSynced: 1 } as any)
            .then(() => {
              db.syncQueue
                .where('entityName').equals('products')
                .and(item => item.payload?.id === updatedProd.id && item.status === 'Pending')
                .delete()
                .catch(() => {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return updatedProd;
  }

  // ─── Soft Delete Product ───────────────────────────────────────────────────
  // ─── Pre-Deletion Dependency Scanner ───────────────────────────────────────
  static async scanProductDependencies(productId: string): Promise<{
    hasSales: boolean;
    salesCount: number;
    hasLedger: boolean;
    ledgerCount: number;
    hasVariants: boolean;
    variantCount: number;
    recommendedStrategy: 'archive' | 'permanent';
  }> {
    const variants = await db.productVariants.where('productId').equals(productId).toArray();

    const ledgerCount = await db.stockLedger
      .where('product_id').equals(productId)
      .count();

    const saleLedgerCount = await db.stockLedger
      .where('product_id').equals(productId)
      .and(l => (l.movement_type as string) === 'SALE' || (l.movement_type as string) === 'CUSTOMER_RETURN')
      .count();

    const orders = await db.orders.toArray();
    let orderSalesCount = 0;
    for (const o of orders) {
      if (o.items && o.items.some((i: any) => i.product_id === productId || i.product?.id === productId)) {
        orderSalesCount++;
      }
    }

    const totalSalesCount = saleLedgerCount + orderSalesCount;
    const hasSales = totalSalesCount > 0;
    const hasLedger = ledgerCount > 0;

    return {
      hasSales,
      salesCount: totalSalesCount,
      hasLedger,
      ledgerCount,
      hasVariants: variants.length > 0,
      variantCount: variants.length,
      recommendedStrategy: (hasSales || hasLedger) ? 'archive' : 'permanent'
    };
  }

  static async checkSalesHistory(productId: string): Promise<{ hasSales: boolean; salesCount: number }> {
    const deps = await this.scanProductDependencies(productId);
    return { hasSales: deps.hasSales, salesCount: deps.salesCount };
  }

  // ─── Production-Grade Product Deletion Engine ──────────────────────────────
  static async deleteProduct(
    id: string,
    user: UserContext,
    _isOnline: boolean,
    options?: { permanent?: boolean; archive?: boolean }
  ): Promise<boolean> {
    const existing = await db.products.get(id);
    if (!existing) return false;

    if (existing.tenant_id !== user.tenant_id) {
      throw new Error('Security Violation: Unauthorized product deletion.');
    }

    if (!validateProductPermission('delete', user.role)) {
      throw new Error(`You do not have permission to delete products.`);
    }

    const now = Date.now();

    // 1. ARCHIVE MODE (Soft Delete / Deactivate / Preserve History)
    if (options?.archive && !options?.permanent) {
      const archivedProd: Product = {
        ...existing,
        status: 'Inactive',
        updatedAt: now,
        syncStatus: 'PENDING',
        version: (existing.version || 1) + 1,
      };
      await db.products.put(mapProductToLocal(archivedProd));
      await db.securityAuditLogs.put({
        id: `aud-${now}-${Math.random().toString(36).substring(2, 9)}`,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
        user_id: user.id,
        action: 'PRODUCT_ARCHIVED',
        created_at: now,
        details: `Archived product '${existing.name}' (${id})`,
      } as any);

      await db.syncQueue.add({
        actionType: 'UPDATE',
        entityName: 'products',
        payload: mapProductToCloud(archivedProd),
        timestamp: now,
        status: 'Pending',
      });

      attemptDirectCloudWrite('UPDATE', mapProductToCloud(archivedProd), user.tenant_id, user.id).catch(() => {});
      return true;
    }

    // 2. PERMANENT TRANSACTIONAL DELETION (ACID Global Wipe)
    const variants = await db.productVariants.where('productId').equals(id).toArray();
    const variantIds = variants.map(v => v.id);

    await db.transaction('rw', [
      db.products,
      db.productVariants,
      db.stockLedger,
      db.stockBalance,
      db.batchLots,
      db.serialNumbers,
      db.reorderRules,
      db.heldCarts,
      db.syncQueue,
      db.securityAuditLogs
    ], async () => {
      // a. Cascade Delete Variants
      for (const vId of variantIds) {
        await db.productVariants.delete(vId);
        await db.stockBalance.where('variant_id').equals(vId).delete();
        await db.stockLedger.where('variant_id').equals(vId).delete();
        await db.batchLots.where('variant_id').equals(vId).delete();
        await db.serialNumbers.where('variant_id').equals(vId).delete();
      }

      // b. Cascade Delete Parent Product Inventory & Specs
      await db.stockBalance.where('product_id').equals(id).delete();
      await db.stockLedger.where('product_id').equals(id).delete();
      await db.batchLots.where('product_id').equals(id).delete();
      await db.serialNumbers.where('product_id').equals(id).delete();
      await db.reorderRules.where('product_id').equals(id).delete();

      // c. Clean from open / held carts
      const heldCarts = await db.heldCarts.toArray();
      for (const hc of heldCarts) {
        if (hc.items && hc.items.length > 0) {
          const cleanedItems = hc.items.filter((item: any) => item.product?.id !== id && item.product_id !== id);
          if (cleanedItems.length !== hc.items.length) {
            if (cleanedItems.length === 0) {
              await db.heldCarts.delete(hc.id);
            } else {
              await db.heldCarts.update(hc.id, { items: cleanedItems });
            }
          }
        }
      }

      // d. Write Tombstone Record into IndexedDB
      await handleDeleteEntity(db, 'products', id, user.tenant_id, user.branch_id);

      // e. Immutable Security Audit Log
      await db.securityAuditLogs.put({
        id: `aud-${now}-${Math.random().toString(36).substring(2, 9)}`,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
        user_id: user.id,
        action: 'DELETE_PRODUCT',
        created_at: now,
        details: `Permanently deleted product '${existing.name}' (${id}) and ${variants.length} variant(s)`,
      } as any);

      // f. Sync Queue Event
      await db.syncQueue.add({
        actionType: 'DELETE',
        entityName: 'products',
        payload: { id, tenant_id: user.tenant_id, deletedAt: now, deletedBy: user.id },
        timestamp: now,
        status: 'Pending',
      });
    });

    // 3. Direct Server Cloud Write (Fire-and-forget server sync)
    attemptDirectCloudWrite('DELETE', { id }, user.tenant_id, user.id).catch(() => {});

    return true;
  }

  // ─── Cloud reconciliation download ────────────────────────────────────────
  static async reconcileCloudChanges(cloudProducts: Product[], tenantId: string) {
    if (!cloudProducts || cloudProducts.length === 0) {
      return;
    }

    const tenantBranches = await db.branches.where('tenant_id').equals(tenantId).toArray();
    const primaryBranchId = tenantBranches.length > 0 ? tenantBranches[0].id : 'branch-main';

    for (const cp of cloudProducts) {
      if (cp.deletedAt || (cp as any).deleted_at || (cp as any).deleted) {
        // Cascade-delete variants and preserve tombstone for product
        const orphanVariants = await db.productVariants.where('productId').equals(cp.id).toArray();
        for (const v of orphanVariants) {
          await db.productVariants.delete(v.id);
          await db.stockBalance.where('variant_id').equals(v.id).delete();
        }
        await db.stockBalance.where('product_id').equals(cp.id).delete();
        await handleDeleteEntity(db, 'products', cp.id, tenantId);
        continue;
      }

      const existing = await db.products.get(cp.id);
      if (existing && existing.syncStatus === 'PENDING') {
        continue;
      }

      const bid = cp.branchId || cp.branch_id || primaryBranchId;
      const resolvedBranchId = (bid === 'branch-dar-hq' && tenantId !== 'tenant-101') ? primaryBranchId : bid;

      const localFormat = mapProductToLocal({
        ...cp,
        branchId: resolvedBranchId,
        branch_id: resolvedBranchId,
        syncStatus: 'SYNCED',
      });
      await db.products.put(localFormat);
      if (cp.hasVariants) {
        await syncParentStock(cp.id);
      }
    }
  }

  // ─── Automated Variant Deduplication & Cleanup ─────────────────────────────
  static async cleanDuplicateVariants(tenantId?: string): Promise<{ cleanedCount: number; mergedProducts: number }> {
    return cleanDuplicateVariants(tenantId);
  }
}

export function getVariantAttrSig(attributes: Record<string, string> | undefined | null): string {
  if (!attributes || typeof attributes !== 'object') return '';
  const parts: string[] = [];
  for (const [, v] of Object.entries(attributes)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      parts.push(String(v).trim().toLowerCase());
    }
  }
  return parts.sort().join('|');
}

export async function cleanDuplicateVariants(tenantId?: string): Promise<{ cleanedCount: number; mergedProducts: number }> {
  try {
    let query = db.productVariants.toCollection();
    if (tenantId) {
      query = db.productVariants.where('tenant_id').equals(tenantId);
    }
    const allVariants = await query.toArray();
    if (allVariants.length === 0) return { cleanedCount: 0, mergedProducts: 0 };

    let cleanedCount = 0;
    const mergedProductIds = new Set<string>();

    // Step 0: Purge orphaned variants with missing/invalid productId or non-existent parent product
    let validProdQuery = db.products.toCollection();
    if (tenantId) {
      validProdQuery = db.products.where('tenant_id').equals(tenantId);
    }
    const validProducts = await validProdQuery.toArray();
    const validProductIds = new Set(validProducts.map(p => p.id));

    const activeVariants: ProductVariant[] = [];
    for (const v of allVariants) {
      if (!v.productId || !validProductIds.has(v.productId)) {
        await db.productVariants.delete(v.id);
        cleanedCount++;
      } else {
        activeVariants.push(v);
      }
    }

    const groupedByProduct = new Map<string, ProductVariant[]>();
    for (const v of activeVariants) {
      if (!groupedByProduct.has(v.productId)) {
        groupedByProduct.set(v.productId, []);
      }
      groupedByProduct.get(v.productId)!.push(v);
    }

    for (const [productId, vars] of groupedByProduct.entries()) {
      if (vars.length <= 1) continue;

      const sigMap = new Map<string, ProductVariant[]>();
      for (const v of vars) {
        const sig = getVariantAttrSig(v.attributes) || (v.sku ? `sku:${v.sku.trim().toLowerCase()}` : `id:${v.id}`);
        if (!sigMap.has(sig)) sigMap.set(sig, []);
        sigMap.get(sig)!.push(v);
      }

      for (const [, group] of sigMap.entries()) {
        if (group.length <= 1) continue;

        group.sort((a, b) => {
          const aStock = a.stock || 0;
          const bStock = b.stock || 0;
          if (aStock !== bStock) return bStock - aStock;
          const aHasSku = a.sku ? 1 : 0;
          const bHasSku = b.sku ? 1 : 0;
          if (aHasSku !== bHasSku) return bHasSku - aHasSku;
          return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        });

        const kept = group[0];
        const redundant = group.slice(1);

        for (const red of redundant) {
          const redLedger = await db.stockLedger.where('variant_id').equals(red.id).toArray();
          for (const l of redLedger) {
            await db.stockLedger.update(l.id, { variant_id: kept.id });
          }

          const redBal = await db.stockBalance.where('variant_id').equals(red.id).toArray();
          for (const b of redBal) {
            await db.stockBalance.delete(b.id);
          }

          await db.productVariants.delete(red.id);

          try {
            await cloudDb.cloud_product_variants.delete(red.id);
          } catch {}

          const syncItems = await db.syncQueue.where('entityName').equals('productVariants').toArray();
          for (const sq of syncItems) {
            if (sq.payload?.id === red.id) {
              await db.syncQueue.delete(sq.id!);
            }
          }

          cleanedCount++;
          mergedProductIds.add(productId);
        }
      }

      if (mergedProductIds.has(productId)) {
        await syncParentStock(productId);
      }
    }

    return { cleanedCount, mergedProducts: mergedProductIds.size };
  } catch (err) {
    console.error('Error cleaning duplicate variants:', err);
    return { cleanedCount: 0, mergedProducts: 0 };
  }
}

// ─── createProductWithVariants ──────────────────────────────────────────────
export async function createProductWithVariants(
  input: Omit<Product, 'id' | 'updatedAt' | 'version' | 'syncStatus'>,
  variants: Omit<ProductVariant, 'productId' | 'isSynced' | 'syncStatus'>[],
  user: UserContext,
  _isOnline: boolean
): Promise<{ product: Product; variants: ProductVariant[] }> {
  if (!validateProductPermission('create', user.role)) {
    throw new Error(`Permission Denied: '${user.role}' cannot create products.`);
  }

  const tenantId = input.tenantId || input.tenant_id || user.tenant_id;
  const branchId = input.branchId || input.branch_id || user.branch_id;
  if (tenantId !== user.tenant_id) throw new Error('Security Error: Tenant ID mismatch.');

  const productId = (input as any).id || ((typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `prod-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  const now = Date.now();
  const prodCreatedAt = input.createdAt || now;

  const product: Product = {
    ...input,
    id: productId,
    tenantId,
    branchId,
    tenant_id: tenantId,
    branch_id: branchId,
    categoryId: input.categoryId || input.category || '',
    costPrice: input.costPrice ?? input.buyingPrice ?? 0,
    sellingPrice: input.sellingPrice ?? input.price ?? 0,
    price: input.sellingPrice ?? input.price ?? 0,
    status: input.status || 'Active',
    version: 1,
    createdAt: prodCreatedAt,
    updatedAt: now,
    createdBy: user.id,
    syncStatus: 'PENDING',
    hasVariants: variants.length > 0,
  };

  const boundVariants: ProductVariant[] = variants.map((v, i) => ({
    ...v,
    id: (v as any).id ?? ((typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `var-${productId}-${i}`),
    productId,
    tenant_id: tenantId,
    branch_id: branchId,
    isSynced: 0,
    syncStatus: 'PENDING' as const,
    createdAt: prodCreatedAt,
    createdBy: user.id,
  }));

  await saveProductAndVariants(product, boundVariants);
  await syncParentStock(productId);

  const rawQueued = await db.syncQueue
    .where('entityName').equals('products')
    .and(item => item.payload?.id === productId && item.status === 'Pending')
    .last();
  if (rawQueued?.id !== undefined) {
    await db.syncQueue.update(rawQueued.id, {
      payload: mapProductToCloud(product),
    });
  }

  await db.securityAuditLogs.put({
    id: `aud-${now}-${Math.random().toString(36).substring(2, 9)}`,
    tenant_id: tenantId,
    branch_id: branchId,
    user_id: user.id,
    action: 'PRODUCT_WITH_VARIANTS_CREATED',
    created_at: now,
    details: `Created '${product.name}' (${productId}) with ${boundVariants.length} variant(s).`,
  } as any);

  return { product, variants: boundVariants };
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchCategories(tenantId: string): Promise<Category[]> {
  const local = await db.categories.where('tenant_id').equals(tenantId).toArray();
  return local;
}

export async function createCategory(
  input: string | Partial<Category>,
  tenantId?: string,
  _branchId?: string
): Promise<Category> {
  const catName = typeof input === 'string' ? input : (input.name || '');
  const trimmedName = catName.trim();
  if (!trimmedName) throw new Error('Category name cannot be empty.');

  let tid = typeof input === 'string' ? (tenantId || '') : (input.tenant_id || tenantId || '');
  if (!tid) {
    try {
      const sessStr = getActiveSessionRaw();
      if (sessStr) {
        const sess = JSON.parse(sessStr);
        tid = sess?.tenant?.id || sess?.user?.tenant_id || 'tenant-101';
      }
    } catch (_) {}
    if (!tid) tid = 'tenant-101';
  }

  // Case-insensitive uniqueness validation within tenant
  const existing = await db.categories.where('tenant_id').equals(tid).filter(c => Boolean(c.name && c.name.toLowerCase() === trimmedName.toLowerCase())).first();
  if (existing) {
    return existing;
  }

  const category: Category = {
    id: typeof input !== 'string' && input.id ? input.id : `cat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: trimmedName,
    tenant_id: tid,
    branch_id: typeof input !== 'string' ? (input.branch_id || _branchId || null) : (_branchId || null),
    industry_type: typeof input !== 'string' ? input.industry_type : undefined,
    description: typeof input !== 'string' ? input.description : undefined,
    created_at: Date.now(),
  };
  await db.categories.put(category);
  await db.syncQueue.add({
    actionType: 'CREATE',
    entityName: 'categories',
    tenant_id: tid,
    payload: category,
    timestamp: Date.now(),
    status: 'Pending',
  });
  return category;
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<void> {
  await db.categories.update(id, updates);
  const updated = await db.categories.get(id);
  if (updated) {
    await db.syncQueue.add({
      actionType: 'UPDATE',
      entityName: 'categories',
      tenant_id: updated.tenant_id,
      payload: updated,
      timestamp: Date.now(),
      status: 'Pending',
    });
  }
}

export function getDeletedCategoryNames(): Set<string> {
  try {
    const raw = localStorage.getItem('dukapos_deleted_categories');
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function registerDeletedCategoryName(nameOrId: string): void {
  if (!nameOrId || !nameOrId.trim()) return;
  try {
    const set = getDeletedCategoryNames();
    set.add(nameOrId.trim());
    set.add(nameOrId.trim().toLowerCase());
    localStorage.setItem('dukapos_deleted_categories', JSON.stringify(Array.from(set)));
  } catch {}
}

export function getDeletedBrandNames(): Set<string> {
  try {
    const raw = localStorage.getItem('dukapos_deleted_brands');
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function registerDeletedBrandName(nameOrId: string): void {
  if (!nameOrId || !nameOrId.trim()) return;
  try {
    const set = getDeletedBrandNames();
    set.add(nameOrId.trim());
    set.add(nameOrId.trim().toLowerCase());
    localStorage.setItem('dukapos_deleted_brands', JSON.stringify(Array.from(set)));
  } catch {}
}

export async function deleteCategory(idOrName: string, tenantId?: string, reassignToCategory: string = 'General'): Promise<void> {
  let catRecord = await db.categories.get(idOrName);
  if (!catRecord && tenantId) {
    catRecord = await db.categories.where('tenant_id').equals(tenantId).filter(c => Boolean(c.name && (c.name === idOrName || c.name.toLowerCase() === idOrName.toLowerCase()))).first();
  }
  if (!catRecord) {
    catRecord = await db.categories.filter(c => c.id === idOrName || (Boolean(c.name) && c.name.toLowerCase() === idOrName.toLowerCase())).first();
  }

  const catName = catRecord?.name || idOrName;
  const catId = catRecord?.id || idOrName;
  const tid = catRecord?.tenant_id || tenantId || '';

  // Register tombstones
  registerDeletedCategoryName(catId);
  registerDeletedCategoryName(catName);

  // 1. Write Tombstones for category records matching ID or Name
  if (catRecord) {
    await handleDeleteEntity(db, 'categories', catRecord.id, tid);
  }
  const matchingCats = await db.categories.filter(c => c.id === catId || (Boolean(c.name) && c.name.toLowerCase() === catName.toLowerCase())).toArray();
  for (const mc of matchingCats) {
    await handleDeleteEntity(db, 'categories', mc.id, tid);
  }

  // 2. Reassign / clear category on all matching products
  let prodQuery = db.products.toCollection();
  if (tid) {
    prodQuery = db.products.where('tenant_id').equals(tid);
  }
  const allProds = await prodQuery.toArray();
  const lowerTargetName = catName.toLowerCase();

  for (const p of allProds) {
    const pCat = p.category ? p.category.trim() : '';
    const pCatId = p.categoryId || (p as any).category_id;
    if (pCatId === catId || pCat.toLowerCase() === lowerTargetName || pCat === catName) {
      await db.products.update(p.id, {
        category: reassignToCategory,
        categoryId: reassignToCategory === 'General' ? '' : reassignToCategory,
        updatedAt: Date.now(),
      });
    }
  }

  // 3. Queue sync deletion event
  await db.syncQueue.add({
    actionType: 'DELETE',
    entityName: 'categories',
    tenant_id: tid || 'tenant-101',
    payload: { id: catId, name: catName, tenant_id: tid },
    timestamp: Date.now(),
    status: 'Pending',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BRANDS SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchBrands(tenantId: string): Promise<Brand[]> {
  try {
    return await db.brands.where('tenant_id').equals(tenantId).toArray();
  } catch {
    return [];
  }
}

export async function createBrand(
  input: string | Partial<Brand>,
  tenantId?: string
): Promise<Brand> {
  const bName = typeof input === 'string' ? input : (input.name || '');
  const trimmedName = bName.trim();
  if (!trimmedName) throw new Error('Brand name cannot be empty.');

  let tid = typeof input === 'string' ? (tenantId || '') : (input.tenant_id || tenantId || '');
  if (!tid) {
    try {
      const sessStr = getActiveSessionRaw();
      if (sessStr) {
        const sess = JSON.parse(sessStr);
        tid = sess?.tenant?.id || sess?.user?.tenant_id || 'tenant-101';
      }
    } catch (_) {}
    if (!tid) tid = 'tenant-101';
  }

  // Case-insensitive uniqueness validation within tenant
  const existing = await db.brands.where('tenant_id').equals(tid).filter(b => Boolean(b.name && b.name.toLowerCase() === trimmedName.toLowerCase())).first();
  if (existing) {
    return existing;
  }

  const brand: Brand = {
    id: typeof input !== 'string' && input.id ? input.id : `brand-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: trimmedName,
    tenant_id: tid,
    branch_id: typeof input !== 'string' ? (input.branch_id || null) : null,
    description: typeof input !== 'string' ? input.description : undefined,
    description_corporate_line: typeof input !== 'string' ? (input.description_corporate_line || input.description) : undefined,
    created_at: Date.now(),
  };
  await db.brands.put(brand);
  await db.syncQueue.add({
    actionType: 'CREATE',
    entityName: 'brands',
    tenant_id: tid,
    payload: brand,
    timestamp: Date.now(),
    status: 'Pending',
  });
  return brand;
}

export async function updateBrand(id: string, updates: Partial<Brand>): Promise<void> {
  await db.brands.update(id, updates);
  const updated = await db.brands.get(id);
  if (updated) {
    await db.syncQueue.add({
      actionType: 'UPDATE',
      entityName: 'brands',
      tenant_id: updated.tenant_id,
      payload: updated,
      timestamp: Date.now(),
      status: 'Pending',
    });
  }
}

export async function deleteBrand(idOrName: string, tenantId?: string, reassignToBrand: string = ''): Promise<void> {
  let brandRecord = await db.brands.get(idOrName);
  if (!brandRecord && tenantId) {
    brandRecord = await db.brands.where('tenant_id').equals(tenantId).filter(b => Boolean(b.name && (b.name === idOrName || b.name.toLowerCase() === idOrName.toLowerCase()))).first();
  }
  if (!brandRecord) {
    brandRecord = await db.brands.filter(b => b.id === idOrName || (Boolean(b.name) && b.name.toLowerCase() === idOrName.toLowerCase())).first();
  }

  const brandName = brandRecord?.name || idOrName;
  const brandId = brandRecord?.id || idOrName;
  const tid = brandRecord?.tenant_id || tenantId || '';

  // Register tombstones
  registerDeletedBrandName(brandId);
  registerDeletedBrandName(brandName);

  // 1. Write Tombstones for brand records matching ID or Name
  if (brandRecord) {
    await handleDeleteEntity(db, 'brands', brandRecord.id, tid);
  }
  const matchingBrands = await db.brands.filter(b => b.id === brandId || (Boolean(b.name) && b.name.toLowerCase() === brandName.toLowerCase())).toArray();
  for (const mb of matchingBrands) {
    await handleDeleteEntity(db, 'brands', mb.id, tid);
  }

  // 2. Reassign / clear brand on all matching products
  let prodQuery = db.products.toCollection();
  if (tid) {
    prodQuery = db.products.where('tenant_id').equals(tid);
  }
  const allProds = await prodQuery.toArray();
  const lowerTargetName = brandName.toLowerCase();

  for (const p of allProds) {
    const pBrand = p.brand ? p.brand.trim() : '';
    const pBrandId = (p as any).brandId || (p as any).brand_id;
    if (pBrandId === brandId || pBrand.toLowerCase() === lowerTargetName || pBrand === brandName) {
      await db.products.update(p.id, {
        brand: reassignToBrand,
        updatedAt: Date.now(),
      });
    }
  }

  // 3. Queue sync deletion event
  await db.syncQueue.add({
    actionType: 'DELETE',
    entityName: 'brands',
    tenant_id: tid || 'tenant-101',
    payload: { id: brandId, name: brandName, tenant_id: tid },
    timestamp: Date.now(),
    status: 'Pending',
  });
}
// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE CATEGORY & BRAND HYGIENE & PRESETS SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export const INDUSTRY_CATEGORY_PRESETS: Record<string, { name: string; description: string; default_tax_rate?: string; target_margin_pct?: number }[]> = {
  Retail: [
    { name: 'Grocery & Food', description: 'Packaged grains, spices, oils & dry food items', default_tax_rate: '0% (Exempt)', target_margin_pct: 20 },
    { name: 'Soft Drinks & Juices', description: 'Carbonated beverages, bottled water & fresh juices', default_tax_rate: '18% VAT', target_margin_pct: 25 },
    { name: 'Alcoholic Beverages', description: 'Beers, spirits, wines & ciders', default_tax_rate: '18% VAT', target_margin_pct: 30 },
    { name: 'Personal Care & Hygiene', description: 'Soaps, shampoos, toothpaste & cosmetics', default_tax_rate: '18% VAT', target_margin_pct: 25 },
    { name: 'Household & Cleaning', description: 'Detergents, disinfectants & trash bags', default_tax_rate: '18% VAT', target_margin_pct: 22 },
    { name: 'Bakery & Snacks', description: 'Fresh bread, cakes, biscuits & crisps', default_tax_rate: '0% (Exempt)', target_margin_pct: 30 },
    { name: 'Electronics & Accessories', description: 'Batteries, cables, bulbs & small appliances', default_tax_rate: '18% VAT', target_margin_pct: 35 },
  ],
  Pharmacy: [
    { name: 'Prescription Antibiotics', description: 'POM regulated antibiotic medications', default_tax_rate: '0% (Exempt)', target_margin_pct: 30 },
    { name: 'Pain Relievers & OTC', description: 'Over-the-counter painkillers & cold remedies', default_tax_rate: '0% (Exempt)', target_margin_pct: 35 },
    { name: 'Chronic Care & Diabetes', description: 'Hypertension, insulin & cardiac medications', default_tax_rate: '0% (Exempt)', target_margin_pct: 25 },
    { name: 'Vitamins & Supplements', description: 'Multivitamins, minerals & health supplements', default_tax_rate: '18% VAT', target_margin_pct: 40 },
    { name: 'First Aid & Surgical', description: 'Bandages, syringes, gloves & antiseptic', default_tax_rate: '0% (Exempt)', target_margin_pct: 30 },
    { name: 'Baby & Child Health', description: 'Baby formula, diapers & infant medicines', default_tax_rate: '0% (Exempt)', target_margin_pct: 20 },
  ],
  Restaurant: [
    { name: 'Starters & Appetizers', description: 'Soups, salads & finger food appetizers', default_tax_rate: '18% VAT', target_margin_pct: 50 },
    { name: 'Main Courses & Grills', description: 'Steaks, chicken, fish & rice platters', default_tax_rate: '18% VAT', target_margin_pct: 45 },
    { name: 'Desserts & Sweets', description: 'Ice cream, cakes & sweet pastries', default_tax_rate: '18% VAT', target_margin_pct: 55 },
    { name: 'Fresh Juices & Cocktails', description: 'Fresh fruit smoothies & house cocktails', default_tax_rate: '18% VAT', target_margin_pct: 60 },
    { name: 'Hot Beverages & Tea', description: 'Coffee, chai, espresso & tea pots', default_tax_rate: '18% VAT', target_margin_pct: 65 },
  ],
  Hardware: [
    { name: 'Cement & Aggregates', description: 'Portland cement, sand, gravel & ballast', default_tax_rate: '18% VAT', target_margin_pct: 15 },
    { name: 'Steel & Iron Bars', description: 'Deformed TMT bars, BRC mesh & wire', default_tax_rate: '18% VAT', target_margin_pct: 18 },
    { name: 'Plumbing & PVC Pipes', description: 'Pipes, fittings, valves & water tanks', default_tax_rate: '18% VAT', target_margin_pct: 25 },
    { name: 'Electrical & Wiring', description: 'Cables, switches, breakers & conduits', default_tax_rate: '18% VAT', target_margin_pct: 28 },
    { name: 'Paints & Sealants', description: 'Emulsion paint, primer, thinner & silicone', default_tax_rate: '18% VAT', target_margin_pct: 30 },
    { name: 'Hand & Power Tools', description: 'Hammers, drills, saws & safety gear', default_tax_rate: '18% VAT', target_margin_pct: 35 },
  ],
  Bar: [
    { name: 'Beers & Ciders', description: 'Lagers, stouts, draft & craft beers', default_tax_rate: '18% VAT', target_margin_pct: 35 },
    { name: 'Spirits & Whiskies', description: 'Vodka, gin, rum, scotch & cognac', default_tax_rate: '18% VAT', target_margin_pct: 50 },
    { name: 'Wines & Champagne', description: 'Red, white, sparkling & dessert wines', default_tax_rate: '18% VAT', target_margin_pct: 45 },
    { name: 'House Cocktails', description: 'Signature mixed drinks & shooters', default_tax_rate: '18% VAT', target_margin_pct: 65 },
    { name: 'Energy Drinks & Mixers', description: 'Tonic, soda water, ginger ale & Red Bull', default_tax_rate: '18% VAT', target_margin_pct: 40 },
  ],
};

export async function seedIndustryCategoryPresets(tenantId: string, moduleName: string): Promise<number> {
  const presets = INDUSTRY_CATEGORY_PRESETS[moduleName] || INDUSTRY_CATEGORY_PRESETS.Retail;
  let count = 0;
  for (const p of presets) {
    const existing = await db.categories.where('tenant_id').equals(tenantId).filter(c => Boolean(c.name && c.name.toLowerCase() === p.name.toLowerCase())).first();
    if (!existing) {
      await createCategory({
        name: p.name,
        description: p.description,
        tenant_id: tenantId,
        default_tax_rate: p.default_tax_rate,
        target_margin_pct: p.target_margin_pct,
        module: moduleName,
      }, tenantId);
      count++;
    }
  }
  return count;
}

export async function mergeDuplicateCategories(tenantId: string): Promise<{ mergedCount: number; updatedProductsCount: number }> {
  const allCats = await db.categories.where('tenant_id').equals(tenantId).toArray();
  const prods = await db.products.where('tenant_id').equals(tenantId).toArray();
  
  const nameGroups = new Map<string, Category[]>();
  for (const c of allCats) {
    const norm = (c.name || '').trim().toLowerCase();
    if (!norm) continue;
    if (!nameGroups.has(norm)) nameGroups.set(norm, []);
    nameGroups.get(norm)!.push(c);
  }

  let mergedCount = 0;
  let updatedProductsCount = 0;

  for (const [, group] of nameGroups) {
    if (group.length > 1) {
      const canonical = group.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
      const dupes = group.filter(c => c.id !== canonical.id);
      const dupeNames = new Set(dupes.map(d => d.name));

      for (const p of prods) {
        if (p.category && dupeNames.has(p.category)) {
          await db.products.update(p.id, { category: canonical.name });
          updatedProductsCount++;
        }
      }

      for (const d of dupes) {
        await deleteCategory(d.id);
        mergedCount++;
      }
    }
  }

  return { mergedCount, updatedProductsCount };
}

export async function mergeDuplicateBrands(tenantId: string): Promise<{ mergedCount: number; updatedProductsCount: number }> {
  const allBrandsList = await db.brands.where('tenant_id').equals(tenantId).toArray();
  const prods = await db.products.where('tenant_id').equals(tenantId).toArray();

  const nameGroups = new Map<string, Brand[]>();
  for (const b of allBrandsList) {
    const norm = (b.name || '').trim().toLowerCase();
    if (!norm) continue;
    if (!nameGroups.has(norm)) nameGroups.set(norm, []);
    nameGroups.get(norm)!.push(b);
  }

  let mergedCount = 0;
  let updatedProductsCount = 0;

  for (const [, group] of nameGroups) {
    if (group.length > 1) {
      const canonical = group.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
      const dupes = group.filter(b => b.id !== canonical.id);
      const dupeNames = new Set(dupes.map(d => d.name));

      for (const p of prods) {
        if (p.brand && dupeNames.has(p.brand)) {
          await db.products.update(p.id, { brand: canonical.name });
          updatedProductsCount++;
        }
      }

      for (const d of dupes) {
        await deleteBrand(d.id);
        mergedCount++;
      }
    }
  }

  return { mergedCount, updatedProductsCount };
}

export async function deleteAllCategoriesAndBrands(tenantId: string): Promise<{ categoriesDeleted: number; brandsDeleted: number }> {
  const cats = await db.categories.where('tenant_id').equals(tenantId).toArray();
  const brands = await db.brands.where('tenant_id').equals(tenantId).toArray();

  for (const c of cats) {
    await db.categories.delete(c.id);
  }
  for (const b of brands) {
    await db.brands.delete(b.id);
  }

  return { categoriesDeleted: cats.length, brandsDeleted: brands.length };
}

export async function reassignCategoryProducts(tenantId: string, fromCategory: string, toCategory: string): Promise<number> {
  const prods = await db.products.where('tenant_id').equals(tenantId).filter(p => p.category === fromCategory).toArray();
  for (const p of prods) {
    await db.products.update(p.id, { category: toCategory });
  }
  const catRec = await db.categories.where('tenant_id').equals(tenantId).filter(c => c.name === fromCategory).first();
  if (catRec) {
    await deleteCategory(catRec.id);
  }
  return prods.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// UN-SYNCED PRODUCT RECOVERY ROUTINE (Dual-Layer Sync & Reconciliation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inspects local IndexedDB for product records marked as PENDING/unsynced,
 * forces a batch push to backend endpoint /api/products/sync-batch,
 * and marks local items as SYNCED once acknowledged.
 */
export async function recoverUnsyncedProducts(tenantId: string): Promise<number> {
  try {
    if (!tenantId) return 0;

    const pendingProducts = await db.products
      .where('tenant_id').equals(tenantId)
      .filter(p => p.syncStatus === 'PENDING' || (p as any).isSynced === 0)
      .toArray();

    if (pendingProducts.length === 0) {
      return 0;
    }

    console.log(`Found ${pendingProducts.length} local un-synced product records. Forcing push...`);

    const response = await fetch('/api/products/sync-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify({
        products: pendingProducts
      })
    });

    if (response.ok) {
      const result = await response.json();
      const syncedCount = result.syncedCount || pendingProducts.length;

      await db.transaction('rw', db.products, async () => {
        for (const p of pendingProducts) {
          await db.products.update(p.id, {
            syncStatus: 'SYNCED',
            isSynced: 1
          } as any);
        }
      });

      // Clear pending queue items for these products
      const pendingIds = new Set(pendingProducts.map(p => p.id));
      const queueItems = await db.syncQueue.where('entityName').equals('products').toArray();
      for (const q of queueItems) {
        if (q.id !== undefined && q.payload?.id && pendingIds.has(q.payload.id)) {
          await db.syncQueue.delete(q.id);
        }
      }

      console.log(`Successfully recovered and synced ${syncedCount} product stocks.`);
      return syncedCount;
    }
    return 0;
  } catch (error) {
    console.error("Failed to recover local product stocks:", error);
    return 0;
  }
}

