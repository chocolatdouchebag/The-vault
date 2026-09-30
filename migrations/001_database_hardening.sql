BEGIN;

-- =========================================================
-- FLIGALIGA V4 — Migration 001
-- Database hardening
-- =========================================================

-- Products
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Basic data integrity
ALTER TABLE products
    ADD CONSTRAINT products_price_non_negative
    CHECK (price >= 0);

ALTER TABLE products
    ADD CONSTRAINT products_stock_non_negative
    CHECK (stock >= 0);

ALTER TABLE cart
    ADD CONSTRAINT cart_quantity_positive
    CHECK (quantity > 0);

ALTER TABLE order_items
    ADD CONSTRAINT order_items_quantity_positive
    CHECK (quantity > 0);

ALTER TABLE order_items
    ADD CONSTRAINT order_items_price_non_negative
    CHECK (price >= 0);

ALTER TABLE order_items
    ADD CONSTRAINT order_items_price_each_non_negative
    CHECK (price_each >= 0);

ALTER TABLE orders
    ADD CONSTRAINT orders_total_non_negative
    CHECK (total >= 0);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_products_active
    ON products (is_active);

CREATE INDEX IF NOT EXISTS idx_products_category
    ON products (category);

CREATE INDEX IF NOT EXISTS idx_cart_user
    ON cart (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_user
    ON orders (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
    ON orders (created_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order
    ON order_items (order_id);

COMMIT;
