// server-helpers/users.js
// upsertUser, upsertSession, revokeSession, revokeDevice

async function execQuery(clientOrPool, text, params) {
  if (!clientOrPool || typeof clientOrPool.query !== 'function') throw new Error('Missing DB client or pool');
  return clientOrPool.query(text, params);
}

exports.upsertUser = async function upsertUser(clientOrPool, payload) {
  const now = new Date();
  const text = `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at, updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, updated_at = EXCLUDED.updated_at RETURNING *`;
  const params = [payload.id || null, payload.tenant_id, payload.email || null, payload.password_hash || null, payload.role || 'user', now, now];
  const res = await execQuery(clientOrPool, text, params);
  return { rowCount: res.rowCount, rows: res.rows };
};

exports.upsertSession = async function upsertSession(clientOrPool, payload) {
  const now = new Date();
  const text = `INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, revoked, created_at, expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (id) DO UPDATE SET refresh_token_hash = EXCLUDED.refresh_token_hash, revoked = EXCLUDED.revoked, expires_at = EXCLUDED.expires_at RETURNING *`;
  const params = [payload.id || null, payload.user_id, payload.device_id || null, payload.refresh_token_hash || null, payload.revoked || false, now, payload.expires_at || null];
  const res = await execQuery(clientOrPool, text, params);
  return { rowCount: res.rowCount, rows: res.rows };
};

exports.revokeSession = async function revokeSession(clientOrPool, sessionId) {
  const now = new Date();
  const res = await execQuery(clientOrPool, `UPDATE sessions SET revoked = true, expires_at = $1 WHERE id = $2 RETURNING *`, [now, sessionId]);
  // Also write to outbox (best effort) should be done by caller transactionally
  return { rowCount: res.rowCount, rows: res.rows };
};

exports.revokeDevice = async function revokeDevice(clientOrPool, deviceId) {
  // Revoke all sessions for the device
  const now = new Date();
  const res = await execQuery(clientOrPool, `UPDATE sessions SET revoked = true, expires_at = $1 WHERE device_id = $2 RETURNING *`, [now, deviceId]);
  return { rowCount: res.rowCount, rows: res.rows };
};
