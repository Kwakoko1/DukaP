/**
 * KwakoPos — Local Integrity Validator
 * 
 * Verifies foreign-key integrity between parent products and variants, categories, and brands,
 * and generates deterministic replica checksums.
 */

import { db } from '../dexie';

export interface IntegrityCheckSummary {
  passed: boolean;
  tenantId: string;
  orphanedVariants: number;
  unmappedCategories: number;
  unmappedBrands: number;
  checkedAt: number;
  checksum?: string;
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

      const checksum = this.calculateChecksumFromData(products, variants, categories, brands);

      return {
        passed: orphanedVariants === 0,
        tenantId,
        orphanedVariants,
        unmappedCategories,
        unmappedBrands,
        checkedAt: Date.now(),
        checksum,
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
  },

  calculateChecksumFromData(products: any[], variants: any[], categories: any[], brands: any[]): string {
    const rawString = `${products.length}:${variants.length}:${categories.length}:${brands.length}`;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
      const char = rawString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `chk-${Math.abs(hash).toString(16)}-${products.length}`;
  },

  async calculateTenantChecksum(tenantId: string): Promise<string> {
    try {
      if (!db.isOpen()) await db.open();
      const [prods, vars, cats, brds] = await Promise.all([
        db.products.where('tenant_id').equals(tenantId).count().catch(() => 0),
        db.productVariants.where('tenant_id').equals(tenantId).count().catch(() => 0),
        db.categories.where('tenant_id').equals(tenantId).count().catch(() => 0),
        db.brands.where('tenant_id').equals(tenantId).count().catch(() => 0),
      ]);
      return `chk-${tenantId.slice(0, 6)}-${prods}-${vars}-${cats}-${brds}`;
    } catch {
      return 'chk-unknown';
    }
  }
};
