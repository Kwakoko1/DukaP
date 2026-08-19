#!/usr/bin/env node
/* Integration test for variants + ledger atomic flow
   Skips if DATABASE_URL not set or tables missing
*/

const assert = require('assert');
const { Pool } = require('pg');
const variants = require('../server-helpers/variants');
const ledger = require('../server-helpers/ledger');

async function tableExists(client, name) {
  const res = await client.query("SELECT to_regclass($1) as tbl", [name]);
  return res.rows[0] && res.rows[0].tbl !== null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { console.log('Skipping: set DATABASE_URL'); process.exit(0); }
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    if (!(await tableExists(client, 'variants'))) { console.log('Skipping: variants table missing'); process.exit(0); }
    if (!(await tableExists(client, 'ledger'))) { console.log('Skipping: ledger table missing'); process.exit(0); }

    // Create a product row if necessary (best effort)
    const tenant = 'test-tenant';
    const prodRes = await client.query("SELECT id FROM products LIMIT 1");
    let productId;
    if (prodRes.rowCount === 0) {
      const r = await client.query("INSERT INTO products (id, tenant_id, name, created_at, updated_at) VALUES(gen_random_uuid(), $1, $2, now(), now()) RETURNING id", [tenant, 'test product']);
      productId = r.rows[0].id;
    } else productId = prodRes.rows[0].id;

    // Upsert variant
    const vPayload = { product_id: productId, tenant_id: tenant, sku: 'TEST-SKU', attributes: { color: 'red' }, price: 1000, stock_balance: 10 };
    const up = await variants.upsertVariant(pool, vPayload);
    assert(up.rowCount === 1, 'variant upsert');
    const variantId = up.rows[0].id;
    console.log('PASS: upsertVariant created variant');

    // Insert ledger entry
    const led = await ledger.insertLedger(pool, { tenant_id: tenant, variant_id: variantId, delta: 5, reason: 'restock' });
    assert(led.rowCount === 1, 'ledger insert');
    console.log('PASS: insertLedger added entry');

    // Reconcile
    const rec = await ledger.reconcileStock(pool, variantId);
    assert(rec.rowCount === 1, 'reconcile updated variant');
    console.log('PASS: reconcileStock updated variant stock');

    // Cleanup: remove variant
    await variants.deleteVariant(pool, variantId, tenant, false);
    console.log('Cleanup done');

    console.log('Variants+ledger integration test passed');
  } catch (err) { console.error(err); process.exitCode = 2; }
  finally { client.release(); await pool.end(); }
}

main();
