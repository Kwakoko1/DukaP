// server-helpers/ledger.js
// insertLedger(clientOrPool, { tenant_id, variant_id, delta, reason, source_type, source_id, idempotency_key })
// reconcileStock(clientOrPool, variant_id) - recompute balance from ledger

async function execQuery(clientOrPool, text, params) {
  if (!clientOrPool || typeof clientOrPool.query !== 'function') throw new Error('Missing DB client or pool');
  return clientOrPool.query(text, params);
}

exports.insertLedger = async function insertLedger(clientOrPool, entry) {
  const { tenant_id, variant_id, delta, reason, source_type, source_id, idempotency_key } = entry;
  if (!tenant_id || !variant_id || typeof delta !== 'number' && typeof delta !== 'bigint') throw new Error('invalid ledger entry');
  const text = `INSERT INTO ledger (tenant_id, variant_id, delta, reason, source_type, source_id, idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
  const res = await execQuery(clientOrPool, text, [tenant_id, variant_id, delta, reason || null, source_type || null, source_id || null, idempotency_key || null]);
  return { rowCount: res.rowCount, rows: res.rows };
};

exports.reconcileStock = async function reconcileStock(clientOrPool, variant_id) {
  // Sum ledger deltas and update variants.stock_balance accordingly
  const sumQ = `SELECT COALESCE(SUM(delta),0) AS balance FROM ledger WHERE variant_id = $1`;
  const sumRes = await execQuery(clientOrPool, sumQ, [variant_id]);
  const balance = Number(sumRes.rows[0].balance || 0);
  const updateQ = `UPDATE variants SET stock_balance = $1, updated_at = $2 WHERE id = $3 RETURNING *`;
  const res = await execQuery(clientOrPool, updateQ, [balance, new Date(), variant_id]);
  return { rowCount: res.rowCount, rows: res.rows };
};
