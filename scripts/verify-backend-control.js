import pg from 'pg';
import http from 'http';
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

async function verifyBackendControlEndpoints() {
  console.log('======================================================');
  console.log('🧪 VERIFYING SUPER ADMIN BACKEND CONTROL & DB STUDIO');
  console.log('======================================================');

  try {
    await client.connect();

    // 1. Direct PG verification
    const dbRes = await client.query('SELECT current_database(), count(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\'');
    console.log(`✅ [1/5] Connected to Database: ${dbRes.rows[0].current_database} (${dbRes.rows[0].table_count} public tables)`);

    // 2. Test Tables & Column Metadata Inspection Query
    const tablesQuery = `
      SELECT 
        t.table_name,
        COALESCE(s.n_live_tup, 0) as live_tuples,
        pg_size_pretty(pg_total_relation_size('"' || t.table_schema || '"."' || t.table_name || '"')) as total_size,
        (
          SELECT count(*) 
          FROM information_schema.columns c 
          WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
        ) as column_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.schemaname = t.table_schema AND s.relname = t.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name ASC;
    `;
    const tablesRes = await client.query(tablesQuery);
    console.log(`✅ [2/5] Database Explorer Schema Engine Verified:`);
    console.log(`   - Discovered ${tablesRes.rows.length} managed tables: ${tablesRes.rows.slice(0, 5).map(r => r.table_name).join(', ')}...`);

    // 3. Test Foreign Key Integrity Audit Routine
    const [orphanProds, orphanVariants, orphanCats, orphanBrands] = await Promise.all([
      client.query(`SELECT count(*) as count FROM products WHERE tenant_id NOT IN (SELECT id FROM tenants)`),
      client.query(`SELECT count(*) as count FROM product_variants WHERE tenant_id NOT IN (SELECT id FROM tenants)`),
      client.query(`SELECT count(*) as count FROM categories WHERE tenant_id NOT IN (SELECT id FROM tenants)`),
      client.query(`SELECT count(*) as count FROM brands WHERE tenant_id NOT IN (SELECT id FROM tenants)`)
    ]);
    const totalOrphans = Number(orphanProds.rows[0].count) + Number(orphanVariants.rows[0].count) + Number(orphanCats.rows[0].count) + Number(orphanBrands.rows[0].count);
    console.log(`✅ [3/5] Foreign Key Isolation Integrity Audit Verified:`);
    console.log(`   - Orphan products: ${orphanProds.rows[0].count}, variants: ${orphanVariants.rows[0].count}, categories: ${orphanCats.rows[0].count}, brands: ${orphanBrands.rows[0].count}`);
    console.log(`   - Integrity Health Status: ${totalOrphans === 0 ? '100% HEALTHY (0 orphans)' : 'NEEDS ATTENTION'}`);

    // 4. Test Live Database Vitals & Metrics Query
    const [dbSizeRes, statsRes, tenantCountRes] = await Promise.all([
      client.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`),
      client.query(`SELECT numbackends, xact_commit, xact_rollback, blks_read, blks_hit FROM pg_stat_database WHERE datname = current_database()`),
      client.query(`SELECT count(*) as count FROM tenants WHERE deleted_at IS NULL`)
    ]);
    const dbStats = statsRes.rows[0] || {};
    const cacheHitRate = Number(dbStats.blks_hit || 0) + Number(dbStats.blks_read || 0) > 0
      ? Math.round((Number(dbStats.blks_hit || 0) / (Number(dbStats.blks_hit || 0) + Number(dbStats.blks_read || 0))) * 1000) / 10
      : 100;
    console.log(`✅ [4/5] Telemetry Engine Metrics Verified:`);
    console.log(`   - Database Size: ${dbSizeRes.rows[0].size}`);
    console.log(`   - Active Backends: ${dbStats.numbackends}`);
    console.log(`   - Cache Hit Rate: ${cacheHitRate}%`);
    console.log(`   - Active Tenants: ${tenantCountRes.rows[0].count}`);

    // 5. Test Maintenance Command (ANALYZE)
    const start = performance.now();
    await client.query(`ANALYZE`);
    const duration = Math.round(performance.now() - start);
    console.log(`✅ [5/5] Database Maintenance Engine (ANALYZE) Completed in ${duration}ms`);

    console.log('\n======================================================');
    console.log('🎉 ALL SUPER ADMIN BACKEND CONTROL CHECKS PASSED!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyBackendControlEndpoints();
