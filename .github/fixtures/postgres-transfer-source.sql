-- Minimal PostgreSQL 18 fixture matching the ten FLIGALIGA source tables.
-- This is synthetic test data only; it contains no live customer or order data.

CREATE TABLE public.users (
  id integer PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  is_admin boolean DEFAULT false
);

CREATE TABLE public.categories (
  id integer PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.products (
  id integer PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL,
  image_url text,
  stock integer DEFAULT 0 NOT NULL,
  description text,
  category text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  category_id integer REFERENCES public.categories(id) ON DELETE SET NULL,
  status text DEFAULT 'active'::text NOT NULL,
  fulfillment_method text DEFAULT 'stock'::text NOT NULL,
  rarity text,
  origin text,
  condition text,
  provenance text,
  is_featured boolean DEFAULT false NOT NULL,
  is_new_arrival boolean DEFAULT false NOT NULL,
  CONSTRAINT products_price_non_negative CHECK (price >= 0),
  CONSTRAINT products_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT products_status_valid CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT products_fulfillment_method_valid CHECK (fulfillment_method IN ('stock', 'made_to_order', 'print_on_demand', 'external')),
  CONSTRAINT unique_name_image UNIQUE (name, image_url)
);

CREATE TABLE public.product_variants (
  id integer PRIMARY KEY,
  product_id integer NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text,
  name text,
  price numeric(12,2) DEFAULT 0 NOT NULL,
  stock integer DEFAULT 0 NOT NULL,
  attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT product_variants_price_non_negative CHECK (price >= 0),
  CONSTRAINT product_variants_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT product_variants_attributes_object CHECK (jsonb_typeof(attributes) = 'object')
);
CREATE UNIQUE INDEX unique_product_variant_sku ON public.product_variants(sku) WHERE sku IS NOT NULL;

CREATE TABLE public.product_images (
  id integer PRIMARY KEY,
  product_id integer NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT product_images_sort_order_non_negative CHECK (sort_order >= 0),
  CONSTRAINT product_images_url_not_blank CHECK (length(trim(image_url)) > 0)
);
CREATE UNIQUE INDEX unique_primary_product_image ON public.product_images(product_id) WHERE is_primary = true;

CREATE TABLE public.orders (
  id integer PRIMARY KEY,
  user_id integer REFERENCES public.users(id),
  total numeric NOT NULL,
  status text DEFAULT 'pending'::text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  customer_name text,
  customer_email text,
  shipping_address_line1 text,
  shipping_postcode text,
  shipping_city text,
  shipping_country text DEFAULT 'NL'::text,
  payment_id text UNIQUE,
  paid_at timestamp without time zone,
  stock_released_at timestamp without time zone,
  payment_expires_at timestamp without time zone,
  CONSTRAINT orders_total_non_negative CHECK (total >= 0)
);

CREATE TABLE public.cart (
  id integer PRIMARY KEY,
  product_id integer REFERENCES public.products(id),
  quantity integer DEFAULT 1 NOT NULL,
  user_id integer REFERENCES public.users(id),
  variant_id integer REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  CONSTRAINT cart_quantity_positive CHECK (quantity > 0),
  CONSTRAINT unique_cart_item UNIQUE (user_id, product_id)
);

CREATE TABLE public.order_items (
  id integer PRIMARY KEY,
  order_id integer REFERENCES public.orders(id),
  product_id integer REFERENCES public.products(id),
  quantity integer NOT NULL,
  price numeric NOT NULL,
  price_each numeric DEFAULT 0 NOT NULL,
  variant_id integer REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_price_non_negative CHECK (price >= 0),
  CONSTRAINT order_items_price_each_non_negative CHECK (price_each >= 0)
);

CREATE TABLE public.session (
  sid character varying PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) without time zone NOT NULL
);

CREATE TABLE public.withdrawal_requests (
  id integer PRIMARY KEY,
  order_id integer REFERENCES public.orders(id) ON DELETE SET NULL,
  email text NOT NULL,
  reason text,
  status text DEFAULT 'received'::text NOT NULL,
  submitted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT withdrawal_status_valid CHECK (status IN ('received', 'reviewing', 'completed', 'rejected')),
  CONSTRAINT withdrawal_email_not_blank CHECK (length(trim(email)) > 3)
);

INSERT INTO public.users (id, username, password, is_admin)
VALUES (41, 'transfer-test-user', 'synthetic-hash', false);

INSERT INTO public.categories (id, name, slug, description, is_active, created_at, updated_at)
VALUES (43, 'Transfer Test Category', 'transfer-test-category', 'synthetic fixture', true,
        '2022-02-03 04:05:06.123456', '2022-02-03 04:05:06.654321');

INSERT INTO public.products (
  id, name, price, image_url, stock, description, category, created_at, updated_at,
  is_active, category_id, status, fulfillment_method, rarity, origin, condition,
  provenance, is_featured, is_new_arrival
) VALUES (
  44, 'Transfer Test Product', 123.4500000000, NULL, 17, 'fixture product', 'Test',
  '2022-02-03 04:05:06.123456', '2022-02-03 04:05:06.654321', true, 43, 'active',
  'stock', 'Rare', 'Test origin', 'New', 'Synthetic only', true, false
);

INSERT INTO public.product_variants (
  id, product_id, sku, name, price, stock, attributes, is_active, created_at, updated_at
) VALUES (
  45, 44, NULL, 'Default', 123.45, 17, '{"color":"gold"}'::jsonb, true,
  '2022-02-03 04:05:06.123456', '2022-02-03 04:05:06.654321'
);

INSERT INTO public.product_images (
  id, product_id, image_url, alt_text, sort_order, is_primary, created_at
) VALUES (
  46, 44, 'https://example.test/transfer-image.jpg', 'Synthetic image', 0, true,
  '2022-02-03 04:05:06.123456'
);

INSERT INTO public.orders (
  id, user_id, total, status, created_at, updated_at, customer_name, customer_email,
  shipping_address_line1, shipping_postcode, shipping_city, shipping_country,
  payment_id, paid_at, stock_released_at, payment_expires_at
) VALUES (
  47, 41, 123.45, 'payment_pending', '2022-02-03 04:05:06.123456',
  '2022-02-03 04:05:06.654321', 'Transfer Test Buyer', 'transfer-test@example.test',
  '1 Test Lane', '1234 AB', 'Test City', 'NL', NULL, NULL, NULL,
  '2022-02-03 04:35:06.123456'
);

INSERT INTO public.cart (id, product_id, quantity, user_id, variant_id)
VALUES (48, 44, 1, 41, 45);

INSERT INTO public.order_items (id, order_id, product_id, quantity, price, price_each, variant_id)
VALUES (49, 47, 44, 1, 123.45, 123.45, 45);

INSERT INTO public.session (sid, sess, expire)
VALUES (
  'transfer-fixture-session',
  '{"cookie":{"expires":"2022-02-03T04:35:06.123Z"},"userId":41}'::json,
  '2022-02-03 04:35:06.123456'
);

INSERT INTO public.withdrawal_requests (
  id, order_id, email, reason, status, submitted_at
) VALUES (
  50, 47, 'transfer-test@example.test', 'Synthetic transfer fixture', 'received',
  '2022-02-03 04:05:06.123456'
);
