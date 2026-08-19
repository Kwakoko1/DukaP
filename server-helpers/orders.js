// server-helpers/orders.js
// applyOrder(clientOrPool, orderOp) - transactional: insert order, items, ledger entries, update variant balances

async function execQuery(clientOrPool, text, params) {
  if (!clientOrPool || typeof clientOrPool.query !== 'function') throw new Error('Missing DB client or pool');
  return clientOrPool.query(text, params);
}

// Expects orderOp: { tenant_id, external_order_id?, customer_id?, items: [{ variant_id, quantity, unit_price }], idempotency_key }
exports.applyOrder = async function applyOrder(client, orderOp) {
  // This helper expects an active transaction (client acquired with client = await pool.connect(); await client.query('BEGIN'))
  if (!client) throw new Error('applyOrder requires a DB client (transaction)');
  const { tenant_id, external_order_id, customer_id, items, idempotency_key } = orderOp;
  if (!items || !Array.isArray(items) || items.length === 0) throw new Error('order must have items');

  // Idempotency: check if order with same external_order_id exists
  if (external_order_id) {
    const chk = await client.query('SELECT id FROM orders WHERE tenant_id=$1 AND external_order_id=$2', [tenant_id, external_order_id]);
    if (chk.rowCount > 0) return { alreadyExists: true, id: chk.rows[0].id };
  }

  // Compute total and validate stock - lock variants
  let total = 0;
  for (const it of items) {
    const v = await client.query('SELECT stock_balance FROM variants WHERE id=$1 FOR UPDATE', [it.variant_id]);
    if (v.rowCount === 0) throw new Error('variant not found: ' + it.variant_id);
    const avail = Number(v.rows[0].stock_balance || 0);
    if (avail < it.quantity) throw new Error('insufficient stock for variant ' + it.variant_id);
    total += Number(it.unit_price) * Number(it.quantity);
  }

  // Insert order
  const orderRes = await client.query('INSERT INTO orders (tenant_id, customer_id, status, total_amount, external_order_id, created_at, updated_at) VALUES($1,$2,$3,$4,$5,now(),now()) RETURNING *', [tenant_id, customer_id || null, 'Completed', total, external_order_id || null]);
  const orderId = orderRes.rows[0].id;

  // Insert items and ledger entries and update variants
  for (const it of items) {
    const itemTotal = Number(it.unit_price) * Number(it.quantity);
    await client.query('INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) VALUES($1,$2,$3,$4,$5)', [orderId, it.variant_id, it.quantity, it.unit_price, itemTotal]);
    // Insert ledger entry (negative delta)
    await client.query('INSERT INTO ledger (tenant_id, variant_id, delta, reason, source_type, source_id, idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7)', [tenant_id, it.variant_id, -Math.abs(Number(it.quantity)), 'sale', 'order', orderId, idempotency_key || null]);
    // Update variant balance
    await client.query('UPDATE variants SET stock_balance = stock_balance - $1, updated_at = now() WHERE id = $2', [it.quantity, it.variant_id]);
  }

  return { rowCount: 1, orderId };
};

exports.upsertSale = async function upsertSale(clientOrPool, sale) {
  // Simplified: treat as applyOrder when inserting a sale record
  // If a transaction client is provided, use it
  if (!sale) throw new Error('missing sale payload');
  const client = clientOrPool;
  await client.query('BEGIN');
  try {
    const res = await exports.applyOrder(client, sale);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    throw err;
  }
};
