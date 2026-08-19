import { execQuery } from '../server.js';
import crypto from 'crypto';

// Canonical helpers for product write paths (upsert, delete, apply from sync)
// These functions accept either a connected client (inside a transaction) or the pool.

function normalizeProductPayload(p) {
  return {
    id: p.id || p.productId || p.id || crypto.randomBytes(6).toString('hex'),
    tenant_id: p.tenant_id || p.tenantId || p.tenant || null,
    branch_id: p.branch_id || p.branchId || null,
    name: (p.name || p.title || '').trim(),
    sku: p.sku || null,
    barcode: p.barcode || null,
    category_id: p.categoryId || p.category_id || null,
    brand_id: p.brandId || p.brand_id || null,
    buying_price: Number(p.buyingPrice ?? p.buying_price ?? 0),
    selling_price: Number(p.sellingPrice ?? p.selling_price ?? p.price ?? 0),
    price: Number(p.price ?? p.selling_price ?? p.sellingPrice ?? 0),
    cost_price: Number(p.costPrice ?? p.cost_price ?? 0),
    wholesale_price: Number(p.wholesalePrice ?? p.wholesale_price ?? 0),
    vip_price: Number(p.vipPrice ?? p.vip_price ?? 0),
    online_price: Number(p.onlinePrice ?? p.online_price ?? 0),
    has_variants: Boolean(p.hasVariants ?? p.has_variants ?? false),
    status: p.status || 'Active',
    version: Number(p.version ?? 1),
    deleted_at: p.deletedAt ?? p.deleted_at ?? null,
  };
}

export async function upsertProduct(clientOrPool, rawPayload) {
  const p = normalizeProductPayload(rawPayload || {});
  const now = Date.now();

  const text = `INSERT INTO products (id, tenant_id, branch_id, name, sku, barcode, category_id, brand_id, buying_price, selling_price, price, cost_price, wholesale_price, vip_price, online_price, has_variants, status, version, deleted_at, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    ON CONFLICT (id, tenant_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id,
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      barcode = EXCLUDED.barcode,
      category_id = EXCLUDED.category_id,
      brand_id = EXCLUDED.brand_id,
      buying_price = EXCLUDED.buying_price,
      selling_price = EXCLUDED.selling_price,
      price = EXCLUDED.price,
      cost_price = EXCLUDED.cost_price,
      wholesale_price = EXCLUDED.wholesale_price,
      vip_price = EXCLUDED.vip_price,
      online_price = EXCLUDED.online_price,
      has_variants = EXCLUDED.has_variants,
      status = EXCLUDED.status,
      version = EXCLUDED.version,
      deleted_at = EXCLUDED.deleted_at,
      updated_at = EXCLUDED.updated_at
    RETURNING *;`;

  const params = [
    p.id,
    p.tenant_id,
    p.branch_id,
    p.name,
    p.sku,
    p.barcode,
    p.category_id,
    p.brand_id,
    p.buying_price,
    p.selling_price,
    p.price,
    p.cost_price,
    p.wholesale_price,
    p.vip_price,
    p.online_price,
    p.has_variants,
    p.status,
    p.version,
    p.deleted_at,
    now,
    now,
  ];

  const res = await execQuery(clientOrPool, text, params);
  return { rowCount: res.rowCount, rows: res.rows };
}

export async function deleteProduct(clientOrPool, id, tenantId, soft = true) {
  if (!id) throw new Error('missing product id');
  const now = Date.now();
  if (soft) {
    const text = `UPDATE products SET deleted_at = $1, status = 'Deleted', updated_at = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *`;
    const res = await execQuery(clientOrPool, text, [now, now, id, tenantId]);
    return { rowCount: res.rowCount, rows: res.rows };
  } else {
    const text = `DELETE FROM products WHERE id = $1 AND tenant_id = $2 RETURNING *`;
    const res = await execQuery(clientOrPool, text, [id, tenantId]);
    return { rowCount: res.rowCount, rows: res.rows };
  }
}

export async function applyProductFromSync(clientOrPool, op) {
  // op: { action: 'UPSERT' | 'DELETE', payload: { ...product fields }, idempotency_key }
  const action = (op.action || op.type || 'UPSERT').toUpperCase();
  const payload = op.payload || {};
  if (action === 'DELETE') {
    return deleteProduct(clientOrPool, payload.id || payload.productId, payload.tenant_id || payload.tenantId || null, true);
  }
  return upsertProduct(clientOrPool, payload);
}
