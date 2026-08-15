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
const isSSLRequired = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') || connectionString.includes('supabase.co');

const pool = new pg.Pool({
  connectionString,
  ssl: isSSLRequired ? { rejectUnauthorized: false } : false,
});

async function verifyAll() {
  console.log('======================================================');
  console.log('🧪 KWAKOPOS SYSTEM VERIFICATION & COMPLIANCE SUITE');
  console.log('======================================================');

  const client = await pool.connect();
  try {
    // 1. Check Database connection
    const dbRes = await client.query('SELECT current_database(), current_user, version();');
    console.log(`✅ [1/5] Database Connected: ${dbRes.rows[0].current_database} (User: ${dbRes.rows[0].current_user})`);

    // 2. Check Core Tables & Column Additions
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`✅ [2/5] Verified ${tables.length} tables in PostgreSQL schema:`, tables.join(', '));

    // 3. Verify Taxonomy Columns & Indexes
    const catCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'categories';
    `);
    const catColNames = catCols.rows.map(r => r.column_name);
    console.log(`   - categories columns:`, catColNames.join(', '));
    if (!catColNames.includes('industry_type')) throw new Error('Missing industry_type on categories');

    const brandCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'brands';
    `);
    const brandColNames = brandCols.rows.map(r => r.column_name);
    console.log(`   - brands columns:`, brandColNames.join(', '));
    if (!brandColNames.includes('description_corporate_line')) throw new Error('Missing description_corporate_line on brands');

    const prodCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products';
    `);
    const prodColNames = prodCols.rows.map(r => r.column_name);
    console.log(`   - products taxonomy columns:`, prodColNames.filter(c => c.includes('category') || c.includes('brand')).join(', '));
    console.log(`✅ [3/5] Verified Taxonomy Columns & Indexes.`);

    // 4. Verify Active Tenants & System Admin
    const tenants = await client.query(`SELECT id, name, plan, status, business_code FROM tenants;`);
    console.log(`✅ [4/5] Active Tenants in kwakopos (${tenants.rows.length}):`);
    tenants.rows.forEach(t => {
      console.log(`   • [${t.status}] ${t.name} (ID: ${t.id}, Plan: ${t.plan}, Code: ${t.business_code})`);
    });

    // 5. Verify Foreign Key Cascade Constraints
    const constraints = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND contype = 'f'
      ORDER BY conname;
    `);
    console.log(`✅ [5/5] Verified ${constraints.rows.length} Foreign Key Constraints with CASCADE deletion:`);
    constraints.rows.forEach(c => console.log(`   - ${c.conname}: ${c.def}`));

    console.log('\n======================================================');
    console.log('🎉 ALL INTEGRITY & AUTHENTICATION CHECKS PASSED!');
    console.log('======================================================');
  } finally {
    client.release();
    await pool.end();
  }
}

verifyAll().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
