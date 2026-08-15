import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pkgPath = path.resolve(__dirname, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

// Compute enterprise build metadata at compile-time with persistent auto-incrementing build counter
const counterPath = path.resolve(__dirname, 'build-counter.json')
let buildCount = 111
try {
  if (fs.existsSync(counterPath)) {
    const data = JSON.parse(fs.readFileSync(counterPath, 'utf-8'))
    buildCount = (Number(data.buildCount) || 111) + 1
  } else {
    buildCount = 112
  }
} catch (e) {
  buildCount = 112
}

try {
  fs.writeFileSync(counterPath, JSON.stringify({ buildCount, updatedAt: new Date().toISOString() }, null, 2), 'utf-8')
} catch (e) {}

let commitSha = 'b5373bd'
try {
  commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
} catch (e) {
  // Fallback if git is uninstalled
}

const now = new Date()
const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
const dynamicBuildNumber = `${dateStr}.${buildCount}`
const buildDateStr = now.toISOString().split('T')[0]

const dbPath = path.resolve(__dirname, 'cloud_db.json')
const dbExamplePath = path.resolve(__dirname, 'cloud_db.json.example')


// Bootstrap cloud_db.json from cloud_db.json.example if it does not exist.
// cloud_db.json is gitignored — all development tenant data stays local only.
// Production tenants must register through the app; they are never seeded here.
function ensureDbSeeded() {
  const dbExists = fs.existsSync(dbPath)
  if (!dbExists) {
    // Auto-create from committed example template
    if (fs.existsSync(dbExamplePath)) {
      try {
        const example = fs.readFileSync(dbExamplePath, 'utf-8')
        const seed = JSON.parse(example)
        // Stamp cleanedAt with current time so it's always fresh
        seed.cleanedAt = Date.now()
        delete seed._comment
        fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2), 'utf-8')
        console.log('[DevServer] cloud_db.json bootstrapped from cloud_db.json.example (clean slate — no dev tenants).')
      } catch (e) {
        console.error('[DevServer] Failed to bootstrap cloud_db.json from example:', e)
      }
    } else {
      // Fallback: write minimal clean state if example is also missing
      const fallback = {
        isProductionLocked: true,
        cleanedAt: Date.now(),
        tenants: [], branches: [], users: [
          { id: 'usr-superadmin', email: 'admin@kwakoko.co.tz', password_hash: 'Kwakoko@2026&$',
            is_super_admin: true, name: 'System Platform Owner', phone: '+255713296319',
            tenant_id: 'tenant-admin-system', role: 'Super Admin', status: 'Active' }
        ],
        products: [], variants: [], orders: [], stockLedger: [], customers: [],
        userBranchRoles: [], tenantModules: [], tenantSettings: [], featureFlags: [],
        userSecurity: [{ user_id: 'usr-superadmin', pin_hash: '1911', failed_attempts: 0, two_factor_enabled: false }],
        subscriptionPlans: [], subscriptions: [], auditLogs: []
      }
      fs.writeFileSync(dbPath, JSON.stringify(fallback, null, 2), 'utf-8')
      console.log('[DevServer] cloud_db.json created with minimal fallback (Super Admin only).')
    }
    return
  }

  // Validate existing db is not corrupted
  try {
    const content = fs.readFileSync(dbPath, 'utf-8').trim()
    if (!content || content === '{}') {
      // Corrupt or empty — remove and let next call recreate
      fs.unlinkSync(dbPath)
      console.warn('[DevServer] cloud_db.json was empty/corrupt — deleted. Will recreate on next request.')
    }
  } catch (e) {
    // ignore read errors
  }
}


// Helper to read database
function readDb() {
  ensureDbSeeded()
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
  } catch (e) {
    return { products: [], variants: [], tenants: [], branches: [], users: [], userBranchRoles: [], tenantModules: [], tenantSettings: [], featureFlags: [], userSecurity: [], subscriptionPlans: [], auditLogs: [] }
  }
}

// Helper to write database
function writeDb(data: any) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(dynamicBuildNumber),
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(commitSha),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDateStr),
  },
  plugins: [
    react(),
    {
      name: 'dukapos-mock-cloud-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/api/')) {
            // 1. Attempt to proxy to local PostgreSQL backend server (server.js on :8080)
            const proxyReq = http.request(
              {
                hostname: '127.0.0.1',
                port: 8080,
                path: req.url,
                method: req.method,
                headers: {
                  ...req.headers,
                  host: '127.0.0.1:8080',
                },
              },
              (backendRes) => {
                if (backendRes.statusCode) {
                  res.writeHead(backendRes.statusCode, backendRes.headers);
                  backendRes.pipe(res, { end: true });
                }
              }
            );

            proxyReq.on('error', () => {
              // 2. Fallback to local file-based mock db if server.js on :8080 is not running
              executeMockFallback(req, res, next);
            });

            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
              req.pipe(proxyReq, { end: true });
            } else {
              proxyReq.end();
            }
            return;
          }
          next();
        });

        function executeMockFallback(req: any, res: any, _next?: any) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Headers', '*')
          res.setHeader('Access-Control-Allow-Methods', '*')


          if (req.method === 'OPTIONS') {
            res.statusCode = 200
            res.end()
            return
          }

          // Parse URL safely
          const url = new URL(req.url, 'http://localhost')
          const db = readDb()

            // 1. Extract table name from URL and dynamically initialize if missing
            const pathParts = url.pathname.split('/')
            const entityNameFromUrl = pathParts[2] // /api/tableName
            if (entityNameFromUrl && entityNameFromUrl !== 'ping' && !db[entityNameFromUrl]) {
              db[entityNameFromUrl] = []
              writeDb(db)
            }

            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            res.setHeader('Pragma', 'no-cache')
            res.setHeader('Expires', '0')

            // 2. Parse multi-tenant headers case-insensitively or from search params
            const reqTenantId = (req.headers['x-tenant-id'] as string) ||
              (req.headers['X-Tenant-ID'] as string) ||
              (req.headers['x-tenant-id'.toLowerCase()] as string) ||
              url.searchParams.get('tenantId') ||
              url.searchParams.get('tenant_id') ||
              ''

            const isPlatformRoute = url.pathname === '/api/tenants' || url.pathname === '/api/users' || url.pathname === '/api/subscriptionPlans'
            const isPingRoute = url.pathname === '/api/ping'

            // Enforce multi-tenant validation on request context
            if (!isPingRoute && reqTenantId !== 'tenant-admin-system') {
              if (!isPlatformRoute && !reqTenantId) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Explicit tenant context required.' }))
                return
              }
            }

            // ── GET /api/ping — connectivity probe ──
            if (url.pathname === '/api/ping' && (req.method === 'GET' || req.method === 'HEAD')) {
              res.statusCode = 200
              res.end(JSON.stringify({ ok: true, ts: Date.now() }))
              return
            }

            // ── GET /api/version — PWA Version Probe ──
            if (url.pathname === '/api/version' && (req.method === 'GET' || req.method === 'HEAD')) {
              res.statusCode = 200
              res.end(JSON.stringify({
                version: pkg.version,
                buildNumber: dynamicBuildNumber,
                commitSha,
                buildDate: buildDateStr,
                timestamp: Date.now()
              }))
              return
            }

            // ── POST /api/bootstrap — Fast Bootstrap Snapshot Endpoint ──
            if (url.pathname === '/api/bootstrap' && (req.method === 'POST' || req.method === 'GET')) {
              const tenantId = reqTenantId || '8f1109a3-9ab8-4922-a4e0-d706a3a2d85d'
              const clientETag = req.headers['if-none-match'] || req.headers['x-if-none-match'] || ''
              const tenant = (db.tenants || []).find((t: any) => t.id === tenantId) || { id: tenantId, name: 'Bravados', plan: 'Enterprise' }
              const user = (db.users || []).find((u: any) => u.tenant_id === tenantId || u.tenantId === tenantId) || null
              const branches = (db.branches || []).filter((b: any) => (b.tenant_id === tenantId || b.tenantId === tenantId) && !b.deletedAt)
              const categories = (db.categories || []).filter((c: any) => (c.tenant_id === tenantId || c.tenantId === tenantId) && !c.deletedAt && !c.deleted_at && (c.status || 'Active') !== 'Inactive')
              const brands = (db.brands || []).filter((b: any) => (b.tenant_id === tenantId || b.tenantId === tenantId) && !b.deletedAt && !b.deleted_at && (b.status || 'Active') !== 'Inactive')
              const products = (db.products || []).filter((p: any) => (p.tenant_id === tenantId || p.tenantId === tenantId) && !p.deletedAt)
              const variants = (db.variants || db.productVariants || []).filter((v: any) => (v.tenant_id === tenantId || v.tenantId === tenantId) && !v.deletedAt)
              const stockLedger = (db.stockLedger || []).filter((s: any) => s.tenant_id === tenantId || s.tenantId === tenantId).slice(0, 500)
              const customers = (db.customers || []).filter((c: any) => c.tenant_id === tenantId || c.tenantId === tenantId)
              const subscriptionPlans = db.subscriptionPlans || []

              let maxSyncVer = 1
              const allEntities = [...categories, ...brands, ...products, ...variants, ...stockLedger, ...customers]
              for (const e of allEntities) {
                const v = parseInt(e.sync_version || e.version || '1', 10)
                if (v > maxSyncVer) maxSyncVer = v
              }

              const etag = `W/"sync-${tenantId}-v${maxSyncVer}"`
              if (clientETag && clientETag === etag) {
                res.statusCode = 304
                res.setHeader('ETag', etag)
                res.setHeader('X-Bootstrap-Cache', 'REVALIDATED_304')
                res.end()
                return
              }

              res.statusCode = 200
              res.setHeader('ETag', etag)
              res.setHeader('X-Bootstrap-Cache', 'MISS')
              res.end(JSON.stringify({
                tenant,
                user,
                branches,
                settings: {},
                categories,
                brands,
                products,
                variants,
                stockLedger,
                customers,
                permissions: [],
                subscriptionPlans,
                syncVersion: maxSyncVer,
                schemaVersion: 8,
                generatedAt: new Date().toISOString(),
                serverTimestamp: Date.now()
              }))
              return
            }

            // ── GET /api/sync — Master Incremental Sync Endpoint ──
            if (url.pathname === '/api/sync' && req.method === 'GET') {
              const tenantId = url.searchParams.get('tenantId') || url.searchParams.get('tenant_id') || reqTenantId;
              const sinceRaw = url.searchParams.get('since') || '0';
              let sinceTs = 0;
              if (sinceRaw.includes('-') || sinceRaw.includes('T')) {
                sinceTs = new Date(sinceRaw).getTime() || 0;
              } else {
                sinceTs = parseInt(sinceRaw, 10) || 0;
              }

              const collections = [
                'products', 'variants', 'categories', 'customers', 'suppliers',
                'orders', 'purchases', 'payments', 'expenses', 'stockLedger',
                'branches', 'tenantSettings', 'users', 'userDevices'
              ];

              const serverTime = Date.now();
              const changes: Record<string, any[]> = {};

              for (const coll of collections) {
                const rawTable = (db[coll] || []);
                const filtered = rawTable.filter((item: any) => {
                  const itemTenant = item.tenantId || item.tenant_id || item.tenant;
                  if (reqTenantId !== 'tenant-admin-system' && itemTenant !== tenantId) return false;
                  
                  const updatedTs = item.updatedAt || item.updated_at || item.createdAt || item.created_at || 0;
                  const deletedTs = item.deletedAt || item.deleted_at || 0;
                  const maxTs = Math.max(updatedTs, deletedTs);

                  return sinceTs === 0 || maxTs > sinceTs;
                });

                changes[coll] = filtered;
              }

              res.statusCode = 200;
              res.end(JSON.stringify({
                tenantId,
                since: sinceTs,
                serverTime,
                changes
              }));
              return;
            }

            // ── POST /api/production-cleanup — Production Clean System disk purge ──
            if (url.pathname === '/api/production-cleanup' && req.method === 'POST') {
              const NOW_CLEAN = Date.now();
              const cleanDbState = {
                isProductionLocked: true,
                cleanedAt: NOW_CLEAN,
                products: [],
                variants: [],
                tenants: [],
                branches: [],
                users: [
                  { id: 'usr-superadmin', email: 'admin@kwakoko.co.tz', password_hash: 'Kwakoko@2026&$', is_super_admin: true, name: 'System Platform Owner', phone: '+255713296319', tenant_id: 'tenant-admin-system', created_at: NOW_CLEAN }
                ],
                userBranchRoles: [],
                tenantModules: [],
                tenantSettings: [],
                featureFlags: [],
                userSecurity: [],
                subscriptionPlans: [
                  { id: 'plan-trial', name: 'Free Trial', code: 'TRIAL', description: '14-day full platform access trial for new business evaluation.', price: 0, currency: 'TZS', billing_cycle: 'monthly', max_users: 2, max_branches: 1, max_products: 100, max_storage_mb: 100, is_trial: true, is_active: true, created_at: NOW_CLEAN, updated_at: NOW_CLEAN },
                  { id: 'plan-starter', name: 'Starter Plan', code: 'STARTER', description: 'For small single-shop businesses looking to start digitization.', price: 12000, currency: 'TZS', billing_cycle: 'monthly', max_users: 3, max_branches: 1, max_products: 1000, max_storage_mb: 500, is_trial: false, is_active: true, created_at: NOW_CLEAN, updated_at: NOW_CLEAN },
                  { id: 'plan-business', name: 'Business Plan', code: 'BUSINESS', description: 'Perfect for retail stores with multiple branches and staff teams.', price: 16000, currency: 'TZS', billing_cycle: 'monthly', max_users: 10, max_branches: 5, max_products: 50000, max_storage_mb: 2000, is_trial: false, is_active: true, created_at: NOW_CLEAN, updated_at: NOW_CLEAN },
                  { id: 'plan-enterprise', name: 'Enterprise Plan', code: 'ENTERPRISE', description: 'Custom setups, infinite scale, and offline micro-service sync.', price: 30000, currency: 'TZS', billing_cycle: 'monthly', max_users: 9999, max_branches: 9999, max_products: 999999, max_storage_mb: 50000, is_trial: false, is_active: true, created_at: NOW_CLEAN, updated_at: NOW_CLEAN }
                ],
                subscriptions: [],
                auditLogs: []
              };
              writeDb(cleanDbState);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Production Clean System applied to disk database cloud_db.json' }));
              return;
            }

            // ── POST /api/tenant/purge — Isolated Tenant Store Data Cleanup ──
            if (url.pathname === '/api/tenant/purge' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', () => {
                try {
                  const parsedBody = body ? JSON.parse(body) : {};
                  const targetTenant = reqTenantId || parsedBody.tenantId || parsedBody.tenant_id;
                  const scope = parsedBody.scope;

                  if (!targetTenant) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Tenant ID required' }));
                    return;
                  }

                  if (scope === 'products') {
                    if (db.products) db.products = db.products.filter((p: any) => (p.tenant_id || p.tenantId) !== targetTenant);
                    if (db.variants) db.variants = db.variants.filter((v: any) => (v.tenant_id || v.tenantId) !== targetTenant);
                    if (db.stockLedger) db.stockLedger = db.stockLedger.filter((s: any) => (s.tenant_id || s.tenantId) !== targetTenant);
                  } else if (scope === 'sales') {
                    if (db.orders) db.orders = db.orders.filter((o: any) => (o.tenant_id || o.tenantId) !== targetTenant);
                    if (db.receipts) db.receipts = db.receipts.filter((r: any) => (r.tenant_id || r.tenantId) !== targetTenant);
                    if (db.receiptItems) db.receiptItems = db.receiptItems.filter((ri: any) => (ri.tenant_id || ri.tenantId) !== targetTenant);
                    if (db.receiptPrintLogs) db.receiptPrintLogs = db.receiptPrintLogs.filter((r: any) => (r.tenant_id || r.tenantId) !== targetTenant);
                    if (db.receiptShareLogs) db.receiptShareLogs = db.receiptShareLogs.filter((r: any) => (r.tenant_id || r.tenantId) !== targetTenant);
                    if (db.receiptAuditLogs) db.receiptAuditLogs = db.receiptAuditLogs.filter((r: any) => (r.tenant_id || r.tenantId) !== targetTenant);
                    if (db.receiptQrCodes) db.receiptQrCodes = db.receiptQrCodes.filter((r: any) => (r.tenant_id || r.tenantId) !== targetTenant);
                    if (db.receiptSignatures) db.receiptSignatures = db.receiptSignatures.filter((r: any) => (r.tenant_id || r.tenantId) !== targetTenant);
                    if (db.receiptNumberSequences) db.receiptNumberSequences = db.receiptNumberSequences.filter((r: any) => (r.tenant_id || r.tenantId) !== targetTenant);
                    if (db.heldCarts) db.heldCarts = db.heldCarts.filter((h: any) => (h.tenant_id || h.tenantId) !== targetTenant);
                    if (db.posShifts) db.posShifts = db.posShifts.filter((s: any) => (s.tenant_id || s.tenantId) !== targetTenant);
                    if (db.tabs) db.tabs = db.tabs.filter((t: any) => (t.tenant_id || t.tenantId) !== targetTenant);
                    if (db.cashMovements) db.cashMovements = db.cashMovements.filter((m: any) => (m.tenant_id || m.tenantId) !== targetTenant);
                    if (db.cashShifts) db.cashShifts = db.cashShifts.filter((s: any) => (s.tenant_id || s.tenantId) !== targetTenant);
                  } else if (scope === 'contacts') {
                    if (db.customers) db.customers = db.customers.filter((c: any) => (c.tenant_id || c.tenantId) !== targetTenant);
                    if (db.suppliers) db.suppliers = db.suppliers.filter((s: any) => (s.tenant_id || s.tenantId) !== targetTenant);
                    if (db.expenses) db.expenses = db.expenses.filter((e: any) => (e.tenant_id || e.tenantId) !== targetTenant);
                  }

                  writeDb(db);
                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, scope, tenantId: targetTenant }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err?.message }));
                }
              });
              return;
            }

            // ── POST /api/sync/push — Batch Queue Push Endpoint ──
            if (url.pathname === '/api/sync/push' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', () => {
                try {
                  const parsedBody = body ? JSON.parse(body) : {};
                  const tenantId = reqTenantId || parsedBody.tenantId || parsedBody.tenant_id;
                  const operations = parsedBody.operations || parsedBody.batch || [];
                  const deviceId = (req.headers['x-device-id'] as string) || parsedBody.deviceId || 'unknown-device';

                  if (!Array.isArray(operations)) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Invalid payload: operations array required' }));
                    return;
                  }

                  const now = Date.now();
                  const processedIds: string[] = [];
                  const conflicts: any[] = [];

                  for (const op of operations) {
                    const entityName = op.entity || op.entityName || 'products';
                    const payload = op.payload || {};
                    const recordId = payload.id || op.entity_id;
                    const action = op.operation || op.actionType || 'UPDATE';

                    if (!recordId) continue;
                    if (!db[entityName]) db[entityName] = [];

                    const table = db[entityName];
                    const index = table.findIndex((r: any) => r.id === recordId);

                    if (action === 'DELETE') {
                      if (index > -1) {
                        table[index].deleted_at = now;
                        table[index].deletedAt = now;
                        table[index].is_deleted = true;
                        table[index].updated_at = now;
                        table[index].updatedAt = now;
                        table[index].version = (table[index].version || 1) + 1;
                      }
                      processedIds.push(op.id || recordId);
                    } else {
                      if (index > -1) {
                        const existing = table[index];
                        const clientVer = payload.version || 1;
                        const serverVer = existing.version || 1;

                        if (clientVer < serverVer && payload.updated_at < existing.updated_at) {
                          conflicts.push({ recordId, resolution: 'SERVER_WINS', serverRecord: existing });
                          continue;
                        }

                        table[index] = {
                          ...existing,
                          ...payload,
                          tenant_id: tenantId,
                          tenantId: tenantId,
                          device_id: deviceId,
                          updated_at: now,
                          updatedAt: now,
                          version: serverVer + 1,
                          sync_version: (existing.sync_version || 0) + 1,
                          sync_status: 'SYNCED'
                        };
                      } else {
                        const newItem = {
                          ...payload,
                          id: recordId,
                          tenant_id: tenantId,
                          tenantId: tenantId,
                          device_id: deviceId,
                          created_at: payload.created_at || now,
                          createdAt: payload.createdAt || now,
                          updated_at: now,
                          updatedAt: now,
                          version: 1,
                          sync_version: 1,
                          sync_status: 'SYNCED'
                        };
                        table.push(newItem);
                      }
                      processedIds.push(op.id || recordId);
                    }
                  }

                  writeDb(db);
                  res.statusCode = 200;
                  res.end(JSON.stringify({
                    success: true,
                    processedCount: processedIds.length,
                    processedIds,
                    conflicts,
                    serverTime: now
                  }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err?.message }));
                }
              });
              return;
            }

            // ── POST /api/userDevices — Device Registration ──
            if (url.pathname === '/api/userDevices' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', () => {
                try {
                  const deviceInfo = body ? JSON.parse(body) : {};
                  if (!db.userDevices) db.userDevices = [];
                  const idx = db.userDevices.findIndex((d: any) => d.device_id === deviceInfo.device_id);
                  if (idx > -1) {
                    db.userDevices[idx] = { ...db.userDevices[idx], ...deviceInfo, last_seen: Date.now() };
                  } else {
                    db.userDevices.push({ ...deviceInfo, last_seen: Date.now() });
                  }
                  writeDb(db);
                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, device: deviceInfo }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err?.message }));
                }
              });
              return;
            }

            // ── Server-Side Inventory WAC & FIFO Valuation Endpoint ──
            if (url.pathname === '/api/inventory/valuation' || url.pathname === '/api/v1/inventory/valuation') {
              const tenantId = url.searchParams.get('tenantId') || url.searchParams.get('tenant_id') || reqTenantId;
              const method = (url.searchParams.get('method') || 'WAC').toUpperCase();

              const products = (db.products || []).filter((p: any) => {
                const pTenant = p.tenantId || p.tenant_id;
                const active = !p.deletedAt && !p.deleted_at && p.status !== 'Inactive';
                return pTenant === tenantId && active;
              });

              const variants = (db.variants || db.productVariants || []).filter((v: any) => {
                const vTenant = v.tenantId || v.tenant_id;
                const active = !v.deletedAt && !v.deleted_at && v.status !== 'Inactive';
                return vTenant === tenantId && active;
              });

              let totalValuation = 0;
              let simpleProductsValuation = 0;
              let variantProductsValuation = 0;
              let itemCount = 0;

              for (const p of products) {
                if (p.hasVariants) {
                  const prodVars = variants.filter((v: any) => v.productId === p.id || v.product_id === p.id);
                  for (const v of prodVars) {
                    const qty = Math.max(0, v.stock || 0);
                    let unitCost = v.buyingPrice ?? v.costPrice ?? p.buyingPrice ?? p.costPrice ?? p.price ?? 0;
                    if (unitCost <= 0 && p.sellingPrice > 0) {
                      unitCost = Math.round(p.sellingPrice * 0.70 * 100) / 100; // Baseline 70% cost margin backfill
                    }
                    const val = Math.round((qty * unitCost) * 100) / 100;
                    variantProductsValuation += val;
                    itemCount += qty;
                  }
                } else {
                  const qty = Math.max(0, p.stock || 0);
                  let unitCost = p.buyingPrice ?? p.costPrice ?? p.price ?? 0;
                  if (unitCost <= 0 && p.sellingPrice > 0) {
                    unitCost = Math.round(p.sellingPrice * 0.70 * 100) / 100; // Baseline 70% cost margin backfill
                  }
                  const val = Math.round((qty * unitCost) * 100) / 100;
                  simpleProductsValuation += val;
                  itemCount += qty;
                }
              }

              totalValuation = Math.round((simpleProductsValuation + variantProductsValuation) * 100) / 100;

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                tenantId,
                method,
                totalValuation,
                simpleProductsValuation: Math.round(simpleProductsValuation * 100) / 100,
                variantProductsValuation: Math.round(variantProductsValuation * 100) / 100,
                productCount: products.length,
                itemCount,
                calculatedAt: Date.now()
              }));
              return;
            }

            // Generic GET route mapping
            const entityMatch = url.pathname.match(/^\/api\/(?:v1\/)?([a-zA-Z_]+)$/)
            if (entityMatch && req.method === 'GET') {
              const entityName = entityMatch[1]
              let table = db[entityName]
              if (table) {
                // Apply soft-delete filtering by default for products, variants, and tenants
                if (entityName === 'products' || entityName === 'variants' || entityName === 'tenants') {
                  table = table.filter((r: any) => r.deletedAt === undefined || r.deletedAt === null || r.deleted_at === undefined || r.deleted_at === null)
                }

                const tenantFilter = url.searchParams.get('tenantId') || url.searchParams.get('tenant_id') || reqTenantId
                const isAuthResolutionEntity = [
                  'tenants', 'users', 'subscriptionPlans', 'userBranchRoles',
                  'branches', 'tenantModules', 'tenantSettings', 'featureFlags',
                  'userSecurity', 'businessProfiles', 'tenantUsers', 'tenantUserBranches'
                ].includes(entityName);

                // Filter records strictly by tenant ID
                if (reqTenantId !== 'tenant-admin-system' && !isAuthResolutionEntity && tenantFilter) {
                  table = table.filter((r: any) => {
                    const recordTenantId = r.tenantId || r.tenant_id || r.tenant
                    return recordTenantId === tenantFilter
                  })
                }

                // Support single ID queries
                const idFilter = url.searchParams.get('id')
                if (idFilter) {
                  const idKey = entityName === 'userSecurity' ? 'user_id' : 'id'
                  table = table.filter((r: any) => r[idKey] === idFilter)
                }

                // Support username/email queries for authentication checking
                const emailFilter = url.searchParams.get('email')
                if (emailFilter && entityName === 'users') {
                  table = table.filter((r: any) => r.email?.toLowerCase() === emailFilter.toLowerCase())
                }

                // Support optional pagination parameters (page & limit)
                const limitParam = url.searchParams.get('limit')
                const pageParam = url.searchParams.get('page')
                if (limitParam) {
                  const limit = parseInt(limitParam, 10) || 50
                  const page = parseInt(pageParam || '1', 10) || 1
                  const offset = (page - 1) * limit
                  table = table.slice(offset, offset + limit)
                }

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(table))
                return
              }
            }

            // Read request body for posts/deletes
            let body = ''
            req.on('data', (chunk: any) => { body += chunk })
            req.on('end', () => {
              try {
                const parsedBody = body ? JSON.parse(body) : {}

                // ── Batch Inventory Sync & Upsert Reconciliation Endpoint ──
                if ((url.pathname === '/api/products/sync-batch' || url.pathname === '/api/v1/products/sync-batch') && req.method === 'POST') {
                  const tenantId = reqTenantId || parsedBody.tenantId || parsedBody.tenant_id;
                  const products = parsedBody.products;

                  if (!tenantId || !Array.isArray(products)) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: "Invalid payload or missing tenant context." }));
                    return;
                  }

                  if (!db.products) db.products = [];

                  const results: any[] = [];
                  const now = Date.now();

                  for (const item of products) {
                    const itemTenant = item.tenantId || item.tenant_id || tenantId;
                    if (reqTenantId !== 'tenant-admin-system' && itemTenant !== tenantId) {
                      continue; // Enforce tenant isolation
                    }

                    const index = db.products.findIndex((r: any) => r.id === item.id && (r.tenantId === tenantId || r.tenant_id === tenantId));
                    if (index > -1) {
                      db.products[index] = {
                        ...db.products[index],
                        ...item,
                        tenantId,
                        tenant_id: tenantId,
                        updatedAt: now,
                        updated_at: now,
                        version: (db.products[index].version || 1) + 1,
                      };
                      results.push(db.products[index]);
                    } else {
                      const newItem = {
                        ...item,
                        tenantId,
                        tenant_id: tenantId,
                        createdAt: item.createdAt || item.created_at || now,
                        updatedAt: now,
                        status: item.status || 'Active',
                        version: 1,
                      };
                      db.products.push(newItem);
                      results.push(newItem);
                    }
                  }

                  writeDb(db);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    message: "Inventory successfully reconciled.",
                    syncedCount: results.length,
                    products: results
                  }));
                  return;
                }

                // Generic POST route mapping (upsert)
                const postMatch = url.pathname.match(/^\/api\/([a-zA-Z_]+)$/)
                if (postMatch && req.method === 'POST') {
                  const entityName = postMatch[1]
                  const table = db[entityName]
                  if (table) {
                    const item = parsedBody

                    // Enforce tenant validation on write payloads
                    if (reqTenantId !== 'tenant-admin-system' && entityName !== 'tenants' && entityName !== 'users') {
                      const itemTenantId = item.tenantId || item.tenant_id || item.tenant
                      if (itemTenantId && itemTenantId !== reqTenantId) {
                        res.statusCode = 403
                        res.end(JSON.stringify({ error: 'Access Denied: Cannot write records belonging to another tenant.' }))
                        return
                      }
                    }

                    const idKey = entityName === 'userSecurity' ? 'user_id' : 'id'
                    const index = table.findIndex((r: any) => r[idKey] === item[idKey])

                    // Verify existing record is not overwritten across tenants
                    if (index > -1 && reqTenantId !== 'tenant-admin-system' && entityName !== 'tenants' && entityName !== 'users') {
                      const existingRecord = table[index]
                      const existingTenantId = existingRecord.tenantId || existingRecord.tenant_id || existingRecord.tenant
                      if (existingTenantId && existingTenantId !== reqTenantId) {
                        res.statusCode = 403
                        res.end(JSON.stringify({ error: 'Access Denied: Cross-tenant overwrite detected.' }))
                        return
                      }
                    }

                    if (index > -1) {
                      table[index] = { ...table[index], ...item }
                    } else {
                      // Auto-bind tenant ID on creation
                      if (reqTenantId !== 'tenant-admin-system' && entityName !== 'tenants' && entityName !== 'users') {
                        if (!item.tenant_id) item.tenant_id = reqTenantId
                        if (!item.tenantId) item.tenantId = reqTenantId
                      }
                      table.push(item)
                    }
                    writeDb(db)
                    res.end(JSON.stringify({ data: [item], error: null }))
                    return
                  }
                }

                // Generic DELETE route mapping
                const deleteMatch = url.pathname.match(/^\/api\/([a-zA-Z_]+)\/([a-zA-Z0-9\-_]+)$/)
                if (deleteMatch && req.method === 'DELETE') {
                  const entityName = deleteMatch[1]
                  const recordId = deleteMatch[2]
                  const table = db[entityName]
                  if (table) {
                    const idKey = entityName === 'userSecurity' ? 'user_id' : 'id'
                    const index = table.findIndex((r: any) => r[idKey] === recordId)
                    if (index > -1) {
                      const record = table[index]

                      // Enforce tenant validation on deletion
                      if (reqTenantId !== 'tenant-admin-system' && entityName !== 'tenants' && entityName !== 'users') {
                        const recordTenantId = record.tenantId || record.tenant_id || record.tenant
                        if (recordTenantId && recordTenantId !== reqTenantId) {
                          res.statusCode = 403
                          res.end(JSON.stringify({ error: 'Access Denied: Cross-tenant deletion unauthorized.' }))
                          return
                        }
                      }

                      if (entityName === 'products' || entityName === 'variants' || entityName === 'tenants') {
                        // Soft delete
                        record.deletedAt = Date.now()
                        record.deleted_at = Date.now()
                        record.status = entityName === 'tenants' ? 'ARCHIVED' : 'Inactive'
                        record.updatedAt = Date.now()
                        record.updated_at = Date.now()
                        table[index] = record
                      } else {
                        // Hard delete
                        table.splice(index, 1)
                      }
                      writeDb(db)
                      res.end(JSON.stringify({ data: [record], error: null }))
                    } else {
                      res.statusCode = 404
                      res.end(JSON.stringify({ error: `${entityName} record not found` }))
                    }
                    return
                  }
                }

                // If no API routes matched, return 404
                res.statusCode = 404
                res.end(JSON.stringify({ error: 'Not Found' }))
              } catch (err: any) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: err.message }))
              }
            })
            return
          }
        }
      }
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'dexie', 'dexie-react-hooks']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'dexie', 'dexie-react-hooks']
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[/\\](?:react|react-dom|scheduler|dexie-react-hooks)/,
              priority: 40,
            },
            {
              name: 'vendor-dexie',
              test: /node_modules[/\\]dexie/,
              priority: 30,
            },
            {
              name: 'vendor-recharts',
              test: /node_modules[/\\]recharts/,
              priority: 20,
            },
            {
              name: 'vendor-icons',
              test: /node_modules[/\\]lucide-react/,
              priority: 10,
            }
          ]
        }
      }
    }
  }
})

