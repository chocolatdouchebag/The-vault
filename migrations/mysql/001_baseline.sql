-- FLIGALIGA MySQL baseline schema
-- Target: MySQL 8.0.16+ (CHECK constraints must be enforced).
-- Create this schema in a fresh, empty database. Existing PostgreSQL tables are not modified.
-- The PostgreSQL export had no 008 email-tracking columns; these are included because
-- the current application queries them. The transfer script intentionally copies only
-- columns that exist on both sides, leaving these new tracking columns NULL for old rows.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE users (
  id INT NOT NULL AUTO_INCREMENT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  is_admin TINYINT(1) DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY users_username_key (username(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE categories (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT categories_name_not_blank CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT categories_slug_not_blank CHECK (CHAR_LENGTH(TRIM(slug)) > 0),
  UNIQUE KEY unique_category_name (name),
  UNIQUE KEY unique_category_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE products (
  id INT NOT NULL AUTO_INCREMENT,
  name TEXT NOT NULL,
  price DECIMAL(30,10) NOT NULL,
  image_url TEXT NULL,
  stock INT NOT NULL DEFAULT 0,
  description TEXT NULL,
  category TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  category_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  fulfillment_method VARCHAR(32) NOT NULL DEFAULT 'stock',
  rarity TEXT NULL,
  origin TEXT NULL,
  `condition` TEXT NULL,
  provenance TEXT NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_new_arrival TINYINT(1) NOT NULL DEFAULT 0,
  unique_name_image_hash BINARY(32)
    GENERATED ALWAYS AS (
      CASE WHEN image_url IS NULL THEN NULL
      ELSE UNHEX(SHA2(CONCAT(CAST(name AS BINARY), 0x00, CAST(image_url AS BINARY)), 256))
      END
    ) STORED,
  PRIMARY KEY (id),
  CONSTRAINT products_fulfillment_method_valid
    CHECK (fulfillment_method IN ('stock', 'made_to_order', 'print_on_demand', 'external')),
  CONSTRAINT products_price_non_negative CHECK (price >= 0),
  CONSTRAINT products_status_valid CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT products_stock_non_negative CHECK (stock >= 0),
  UNIQUE KEY unique_name_image (unique_name_image_hash),
  KEY idx_products_active (is_active),
  KEY idx_products_category (category(191)),
  KEY idx_products_category_id (category_id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE product_variants (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  sku VARCHAR(255) NULL,
  name TEXT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock INT NOT NULL DEFAULT 0,
  attributes JSON NOT NULL DEFAULT (JSON_OBJECT()),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT product_variants_attributes_object CHECK (JSON_TYPE(attributes) = 'OBJECT'),
  CONSTRAINT product_variants_price_non_negative CHECK (price >= 0),
  CONSTRAINT product_variants_stock_non_negative CHECK (stock >= 0),
  UNIQUE KEY unique_product_variant_sku (sku),
  KEY idx_product_variants_product (product_id),
  KEY idx_product_variants_active (is_active),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE product_images (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  primary_product_id INT
    GENERATED ALWAYS AS (CASE WHEN is_primary = 1 THEN product_id ELSE NULL END) VIRTUAL,
  PRIMARY KEY (id),
  CONSTRAINT product_images_sort_order_non_negative CHECK (sort_order >= 0),
  CONSTRAINT product_images_url_not_blank CHECK (CHAR_LENGTH(TRIM(image_url)) > 0),
  UNIQUE KEY unique_primary_product_image (primary_product_id),
  KEY idx_product_images_product (product_id, sort_order),
  CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE orders (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NULL,
  total DECIMAL(30,10) NOT NULL,
  status VARCHAR(64) NULL DEFAULT 'pending',
  created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  customer_name TEXT NULL,
  customer_email VARCHAR(254) NULL,
  shipping_address_line1 TEXT NULL,
  shipping_postcode TEXT NULL,
  shipping_city TEXT NULL,
  shipping_country VARCHAR(255) NULL DEFAULT 'NL',
  payment_id VARCHAR(255) NULL,
  paid_at DATETIME(6) NULL,
  stock_released_at DATETIME(6) NULL,
  payment_expires_at DATETIME(6) NULL,
  order_received_email_sent_at DATETIME(6) NULL,
  payment_confirmation_email_sent_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  CONSTRAINT orders_total_non_negative CHECK (total >= 0),
  UNIQUE KEY idx_orders_payment_id (payment_id),
  KEY idx_orders_user (user_id),
  KEY idx_orders_created_at (created_at),
  KEY idx_orders_customer_email (customer_email),
  KEY idx_orders_payment_pending_expiry (status, stock_released_at, payment_expires_at, id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE cart (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NULL,
  quantity INT NOT NULL DEFAULT 1,
  user_id INT NULL,
  variant_id INT NULL,
  PRIMARY KEY (id),
  CONSTRAINT cart_quantity_positive CHECK (quantity > 0),
  UNIQUE KEY unique_cart_item (user_id, product_id),
  KEY idx_cart_user (user_id),
  KEY idx_cart_variant (variant_id),
  CONSTRAINT cart_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT cart_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT cart_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE order_items (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NULL,
  product_id INT NULL,
  quantity INT NOT NULL,
  price DECIMAL(30,10) NOT NULL,
  price_each DECIMAL(30,10) NOT NULL DEFAULT 0,
  variant_id INT NULL,
  PRIMARY KEY (id),
  CONSTRAINT order_items_price_each_non_negative CHECK (price_each >= 0),
  CONSTRAINT order_items_price_non_negative CHECK (price >= 0),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_variant (variant_id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE session (
  sid VARCHAR(255) NOT NULL,
  sess JSON NOT NULL,
  expire DATETIME(6) NOT NULL,
  PRIMARY KEY (sid),
  KEY idx_session_expire (expire)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE withdrawal_requests (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NULL,
  email VARCHAR(254) NOT NULL,
  reason TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  confirmation_email_sent_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  CONSTRAINT withdrawal_email_not_blank CHECK (CHAR_LENGTH(TRIM(email)) > 3),
  CONSTRAINT withdrawal_status_valid CHECK (status IN ('received', 'reviewing', 'completed', 'rejected')),
  KEY idx_withdrawal_order (order_id),
  KEY idx_withdrawal_submitted_at (submitted_at DESC),
  CONSTRAINT withdrawal_order_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

SET FOREIGN_KEY_CHECKS = 1;
