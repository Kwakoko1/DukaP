// server-helpers/categories.js
async function execQuery(clientOrPool, text, params) {
  if (!clientOrPool || typeof clientOrPool.query !== 'function') throw new Error('Missing DB client or pool');
  return clientOrPool.query(text, params);
}

exports.upsertCategory = async function upsertCategory(clientOrPool, payload) {
  const now = new Date();
  const id = payload.id || null;
  const text = `INSERT INTO categories (id, tenant_id, name, description, created_at, updated_at)
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at RETURNING *`;
  const params = [id, payload.tenant_id, payload.name, payload.description || null, now, now];
  const res = await execQuery(clientOrPool, text, params);
  return { rowCount: res.rowCount, rows: res.rows };
};

exports.deleteCategory = async function deleteCategory(clientOrPool, id, tenantId, soft=true) {
  const now = new Date();
  if (soft) {
    const res = await execQuery(clientOrPool, `UPDATE categories SET deleted_at=$1, updated_at=$2 WHERE id=$3 AND tenant_id=$4 RETURNING *`, [now, now, id, tenantId]);
    return { rowCount: res.rowCount, rows: res.rows };
  }
  const res = await execQuery(clientOrPool, `DELETE FROM categories WHERE id=$1 AND tenant_id=$2 RETURNING *`, [id, tenantId]);
  return { rowCount: res.rowCount, rows: res.rows };
};
