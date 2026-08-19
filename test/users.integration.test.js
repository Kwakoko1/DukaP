#!/usr/bin/env node
/* Integration test for users/sessions revocations
*/
const assert = require('assert');
const { Pool } = require('pg');
const users = require('../server-helpers/users');

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
    if (!(await tableExists(client, 'users')) || !(await tableExists(client, 'sessions'))) { console.log('Skipping: users/sessions tables missing'); process.exit(0); }
    const tenant = 'test-tenant';
    const u = await users.upsertUser(pool, { tenant_id: tenant, email: 'test@example.com', password_hash: 'hash' });
    assert(u.rowCount === 1, 'user upsert');
    const userId = u.rows[0].id;
    const s = await users.upsertSession(pool, { user_id: userId, device_id: null });
    assert(s.rowCount === 1, 'session upsert');
    const sessionId = s.rows[0].id;
    await users.revokeSession(pool, sessionId);
    const q = await client.query('SELECT revoked FROM sessions WHERE id=$1', [sessionId]);
    assert(q.rowCount === 1 && q.rows[0].revoked === true, 'session revoked');
    console.log('PASS: revokeSession works');
  } catch (err) { console.error(err); process.exitCode = 2; }
  finally { client.release(); await pool.end(); }
}

main();
