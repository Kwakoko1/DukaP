// server-helpers/variants.js
// Helpers: upsertVariant, deleteVariant, getVariantForUpdate

async function execQuery(clientOrPool, text, params) {
  if (!clientOrPool || typeof clientOrPool.query !== 'function') throw new Error('Missing DB client or pool');
  return clientOrPool.query(text, params);
}

function normalizeVariantPayload(p) {
  return {
    id: p.id || p.variantId || null,
    product_id: p.product_id || p.productId || null,
    tenant_id: p.tenant_id || p.tenantId || null,
    sku: p.sku || null,
    attributes: p.attributes || p.attrs || {},
    price: p.price ?? 0,
    stock_balance: p.stock_balance ?? 0,
    status: p.status || 'Active',
    version: p.version ?? 1,
  };
}

export async function upsertVariant(clientOrPool, raw) {
  const v = normalizeVariantPayload(raw || {});
  const now = new Date();
  if (!v.product_id) throw new Error('variant requires product_id');
  // Insert or update by id if provided, else create new uuid via DB default
  const text = `INSERT INTO variants (id, product_id, tenant_id, sku, attributes, price, stock_balance, status, version, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO UPDATE SET
      sku = EXCLUDED.sku,
      attributes = EXCLUDED.attributes,
      price = EXCLUDED.price,
      stock_balance = EXCLUDED.stock_balance,
      status = EXCLUDED.status,
      version = EXCLUDED.version,
      updated_at = EXCLUDED.updated_at
    RETURNING *;`;
  const params = [v.id, v.product_id, v.tenant_id, v.sku, JSON.stringify(v.attributes), v.price, v.stock_balance, v.status, v.version, now, now];
  const res = await execQuery(clientOrPool, text, params);
  return { rowCount: res.rowCount, rows: res.rows };
}

export async function deleteVariant(clientOrPool, id, tenantId, soft = true) {
  if (!id) throw new Error('missing variant id');
  const now = new Date();
  if (soft) {
    const text = `UPDATE variants SET deleted_at = $1, status = 'Deleted', updated_at = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *`;
    const res = await execQuery(clientOrPool, text, [now, now, id, tenantId]);
    return { rowCount: res.rowCount, rows: res.rows };
  } else {
    const text = `DELETE FROM variants WHERE id = $1 AND tenant_id = $2 RETURNING *`;
    const res = await execQuery(clientOrPool, text, [id, tenantId]);
    return { rowCount: res.rowCount, rows: res.rows };
  }
}

export async function getVariantForUpdate(client, variantId) {
  const text = `SELECT * FROM variants WHERE id = $1 FOR UPDATE`;
  const res = await client.query(text, [variantId]);
  return res.rows[0];
}
