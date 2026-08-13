import { useEffect, useState, useCallback } from 'react';
import { db, type Product } from '../db/dexie';
import { mapProductToLocal } from '../services/productService';

export function useTenantProducts(tenantId?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Force explicit tenant validation header & cache-busting timestamp
      const response = await fetch(`/api/products?tenantId=${encodeURIComponent(tenantId)}&_t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'x-tenant-id': tenantId,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: Failed to synchronize product inventory`);
      }

      const responseData = await response.json();
      const serverProducts: any[] = Array.isArray(responseData)
        ? responseData
        : (responseData.products || []);

      // 2. Hydrate local IndexedDB with retrieved server products
      for (const sp of serverProducts) {
        if (sp.deletedAt || sp.deleted_at) {
          await db.products.delete(sp.id);
          continue;
        }
        const existing = await db.products.get(sp.id);
        if (existing && existing.syncStatus === 'PENDING') continue;

        const localFormat = mapProductToLocal({ ...sp, syncStatus: 'SYNCED' });
        await db.products.put(localFormat);
      }

      // 3. Query local storage for active tenant's products
      const localTenantProducts = await db.products
        .where('tenant_id').equals(tenantId)
        .and(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive')
        .toArray();

      setProducts(localTenantProducts);
    } catch (err: any) {
      console.error('Failed to synchronize product inventory:', err);
      setError(err.message || 'Synchronization failed');

      // Fallback: load whatever is available in IndexedDB for this tenant
      const localTenantProducts = await db.products
        .where('tenant_id').equals(tenantId)
        .and(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive')
        .toArray();
      setProducts(localTenantProducts);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refetch: fetchProducts };
}
