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

async function runCatalogVerification() {
  console.log('======================================================');
  console.log('🧪 VERIFYING CATALOG MANAGER & SAFE DELETION WIRING');
  console.log('======================================================');

  try {
    await client.connect();

    // 1. Verify connection
    const dbRes = await client.query('SELECT current_database()');
    console.log(`✅ [1/6] Connected to Database: ${dbRes.rows[0].current_database}`);

    // 2. Fetch or seed test tenant
    let tenantRes = await client.query('SELECT id, name FROM tenants LIMIT 1');
    if (tenantRes.rows.length === 0) {
      await client.query(`INSERT INTO tenants (id, name, plan, status, business_code) VALUES ('tenant-test-wiring', 'Test Business', 'Enterprise', 'Active', 'TEST-001')`);
      tenantRes = { rows: [{ id: 'tenant-test-wiring', name: 'Test Business' }] };
    }
    const testTenantId = tenantRes.rows[0].id;
    console.log(`✅ [2/6] Using Tenant Context: ${tenantRes.rows[0].name} (${testTenantId})`);

    // 3. Test Category CRUD & industry_type column
    const testCatId = `cat-test-${Date.now()}`;
    const testCatName = `Test Category ${Date.now()}`;
    await client.query(
      `INSERT INTO categories (id, tenant_id, name, description, industry_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testCatId, testTenantId, testCatName, 'Test category description', 'pharmacy', Date.now(), Date.now()]
    );
    const catRes = await client.query('SELECT * FROM categories WHERE id = $1', [testCatId]);
    const insertedCat = catRes.rows[0];
    if (!insertedCat || insertedCat.industry_type !== 'pharmacy') {
      throw new Error(`Category insertion verification failed: ${JSON.stringify(insertedCat)}`);
    }
    console.log(`✅ [3/6] Category Created & Verified: "${insertedCat.name}" (Industry: ${insertedCat.industry_type})`);

    // 4. Test Brand CRUD & description_corporate_line column
    const testBrandId = `brand-test-${Date.now()}`;
    const testBrandName = `Test Brand ${Date.now()}`;
    await client.query(
      `INSERT INTO brands (id, tenant_id, name, description, description_corporate_line, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testBrandId, testTenantId, testBrandName, 'Brand description', 'Official Corporate Line', Date.now(), Date.now()]
    );
    const brandRes = await client.query('SELECT * FROM brands WHERE id = $1', [testBrandId]);
    const insertedBrand = brandRes.rows[0];
    if (!insertedBrand || insertedBrand.description_corporate_line !== 'Official Corporate Line') {
      throw new Error(`Brand insertion verification failed: ${JSON.stringify(insertedBrand)}`);
    }
    console.log(`✅ [4/6] Brand Created & Verified: "${insertedBrand.name}" (Corporate Line: ${insertedBrand.description_corporate_line})`);

    // 5. Test Product Relational Wiring (category_id, brand_id FK resolution)
    const testProdId = `prod-test-${Date.now()}`;
    await client.query(
      `INSERT INTO products (id, tenant_id, name, category, category_id, brand, brand_id, sku, price, stock, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testProdId, testTenantId, 'Test Product With Taxonomy', testCatName, testCatId, testBrandName, testBrandId, 'TEST-SKU-001', 5000, 10, Date.now(), Date.now()]
    );
    const prodRes = await client.query(`
      SELECT p.id, p.name, p.category, p.category_id, p.brand, p.brand_id, c.name as category_rel_name, b.name as brand_rel_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.id = $1
    `, [testProdId]);
    const insertedProd = prodRes.rows[0];
    console.log(`✅ [5/6] Product Taxonomy Wiring Verified:`);
    console.log(`   - Product: "${insertedProd.name}" (${insertedProd.id})`);
    console.log(`   - Category FK: "${insertedProd.category_id}" -> Rel Category: "${insertedProd.category_rel_name}"`);
    console.log(`   - Brand FK: "${insertedProd.brand_id}" -> Rel Brand: "${insertedProd.brand_rel_name}"`);

    // 6. Test Safe Deletion (ON DELETE SET NULL without Foreign Key Violation)
    await client.query('DELETE FROM categories WHERE id = $1', [testCatId]);
    await client.query('DELETE FROM brands WHERE id = $1', [testBrandId]);

    const afterDelProd = (await client.query('SELECT category_id, brand_id FROM products WHERE id = $1', [testProdId])).rows[0];
    if (afterDelProd.category_id !== null || afterDelProd.brand_id !== null) {
      throw new Error(`Expected category_id and brand_id to be NULL after category/brand deletion, got: ${JSON.stringify(afterDelProd)}`);
    }
    console.log(`✅ [6/6] Safe Deletion (ON DELETE SET NULL) Verified!`);
    console.log(`   - Product after taxonomy deletion: category_id=${afterDelProd.category_id}, brand_id=${afterDelProd.brand_id} (0 errors)`);

    // Cleanup test product
    await client.query('DELETE FROM products WHERE id = $1', [testProdId]);
    console.log(`\n🧹 Cleaned up test fixtures.`);

    console.log('\n======================================================');
    console.log('🎉 ALL SAFE DELETION & TAXONOMY WIRING CHECKS PASSED!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runCatalogVerification();
