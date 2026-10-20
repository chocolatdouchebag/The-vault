# FLIGALIGA PostgreSQL → MySQL Migration

## Safety rules

- Work on `mysql-migration`; do not commit migration work to `main` or merge until verification passes.
- Keep the current PostgreSQL database unchanged as the rollback source.
- Never put credentials, live customer records, payment secrets, or a production database dump in Git.
- Do not switch production or enable live payments against MySQL until schema, migration, and checkout tests pass.

## Repository audit (2026-10-20)

Branch: `mysql-migration`, created from `main`.

### Current PostgreSQL coupling

- `package.json`: uses `pg`.
- `db.js`: creates a PostgreSQL `Pool` from `DATABASE_URL` or `DB_*` variables; also configures PostgreSQL-specific timeout settings.
- `server.js`: SQL parameters use `$1`-style placeholders; consumes `result.rows`; relies on `RETURNING`; opens transactions via `pool.connect()`; uses PostgreSQL `FOR UPDATE OF c, p` and `make_interval(mins => $9::integer)`.
- `session-store.js`: a custom Express session store uses PostgreSQL query syntax, `$n` placeholders, a `::json` cast, and `ON CONFLICT ... EXCLUDED`.
- `payment-cleanup.js`: assumes `pg` query results (`rows`, `rowCount`), `pool.connect()`, `client.release()`, and PostgreSQL transactions.
- `.env.example`: sets PostgreSQL's default port 5432 and documents a PostgreSQL URL.
- Existing migrations `001`–`008` are PostgreSQL SQL, not portable MySQL migrations.

### Existing migration files

1. `001_database_hardening.sql`: product/order timestamps, active flag, check constraints and indexes.
2. `002_product_catalog.sql`: categories, product catalog fields, product variants, product images, seeded categories/default variants/images; includes PostgreSQL identity columns, JSONB, regex replacement, `ON CONFLICT`, `UPDATE ... FROM`, and partial indexes.
3. `003_cart_variant_support.sql`: variant references on cart/order items, backfill, foreign keys and indexes; uses `UPDATE ... FROM`.
4. `004_launch_support.sql`: session and withdrawal-request tables; identity columns and indexes.
5. `005_checkout_customer_details.sql`: order customer/shipping fields and customer-email index.
6. `006_payment_tracking.sql`: payment ID, paid time, stock release time and a partial unique index.
7. `007_payment_reservation_expiry.sql`: payment-expiry column and partial index.
8. `008_transactional_email_tracking.sql`: email delivery-tracking timestamps.

### Core schema gap

The repository root has no initial schema/bootstrap migration for the existing core tables `users`, `products`, `cart`, `orders`, and `order_items`. The current SQL migrations alter those tables as if they already exist. Before generating a faithful MySQL baseline or transferring production data, obtain a schema-only export of the actual PostgreSQL database and compare it with the application's queries. Do not guess at the actual deployed column definitions or silently drop legacy columns.

### Core tables inferred from application queries

This is a query inventory, not a substitute for the live schema export.

- `users`: referenced fields include `id`, `username`, `password`, `is_admin`.
- `products`: query usage includes `id`, `name`, `description`, `price`, `stock`, `image_url`, `category`, `rarity`, `origin`, `condition`, `provenance`, `is_featured`, `is_new_arrival`, `created_at`, `updated_at`, `is_active`, `status`, `fulfillment_method`, and `category_id`.
- `cart`: query usage includes `id`, `user_id`, `product_id`, `quantity`; migration 003 also adds `variant_id`.
- `orders`: code and migrations reference `id`, `user_id`, `total`, `status`, `created_at`, `updated_at`, checkout customer/shipping fields, payment tracking fields and email tracking fields.
- `order_items`: code and migrations reference `order_id`, `product_id`, `quantity`, `price`, `price_each` (the hardening migration constrains it), and `variant_id`.

### Highest-risk compatibility points

- Transactions and stock reservation/rollback must be preserved with InnoDB and row locks.
- Convert the checkout interval expression to MySQL date arithmetic.
- Replace `RETURNING` uses with explicit insert-ID handling and follow-up selects where the response needs the resulting row.
- Rework PostgreSQL `UPDATE ... FROM` operations as MySQL `UPDATE ... JOIN`.
- Replace partial indexes with equivalent MySQL indexes/constraints (including a generated-column approach where needed).
- Convert PostgreSQL JSONB types/casts/defaults to a version-compatible MySQL JSON representation.
- Replace the PostgreSQL session store, and keep expiry cleanup behavior.
- Check migration assumptions against the exact MySQL version supported by the target host. Check-constraint enforcement and JSON defaults vary by server version.
- Review email idempotency and payment webhook idempotency during the database conversion.

## Work sequence

- [x] Create isolated `mysql-migration` branch from `main`.
- [x] Inventory database drivers, session storage, payment cleanup, SQL dialect features and existing migration files.
- [ ] Obtain and inspect a schema-only PostgreSQL export; do not commit it if it contains sensitive schema comments or other secrets.
- [ ] Confirm target host's MySQL/MariaDB product and exact version, supported Node.js version, and whether the Express app can run there.
- [ ] Add a checked-in MySQL baseline schema and version-specific migration set.
- [ ] Add a repeatable PostgreSQL-to-MySQL data transfer script with explicit table ordering and ID preservation.
- [ ] Convert connection setup, query interface, session store, application queries, and payment cleanup.
- [ ] Add automated migration and regression tests for authentication, products, cart, checkout, payment handling, sessions, emails and withdrawals.
- [ ] Compare row counts, primary keys, foreign keys, stock quantities and order totals on a staging database.
- [ ] Perform production cutover only with a final backup, write freeze, verification, and documented rollback route.

## Local schema export (run in the FLIGALIGA project directory)

This exports **schema only**, not customer rows. It prompts for the PostgreSQL password if needed. Keep the resulting file local and do not commit it.

```bash
pg_dump --schema-only --no-owner --no-privileges -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" > /tmp/fligaliga-postgres-schema.sql
```

If `DB_HOST`, `DB_USER`, and `DB_NAME` are only in `.env`, load those non-secret settings in your shell first. Do not paste or upload your `.env` file. Inspect or share only the schema dump, after checking it for secrets.

## Completion criteria

MySQL is not production-ready until a fresh database can be created repeatably, all existing data transfers without loss, key relationships and totals match, the critical automated tests pass, and production checkout/payment flows pass on staging with the target host's actual MySQL version.
