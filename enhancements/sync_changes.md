PATCH-INSTRUCTIONS FOR server.js (apply manually or use this as a guide)

Overview
- This file contains a set of minimal, safe, prioritized changes to implement Priority A (durable writes before ack).
- I added a migration file migrations/999_sync_outbox.sql (apply this before deploying server changes).
- The recommended approach here is to make three changes in server.js:
  1) Replace the current sql() helper so it logs errors and rethrows instead of silently returning [].
  2) Add execQuery(clientOrPool, text, params) helper used for write/transaction assertions.
  3) Add persistOutboxOperations(ops, tenantId) helper that persists incoming sync ops to outbox inside a transaction and updates tenant_sync_checkpoints atomically.
  4) Update /api/sync/push handler to call persistOutboxOperations and only return success after commit (or return 500 on failure).
  5) Update /api/bootstrap ETag logic to derive from tenant_sync_checkpoints (last_sync_version / last_seq) instead of ad-hoc max() scans.

Notes
- I intentionally do NOT change every endpoint across the codebase in this patch. The goal is to ensure durable acceptance for sync pushes and provide a clear helper pattern to convert other write flows.
- After applying this change, you should run tests: sync push acceptance, idempotency duplicate, failure rollback test, and bootstrap ETag validation.

---- Replace sql(...) implementation
Find the existing sql function in server.js (search for "async function sql(strings, ...values)") and replace its body with the following implementation. The wrapper still supports tagged templates and simple string calls.

```javascript
async function sql(strings, ...values) {
  // Supports both sql('text', paramsArray) and tagged template usage sql`SELECT ... ${val}`
  let queryText;
  let queryValues;
  if (typeof strings === 'string') {
    queryText = strings;
    queryValues = values[0] || [];
  } else {
    queryText = strings[0];
    for (let i = 1; i < strings.length; i++) queryText += `$${i}` + strings[i];
    queryValues = values;
  }

  try {
    const result = await pool.query(queryText, queryValues);
    return result.rows;
  } catch (err) {
    // Log full context and rethrow so callers can decide to rollback or return 5xx.
    console.error('[sql] Query error:', err.message, { query: queryText, params: queryValues });
    throw err;
  }
}
```

Rationale: previously sql swallowed errors and returned [], which caused the server to ACK clients even when DB writes failed. Rethrowing lets the caller rollback transactions or return error responses.

---- Add execQuery helper
Add this helper near the sql function (top-level). Use for writes where you need rowCount or want consistent logging.

```javascript
async function execQuery(clientOrPool, text, params = []) {
  try {
    const res = await clientOrPool.query(text, params);
    return res;
  } catch (err) {
    console.error('[execQuery] Error running query:', err.message, text, params);
    throw err;
  }
}
```

---- Add persistOutboxOperations helper
Add this function below execQuery. It accepts an array of operations and a tenantId, persists them to outbox inside a DB transaction and updates tenant_sync_checkpoints in the same transaction. It returns an array of persisted outbox ids.

```javascript
async function persistOutboxOperations(ops = [], tenantId) {
  const client = await pool.connect();
  const now = Date.now();
  const processedIds = [];
  try {
    await client.query('BEGIN');
    const insertSql = `INSERT INTO outbox (id, tenant_id, entity, action, payload, idempotency_key, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7) ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET payload = EXCLUDED.payload RETURNING id`;
    for (const op of ops) {
      const outId = op.id || `out-${now}-${Math.random().toString(36).substring(2,7)}`;
      const idempotency = op.idempotency_key || op.id || null;
      const tenant = op.tenant || op.tenant_id || tenantId || '';
      try {
        const r = await execQuery(client, insertSql, [outId, tenant, op.entity || op.entityName || 'unknown', op.action || op.operation || 'UPSERT', JSON.stringify(op.payload || {}), idempotency, now]);
        if (r && r.rows && r.rows[0]) processedIds.push(r.rows[0].id);
      } catch (e) {
        console.error('[persistOutboxOperations] failed to persist op:', e.message, op);
        throw e; // bubble to rollback
      }
    }

    // Update tenant checkpoint (acceptance) inside same transaction
    await execQuery(client, `INSERT INTO tenant_sync_checkpoints (tenant_id, last_seq, last_sync_version, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id) DO UPDATE SET last_seq = GREATEST(tenant_sync_checkpoints.last_seq, EXCLUDED.last_seq), last_sync_version = GREATEST(tenant_sync_checkpoints.last_sync_version, EXCLUDED.last_sync_version), updated_at = EXCLUDED.updated_at`, [tenantId, now, 0, now]);

    await client.query('COMMIT');
    return processedIds;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

Rationale: This ensures the server durably accepts the incoming operations as a single atomic transaction before responding success to the client. Optionally you can run immediate processing against canonical tables in the same transaction (see alternate patterns below).

---- Update /api/sync/push to use durable outbox acceptance
Find the handler block for pathname === '/api/sync/push' (around where server.js previously processed operations). Replace the internal loop with a call to persistOutboxOperations and return only after commit.

Find the existing code (look for `if (pathname === '/api/sync/push' && req.method === 'POST') {`) and replace the internal for-loop and response with this pattern:

```javascript
if (pathname === '/api/sync/push' && req.method === 'POST') {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
  if (!await checkDistributedRateLimit(clientIp, 'sync_push', 240)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Too many sync push requests. Please wait a moment.' }));
    return;
  }

  const body = await parseRequestBody(req);
  const operations = body.operations || body.mutations || [];
  const tenantIdForBatch = body.tenantId || tenantId || 'tenant-101';
  const now = Date.now();
  try {
    // Persist operations to durable outbox and update checkpoint atomically
    const processedIds = await persistOutboxOperations(operations, tenantIdForBatch);

    // Optionally: kick worker or process outbox entries here or let background worker process them.

    invalidateTenantBootstrapCache(tenantIdForBatch);
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, processedIds, serverTimestamp: now }));
    return;
  } catch (err) {
    console.error('[Sync Push] transaction failed:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
    return;
  }
}
```

Notes: If you want immediate application of ops to canonical tables, do that using the same client inside persistOutboxOperations (so everything remains atomic). Alternatively, persist to outbox and use a background worker to process and then advance per-tenant last_sync_version.

---- Update /api/bootstrap ETag to use tenant_sync_checkpoints
Around the bootstrap handling (where it computed maxSyncVer and etag like `W/"sync-${targetTenant}-v${maxSyncVer}"`), replace that logic with a lookup to tenant_sync_checkpoints:

```javascript
let maxSyncVer = 1;
let etag;
try {
  const cpRows = await sql`SELECT last_sync_version, last_seq FROM tenant_sync_checkpoints WHERE tenant_id = ${targetTenant} LIMIT 1`;
  if (cpRows && cpRows.length > 0) {
    maxSyncVer = Number(cpRows[0].last_sync_version || 1);
    const checkpointSeq = Number(cpRows[0].last_seq || Date.now());
    etag = `W/"sync-${targetTenant}-v${maxSyncVer}-s${checkpointSeq}"`;
  } else {
    etag = `W/"sync-${targetTenant}-v${maxSyncVer}"`;
  }
} catch (e) {
  console.error('[bootstrap] checkpoint lookup failed:', e.message);
  etag = `W/"sync-${targetTenant}-v${maxSyncVer}"`;
}
```

Rationale: Using the durable checkpoint prevents ETag showing committed state when writes that should have incremented sync_version failed silently.

---- Replace critical .catch(() => {}) patterns
Search for occurrences of `.catch(() => {})` in server.js. For any write path that affects client-visible durability (session creation, user/tenant creation, products upsert, sync push, stock ledger), replace the swallow with try/catch that logs and returns 500 (or treats duplicates idempotently). Example replacement:

Old:
```javascript
await sql`INSERT INTO devices (...)`.catch(() => {});
```

New:
```javascript
try {
  await sql`INSERT INTO devices (...)`;
} catch (err) {
  console.error('[devices] insert failed:', err.message);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Device registration failed' }));
  return;
}
```

Do not change audit-only writes (security_audit_logs) if you purposely want them to be best-effort — but be explicit by catching errors and logging them instead of swallowing silently.

---- Idempotency: inspect rowCount when using ON CONFLICT DO NOTHING
Where you do `ON CONFLICT DO NOTHING`, change to `RETURNING id` (or check result.rowCount) so you can tell whether the row was inserted or a duplicate. Example:

```javascript
const r = await pool.query(`INSERT INTO receipts (id, ...) VALUES ($1,...) ON CONFLICT (id) DO NOTHING RETURNING id`, [id, ...]);
if (r.rowCount === 0) {
  // duplicate
  console.log('[idempotency] duplicate receipt', id);
} else {
  // new insert
}
```

---- Stock ledger: ensure product stock update occurs in same transaction
When inserting a stock_ledger entry as part of sync push, ensure you update products.stock in the same DB client transaction. Example inside persistOutboxOperations (when processing a stock_ledger op):

```javascript
// after inserting stock_ledger row
await execQuery(client, `UPDATE products SET stock = (SELECT COALESCE(SUM(quantity_change),0) FROM stock_ledger WHERE product_id = $1), updated_at = $2 WHERE id = $1`, [productId, now]);
```

This ensures immediate materialized consistency between ledger and product stock.

---- Tests to run after implementing
1) Sync push success: POST /api/sync/push with operations and ensure server returns success and tenant_sync_checkpoints updated.
2) Sync push failure: induce DB error and confirm server returns 500 and no checkpoint advance.
3) Idempotency: POST same op twice with same idempotency_key => second treated as duplicate.
4) Bootstrap ETag: request bootstrap, note ETag, call again with If-None-Match and expect 304.
5) Stock consistency: push stock_ledger op and verify products.stock updated.

---- Rollback guidance
- Revert server.js to previous commit and restart server.
- Revert migration using your migration tool (or manually DROP TABLE outbox; DROP TABLE tenant_sync_checkpoints) if needed.

If you'd like, I can also prepare a ready-to-apply server.js with these changes applied. I did not overwrite server.js automatically to avoid unintended merge conflicts — confirm if you want me to create that full file replacement in a branch/PR and I will push the changes to the repository.
