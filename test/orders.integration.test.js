#!/usr/bin/env node
/* Integration test for order application (requires variants/ledger/orders tables)
   Skips if DATABASE_URL not set or tables missing
*/

const assert = require('assert');
const { Pool } = require('pg');
const orders = require('../server-helpers/orders');

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
    if (!(await tableExists(client, 'variants')) || !(await tableExists(client, 'orders'))) { console.log('Skipping: required tables missing'); process.exit(0); }

    // Create a variant with some stock
    const tenant = 'test-tenant';
    const prodRes = await client.query("SELECT id FROM products LIMIT 1");
    let productId;
    if (prodRes.rowCount === 0) {
      const r = await client.query("INSERT INTO products (id, tenant_id, name, created_at, updated_at) VALUES(gen_random_uuid(), $1, $2, now(), now()) RETURNING id", [tenant, 'test product']);
      productId = r.rows[0].id;
    } else productId = prodRes.rows[0].id;

    const v = await client.query("INSERT INTO variants (id, product_id, tenant_id, sku, price, stock_balance, created_at, updated_at) VALUES (gen_random_uuid(), $1,$2,$3,$4, $5, now(), now()) RETURNING id", [productId, tenant, 'SKU-ORD', 1000, 5]);
    const variantId = v.rows[0].id;

    // Build order with quantity 2
    const orderOp = { tenant_id: tenant, items: [{ variant_id: variantId, quantity: 2, unit_price: 1000 }], idempotency_key: `ord-${Date.now()}` };

    await client.query('BEGIN');
    try {
      const res = await orders.applyOrder(client, orderOp);
      await client.query('COMMIT');
      console.log('PASS: applyOrder committed', res.orderId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Verify variant stock decreased by 2
    const q = await client.query('SELECT stock_balance FROM variants WHERE id=$1', [variantId]);
    assert(q.rowCount === 1 && Number(q.rows[0].stock_balance) === 3, 'stock decreased');
    console.log('PASS: stock adjusted');

    console.log('Order integration test passed');
  } catch (err) { console.error(err); process.exitCode = 2; }
  finally { client.release(); await pool.end(); }
}

main();
