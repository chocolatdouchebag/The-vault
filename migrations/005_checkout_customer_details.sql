BEGIN;

-- =========================================================
-- FLIGALIGA V4 — Migration 005
-- Checkout customer details
-- =========================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS customer_email TEXT,
    ADD COLUMN IF NOT EXISTS shipping_address_line1 TEXT,
    ADD COLUMN IF NOT EXISTS shipping_postcode TEXT,
    ADD COLUMN IF NOT EXISTS shipping_city TEXT,
    ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'NL';

CREATE INDEX IF NOT EXISTS idx_orders_customer_email
    ON orders (customer_email);

COMMIT;
