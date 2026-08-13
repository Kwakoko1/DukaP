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

const connectionString = process.env.DATABASE_URL || process.env.VITE_POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/dukapos';

console.log(`[DB Health Check] Probing PostgreSQL database connection...`);

const isSSLRequired = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech');

const pool = new pg.Pool({
  connectionString,
  ssl: isSSLRequired ? { rejectUnauthorized: false } : false,
});

async function runCheck() {
  const start = Date.now();
  try {
    const timeRes = await pool.query('SELECT NOW() as current_time, current_database() as db_name;');
    const latency = Date.now() - start;
    const dbName = timeRes.rows[0].db_name;
    const currentTime = timeRes.rows[0].current_time;

    console.log(`✅ [DB Health Check] Connected to database '${dbName}' in ${latency}ms.`);
    console.log(`   DB Time: ${currentTime}`);

    // Check table count
    const tableRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);

    const tableNames = tableRes.rows.map(r => r.table_name);
    console.log(`📊 [DB Health Check] Found ${tableNames.length} tables in 'public' schema.`);

    const requiredTables = ['tenants', 'users', 'products', 'product_variants', 'categories', 'brands', 'stock_ledger'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));

    if (missingTables.length > 0) {
      console.warn(`⚠️ [DB Health Check] Missing required tables: ${missingTables.join(', ')}`);
      console.warn(`   Run 'npm run db:setup' to build all required tables.`);
      process.exit(1);
    } else {
      console.log(`✅ [DB Health Check] All core schema tables are present and healthy.`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`❌ [DB Health Check Failed] Could not connect to PostgreSQL:`, err.message);
    console.error(`   Connection String: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

runCheck().catch((err) => {
  console.error('❌ [DB Health Check Fatal Error]:', err);
  process.exit(1);
});
