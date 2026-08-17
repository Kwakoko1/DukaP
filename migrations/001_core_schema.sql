-- Migration 001: Core KwakoPOS SaaS Schema
-- Authoritative PostgreSQL Source of Truth

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT,
  applied_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'Basic',
  status TEXT DEFAULT 'Active',
  business_code TEXT,
  tenant_code TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  is_headquarters BOOLEAN DEFAULT false,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  username TEXT,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'Staff',
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  color TEXT,
  icon TEXT,
  status TEXT DEFAULT 'Active',
  parent_id TEXT,
  created_by TEXT,
  updated_by TEXT,
  sync_version INT DEFAULT 1,
  sync_status TEXT DEFAULT 'SYNCED',
  last_synced_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  color TEXT,
  icon TEXT,
  status TEXT DEFAULT 'Active',
  created_by TEXT,
  updated_by TEXT,
  sync_version INT DEFAULT 1,
  sync_status TEXT DEFAULT 'SYNCED',
  last_synced_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  brand TEXT,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  sku TEXT,
  barcode TEXT,
  buying_price NUMERIC(15, 2) DEFAULT 0.00,
  selling_price NUMERIC(15, 2) DEFAULT 0.00,
  price NUMERIC(15, 2) DEFAULT 0.00,
  cost_price NUMERIC(15, 2) DEFAULT 0.00,
  wholesale_price NUMERIC(15, 2) DEFAULT 0.00,
  vip_price NUMERIC(15, 2) DEFAULT 0.00,
  online_price NUMERIC(15, 2) DEFAULT 0.00,
  stock NUMERIC(15, 3) DEFAULT 0.000,
  reorder_level NUMERIC(15, 3) DEFAULT 5.000,
  module TEXT DEFAULT 'Retail',
  has_variants BOOLEAN DEFAULT false,
  attributes JSONB DEFAULT '[]'::jsonb,
  origin TEXT DEFAULT 'PRODUCTION',
  status TEXT DEFAULT 'Active',
  version INT DEFAULT 1,
  sync_version INT DEFAULT 1,
  sync_status TEXT DEFAULT 'SYNCED',
  last_synced_at BIGINT,
  created_by TEXT,
  updated_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  sku TEXT,
  barcode TEXT,
  buying_price NUMERIC(15, 2) DEFAULT 0.00,
  selling_price NUMERIC(15, 2) DEFAULT 0.00,
  wholesale_price NUMERIC(15, 2) DEFAULT 0.00,
  vip_price NUMERIC(15, 2) DEFAULT 0.00,
  online_price NUMERIC(15, 2) DEFAULT 0.00,
  stock NUMERIC(15, 3) DEFAULT 0.000,
  reserved_stock NUMERIC(15, 3) DEFAULT 0.000,
  reorder_level NUMERIC(15, 3) DEFAULT 5.000,
  status TEXT DEFAULT 'Active',
  attributes JSONB DEFAULT '{}'::jsonb,
  sync_version INT DEFAULT 1,
  sync_status TEXT DEFAULT 'SYNCED',
  last_synced_at BIGINT,
  created_by TEXT,
  updated_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT,
  movement_type TEXT NOT NULL, -- OPENING, PURCHASE, SALE, RETURN, DAMAGE, ADJUSTMENT
  quantity_before NUMERIC(15, 3) DEFAULT 0.000,
  quantity_change NUMERIC(15, 3) NOT NULL,
  quantity_after NUMERIC(15, 3) DEFAULT 0.000,
  unit_cost NUMERIC(15, 2) DEFAULT 0.00,
  total_cost NUMERIC(15, 2) DEFAULT 0.00,
  reference_id TEXT,
  reason TEXT,
  batch_number TEXT,
  user_id TEXT,
  device_id TEXT,
  operation_id TEXT,
  sync_version INT DEFAULT 1,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  loyalty_points NUMERIC(15, 2) DEFAULT 0.00,
  outstanding_balance NUMERIC(15, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'Active',
  sync_version INT DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  outstanding_balance NUMERIC(15, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'Active',
  sync_version INT DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  receipt_number TEXT,
  customer_id TEXT,
  user_id TEXT,
  subtotal NUMERIC(15, 2) DEFAULT 0.00,
  discount NUMERIC(15, 2) DEFAULT 0.00,
  tax NUMERIC(15, 2) DEFAULT 0.00,
  total_amount NUMERIC(15, 2) NOT NULL,
  payment_method TEXT DEFAULT 'Cash',
  payment_status TEXT DEFAULT 'PAID',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_id TEXT,
  operation_id TEXT,
  sync_version INT DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT,
  device_name TEXT,
  platform TEXT,
  browser TEXT,
  trusted BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'ACTIVE',
  last_seen_at BIGINT,
  last_sync_at BIGINT,
  created_at BIGINT NOT NULL,
  revoked_at BIGINT,
  PRIMARY KEY (tenant_id, device_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  device_id TEXT,
  token_family_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  ip_address TEXT,
  user_agent TEXT,
  created_at BIGINT NOT NULL,
  last_activity_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  revoke_reason TEXT
);

CREATE TABLE IF NOT EXISTS session_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT,
  tenant_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  device_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  operation_type TEXT,
  request_hash TEXT,
  response_payload JSONB,
  created_at BIGINT NOT NULL,
  CONSTRAINT uq_idempotency_tenant_op UNIQUE (tenant_id, operation_id)
);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_sync_version INT DEFAULT 0,
  last_successful_sync_at BIGINT,
  last_failed_sync_at BIGINT,
  sync_state TEXT DEFAULT 'IDLE',
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, device_id)
);

CREATE TABLE IF NOT EXISTS tenant_sync_sequences (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  current_sync_version INT DEFAULT 1,
  updated_at BIGINT NOT NULL
);
