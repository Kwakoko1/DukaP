/**
 * KwakoPOS SaaS — Production Runtime Validation Configuration
 * 
 * Sets up isolated runtime validation environment:
 * - Dedicated test tenant ('runtime-validation-tenant')
 * - Isolated branches, users, and device contexts
 * - Deterministic dataset generation with 'RTV-' prefixes
 * - HTTP client helpers for authenticated requests and failure injection
 */

import http from 'http';
import pkg from 'pg';
import crypto from 'crypto';
const { Pool } = pkg;

export const RUNTIME_TEST_TENANT = 'runtime-validation-tenant';
export const RUNTIME_BRANCHES = ['branch-a', 'branch-b'];
export const RUNTIME_USERS = ['cashier-a', 'cashier-b', 'manager-a'];
export const RUNTIME_DEVICES = ['device-a', 'device-b', 'device-c'];

export const PORT = 8080;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kwakopos';

export const pool = new Pool({ connectionString: DATABASE_URL });

export async function initRuntimeTestEnvironment() {
  const now = Date.now();
  const sha256Pass = crypto.createHash('sha256').update('password123').digest('hex');

  // 1. Seed test tenant
  await pool.query(`
    INSERT INTO tenants (id, name, plan, status, business_code, tenant_code, created_at)
    VALUES ($1, 'Runtime Test Tenant', 'Enterprise', 'Active', 'BIZ-RTV-001', 'TZ-RET-RTV-001', $2)
    ON CONFLICT (id) DO UPDATE SET status = 'Active';
  `, [RUNTIME_TEST_TENANT, now]);

  // 2. Seed branches
  for (const b of RUNTIME_BRANCHES) {
    await pool.query(`
      INSERT INTO branches (id, tenant_id, name, location, is_headquarters, created_at)
      VALUES ($1, $2, $3, 'Dar es Salaam', $4, $5)
      ON CONFLICT (id) DO NOTHING;
    `, [b, RUNTIME_TEST_TENANT, `Branch ${b}`, b === 'branch-a', now]);
  }

  // 3. Seed test owner user
  await pool.query(`
    INSERT INTO users (id, tenant_id, branch_id, name, username, email, phone, role, password_hash, created_at)
    VALUES ('usr-rtv-owner', $1, 'branch-a', 'RTV Owner', 'rtvowner', 'owner@dukapos.com', '+255700000000', 'Owner', $2, $3)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash;
  `, [RUNTIME_TEST_TENANT, sha256Pass, now]);

  await pool.query(`
    INSERT INTO user_security (user_id, tenant_id, pin_hash, password_hash, last_login_at, created_at)
    VALUES ('usr-rtv-owner', $1, '1234', $2, $3, $3)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  `, [RUNTIME_TEST_TENANT, sha256Pass, now]);
}

export function httpRequest(endpoint, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      timeout: options.timeout || 15000,
    };

    const req = http.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('REQUEST_TIMEOUT'));
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message, body: null });
    });

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

export async function getAuthHeaders(deviceId = 'rtv-dev-default') {
  const loginRes = await httpRequest('/api/auth/login', {
    method: 'POST',
  }, {
    email: 'owner@dukapos.com',
    password: 'password123',
    deviceId,
  });
  const token = loginRes.body?.accessToken || loginRes.body?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
