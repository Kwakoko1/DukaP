-- Migration 002: Indexes, Constraints, Backward Compatibility Columns and Performance Optimizations
-- Multi-tenant isolation, delta-sync queries, and idempotency indexing

-- Backward-compatibility column safety
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE products ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id TEXT;

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode TEXT;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at BIGINT;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS sync_version INT DEFAULT 1;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at BIGINT;

ALTER TABLE devices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_family_id TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_validated_at BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS permissions_version INT DEFAULT 1;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_version INT DEFAULT 1;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS platform TEXT;

-- Products Indexes
CREATE INDEX IF NOT EXISTS idx_products_tenant_sync ON products(tenant_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_products_tenant_updated ON products(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_products_tenant_deleted ON products(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_tenant_sku ON products(tenant_id, LOWER(sku)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_tenant_barcode ON products(tenant_id, barcode) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON products(tenant_id, category_id);

-- Product Variants Indexes
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_tenant_sync ON product_variants(tenant_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_variants_tenant_sku ON product_variants(tenant_id, LOWER(sku)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_variants_tenant_barcode ON product_variants(tenant_id, barcode) WHERE deleted_at IS NULL;

-- Categories & Brands Indexes
CREATE INDEX IF NOT EXISTS idx_categories_tenant_sync ON categories(tenant_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_deleted ON categories(tenant_id, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_tenant_name ON categories(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_brands_tenant_sync ON brands(tenant_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_brands_tenant_deleted ON brands(tenant_id, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_tenant_name ON brands(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;

-- Stock Ledger Indexes
CREATE INDEX IF NOT EXISTS idx_stock_ledger_tenant_product ON stock_ledger(tenant_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_tenant_variant ON stock_ledger(tenant_id, branch_id, product_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_tenant_sync ON stock_ledger(tenant_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_operation ON stock_ledger(tenant_id, operation_id);

-- Sales Indexes
CREATE INDEX IF NOT EXISTS idx_sales_tenant_created ON sales(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_sync ON sales(tenant_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_sales_operation ON sales(tenant_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(tenant_id, receipt_number);

-- Sessions & Devices Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_token_family ON sessions(token_family_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- Audit Logs Indexes
CREATE INDEX IF NOT EXISTS idx_session_audit_tenant_created ON session_audit_logs(tenant_id, created_at DESC);
