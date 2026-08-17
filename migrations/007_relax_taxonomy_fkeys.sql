-- Migration 007: Relax strict taxonomy foreign key constraints to allow resilient offline-first multi-entity delta sync

ALTER TABLE products DROP CONSTRAINT IF EXISTS fk_products_category;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_id_fkey;
ALTER TABLE products DROP CONSTRAINT IF EXISTS fk_products_brand;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_brand_id_fkey;
