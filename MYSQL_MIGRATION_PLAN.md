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
- `.env.example`: now separates the MySQL application target (`MYSQL_*`) from the PostgreSQL source (`DB_*` or `DATABASE_URL`) used by migration tools.
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

The repository root has no initial schema/bootstrap migration for the existing core tables `users`, `products`, `cart`, `orders`, and `order_items`. The schema-only export from the configured PostgreSQL database confirms all ten tables and their relationships, so `migrations/mysql/001_baseline.sql` now defines a separate MySQL baseline. The export also shows that the PostgreSQL database is missing `orders.order_received_email_sent_at`, `orders.payment_confirmation_email_sent_at`, and `withdrawal_requests.confirmation_email_sent_at`, despite current application code using them. The MySQL baseline includes these columns as nullable fields; the data-transfer script copies only columns found on both sides, leaving new tracking values NULL.

### Core tables from the export and application query inventory

The live schema-only export was inspected to create the checked-in baseline. This list remains a useful map of the columns used by the application:

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
- [x] Obtain and inspect a schema-only PostgreSQL export locally; do not commit the dump itself.
- [x] Add `npm run db:export-postgres-schema`, which reads the local `.env` without displaying credentials, writes schema DDL only to a private `/tmp` file, and lists table names.
- [x] Add the MySQL 8 baseline schema using the exported ten-table structure, including the three nullable email-tracking columns expected by current application code but absent from this live export.
- [x] Add guarded scripts to create a baseline in an empty MySQL database and transfer rows with ID preservation, type/length checks, and transactional rollback.
- [x] Switch the application's DB pool/session store to MySQL and add SQL-compatibility regression tests.
- [x] Test the DB adapter and session store against MySQL 8.4, including boolean return types, positional parameters, `RETURNING`, duplicate-key handling and row locking.
- [x] Test authentication, cart addition, checkout and a failed-payment webhook end-to-end against MySQL with a test-only mocked Mollie API.
- [x] Verify payment-failure stock restoration and idempotent webhook retries with InnoDB transactions. Fixed the existing server route calls to pass the database pool into `releaseReservedStock`.
- [x] Test a synthetic PostgreSQL-to-MySQL transfer end-to-end, checking row counts, primary keys, JSON, decimals, timestamp microseconds, foreign keys and new nullable email-tracking columns.
- [x] Refresh `package-lock.json` with the added `mysql2` dependency and validate it with `npm ci --ignore-scripts --no-audit --no-fund` in CI. The migration CI currently installs from `package.json` without relying on the outdated lockfile.
- [ ] Confirm target host's MySQL/MariaDB product and exact version, supported Node.js version, and whether the Express app can run there.
- [x] Add a checked-in MySQL baseline schema targeting MySQL 8.0.16+.
- [x] Add a guarded PostgreSQL-to-MySQL transfer script with foreign-key-safe table ordering, explicit ID preservation, metadata-driven column matching, target-length/decimal preflight checks, and a transaction rollback on failure.
- [x] Convert connection setup and session storage; add an adapter for the remaining PostgreSQL-style parameter, `RETURNING`, lock, interval, and duplicate-key syntax while application route SQL is being converted/tested.
- [ ] Replace the transitional compatibility adapter with native MySQL SQL after route-level regression tests cover all write operations.
- [ ] Expand route-level regression coverage for paid-payment webhook handling, email idempotency and withdrawal flows on a staging database.
- [ ] Compare row counts, primary keys, foreign keys, stock quantities and order totals on a staging database.
- [ ] Perform production cutover only with a final backup, write freeze, verification, and documented rollback route.

## Local schema export (run in the FLIGALIGA project directory)

The repository includes a helper that reads the existing local `.env` automatically. From the checked-out `mysql-migration` branch, run:

```bash
npm run db:export-postgres-schema
```

It uses the installed `pg_dump` client with `--schema-only`, `--no-owner`, `--no-privileges`, and `--no-comments`. It writes the DDL to `/tmp/fligaliga-postgres-schema.sql` with owner-only file permissions. No table rows are exported, and credentials are never printed.

Do not commit or paste the `.env` file. Once the export succeeds, attach the generated schema SQL file to the conversation or share the `CREATE TABLE` definitions for the core tables (`users`, `products`, `cart`, `orders`, `order_items`) and related foreign keys/indexes. The export may also show whether each follow-up PostgreSQL migration has already been applied.

If the helper reports that `pg_dump` is not installed, install the PostgreSQL client tools on the local machine and rerun it. If it reports a connection error, verify that the configured database is reachable; do not paste database credentials.

## Current implementation notes

- The application now requires `MYSQL_HOST`, `MYSQL_DATABASE`, and `MYSQL_USER` for runtime database access. Existing `DB_*` / `DATABASE_URL` settings remain the PostgreSQL source for the export/transfer utilities, preventing the app from accidentally treating the PostgreSQL endpoint as MySQL.
- `npm run db:apply-mysql-schema` refuses a non-empty target database and requires MySQL 8.0.16+; it never drops tables. The baseline and its check constraints have passed against MySQL 8.4.11.
- `npm run db:migrate-postgres-to-mysql` refuses to run unless `MYSQL_MIGRATION_CONFIRM=TRANSFER_DATA_TO_EMPTY_MYSQL_TARGET` is set and all target tables are empty. It copies data only when explicitly invoked; the end-to-end transfer test uses synthetic fixture data, not the real database.
- The MySQL application adapter standardizes database timestamps to UTC and converts MySQL `TINYINT(1)` results back to booleans so JSON responses remain compatible with the existing PostgreSQL API.
- The source PostgreSQL database remains read-only to the transfer script. No production cutover or payment enablement is authorized until a staging test passes.

## Completion criteria

MySQL is not production-ready until a fresh database can be created repeatably, all existing data transfers without loss, key relationships and totals match, the critical automated tests pass, and production checkout/payment flows pass on staging with the target host's actual MySQL version.
