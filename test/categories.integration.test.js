#!/usr/bin/env node
/* Integration test for categories & brands basic upsert/delete
*/
const assert = require('assert');
const { Pool } = require('pg');
const cats = require('../server-helpers/categories');

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
    if (!(await tableExists(client, 'categories'))) { console.log('Skipping: categories table missing'); process.exit(0); }
    const tenant = 'test-tenant';
    const res = await cats.upsertCategory(pool, { tenant_id: tenant, name: 'Toys', description: 'Test category' });
    assert(res.rowCount === 1, 'category upsert');
    const id = res.rows[0].id;
    console.log('PASS: upsertCategory');
    await cats.deleteCategory(pool, id, tenant, false);
    console.log('PASS: deleteCategory');
  } catch (err) { console.error(err); process.exitCode = 2; }
  finally { client.release(); await pool.end(); }
}

main();
