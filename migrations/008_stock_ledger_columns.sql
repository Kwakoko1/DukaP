-- Migration 008: Stock ledger idempotency_key and variant_id compatibility columns

ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reference_id TEXT;
