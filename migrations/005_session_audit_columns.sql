-- Migration 005: Ensure Session Audit Log compatibility columns

ALTER TABLE session_audit_logs ADD COLUMN IF NOT EXISTS event TEXT;
ALTER TABLE session_audit_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE session_audit_logs ADD COLUMN IF NOT EXISTS branch_id TEXT;
ALTER TABLE session_audit_logs ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE session_audit_logs ADD COLUMN IF NOT EXISTS timestamp BIGINT;
ALTER TABLE session_audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE session_audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
