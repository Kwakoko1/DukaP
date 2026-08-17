/**
 * KwakoPos — Local Integrity Validator
 * 
 * Verifies foreign-key integrity between parent products and variants, categories, and brands,
 * and generates deterministic SHA-256 replica content checksums.
 */

import { db } from '../dexie';
import {
  calculateCanonicalChecksum,
  type ReplicaChecksumResult,
} from './canonicalChecksum';

export interface IntegrityCheckSummary {
  passed: boolean;
  tenantId: string;
  orphanedVariants: number;
  unmappedCategories: number;
  unmappedBrands: number;
  checkedAt: number;
  checksum?: string;
  recordCount?: number;
  error?: string;
}

export const integrityValidator = {
  async checkTenantIntegrity(tenantId: string): Promise<IntegrityCheckSummary> {
    try {
      if (!db.isOpen()) await db.open();

      const [products, variants, categories, brands] = await Promise.all([
        db.products.where('tenant_id').equals(tenantId).toArray().catch(() => []),
        db.productVariants.where('tenant_id').equals(tenantId).toArray().catch(() => []),
        db.categories.where('tenant_id').equals(tenantId).toArray().catch(() => []),
        db.brands.where('tenant_id').equals(tenantId).toArray().catch(() => []),
      ]);

      const productIds = new Set(products.map((p) => p.id));
      const categoryNames = new Set(categories.map((c) => c.name.toLowerCase()));
      const brandNames = new Set(brands.map((b) => b.name.toLowerCase()));

      let orphanedVariants = 0;
      variants.forEach((v) => {
        if (!productIds.has(v.productId)) orphanedVariants++;
      });

      let unmappedCategories = 0;
      let unmappedBrands = 0;
      products.forEach((p) => {
        if (p.category && !categoryNames.has(p.category.toLowerCase())) unmappedCategories++;
        if (p.brand && !brandNames.has(p.brand.toLowerCase())) unmappedBrands++;
      });

      const checksumResult = await calculateCanonicalChecksum(
        tenantId,
        products,
        variants,
        categories,
        brands
      );

      return {
        passed: orphanedVariants === 0,
        tenantId,
        orphanedVariants,
        unmappedCategories,
        unmappedBrands,
        checkedAt: Date.now(),
        checksum: checksumResult.checksum,
        recordCount: checksumResult.recordCount,
      };
    } catch (err: any) {
      return {
        passed: false,
        tenantId,
        orphanedVariants: -1,
        unmappedCategories: -1,
        unmappedBrands: -1,
        checkedAt: Date.now(),
        error: err?.message || 'Integrity validation exception',
      };
    }
  },

  /**
   * Deterministic SHA-256 Checksum from in-memory record arrays
   */
  async calculateChecksumFromData(
    tenantId: string,
    products: any[] = [],
    variants: any[] = [],
    categories: any[] = [],
    brands: any[] = [],
    schemaVersion: number = 8
  ): Promise<string> {
    const result = await calculateCanonicalChecksum(
      tenantId,
      products,
      variants,
      categories,
      brands,
      schemaVersion
    );
    return result.checksum;
  },

  /**
   * Deterministic SHA-256 Checksum from local IndexedDB replica state
   */
  async calculateTenantChecksum(
    tenantId: string,
    schemaVersion: number = 8
  ): Promise<ReplicaChecksumResult> {
    if (!db.isOpen()) await db.open();

    const [products, variants, categories, brands] = await Promise.all([
      db.products.where('tenant_id').equals(tenantId).toArray(),
      db.productVariants.where('tenant_id').equals(tenantId).toArray(),
      db.categories.where('tenant_id').equals(tenantId).toArray(),
      db.brands.where('tenant_id').equals(tenantId).toArray(),
    ]);

    return await calculateCanonicalChecksum(
      tenantId,
      products,
      variants,
      categories,
      brands,
      schemaVersion
    );
  },
};
