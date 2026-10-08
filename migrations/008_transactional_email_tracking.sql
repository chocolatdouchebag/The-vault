BEGIN;

-- =========================================================
-- FLIGALIGA V5 — Transactional email delivery tracking
-- =========================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_received_email_sent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS payment_confirmation_email_sent_at TIMESTAMP;

ALTER TABLE withdrawal_requests
    ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMP;

COMMIT;
