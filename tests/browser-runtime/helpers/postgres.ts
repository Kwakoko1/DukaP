/**
 * KwakoPOS SaaS — Real PostgreSQL Verification Authority for Playwright Tests
 */
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kwakopos';

export const pgPool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 10000,
});

export async function queryPostgres<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const client = await pgPool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

export async function getProductFromDb(id: string, tenantId: string) {
  const rows = await queryPostgres(
    'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return rows[0] || null;
}

export async function getStockLedgerCount(tenantId: string, productId: string) {
  const rows = await queryPostgres(
    'SELECT count(*) as total, COALESCE(SUM(quantity_change), 0) as balance FROM stock_ledger WHERE tenant_id = $1 AND product_id = $2',
    [tenantId, productId]
  );
  return {
    count: parseInt(rows[0]?.total || '0', 10),
    balance: parseFloat(rows[0]?.balance || '0'),
  };
}

export async function getSaleFromDb(id: string, tenantId: string) {
  const rows = await queryPostgres(
    'SELECT * FROM sales WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return rows[0] || null;
}

export async function getVariantFromDb(id: string, tenantId: string) {
  const rows = await queryPostgres(
    'SELECT * FROM product_variants WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return rows[0] || null;
}

export async function getCategoryFromDb(id: string, tenantId: string) {
  const rows = await queryPostgres(
    'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return rows[0] || null;
}

export async function getBrandFromDb(id: string, tenantId: string) {
  const rows = await queryPostgres(
    'SELECT * FROM brands WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return rows[0] || null;
}

export async function getTombstoneFromDb(id: string, tenantId: string) {
  const rows = await queryPostgres(
    'SELECT * FROM products WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL',
    [id, tenantId]
  );
  return rows[0] || null;
}

export async function closePgPool() {
  await pgPool.end();
}
