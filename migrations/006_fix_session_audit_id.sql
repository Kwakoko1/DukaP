-- Migration 006: Ensure session_audit_logs id is TEXT
ALTER TABLE session_audit_logs ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE session_audit_logs ALTER COLUMN id DROP DEFAULT;
