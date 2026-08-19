-- Migration: create outbox and tenant_sync_checkpoints for durable sync
-- Run as part of existing migration pipeline

CREATE TABLE IF NOT EXISTS tenant_sync_checkpoints (
  tenant_id TEXT PRIMARY KEY,
  last_seq BIGINT DEFAULT 0,
  last_sync_version INT DEFAULT 0,
  updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at BIGINT NOT NULL
);

-- Unique index to prevent double-processing inside a tenant for provided idempotency keys
CREATE UNIQUE INDEX IF NOT EXISTS outbox_tenant_idempotency_idx ON outbox (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
