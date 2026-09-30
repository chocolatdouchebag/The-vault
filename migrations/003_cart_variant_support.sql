BEGIN;

-- =========================================================
-- FLIGALIGA V4 — Migration 003
-- Cart + order item variant support
-- =========================================================

ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS variant_id INTEGER;

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS variant_id INTEGER;

-- Existing cart rows use the default variant created in migration 002.
UPDATE cart c
SET variant_id = v.id
FROM product_variants v
WHERE c.variant_id IS NULL
  AND v.product_id = c.product_id;

ALTER TABLE cart
    ADD CONSTRAINT cart_variant_id_fkey
    FOREIGN KEY (variant_id)
    REFERENCES product_variants(id)
    ON DELETE RESTRICT;

ALTER TABLE order_items
    ADD CONSTRAINT order_items_variant_id_fkey
    FOREIGN KEY (variant_id)
    REFERENCES product_variants(id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_cart_variant
    ON cart (variant_id);

CREATE INDEX IF NOT EXISTS idx_order_items_variant
    ON order_items (variant_id);

COMMIT;
