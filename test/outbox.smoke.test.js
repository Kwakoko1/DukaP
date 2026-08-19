#!/usr/bin/env node
/*
  Smoke test for durable outbox persistence for sync-batch.
  - Requires DATABASE_URL
  - Skips if outbox table is not present
*/

const assert = require('assert');
const { Pool } = require('pg');

async function tableExists(client, name) {
  const res = await client.query("SELECT to_regclass($1) as tbl", [name]);
  return res.rows[0] && res.rows[0].tbl !== null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('Skipping outbox smoke test: set DATABASE_URL to run');
    process.exit(0);
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const outboxExists = await tableExists(client, 'outbox');
    if (!outboxExists) {
      console.log('Skipping: outbox table not found (run migrations first)');
      process.exit(0);
    }

    const tenantId = 'test-tenant';
    const payload = { sample: true };
    const idempotency = `test-key-${Date.now()}`;
    const insertSql = `INSERT INTO outbox (tenant_id, op_type, payload, idempotency_key) VALUES($1,$2,$3,$4) RETURNING id`;
    const res = await client.query(insertSql, [tenantId, 'UPSERT_PRODUCT', JSON.stringify(payload), idempotency]);
    assert(res.rowCount === 1, 'outbox insert should return 1 row');
    console.log('PASS: inserted outbox row');

    // Attempt duplicate insert with same idempotency -> should violate unique constraint
    let duplicateErrored = false;
    try {
      await client.query(insertSql, [tenantId, 'UPSERT_PRODUCT', JSON.stringify(payload), idempotency]);
    } catch (err) {
      duplicateErrored = true;
      console.log('PASS: duplicate outbox insert failed as expected (idempotency enforcement)');
    }
    assert(duplicateErrored, 'duplicate insert should fail when idempotency enforced');

    // Cleanup
    await client.query('DELETE FROM outbox WHERE id=$1', [res.rows[0].id]);
    console.log('Outbox smoke test passed');
  } catch (err) {
    console.error('Outbox test failure:', err);
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
