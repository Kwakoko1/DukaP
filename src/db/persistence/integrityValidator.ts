/**
 * KwakoPos — Local Integrity Validator
 * 
 * Verifies foreign-key integrity between parent products and variants, categories, and brands.
 */

import { db } from '../dexie';

export interface IntegrityCheckSummary {
  passed: boolean;
  tenantId: string;
  orphanedVariants: number;
  unmappedCategories: number;
  unmappedBrands: number;
  checkedAt: number;
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

      return {
        passed: orphanedVariants === 0,
        tenantId,
        orphanedVariants,
        unmappedCategories,
        unmappedBrands,
        checkedAt: Date.now(),
      };
    } catch (err: any) {
      return {
        passed: false,
        tenantId,
        orphanedVariants: -1,
        unmappedCategories: -1,
        unmappedBrands: -1,
        checkedAt: Date.now(),
        error: err?.message || 'Integrity validation exception'
      };
    }
  }
};

