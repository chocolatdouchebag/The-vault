BEGIN;

-- =========================================================
-- FLIGALIGA V4 — Migration 006
-- Payment tracking and safe stock release
-- =========================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_id TEXT,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_id
    ON orders (payment_id)
    WHERE payment_id IS NOT NULL;

COMMIT;
