#!/usr/bin/env node
/*
  Integration test for product write helpers (upsertProduct, deleteProduct, applyProductFromSync).
  - Requires a running Postgres and DATABASE_URL env var
  - Skips tests if required tables are not present
*/

const assert = require('assert');
const { Pool } = require('pg');
const path = require('path');

const { upsertProduct, deleteProduct, applyProductFromSync } = require('../server-helpers/db-writes');

async function tableExists(client, name) {
  const res = await client.query("SELECT to_regclass($1) as tbl", [name]);
  return res.rows[0] && res.rows[0].tbl !== null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('Skipping tests: set DATABASE_URL to run integration tests');
    process.exit(0);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    // Ensure products table exists
    const productsExists = await tableExists(client, 'products');
    if (!productsExists) {
      console.log('Skipping tests: products table not found in DB');
      process.exit(0);
    }

    // Test upsert creates a product
    const tenantId = 'test-tenant';
    const id = `test-prod-${Date.now()}`;
    const payload = { id, tenant_id: tenantId, name: 'Integration Test Product', price: 1200 };

    const res1 = await upsertProduct(pool, payload);
    assert(res1.rowCount === 1, 'upsert should affect one row');
    assert(res1.rows && res1.rows[0] && res1.rows[0].id === id, 'returned row id should match');
    console.log('PASS: upsertProduct created product');

    // Test idempotent upsert (same id) updates (still returns row)
    const payload2 = { id, tenant_id: tenantId, name: 'Integration Test Product Updated', price: 1500 };
    const res2 = await upsertProduct(pool, payload2);
    assert(res2.rowCount === 1, 'idempotent upsert should affect one row');
    console.log('PASS: idempotent upsertProduct updated product');

    // Test soft delete
    await deleteProduct(pool, id, tenantId, true);
    const q = await client.query('SELECT status, deleted_at FROM products WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
    assert(q.rowCount === 1, 'product should still exist after soft delete');
    const row = q.rows[0];
    assert(row.status === 'Deleted' || row.deleted_at, 'product should be marked deleted');
    console.log('PASS: deleteProduct soft-deleted product');

    // Clean up: hard delete
    await deleteProduct(pool, id, tenantId, false);
    const q2 = await client.query('SELECT * FROM products WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
    assert(q2.rowCount === 0, 'product should be hard-deleted');
    console.log('PASS: deleteProduct hard-deleted product');

    console.log('All product helper integration tests passed');
  } catch (err) {
    console.error('Test failure:', err);
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
