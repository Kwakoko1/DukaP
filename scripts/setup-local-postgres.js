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

const rawUrl = process.env.DATABASE_URL || process.env.VITE_POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/dukapos';

// Parse database connection parameters
let parsedUrl;
try {
  parsedUrl = new URL(rawUrl);
} catch (e) {
  console.error('❌ [PostgreSQL Setup] Invalid DATABASE_URL:', rawUrl);
  process.exit(1);
}

const dbName = parsedUrl.pathname.replace(/^\//, '') || 'dukapos';
const dbUser = parsedUrl.username || 'postgres';
const dbPassword = parsedUrl.password || 'postgres';
const dbHost = parsedUrl.hostname || 'localhost';
const dbPort = parseInt(parsedUrl.port || '5432', 10);

console.log(`\n======================================================`);
console.log(`🚀 [PostgreSQL Local Engine] Initializing Database Setup`);
console.log(`======================================================`);
console.log(` Target Host : ${dbHost}:${dbPort}`);
console.log(` Target User : ${dbUser}`);
console.log(` Target DB   : ${dbName}`);
console.log(`======================================================\n`);

async function setupPostgres() {
  // Step 1: Connect to default 'postgres' database to ensure server is reachable and create target DB if needed
  const adminClient = new pg.Client({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: 'postgres',
  });

  try {
    console.log(`[1/3] Connecting to PostgreSQL server at ${dbHost}:${dbPort}...`);
    await adminClient.connect();
    console.log(`✅ [1/3] Connected to PostgreSQL server.`);

    // Check if target database exists
    const dbCheckRes = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (dbCheckRes.rowCount === 0) {
      console.log(`⚙️ Database '${dbName}' does not exist. Creating database...`);
      // Escape identifier safely
      await adminClient.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`✅ Database '${dbName}' created successfully.`);
    } else {
      console.log(`ℹ️ Database '${dbName}' already exists.`);
    }
  } catch (err) {
    console.error(`❌ [PostgreSQL Connection Error] Failed to connect to PostgreSQL at ${dbHost}:${dbPort}`);
    console.error(`   Details: ${err.message}`);
    console.error(`\n   Troubleshooting Checklist:`);
    console.error(`   1. Is PostgreSQL service running on your PC?`);
    console.error(`   2. Are credentials correct in .env (user: '${dbUser}', port: ${dbPort})?`);
    console.error(`   3. Can you connect via psql or pgAdmin?\n`);
    await adminClient.end().catch(() => {});
    process.exit(1);
  } finally {
    await adminClient.end().catch(() => {});
  }

  // Step 2: Connect directly to the target database and build schemas
  const appPool = new pg.Pool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  try {
    console.log(`\n[2/3] Initializing schema and tables in '${dbName}'...`);

    // Tables DDL
    const ddlQueries = [
      `CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT DEFAULT 'Basic',
        status TEXT DEFAULT 'Active',
        business_code TEXT,
        tenant_code TEXT,
        created_at BIGINT,
        deleted_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        name TEXT,
        username TEXT,
        email TEXT,
        phone TEXT,
        role TEXT,
        password_hash TEXT,
        created_at BIGINT,
        deleted_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        location TEXT,
        is_headquarters BOOLEAN DEFAULT false,
        created_at BIGINT,
        deleted_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        name TEXT,
        category TEXT,
        category_id TEXT,
        sku TEXT,
        barcode TEXT,
        buying_price NUMERIC DEFAULT 0,
        selling_price NUMERIC DEFAULT 0,
        price NUMERIC DEFAULT 0,
        cost_price NUMERIC DEFAULT 0,
        stock NUMERIC DEFAULT 0,
        module TEXT DEFAULT 'Retail',
        has_variants BOOLEAN DEFAULT false,
        origin TEXT DEFAULT 'PRODUCTION',
        status TEXT DEFAULT 'Active',
        version INT DEFAULT 1,
        sync_version INT DEFAULT 1,
        created_at BIGINT,
        updated_at BIGINT,
        deleted_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        tenant_id TEXT,
        branch_id TEXT,
        sku TEXT,
        barcode TEXT,
        buying_price NUMERIC DEFAULT 0,
        selling_price NUMERIC DEFAULT 0,
        stock NUMERIC DEFAULT 0,
        reserved_stock NUMERIC DEFAULT 0,
        reorder_level NUMERIC DEFAULT 5,
        status TEXT DEFAULT 'Active',
        attributes JSONB DEFAULT '{}'::jsonb,
        sync_version INT DEFAULT 1,
        created_at BIGINT,
        updated_at BIGINT,
        deleted_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        name TEXT,
        code TEXT,
        description TEXT,
        color TEXT,
        icon TEXT,
        status TEXT DEFAULT 'Active',
        created_by TEXT,
        updated_by TEXT,
        created_at BIGINT,
        updated_at BIGINT,
        deleted_at BIGINT,
        sync_version INT DEFAULT 1,
        sync_status TEXT DEFAULT 'SYNCED',
        last_synced_at BIGINT,
        parent_id TEXT
      );`,

      `CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        name TEXT,
        code TEXT,
        description TEXT,
        color TEXT,
        icon TEXT,
        status TEXT DEFAULT 'Active',
        created_by TEXT,
        updated_by TEXT,
        created_at BIGINT,
        updated_at BIGINT,
        deleted_at BIGINT,
        sync_version INT DEFAULT 1,
        sync_status TEXT DEFAULT 'SYNCED',
        last_synced_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS stock_ledger (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        product_id TEXT,
        variant_id TEXT,
        change_type TEXT,
        quantity_change NUMERIC DEFAULT 0,
        quantity_before NUMERIC DEFAULT 0,
        quantity_after NUMERIC DEFAULT 0,
        reference_id TEXT,
        sync_version INT DEFAULT 1,
        created_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        customer_id TEXT,
        total_amount NUMERIC DEFAULT 0,
        payment_method TEXT DEFAULT 'CASH',
        status TEXT DEFAULT 'COMPLETED',
        sync_version INT DEFAULT 1,
        created_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        product_id TEXT,
        variant_id TEXT,
        quantity NUMERIC DEFAULT 1,
        unit_price NUMERIC DEFAULT 0,
        subtotal NUMERIC DEFAULT 0
      );`,

      `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        phone TEXT,
        email TEXT,
        outstanding_balance NUMERIC DEFAULT 0,
        sync_version INT DEFAULT 1,
        created_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS user_security (
        user_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        pin_hash TEXT,
        password_hash TEXT,
        last_login_at BIGINT,
        failed_attempts INT DEFAULT 0,
        two_factor_enabled BOOLEAN DEFAULT false,
        created_at BIGINT
      );`,

      `CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        description TEXT,
        price NUMERIC DEFAULT 0,
        currency TEXT DEFAULT 'TZS',
        billing_cycle TEXT DEFAULT 'monthly',
        max_users INT DEFAULT 1,
        max_branches INT DEFAULT 1,
        max_products INT DEFAULT 100,
        max_storage_mb INT DEFAULT 100,
        is_trial BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true
      );`,

      // Ensure sync_version column exists on existing pre-created tables
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;`,
      `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;`,
      `ALTER TABLE categories ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;`,
      `ALTER TABLE brands ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;`,
      `ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;`,
      `ALTER TABLE customers ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;`,

      // Indexes
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_tenant_name ON categories(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_tenant_name ON brands(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_products_tenant_branch ON products(tenant_id, branch_id);`,
      `CREATE INDEX IF NOT EXISTS idx_products_tenant_sync ON products(tenant_id, sync_version);`,
      `CREATE INDEX IF NOT EXISTS idx_products_tenant_updated ON products(tenant_id, updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);`,
      `CREATE INDEX IF NOT EXISTS idx_variants_tenant_sync ON product_variants(tenant_id, sync_version);`,
      `CREATE INDEX IF NOT EXISTS idx_categories_tenant_sync ON categories(tenant_id, sync_version);`,
      `CREATE INDEX IF NOT EXISTS idx_brands_tenant_sync ON brands(tenant_id, sync_version);`,
      `CREATE INDEX IF NOT EXISTS idx_stock_ledger_tenant ON stock_ledger(tenant_id, branch_id);`,
      `CREATE INDEX IF NOT EXISTS idx_stock_ledger_tenant_sync ON stock_ledger(tenant_id, sync_version);`,
      `CREATE INDEX IF NOT EXISTS idx_customers_tenant_sync ON customers(tenant_id, sync_version);`
    ];

    for (const query of ddlQueries) {
      await appPool.query(query);
    }
    console.log(`✅ Schema DDL & indexes initialized.`);

    // Step 3: Seed initial platform reference data
    console.log(`\n[3/3] Seeding platform reference data...`);

    // 1. Superadmin user seed
    await appPool.query(`
      INSERT INTO users (id, tenant_id, branch_id, name, username, email, phone, role, password_hash, created_at)
      VALUES ('usr-superadmin', 'tenant-admin-system', 'branch-admin-main', 'System Platform Owner', 'admin', 'admin@dukapos.com', '+255799999999', 'Super Admin', 'admin123', $1)
      ON CONFLICT (id) DO NOTHING;
    `, [Date.now()]);

    await appPool.query(`
      INSERT INTO user_security (user_id, tenant_id, pin_hash, password_hash, last_login_at, created_at)
      VALUES ('usr-superadmin', 'tenant-admin-system', '1234', 'admin123', $1, $1)
      ON CONFLICT (user_id) DO NOTHING;
    `, [Date.now()]);

    // 2. Primary active tenant seed (Bravados)
    const activeTenantId = '8f1109a3-9ab8-4922-a4e0-d706a3a2d85d';
    const activeBranchId = 'bc1497d1-3a12-481f-9d93-ca1815875902';
    const activeOwnerId = 'usr-8f1109a3-9ab8-4922-a4e0-d706a3a2d85d-owner';

    await appPool.query(`
      INSERT INTO tenants (id, name, plan, status, business_code, tenant_code, created_at)
      VALUES ($1, 'Bravados', 'Enterprise', 'Active', 'BIZ-BRAVAD-57WQ', 'TZ-RET-BRAVAD-57WQ', $2)
      ON CONFLICT (id) DO NOTHING;
    `, [activeTenantId, Date.now()]);

    // 3. Primary active branch seed
    await appPool.query(`
      INSERT INTO branches (id, tenant_id, name, location, is_headquarters, created_at)
      VALUES ($1, $2, 'Main HQ Branch', 'Lumumba', true, $3)
      ON CONFLICT (id) DO NOTHING;
    `, [activeBranchId, activeTenantId, Date.now()]);

    // 4. Primary active tenant owner user seed
    await appPool.query(`
      INSERT INTO users (id, tenant_id, branch_id, name, username, email, phone, role, password_hash, created_at)
      VALUES ($1, $2, $3, 'Yannick Mtango', 'yannick', 'yannick@kwakoko.co.tz', '+255713296319', 'Tenant Owner', 'Kwakoko@2026', $4)
      ON CONFLICT (id) DO NOTHING;
    `, [activeOwnerId, activeTenantId, activeBranchId, Date.now()]);

    await appPool.query(`
      INSERT INTO user_security (user_id, tenant_id, pin_hash, password_hash, last_login_at, created_at)
      VALUES ($1, $2, '1234', 'Kwakoko@2026', $3, $3)
      ON CONFLICT (user_id) DO NOTHING;
    `, [activeOwnerId, activeTenantId, Date.now()]);

    // 5. Subscription plans seed
    const defaultPlans = [
      { id: 'plan-trial', name: 'Free Trial', code: 'TRIAL', price: 0, max_users: 2, max_branches: 1, max_products: 100, is_trial: true },
      { id: 'plan-starter', name: 'Starter Plan', code: 'STARTER', price: 12000, max_users: 3, max_branches: 1, max_products: 1000, is_trial: false },
      { id: 'plan-business', name: 'Business Plan', code: 'BUSINESS', price: 16000, max_users: 10, max_branches: 5, max_products: 50000, is_trial: false },
      { id: 'plan-enterprise', name: 'Enterprise Plan', code: 'ENTERPRISE', price: 30000, max_users: 9999, max_branches: 9999, max_products: 999999, is_trial: false },
    ];

    for (const plan of defaultPlans) {
      await appPool.query(`
        INSERT INTO subscription_plans (id, name, code, price, currency, max_users, max_branches, max_products, is_trial, is_active)
        VALUES ($1, $2, $3, $4, 'TZS', $5, $6, $7, $8, true)
        ON CONFLICT (id) DO NOTHING;
      `, [plan.id, plan.name, plan.code, plan.price, plan.max_users, plan.max_branches, plan.max_products, plan.is_trial]);
    }

    console.log(`✅ System reference data, current tenant (Bravados), tenant owner, and subscription plans seeded successfully.`);

    console.log(`\n======================================================`);
    console.log(`🎉 [PostgreSQL Local Engine] Setup Completed Successfully!`);
    console.log(`======================================================`);
    console.log(` You can now run DukaPos locally with real PostgreSQL:`);
    console.log(`   npm start   (Backend Server)`);
    console.log(`   npm run dev (Vite Frontend)`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error(`❌ [Schema DDL Error] Failed initializing schema in '${dbName}':`, err.message);
    process.exit(1);
  } finally {
    await appPool.end().catch(() => {});
  }
}

setupPostgres().catch((err) => {
  console.error('❌ [Setup Local Postgres Fatal Error]:', err);
  process.exit(1);
});
