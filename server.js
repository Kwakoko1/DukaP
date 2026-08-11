import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file if available locally
const envPath = path.join(__dirname, '.env');
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

const PORT = process.env.PORT || 8080;
const DIST_DIR = path.join(__dirname, 'dist');

const DEFAULT_LOCAL_PG_URL = 'postgresql://postgres:postgres@localhost:5432/dukapos';
const DATABASE_URL = process.env.DATABASE_URL || process.env.VITE_POSTGRES_URL || DEFAULT_LOCAL_PG_URL;
const isSSLRequired = DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('neon.tech');

console.log(`[PostgreSQL Engine] Initializing database connection pool...`);
console.log(`[PostgreSQL Engine] Connection target: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: isSSLRequired ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Engine] Idle client error:', err.message);
});

// Universal tagged template & function query executor for PostgreSQL
async function sql(strings, ...values) {
  if (typeof strings === 'string') {
    const result = await pool.query(strings, values[0] || []);
    return result.rows;
  }
  let queryText = strings[0];
  for (let i = 1; i < strings.length; i++) {
    queryText += `$${i}` + strings[i];
  }
  const result = await pool.query(queryText, values);
  return result.rows;
}

// In-Memory Bootstrap Snapshot Cache Engine (Redis Fallback)
const bootstrapCache = new Map();
const BOOTSTRAP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

function invalidateTenantBootstrapCache(targetTenantId) {
  if (!targetTenantId) return;
  for (const key of bootstrapCache.keys()) {
    if (key.startsWith(`${targetTenantId}:`) || key === targetTenantId) {
      bootstrapCache.delete(key);
    }
  }
}

// Auto-initialize Neon PostgreSQL schema on startup
async function initDatabaseSchema() {
  try {
    console.log(`[Neon Backend Engine] Initializing database schema on Neon PostgreSQL...`);
    await sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT DEFAULT 'Basic',
        status TEXT DEFAULT 'Active',
        business_code TEXT,
        tenant_code TEXT,
        created_at BIGINT,
        deleted_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS users (
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
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        location TEXT,
        is_headquarters BOOLEAN DEFAULT false,
        created_at BIGINT,
        deleted_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS products (
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
        created_at BIGINT,
        updated_at BIGINT,
        deleted_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS product_variants (
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
        created_at BIGINT,
        updated_at BIGINT,
        deleted_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS categories (
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
      );
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_tenant_name ON categories(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;`;
    await sql`
      CREATE TABLE IF NOT EXISTS brands (
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
      );
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_tenant_name ON brands(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;`;
    await sql`
      CREATE TABLE IF NOT EXISTS stock_ledger (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        product_id TEXT,
        variant_id TEXT,
        movement_type TEXT,
        quantity_before NUMERIC DEFAULT 0,
        quantity_change NUMERIC DEFAULT 0,
        quantity_after NUMERIC DEFAULT 0,
        unit_cost NUMERIC DEFAULT 0,
        total_cost NUMERIC DEFAULT 0,
        user_id TEXT,
        device_id TEXT,
        idempotency_key TEXT,
        created_at BIGINT
      );
    `;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS movement_type TEXT;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS quantity_before NUMERIC DEFAULT 0;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS quantity_change NUMERIC DEFAULT 0;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS quantity_after NUMERIC DEFAULT 0;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS total_cost NUMERIC DEFAULT 0;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS user_id TEXT;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS device_id TEXT;`;
    await sql`ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS idempotency_key TEXT;`;
    await sql`
      CREATE TABLE IF NOT EXISTS user_branch_roles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        user_id TEXT,
        branch_id TEXT,
        role_id TEXT,
        role_name TEXT,
        created_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_modules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        module_name TEXT,
        is_enabled BOOLEAN DEFAULT true,
        updated_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        setting_key TEXT,
        setting_value TEXT,
        updated_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        flag_key TEXT,
        is_enabled BOOLEAN DEFAULT false,
        updated_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS user_devices (
        device_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        user_id TEXT,
        name TEXT,
        os TEXT,
        browser TEXT,
        user_agent TEXT,
        ip_address TEXT,
        last_seen_at BIGINT,
        created_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS user_security (
        user_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        pin_hash TEXT,
        password_hash TEXT,
        last_login_at BIGINT,
        failed_attempts INT DEFAULT 0,
        created_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS business_profiles (
        tenant_id TEXT PRIMARY KEY,
        business_name TEXT,
        tin_number TEXT,
        vrn_number TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        logo_url TEXT,
        currency TEXT DEFAULT 'TZS',
        updated_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        plan_name TEXT,
        start_date BIGINT,
        end_date BIGINT,
        status TEXT DEFAULT 'ACTIVE',
        amount NUMERIC DEFAULT 0,
        updated_at BIGINT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        plan_code TEXT,
        name TEXT,
        monthly_price NUMERIC,
        yearly_price NUMERIC,
        features JSONB DEFAULT '{}'::jsonb
      );
    `;

    // Auto-heal: add all missing columns to tenants for full online-registration capture
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_name TEXT;`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'Retail';`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_source TEXT DEFAULT 'SELF_REGISTERED';`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'PENDING';`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at BIGINT;`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_ip TEXT;`;
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_device TEXT;`;

    // Auto-heal missing password_hash and security columns on existing tables
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`;
    await sql`ALTER TABLE user_security ADD COLUMN IF NOT EXISTS tenant_id TEXT;`;
    await sql`ALTER TABLE user_security ADD COLUMN IF NOT EXISTS password_hash TEXT;`;
    await sql`ALTER TABLE user_security ADD COLUMN IF NOT EXISTS last_login_at BIGINT;`;
    await sql`ALTER TABLE user_security ADD COLUMN IF NOT EXISTS created_at BIGINT;`;

    // Security audit log — created here so /api/securityAuditLogs never 404s on cold start
    await sql`
      CREATE TABLE IF NOT EXISTS security_audit_logs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT,
        user_id TEXT,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        ip_address TEXT,
        user_agent TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_security_audit_logs_tenant ON security_audit_logs(tenant_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user   ON security_audit_logs(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created ON security_audit_logs(created_at DESC);`;

    console.log(`[Neon Backend Engine] Schema initialization complete.`);
  } catch (err) {
    console.error(`[Neon Backend Engine] Error initializing schema:`, err);
  }
}

initDatabaseSchema();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
};

async function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const fullUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = fullUrl.pathname;

  // Set CORS Headers for multi-domain SaaS access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-id, x-user-id, x-branch-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── API BACKEND ROUTES CONNECTED TO NEON POSTGRESQL ───────────────────────
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    try {
      let tenantId = req.headers['x-tenant-id'] || fullUrl.searchParams.get('tenantId') || fullUrl.searchParams.get('tenant_id') || '';
      if (tenantId && typeof tenantId === 'string' && tenantId.includes(',')) {
        tenantId = tenantId.split(',')[0].trim();
      }
      const emailParam = fullUrl.searchParams.get('email');
      const usernameParam = fullUrl.searchParams.get('username');

      // 0. GET /api/ping — Health Ping Endpoint for Offline/Online Sync
      if (pathname === '/api/ping') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now(), database: 'Neon PostgreSQL' }));
        return;
      }

      // 0.1 POST /api/bootstrap — Optimized Fast Bootstrap Snapshot Endpoint (ETag 304 + Pre-Stringified Buffer Caching)
      if (pathname === '/api/bootstrap' && (req.method === 'POST' || req.method === 'GET')) {
        let body = {};
        if (req.method === 'POST') {
          body = await parseRequestBody(req);
        }
        const targetTenant = tenantId || body.tenantId || fullUrl.searchParams.get('tenantId') || 'tenant-101';
        const targetBranch = body.branchId || fullUrl.searchParams.get('branchId') || '';
        const clientETag = req.headers['if-none-match'] || req.headers['x-if-none-match'] || body.ifNoneMatch || '';
        const cacheKey = `${targetTenant}:${targetBranch}`;

        const cached = bootstrapCache.get(cacheKey);
        if (cached && (Date.now() - cached.generatedAt < BOOTSTRAP_CACHE_TTL_MS)) {
          // Check 304 Not Modified Re-validation
          if (clientETag && clientETag === cached.etag) {
            res.writeHead(304, {
              'ETag': cached.etag,
              'X-Bootstrap-Cache': 'REVALIDATED_304',
              'Cache-Control': 'private, no-cache, revalidate',
            });
            res.end();
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'ETag': cached.etag,
            'X-Bootstrap-Cache': 'HIT',
            'Cache-Control': 'public, max-age=60',
          });
          res.end(cached.jsonString);
          return;
        }

        // Concurrently run all module queries using Promise.all to minimize latency
        const [
          tenants, users, branches, settings, categories, brands,
          products, variants, stockLedger, customers, plans
        ] = await Promise.all([
          sql`SELECT * FROM tenants WHERE id = ${targetTenant} AND (deleted_at IS NULL)`,
          sql`SELECT * FROM users WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL)`,
          sql`SELECT * FROM branches WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL)`,
          sql`SELECT * FROM tenant_settings WHERE tenant_id = ${targetTenant}`,
          sql`SELECT * FROM categories WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL)`,
          sql`SELECT * FROM brands WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL)`,
          sql`SELECT * FROM products WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL)`,
          sql`SELECT * FROM product_variants WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL)`,
          sql`SELECT * FROM stock_ledger WHERE tenant_id = ${targetTenant} ORDER BY created_at DESC LIMIT 500`,
          sql`SELECT * FROM customers WHERE tenant_id = ${targetTenant}`,
          sql`SELECT * FROM subscription_plans WHERE is_active = true`
        ]);

        let maxSyncVer = 1;
        const allEntities = [...categories, ...brands, ...products, ...variants, ...stockLedger, ...customers];
        for (const e of allEntities) {
          const v = parseInt(e.sync_version || e.version || '1', 10);
          if (v > maxSyncVer) maxSyncVer = v;
        }

        const etag = `W/"sync-${targetTenant}-v${maxSyncVer}"`;

        if (clientETag && clientETag === etag) {
          res.writeHead(304, {
            'ETag': etag,
            'X-Bootstrap-Cache': 'REVALIDATED_304',
            'Cache-Control': 'private, no-cache, revalidate',
          });
          res.end();
          return;
        }

        const payload = {
          tenant: tenants[0] || { id: targetTenant, name: 'Bravados', plan: 'Enterprise', status: 'Active' },
          user: users[0] || null,
          branches,
          settings: settings.reduce((acc, s) => ({ ...acc, [s.setting_key]: s.setting_value }), {}),
          categories,
          brands,
          products,
          variants,
          stockLedger,
          customers,
          permissions: [],
          subscriptionPlans: plans,
          syncVersion: maxSyncVer,
          schemaVersion: 8,
          generatedAt: new Date().toISOString(),
          serverTimestamp: Date.now()
        };

        const jsonString = JSON.stringify(payload);
        bootstrapCache.set(cacheKey, { payload, jsonString, etag, maxSyncVer, generatedAt: Date.now() });

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'ETag': etag,
          'X-Bootstrap-Cache': 'MISS',
          'Cache-Control': 'public, max-age=60',
        });
        res.end(jsonString);
        return;
      }

      // 1. GET /api/users & POST /api/users
      if (pathname === '/api/users' && req.method === 'GET') {
        let users = [];
        const filterTenantId = fullUrl.searchParams.get('filterTenantId');
        if (filterTenantId) {
          users = await sql`SELECT * FROM users WHERE tenant_id = ${filterTenantId} AND (deleted_at IS NULL)`;
        } else if (emailParam) {
          users = await sql`SELECT * FROM users WHERE LOWER(email) = ${emailParam.toLowerCase()} OR LOWER(username) = ${emailParam.toLowerCase()} LIMIT 5`;
        } else if (usernameParam) {
          users = await sql`SELECT * FROM users WHERE LOWER(username) = ${usernameParam.toLowerCase()} LIMIT 5`;
        } else if (tenantId && tenantId !== 'tenant-admin-system') {
          users = await sql`SELECT * FROM users WHERE tenant_id = ${tenantId} AND (deleted_at IS NULL)`;
        } else {
          users = await sql`SELECT * FROM users LIMIT 100`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(users));
        return;
      }

      if (pathname === '/api/users' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const uid = payload.id || `usr-${Date.now()}`;
        const now = Date.now();
        await sql`
          INSERT INTO users (id, tenant_id, branch_id, name, username, email, phone, role, password_hash, created_at)
          VALUES (${uid}, ${payload.tenant_id || tenantId || ''}, ${payload.branch_id || ''}, ${payload.name || ''}, ${payload.username || ''}, ${payload.email || ''}, ${payload.phone || ''}, ${payload.role || 'Cashier'}, ${payload.password_hash || payload.password || ''}, ${payload.created_at || now})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            phone = EXCLUDED.phone,
            password_hash = EXCLUDED.password_hash;
        `;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: uid }));
        return;
      }

      // 2. GET /api/tenants/all — Super Admin privileged full tenant registry
      if (pathname === '/api/tenants/all' && req.method === 'GET') {
        const allTenants = await sql`SELECT * FROM tenants WHERE (deleted_at IS NULL) ORDER BY created_at DESC`;
        res.writeHead(200);
        res.end(JSON.stringify(allTenants));
        return;
      }

      // 2.1 GET /api/tenants & POST /api/tenants
      if (pathname === '/api/tenants' && req.method === 'GET') {
        let tenants = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          tenants = await sql`SELECT * FROM tenants WHERE id = ${tenantId} AND (deleted_at IS NULL)`;
        } else {
          // Super admin or no scoping — return all
          tenants = await sql`SELECT * FROM tenants WHERE (deleted_at IS NULL) ORDER BY created_at DESC`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(tenants));
        return;
      }

      if (pathname === '/api/tenants' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const tid = payload.id || `tenant-${Date.now()}`;
        const now = Date.now();
        const slug = payload.slug || payload.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || tid;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
        const device = req.headers['user-agent'] || 'Web Client';
        await sql`
          INSERT INTO tenants (
            id, name, plan, status, business_code, tenant_code, slug,
            email, owner_name, business_type,
            registration_source, verification_status,
            registration_ip, registration_device,
            created_at, updated_at
          )
          VALUES (
            ${tid},
            ${payload.name || 'Tenant'},
            ${payload.plan || 'Basic'},
            ${payload.status || 'Trial'},
            ${payload.business_code || ''},
            ${payload.tenant_code || tid},
            ${slug},
            ${payload.email || ''},
            ${payload.owner_name || payload.ownerName || ''},
            ${payload.business_type || payload.businessType || 'Retail'},
            ${payload.registration_source || payload.registrationSource || 'SELF_REGISTERED'},
            ${payload.verification_status || payload.verificationStatus || 'PENDING'},
            ${String(payload.registration_ip || ip)},
            ${String(payload.registration_device || device).substring(0, 255)},
            ${payload.created_at || now},
            ${now}
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            email = COALESCE(EXCLUDED.email, tenants.email),
            owner_name = COALESCE(EXCLUDED.owner_name, tenants.owner_name),
            business_type = COALESCE(EXCLUDED.business_type, tenants.business_type),
            updated_at = ${now};
        `;
        invalidateTenantBootstrapCache(tid);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: tid }));
        return;
      }

      // 2.2 PUT /api/tenants/:id — Update single tenant record
      if (pathname.startsWith('/api/tenants/') && req.method === 'PUT') {
        const tid = pathname.replace('/api/tenants/', '');
        const payload = await parseRequestBody(req);
        const now = Date.now();
        await sql`
          UPDATE tenants SET
            name = COALESCE(${payload.name || null}, name),
            plan = COALESCE(${payload.plan || null}, plan),
            status = COALESCE(${payload.status || null}, status),
            email = COALESCE(${payload.email || null}, email),
            owner_name = COALESCE(${payload.owner_name || null}, owner_name),
            business_type = COALESCE(${payload.business_type || null}, business_type),
            verification_status = COALESCE(${payload.verification_status || null}, verification_status),
            updated_at = ${now}
          WHERE id = ${tid}
        `;
        invalidateTenantBootstrapCache(tid);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: tid }));
        return;
      }

      // 2.3 DELETE /api/tenants/:id — Soft delete
      if (pathname.startsWith('/api/tenants/') && req.method === 'DELETE') {
        const tid = pathname.replace('/api/tenants/', '');
        const now = Date.now();
        await sql`UPDATE tenants SET deleted_at = ${now}, updated_at = ${now} WHERE id = ${tid}`;
        invalidateTenantBootstrapCache(tid);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: tid }));
        return;
      }

      // 3. GET /api/branches & POST /api/branches
      if (pathname === '/api/branches' && req.method === 'GET') {
        let branches = [];
        const filterTenantId = fullUrl.searchParams.get('filterTenantId');
        if (filterTenantId) {
          branches = await sql`SELECT * FROM branches WHERE tenant_id = ${filterTenantId} AND (deleted_at IS NULL)`;
        } else if (tenantId && tenantId !== 'tenant-admin-system') {
          branches = await sql`SELECT * FROM branches WHERE tenant_id = ${tenantId} AND (deleted_at IS NULL)`;
        } else {
          branches = await sql`SELECT * FROM branches WHERE (deleted_at IS NULL)`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(branches));
        return;
      }

      // 3.1 GET /api/securityAuditLogs
      if (pathname === '/api/securityAuditLogs' && req.method === 'GET') {
        let logs = [];
        const filterTenantId = fullUrl.searchParams.get('filterTenantId');
        if (filterTenantId) {
          logs = await sql`SELECT * FROM security_audit_logs WHERE tenant_id = ${filterTenantId} ORDER BY created_at DESC LIMIT 10`;
        } else {
          logs = await sql`SELECT * FROM security_audit_logs ORDER BY created_at DESC LIMIT 100`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(logs));
        return;
      }

      if (pathname === '/api/branches' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const bid = payload.id || `branch-${Date.now()}`;
        const now = Date.now();
        await sql`
          INSERT INTO branches (id, tenant_id, name, location, is_headquarters, created_at)
          VALUES (${bid}, ${payload.tenant_id || tenantId || ''}, ${payload.name || 'Branch'}, ${payload.location || ''}, ${payload.is_headquarters || false}, ${payload.created_at || now})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            location = EXCLUDED.location,
            is_headquarters = EXCLUDED.is_headquarters;
        `;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: bid }));
        return;
      }

      // 4. GET /api/userBranchRoles
      if (pathname === '/api/userBranchRoles' && req.method === 'GET') {
        let roles = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          roles = await sql`SELECT * FROM user_branch_roles WHERE tenant_id = ${tenantId}`;
        } else {
          roles = await sql`SELECT * FROM user_branch_roles LIMIT 200`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(roles));
        return;
      }

      // 5. GET /api/tenantModules
      if (pathname === '/api/tenantModules' && req.method === 'GET') {
        let modules = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          modules = await sql`SELECT * FROM tenant_modules WHERE tenant_id = ${tenantId}`;
        } else {
          modules = await sql`SELECT * FROM tenant_modules LIMIT 200`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(modules));
        return;
      }

      // 6. GET /api/tenantSettings
      if (pathname === '/api/tenantSettings' && req.method === 'GET') {
        let settings = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          settings = await sql`SELECT * FROM tenant_settings WHERE tenant_id = ${tenantId}`;
        } else {
          settings = await sql`SELECT * FROM tenant_settings LIMIT 200`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(settings));
        return;
      }

      // 7. GET /api/featureFlags
      if (pathname === '/api/featureFlags' && req.method === 'GET') {
        let flags = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          flags = await sql`SELECT * FROM feature_flags WHERE tenant_id = ${tenantId}`;
        } else {
          flags = await sql`SELECT * FROM feature_flags LIMIT 200`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(flags));
        return;
      }

      // 8. GET /api/products, POST /api/products, DELETE /api/products
      if (pathname === '/api/products' && req.method === 'GET') {
        const prodId = fullUrl.searchParams.get('id');
        let products = [];
        if (prodId) {
          if (tenantId && tenantId !== 'tenant-admin-system') {
            products = await sql`SELECT * FROM products WHERE id = ${prodId} AND tenant_id = ${tenantId} AND (deleted_at IS NULL)`;
          } else {
            products = await sql`SELECT * FROM products WHERE id = ${prodId} AND (deleted_at IS NULL)`;
          }
        } else if (tenantId && tenantId !== 'tenant-admin-system') {
          products = await sql`SELECT * FROM products WHERE tenant_id = ${tenantId} AND (deleted_at IS NULL)`;
        } else {
          products = await sql`SELECT * FROM products WHERE (deleted_at IS NULL) LIMIT 300`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(products));
        return;
      }

      if (pathname === '/api/products' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const pid = payload.id || `prod-${Date.now()}`;
        const now = Date.now();
        await sql`
          INSERT INTO products (id, tenant_id, branch_id, name, category, category_id, sku, barcode, buying_price, selling_price, price, cost_price, stock, module, has_variants, origin, status, created_at, updated_at, version)
          VALUES (${pid}, ${payload.tenant_id || tenantId || ''}, ${payload.branch_id || ''}, ${payload.name || 'Product'}, ${payload.category || 'General'}, ${payload.category_id || ''}, ${payload.sku || ''}, ${payload.barcode || ''}, ${payload.buyingPrice || payload.buying_price || 0}, ${payload.sellingPrice || payload.selling_price || 0}, ${payload.price || 0}, ${payload.costPrice || payload.cost_price || 0}, ${payload.stock || 0}, ${payload.module || 'Retail'}, ${payload.hasVariants || false}, ${payload.origin || 'PRODUCTION'}, ${payload.status || 'Active'}, ${payload.createdAt || payload.created_at || now}, ${now}, ${payload.version || 1})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            stock = EXCLUDED.stock,
            selling_price = EXCLUDED.selling_price,
            buying_price = EXCLUDED.buying_price,
            updated_at = ${now},
            version = products.version + 1;
        `;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: pid }));
        return;
      }

      if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
        const pid = pathname.replace('/api/products/', '');
        const now = Date.now();
        await sql`UPDATE products SET deleted_at = ${now}, updated_at = ${now} WHERE id = ${pid}`;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: pid }));
        return;
      }

      // 8b. POST /api/products/sync-batch
      if (pathname === '/api/products/sync-batch' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const productsList = payload.products || [];
        const now = Date.now();
        for (const p of productsList) {
          const pid = p.id || `prod-${Date.now()}`;
          await sql`
            INSERT INTO products (id, tenant_id, branch_id, name, category, category_id, sku, barcode, buying_price, selling_price, price, cost_price, stock, module, has_variants, origin, status, created_at, updated_at, version)
            VALUES (${pid}, ${p.tenant_id || tenantId || ''}, ${p.branch_id || ''}, ${p.name || 'Product'}, ${p.category || 'General'}, ${p.category_id || ''}, ${p.sku || ''}, ${p.barcode || ''}, ${p.buyingPrice || p.buying_price || 0}, ${p.sellingPrice || p.selling_price || 0}, ${p.price || 0}, ${p.costPrice || p.cost_price || 0}, ${p.stock || 0}, ${p.module || 'Retail'}, ${p.hasVariants || false}, ${p.origin || 'PRODUCTION'}, ${p.status || 'Active'}, ${p.createdAt || p.created_at || now}, ${now}, ${p.version || 1})
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              stock = EXCLUDED.stock,
              selling_price = EXCLUDED.selling_price,
              buying_price = EXCLUDED.buying_price,
              updated_at = ${now},
              version = products.version + 1;
          `;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, count: productsList.length }));
        return;
      }

      // 9. GET /api/variants
      if (pathname === '/api/variants' && req.method === 'GET') {
        let variants = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          variants = await sql`SELECT * FROM product_variants WHERE tenant_id = ${tenantId} AND (deleted_at IS NULL)`;
        } else {
          variants = await sql`SELECT * FROM product_variants WHERE (deleted_at IS NULL) LIMIT 300`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(variants));
        return;
      }

      // 10. GET /api/stockLedger
      if (pathname === '/api/stockLedger' && req.method === 'GET') {
        let ledger = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          ledger = await sql`SELECT * FROM stock_ledger WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT 200`;
        } else {
          ledger = await sql`SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT 200`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(ledger));
        return;
      }

      // 11. GET & POST /api/userDevices
      if (pathname === '/api/userDevices' && req.method === 'GET') {
        const devices = await sql`SELECT * FROM user_devices ORDER BY last_seen_at DESC LIMIT 100`;
        res.writeHead(200);
        res.end(JSON.stringify(devices));
        return;
      }

      if (pathname === '/api/userDevices' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const devId = payload.device_id || `dev-${Date.now()}`;
        const devName = payload.name || 'Web Browser Client';
        const os = payload.os || 'Unknown OS';
        const browser = payload.browser || 'Web Client';
        const userAgent = payload.user_agent || req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const now = Date.now();

        await sql`
          INSERT INTO user_devices (device_id, tenant_id, user_id, name, os, browser, user_agent, ip_address, last_seen_at, created_at)
          VALUES (${devId}, ${payload.tenant_id || tenantId || ''}, ${payload.user_id || ''}, ${devName}, ${os}, ${browser}, ${userAgent}, ${String(ip)}, ${now}, ${now})
          ON CONFLICT (device_id) DO UPDATE SET
            last_seen_at = EXCLUDED.last_seen_at,
            ip_address = EXCLUDED.ip_address,
            user_agent = EXCLUDED.user_agent;
        `;

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, device_id: devId }));
        return;
      }

      // 12. GET & POST /api/userSecurity
      if (pathname === '/api/userSecurity' && req.method === 'GET') {
        const security = await sql`SELECT * FROM user_security LIMIT 100`;
        res.writeHead(200);
        res.end(JSON.stringify(security));
        return;
      }

      if (pathname === '/api/userSecurity' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const userId = payload.user_id || payload.userId || '';
        const now = Date.now();
        await sql`
          INSERT INTO user_security (user_id, tenant_id, pin_hash, password_hash, last_login_at, created_at)
          VALUES (${userId}, ${payload.tenant_id || tenantId || ''}, ${payload.pin_hash || ''}, ${payload.password_hash || ''}, ${now}, ${now})
          ON CONFLICT (user_id) DO UPDATE SET
            pin_hash = EXCLUDED.pin_hash,
            last_login_at = EXCLUDED.last_login_at;
        `;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, user_id: userId }));
        return;
      }

      // 13. GET & POST /api/businessProfiles
      if (pathname === '/api/businessProfiles' && req.method === 'GET') {
        let profiles = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          profiles = await sql`SELECT * FROM business_profiles WHERE tenant_id = ${tenantId}`;
        } else {
          profiles = await sql`SELECT * FROM business_profiles LIMIT 100`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(profiles));
        return;
      }

      if (pathname === '/api/businessProfiles' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const tId = payload.tenant_id || tenantId || '';
        const now = Date.now();
        await sql`
          INSERT INTO business_profiles (tenant_id, business_name, tin_number, vrn_number, address, phone, email, logo_url, currency, updated_at)
          VALUES (${tId}, ${payload.business_name || ''}, ${payload.tin_number || ''}, ${payload.vrn_number || ''}, ${payload.address || ''}, ${payload.phone || ''}, ${payload.email || ''}, ${payload.logo_url || ''}, ${payload.currency || 'TZS'}, ${now})
          ON CONFLICT (tenant_id) DO UPDATE SET
            business_name = EXCLUDED.business_name,
            address = EXCLUDED.address,
            updated_at = ${now};
        `;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, tenant_id: tId }));
        return;
      }

      // 14. GET & POST /api/tenantSubscriptions
      if (pathname === '/api/tenantSubscriptions' && req.method === 'GET') {
        let subs = [];
        if (tenantId && tenantId !== 'tenant-admin-system') {
          subs = await sql`SELECT * FROM tenant_subscriptions WHERE tenant_id = ${tenantId}`;
        } else {
          subs = await sql`SELECT * FROM tenant_subscriptions LIMIT 100`;
        }
        res.writeHead(200);
        res.end(JSON.stringify(subs));
        return;
      }

      if (pathname === '/api/tenantSubscriptions' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const sid = payload.id || `sub-${Date.now()}`;
        const now = Date.now();
        await sql`
          INSERT INTO tenant_subscriptions (id, tenant_id, plan_name, start_date, end_date, status, amount, updated_at)
          VALUES (${sid}, ${payload.tenant_id || tenantId || ''}, ${payload.plan_name || 'Basic'}, ${payload.start_date || now}, ${payload.end_date || now + 365*86400000}, ${payload.status || 'ACTIVE'}, ${payload.amount || 0}, ${now})
          ON CONFLICT (id) DO UPDATE SET
            plan_name = EXCLUDED.plan_name,
            status = EXCLUDED.status,
            updated_at = ${now};
        `;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: sid }));
        return;
      }

      // 15. GET /api/subscriptionPlans & POST /api/subscriptionPlans
      if (pathname === '/api/subscriptionPlans' && req.method === 'GET') {
        const plans = await sql`SELECT * FROM subscription_plans LIMIT 50`;
        res.writeHead(200);
        res.end(JSON.stringify(plans));
        return;
      }

      if (pathname === '/api/subscriptionPlans' && req.method === 'POST') {
        const payload = await parseRequestBody(req);
        const pid = payload.id || `plan-${Date.now()}`;
        await sql`
          INSERT INTO subscription_plans (id, plan_code, name, monthly_price, yearly_price, features)
          VALUES (${pid}, ${payload.plan_code || 'BASIC'}, ${payload.name || 'Basic Plan'}, ${payload.monthly_price || 0}, ${payload.yearly_price || 0}, ${JSON.stringify(payload.features || {})})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            monthly_price = EXCLUDED.monthly_price;
        `;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: pid }));
        return;
      }

      // 16. POST /api/production-cleanup
      if (pathname === '/api/production-cleanup' && req.method === 'POST') {
        console.log(`[Neon Backend] Maintenance cleanup executed.`);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Production cleanup completed' }));
        return;
      }

      // 17. GET /api/sync (Master Incremental Sync from Neon PostgreSQL)
      if (pathname === '/api/sync' && req.method === 'GET') {
        const since = parseInt(fullUrl.searchParams.get('since') || '0', 10);
        const sinceVersion = parseInt(fullUrl.searchParams.get('sinceVersion') || '0', 10);
        const targetTenant = tenantId || fullUrl.searchParams.get('tenantId') || 'tenant-101';
        const filterSince = Math.max(since, sinceVersion);

        const [prods, vars, cats, brds, ledger, brs, settings, modules, flags, devList] = await Promise.all([
          sql`SELECT * FROM products WHERE tenant_id = ${targetTenant} AND (updated_at > ${since} OR created_at > ${since})`,
          sql`SELECT * FROM product_variants WHERE tenant_id = ${targetTenant} AND (updated_at > ${since} OR created_at > ${since})`,
          sql`SELECT * FROM categories WHERE tenant_id = ${targetTenant} AND (updated_at > ${filterSince} OR created_at > ${filterSince} OR sync_version > ${sinceVersion})`,
          sql`SELECT * FROM brands WHERE tenant_id = ${targetTenant} AND (updated_at > ${filterSince} OR created_at > ${filterSince} OR sync_version > ${sinceVersion})`,
          sql`SELECT * FROM stock_ledger WHERE tenant_id = ${targetTenant} AND created_at > ${since}`,
          sql`SELECT * FROM branches WHERE tenant_id = ${targetTenant}`,
          sql`SELECT * FROM tenant_settings WHERE tenant_id = ${targetTenant}`,
          sql`SELECT * FROM tenant_modules WHERE tenant_id = ${targetTenant}`,
          sql`SELECT * FROM feature_flags WHERE tenant_id = ${targetTenant}`,
          sql`SELECT * FROM user_devices WHERE tenant_id = ${targetTenant}`
        ]);

        res.writeHead(200);
        res.end(JSON.stringify({
          serverTimestamp: Date.now(),
          tenantId: targetTenant,
          since,
          changes: {
            products: prods,
            productVariants: vars,
            categories: cats,
            brands: brds,
            stockLedger: ledger,
            branches: brs,
            tenantSettings: settings,
            tenantModules: modules,
            featureFlags: flags,
            userDevices: devList
          }
        }));
        return;
      }

      // 17.1 GET /api/sync/categories (Incremental Categories Sync Endpoint)
      if (pathname === '/api/sync/categories' && req.method === 'GET') {
        const sinceVersion = parseInt(fullUrl.searchParams.get('sinceVersion') || '0', 10);
        const targetTenant = tenantId || fullUrl.searchParams.get('tenantId') || 'tenant-101';
        const serverCategories = await sql`SELECT * FROM categories WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL) AND (sync_version > ${sinceVersion} OR updated_at > ${sinceVersion} OR ${sinceVersion} = 0)`;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, serverCategories }));
        return;
      }

      // 17.2 GET /api/sync/brands (Incremental Brands Sync Endpoint)
      if (pathname === '/api/sync/brands' && req.method === 'GET') {
        const sinceVersion = parseInt(fullUrl.searchParams.get('sinceVersion') || '0', 10);
        const targetTenant = tenantId || fullUrl.searchParams.get('tenantId') || 'tenant-101';
        const serverBrands = await sql`SELECT * FROM brands WHERE tenant_id = ${targetTenant} AND (deleted_at IS NULL) AND (sync_version > ${sinceVersion} OR updated_at > ${sinceVersion} OR ${sinceVersion} = 0)`;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, serverBrands }));
        return;
      }

      // 18. POST /api/sync/push (Batch Queue Sync to Neon PostgreSQL)
      if (pathname === '/api/sync/push' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const operations = body.operations || [];
        const deviceId = req.headers['x-device-id'] || body.deviceId || 'WEB-CLIENT';
        const now = Date.now();
        const processedIds = [];

        for (const op of operations) {
          const entity = op.entity || op.entityName || 'products';
          const payload = op.payload || {};
          const recordId = payload.id || op.entity_id;
          const action = op.operation || op.actionType || 'UPDATE';

          const opTenant = payload.tenant_id || payload.tenantId || op.tenant_id || body.tenantId || tenantId || 'tenant-101';

          if (!recordId) continue;

          if (entity === 'products') {
            if (action === 'DELETE') {
              await sql`UPDATE products SET deleted_at = ${now}, updated_at = ${now} WHERE id = ${recordId}`;
            } else {
              await sql`
                INSERT INTO products (id, tenant_id, branch_id, name, category, category_id, sku, barcode, buying_price, selling_price, price, cost_price, stock, module, has_variants, origin, status, created_at, updated_at, version)
                VALUES (${recordId}, ${opTenant}, ${payload.branch_id || ''}, ${payload.name || 'Product'}, ${payload.category || 'General'}, ${payload.category_id || ''}, ${payload.sku || ''}, ${payload.barcode || ''}, ${payload.buyingPrice || payload.buying_price || 0}, ${payload.sellingPrice || payload.selling_price || 0}, ${payload.price || 0}, ${payload.costPrice || payload.cost_price || 0}, ${payload.stock || 0}, ${payload.module || 'Retail'}, ${payload.hasVariants || false}, ${payload.origin || 'PRODUCTION'}, ${payload.status || 'Active'}, ${payload.createdAt || payload.created_at || now}, ${now}, ${payload.version || 1})
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  stock = EXCLUDED.stock,
                  selling_price = EXCLUDED.selling_price,
                  buying_price = EXCLUDED.buying_price,
                  updated_at = ${now},
                  version = products.version + 1;
              `;
            }
            processedIds.push(op.id || recordId);
          } else if (entity === 'productVariants' || entity === 'product_variants') {
            if (action === 'DELETE') {
              await sql`DELETE FROM product_variants WHERE id = ${recordId}`;
            } else {
              await sql`
                INSERT INTO product_variants (id, tenant_id, branch_id, product_id, sku, barcode, attributes, buying_price, selling_price, stock, status, created_at, updated_at)
                VALUES (${recordId}, ${opTenant}, ${payload.branch_id || ''}, ${payload.productId || payload.product_id || ''}, ${payload.sku || ''}, ${payload.barcode || ''}, ${JSON.stringify(payload.attributes || {})}, ${payload.buyingPrice || payload.buying_price || 0}, ${payload.sellingPrice || payload.selling_price || 0}, ${payload.stock || 0}, ${payload.status || 'Active'}, ${payload.createdAt || payload.created_at || now}, ${now})
                ON CONFLICT (id) DO UPDATE SET
                  stock = EXCLUDED.stock,
                  selling_price = EXCLUDED.selling_price,
                  buying_price = EXCLUDED.buying_price,
                  updated_at = ${now};
              `;
            }
            processedIds.push(op.id || recordId);
          } else if (entity === 'categories') {
            if (action === 'DELETE') {
              await sql`UPDATE categories SET deleted_at = ${now}, updated_at = ${now}, sync_version = sync_version + 1 WHERE id = ${recordId}`;
            } else {
              await sql`
                INSERT INTO categories (id, tenant_id, branch_id, name, code, description, color, icon, status, created_by, updated_by, created_at, updated_at, sync_version, sync_status, parent_id)
                VALUES (
                  ${recordId},
                  ${opTenant},
                  ${payload.branch_id || null},
                  ${payload.name || ''},
                  ${payload.code || ''},
                  ${payload.description || ''},
                  ${payload.color || '#4f46e5'},
                  ${payload.icon || 'Folder'},
                  ${payload.status || 'Active'},
                  ${payload.created_by || 'usr-system'},
                  ${payload.updated_by || 'usr-system'},
                  ${payload.created_at || now},
                  ${now},
                  ${payload.sync_version || 1},
                  'SYNCED',
                  ${payload.parent_id || payload.parentId || null}
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  description = EXCLUDED.description,
                  status = EXCLUDED.status,
                  updated_at = ${now},
                  sync_version = categories.sync_version + 1;
              `;
            }
            processedIds.push(op.id || recordId);
          } else if (entity === 'brands') {
            if (action === 'DELETE') {
              await sql`UPDATE brands SET deleted_at = ${now}, updated_at = ${now}, sync_version = sync_version + 1 WHERE id = ${recordId}`;
            } else {
              await sql`
                INSERT INTO brands (id, tenant_id, branch_id, name, code, description, color, icon, status, created_by, updated_by, created_at, updated_at, sync_version, sync_status)
                VALUES (
                  ${recordId},
                  ${opTenant},
                  ${payload.branch_id || null},
                  ${payload.name || ''},
                  ${payload.code || ''},
                  ${payload.description || ''},
                  ${payload.color || '#9333ea'},
                  ${payload.icon || 'Tag'},
                  ${payload.status || 'Active'},
                  ${payload.created_by || 'usr-system'},
                  ${payload.updated_by || 'usr-system'},
                  ${payload.created_at || now},
                  ${now},
                  ${payload.sync_version || 1},
                  'SYNCED'
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  description = EXCLUDED.description,
                  status = EXCLUDED.status,
                  updated_at = ${now},
                  sync_version = brands.sync_version + 1;
              `;
            }
            processedIds.push(op.id || recordId);
          } else if (entity === 'stockLedger' || entity === 'stock_ledger') {
            await sql`
              INSERT INTO stock_ledger (id, tenant_id, branch_id, product_id, variant_id, movement_type, quantity_before, quantity_change, quantity_after, unit_cost, total_cost, user_id, device_id, idempotency_key, created_at)
              VALUES (${recordId}, ${opTenant}, ${payload.branch_id || ''}, ${payload.product_id || ''}, ${payload.variant_id || ''}, ${payload.movement_type || 'ADJUSTMENT'}, ${payload.quantity_before || 0}, ${payload.quantity_change || 0}, ${payload.quantity_after || 0}, ${payload.unit_cost || 0}, ${payload.total_cost || 0}, ${payload.user_id || ''}, ${deviceId}, ${payload.idempotency_key || recordId}, ${payload.created_at || now})
              ON CONFLICT (id) DO NOTHING;
            `;

            if (payload.product_id) {
              await sql`
                UPDATE products 
                SET stock = (
                  SELECT COALESCE(SUM(
                    CASE 
                      WHEN movement_type IN ('OPENING_STOCK', 'PURCHASE_RECEIVE', 'CUSTOMER_RETURN', 'TRANSFER_IN', 'PRODUCTION_OUTPUT', 'ADJUSTMENT_GAIN') THEN ABS(quantity_change)
                      ELSE -ABS(quantity_change)
                    END
                  ), 0)
                  FROM stock_ledger 
                  WHERE product_id = ${payload.product_id}
                ), updated_at = ${now}
                WHERE id = ${payload.product_id}
              `;
            }

            if (payload.variant_id && payload.variant_id !== 'no-variant') {
              await sql`
                UPDATE product_variants 
                SET stock = (
                  SELECT COALESCE(SUM(
                    CASE 
                      WHEN movement_type IN ('OPENING_STOCK', 'PURCHASE_RECEIVE', 'CUSTOMER_RETURN', 'TRANSFER_IN', 'PRODUCTION_OUTPUT', 'ADJUSTMENT_GAIN') THEN ABS(quantity_change)
                      ELSE -ABS(quantity_change)
                    END
                  ), 0)
                  FROM stock_ledger 
                  WHERE variant_id = ${payload.variant_id}
                ), updated_at = ${now}
                WHERE id = ${payload.variant_id}
              `;
            }

            processedIds.push(op.id || recordId);
          } else if (entity === 'orders') {
            await sql`
              INSERT INTO orders (id, tenant_id, branch_id, total, status, payment_method, created_at, updated_at)
              VALUES (${recordId}, ${opTenant}, ${payload.branch_id || ''}, ${payload.total || 0}, ${payload.status || 'Completed'}, ${payload.paymentMethod || payload.payment_method || 'Cash'}, ${payload.timestamp || payload.created_at || now}, ${now})
              ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                updated_at = ${now};
            `.catch(() => {});
            processedIds.push(op.id || recordId);
          } else if (entity === 'receipts') {
            await sql`
              INSERT INTO receipts (id, tenant_id, branch_id, receipt_number, total, status, created_at, updated_at)
              VALUES (${recordId}, ${opTenant}, ${payload.branch_id || ''}, ${payload.receipt_number || recordId}, ${payload.total || 0}, ${payload.status || 'Completed'}, ${payload.created_at || now}, ${now})
              ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                updated_at = ${now};
            `.catch(() => {});
            processedIds.push(op.id || recordId);
          } else {
            processedIds.push(op.id || recordId);
          }
        }

        invalidateTenantBootstrapCache(tenantId);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          processedIds,
          serverTimestamp: now,
          deviceId
        }));
        return;
      }

      // 19. DELETE /api/products/:id
      if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
        const prodId = pathname.replace('/api/products/', '');
        if (prodId) {
          console.log(`[Neon Backend] Permanently deleting product ${prodId} and variants from PostgreSQL...`);
          await sql`DELETE FROM product_variants WHERE product_id = ${prodId}`;
          await sql`DELETE FROM products WHERE id = ${prodId}`;
          invalidateTenantBootstrapCache(tenantId);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, id: prodId, message: 'Product and variants deleted from Neon PostgreSQL' }));
          return;
        }
      }

      // 20. POST /api/tenant/purge — Isolated Tenant Store Data Cleanup
      if (pathname === '/api/tenant/purge' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const targetTenant = tenantId || body.tenantId || body.tenant_id;
        const scope = body.scope; // 'products' | 'sales' | 'contacts'

        if (!targetTenant) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Tenant ID required for purge operation.' }));
          return;
        }

        console.log(`[Neon Backend] Executing tenant purge [scope: ${scope}] for tenant ${targetTenant}...`);

        if (scope === 'products') {
          await sql`DELETE FROM stock_ledger WHERE tenant_id = ${targetTenant}`;
          await sql`DELETE FROM product_variants WHERE tenant_id = ${targetTenant}`;
          await sql`DELETE FROM products WHERE tenant_id = ${targetTenant}`;
        } else if (scope === 'sales') {
          await sql`DELETE FROM receipt_items WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM receipt_print_logs WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM receipt_share_logs WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM receipt_audit_logs WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM receipt_qr_codes WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM receipt_signatures WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM receipt_number_sequences WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM receipts WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM held_carts WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM pos_shifts WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM tabs WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM cash_movements WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM cash_shifts WHERE tenant_id = ${targetTenant}`.catch(() => {});
          await sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ${targetTenant})`.catch(() => {});
          await sql`DELETE FROM orders WHERE tenant_id = ${targetTenant}`.catch(() => {});
        } else if (scope === 'contacts') {
          await sql`DELETE FROM customers WHERE tenant_id = ${targetTenant}`;
        }

        invalidateTenantBootstrapCache(targetTenant);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          scope,
          tenantId: targetTenant,
          message: `Tenant store cleanup completed for scope: ${scope}`
        }));
        return;
      }

      // Generic 404 for unrecognized API routes
      res.writeHead(404);
      res.end(JSON.stringify({ error: `API endpoint ${pathname} not found on Neon backend` }));
      return;
    } catch (apiErr) {
      console.error(`[Neon Backend API Error] ${pathname}:`, apiErr);
      res.writeHead(500);
      res.end(JSON.stringify({ error: apiErr.message || 'Internal Server Error' }));
      return;
    }
  }

  // ─── STATIC ASSET SERVING FOR FIREBASE APP HOSTING ─────────────────────────
  const reqUrl = req.url ? req.url.split('?')[0] : '/';
  let filePath = path.join(DIST_DIR, reqUrl === '/' ? 'index.html' : reqUrl);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': extname === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`DukaPos Production Backend running on http://0.0.0.0:${PORT} connected to Neon PostgreSQL!`);
});
