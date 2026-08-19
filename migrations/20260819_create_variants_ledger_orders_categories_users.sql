-- Migration: create variants, ledger, orders, categories, brands, users, sessions tables
-- Run this after base migrations. Designed for Postgres.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Variants table: tightly coupled to products
CREATE TABLE IF NOT EXISTS variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  tenant_id text NOT NULL,
  sku text,
  attributes jsonb DEFAULT '{}'::jsonb,
  price numeric DEFAULT 0,
  stock_balance bigint DEFAULT 0,
  status text DEFAULT 'Active',
  version bigint DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS variants_tenant_idx ON variants (tenant_id);
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants (product_id);

-- Ledger table: append-only stock changes
CREATE TABLE IF NOT EXISTS ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  variant_id uuid NOT NULL,
  delta bigint NOT NULL,
  reason text,
  source_type text,
  source_id uuid,
  idempotency_key text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_variant_idx ON ledger (variant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_idempotency_idx ON ledger (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Orders and order_items
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  customer_id uuid,
  status text DEFAULT 'Pending',
  total_amount numeric DEFAULT 0,
  external_order_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_external_idx ON orders (tenant_id, external_order_id) WHERE external_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  quantity bigint NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

-- Categories & brands (simpler catalog tables)
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories (tenant_id);

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS brands_tenant_idx ON brands (tenant_id);

-- Users, sessions, devices
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  email text,
  password_hash text,
  role text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid,
  refresh_token_hash text,
  revoked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  name text,
  last_seen timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_tenant_idx ON devices (tenant_id);
