-- Migration 003: Modules, Security Audit, Settings and Extensions

CREATE TABLE IF NOT EXISTS user_branch_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_modules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  config JSONB DEFAULT '{}'::jsonb,
  installed_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT uq_tenant_module UNIQUE (tenant_id, module_id)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at BIGINT NOT NULL,
  CONSTRAINT uq_tenant_settings_cat UNIQUE (tenant_id, category)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  rules JSONB DEFAULT '{}'::jsonb,
  updated_at BIGINT NOT NULL,
  CONSTRAINT uq_tenant_feature_flag UNIQUE (tenant_id, flag_name)
);

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  event_type TEXT NOT NULL, -- LOGIN_FAILED, TOKEN_REUSE_DETECTED, SESSION_REVOKED, TENANT_UNAUTHORIZED
  severity TEXT DEFAULT 'WARNING', -- INFO, WARNING, CRITICAL
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_audit_trail (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_tenant_id TEXT,
  target_entity TEXT,
  target_id TEXT,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_audit_tenant_type ON security_audit_logs(tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target_tenant ON platform_audit_trail(target_tenant_id, created_at DESC);
