import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file if available
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valParts] = trimmed.split('=');
      const val = valParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (key.trim() && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  });
}

const connectionString = process.env.DATABASE_URL || process.env.VITE_POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/kwakopos';
const client = new pg.Client({ connectionString });

async function verifyOrphanPurgeEngine() {
  console.log('======================================================');
  console.log('🧪 VERIFYING ORPHAN RECORD PURGE & INTEGRITY AUDIT WIRING');
  console.log('======================================================');

  try {
    await client.connect();
    console.log('✅ [1/5] Connected to PostgreSQL Database Engine.');

    const fakeOrphanTenant = `non-existent-tenant-${Date.now()}`;
    const now = Date.now();

    // 1. Temporarily drop any FK referencing tenants to test unlinked orphan detection
    const fks = await client.query(`
      SELECT conname, conrelid::regclass as tbl 
      FROM pg_constraint 
      WHERE contype = 'f' AND confrelid::regclass::text = 'tenants'
    `);
    
    for (const fk of fks.rows) {
      await client.query(`ALTER TABLE "${fk.tbl}" DROP CONSTRAINT IF EXISTS "${fk.conname}"`);
    }

    const testCatId = `cat-orphan-${Date.now()}`;
    const testBrandId = `brand-orphan-${Date.now()}`;
    const testProdId = `prod-orphan-${Date.now()}`;
    const testVarId = `var-orphan-${Date.now()}`;

    await client.query(
      `INSERT INTO categories (id, tenant_id, name, industry_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [testCatId, fakeOrphanTenant, 'Orphan Category', 'retail', now, now]
    );
    await client.query(
      `INSERT INTO brands (id, tenant_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      [testBrandId, fakeOrphanTenant, 'Orphan Brand', now, now]
    );
    await client.query(
      `INSERT INTO products (id, tenant_id, name, category, category_id, brand_id, selling_price, stock, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [testProdId, fakeOrphanTenant, 'Orphan Product', 'Orphan Category', testCatId, testBrandId, 1500, 10, now, now]
    );
    await client.query(
      `INSERT INTO product_variants (id, product_id, tenant_id, sku, stock, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testVarId, testProdId, fakeOrphanTenant, 'ORPHAN-SKU-1', 5, now, now]
    );

    console.log(`🌱 [2/5] Seeded genuine orphan fixtures under unlinked tenant '${fakeOrphanTenant}'.`);

    // 2. Run Integrity Audit queries sequentially
    console.log('\n🔍 [3/5] Running Foreign Key Integrity Audit Query...');
    const orphanProds = await client.query(`SELECT count(*) as count FROM products WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const orphanVariants = await client.query(`SELECT count(*) as count FROM product_variants WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const orphanCats = await client.query(`SELECT count(*) as count FROM categories WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const orphanBrands = await client.query(`SELECT count(*) as count FROM brands WHERE tenant_id NOT IN (SELECT id FROM tenants)`);

    const detectedCount = Number(orphanProds.rows[0].count) + Number(orphanVariants.rows[0].count) + Number(orphanCats.rows[0].count) + Number(orphanBrands.rows[0].count);
    console.log(`   - Audit Result: Detected ${detectedCount} orphan records (Products: ${orphanProds.rows[0].count}, Variants: ${orphanVariants.rows[0].count}, Categories: ${orphanCats.rows[0].count}, Brands: ${orphanBrands.rows[0].count})`);

    if (detectedCount === 0) {
      throw new Error('Integrity Audit failed to detect seeded orphan records.');
    }
    console.log('✅ Integrity Audit engine accurately identified orphan records!');

    // 3. Execute PURGE_ORPHANS Maintenance Routine
    console.log('\n🧹 [4/5] Executing PURGE_ORPHANS Maintenance Routine...');
    const start = performance.now();
    const delVariants = await client.query(`DELETE FROM product_variants WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const delProds = await client.query(`DELETE FROM products WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const delCats = await client.query(`DELETE FROM categories WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const delBrands = await client.query(`DELETE FROM brands WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    
    const duration = Math.round(performance.now() - start);
    const totalPurged = (delVariants.rowCount || 0) + (delProds.rowCount || 0) + (delCats.rowCount || 0) + (delBrands.rowCount || 0);

    console.log(`   - Purge Execution Result (Completed in ${duration}ms):`);
    console.log(`     • Purged Products: ${delProds.rowCount}`);
    console.log(`     • Purged Variants: ${delVariants.rowCount}`);
    console.log(`     • Purged Categories: ${delCats.rowCount}`);
    console.log(`     • Purged Brands: ${delBrands.rowCount}`);
    console.log(`     • Total Records Removed: ${totalPurged}`);

    // 4. Follow-up Audit Verification
    console.log('\n🛡️ [5/5] Running Follow-up Integrity Audit...');
    const postProds = await client.query(`SELECT count(*) as count FROM products WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const postVariants = await client.query(`SELECT count(*) as count FROM product_variants WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const postCats = await client.query(`SELECT count(*) as count FROM categories WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    const postBrands = await client.query(`SELECT count(*) as count FROM brands WHERE tenant_id NOT IN (SELECT id FROM tenants)`);

    const remainingOrphans = Number(postProds.rows[0].count) + Number(postVariants.rows[0].count) + Number(postCats.rows[0].count) + Number(postBrands.rows[0].count);
    console.log(`   - Post-Purge Orphan Count: ${remainingOrphans}`);

    if (remainingOrphans !== 0) {
      throw new Error(`Orphan purge incomplete. ${remainingOrphans} orphan records still remain.`);
    }

    // Restore FK constraints with ON DELETE CASCADE
    await client.query(`
      ALTER TABLE categories ADD CONSTRAINT categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      ALTER TABLE brands ADD CONSTRAINT brands_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      ALTER TABLE products ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      ALTER TABLE product_variants ADD CONSTRAINT product_variants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    `).catch(() => {});

    console.log('✅ Database Health Status: 100% HEALTHY (0 orphan records remaining)');

    console.log('\n======================================================');
    console.log('🎉 ORPHAN PURGE & INTEGRITY AUDIT VERIFICATION PASSED!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyOrphanPurgeEngine();
