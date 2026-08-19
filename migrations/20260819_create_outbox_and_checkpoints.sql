-- Migration: create outbox and tenant_sync_checkpoints tables
-- Run this in Postgres before enabling durable sync features.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text,
  op_type text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,
  processed_at timestamptz
);

-- Enforce idempotency per tenant when a key is provided
CREATE UNIQUE INDEX IF NOT EXISTS outbox_idempotency_idx ON outbox (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS outbox_tenant_created_at_idx ON outbox (tenant_id, created_at);

-- Tenant checkpoint table used to track durable-acceptance progress
CREATE TABLE IF NOT EXISTS tenant_sync_checkpoints (
  tenant_id text PRIMARY KEY,
  last_seq bigint DEFAULT 0,
  last_sync_version bigint DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
