BEGIN;

-- =========================================================
-- FLIGALIGA V4 — Migration 007
-- Payment reservation expiry
-- =========================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orders_payment_pending_expiry
    ON orders (payment_expires_at)
    WHERE status = 'payment_pending'
      AND stock_released_at IS NULL
      AND payment_expires_at IS NOT NULL;

COMMIT;
