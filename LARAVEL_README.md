# FLIGALIGA Laravel edition

This is the isolated Laravel/PHP port of the custom FLIGALIGA Vault storefront. It is a work in progress and is not production-ready.

## Protected versions and data

- Develop only on `feature/laravel-shared-hosting`.
- `main` and `backup/node-postgres-2026-10-20` preserve the Node.js/PostgreSQL website.
- `mysql-migration` remains a separate migration reference branch.
- The PostgreSQL database and private local dump are recovery sources; Laravel development must not write to them.
- Never commit `.env`, PostgreSQL dumps, customer records, real Mollie keys or email credentials.

## Current ported features

- Existing Vault frontend shell, CSS, browser JavaScript and static assets.
- Public product catalogue, shareable product detail routes, image gallery, and active product variants exposed through the detail API.
- Registration, login, logout, session-backed identity and admin authorization.
- Compatibility with existing Node.js bcrypt hashes, with rehash only after successful login.
- Admin product listing/create/update/soft-disable endpoints.
- Admin product-variant list/create/update/soft-disable UI and API, including SKU uniqueness and JSON attribute validation.
- Product detail image gallery with primary-first ordering, accessible thumbnail selection and legacy image fallback.
- Admin gallery management (list/add/set-primary/remove image URLs) with same-origin/admin protection and primary-image integrity checks; admin variant management covers list/create/edit/soft-disable with SKU and JSON-attribute validation. Image file uploads remain unimplemented.
- Cart listing/add/update/empty with per-user ownership and stock-limit checks.
- Customer order read endpoints and an admin order summary.
- Withdrawal request submissions with optional order-email verification, and admin listing/status management. Confirmation email remains disabled.
- Public analytics configuration endpoint and a dynamic sitemap.
- Contact endpoint explicitly reports that email delivery is not configured; it does not pretend to send anything.
- Checkout endpoint is intentionally disabled and returns an explicit not-configured response without creating orders or reserving stock.

## Deliberately deferred

The store is not finished. The owner does not yet have Mollie or KvK details, so these are not current development blockers:

- Mollie checkout, webhooks, payment status transitions and stock reservation/release on payment outcomes.
- Production transactional email, Resend credentials and delivery idempotency.
- Contact-message and transactional email delivery (deferred), actual product image-file uploads (the current gallery manages image URLs), and remaining admin pages.
- Final business identity, legal/merchant launch content and production cutover.

Keep `PAYMENTS_ENABLED=false`. Do not add live keys, enable checkout or claim a customer payment is accepted until the payment lifecycle is implemented and end-to-end tested.

## Local development

Requirements: PHP 8.3 or newer, Composer, the Laravel-required PHP extensions, and PDO support for the local/test database. The checked-in CI tests use SQLite; CI additionally runs the schema/tests against MySQL 8.4 and MariaDB 10.11.

1. Copy `.env.example` to `.env` for local SQLite development. It deliberately leaves `DB_DATABASE` unset so Laravel resolves its database file through `database_path()` rather than a relative working-directory path.
2. Run `composer install` and `php artisan key:generate`.
3. Create the new local database file with `touch database/database.sqlite`, then run `php artisan migrate --seed` if you want demo catalogue items.
4. Run `php artisan test`.
5. Run `php artisan serve` and open `http://127.0.0.1:8000`.
6. For STRATO deployment, use `.env.strato.example` only as a reference for the MySQL/MariaDB settings; create a separate production `.env` with real host credentials, `APP_DEBUG=false`, HTTPS URLs and a secure session cookie. Never configure this Laravel copy to use the PostgreSQL rollback source.

Before a reusable/release build, commit and review `composer.lock` so dependency versions are reproducible.

## PostgreSQL transfer safety (maintainers)

The transfer tool and the verifier are separate commands. Use only a disposable, freshly migrated Laravel MySQL/MariaDB target for transfer testing; never point the target at the live site or the PostgreSQL recovery source.

- `npm run db:migrate-postgres-to-laravel-mysql` is a **write** operation against the target. It requires `LARAVEL_MIGRATION_CONFIRM=TRANSFER_DATA_TO_EMPTY_LARAVEL_DATABASE` and refuses non-empty business tables.
- `npm run db:verify-postgres-laravel-mysql` is a **read-only** comparison of every shared source column across the ten business tables. It uses read-only transactions, compares in batches, and requires `LARAVEL_MIGRATION_VERIFY=COMPARE_POSTGRES_LARAVEL_DATA_READ_ONLY`.
- Both commands take PostgreSQL source settings from `PG_SOURCE_HOST`, `PG_SOURCE_PORT`, `PG_SOURCE_DATABASE`, `PG_SOURCE_USER`, and `PG_SOURCE_PASSWORD` (or `PG_SOURCE_URL`). The Laravel target is configured using `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`.

CI validates these utilities using a synthetic database fixture on MySQL 8.4 and MariaDB 10.11. This is not evidence that real customer data has been transferred: real-data staging verification and the hosting-specific deployment checks are still required. Keep all real credentials, customer data, and database dumps out of Git.


## STRATO deployment gates

STRATO currently lists PHP 8.4 and the PDO/`pdo_mysql` extensions for shared hosting, and documents internal domain forwarding to a selected webspace folder. Before deployment, verify these against the chosen account, confirm its exact MySQL/MariaDB version, and test mapping a non-production subdomain to the Laravel `public/` folder. Also confirm SSH/Composer access; if Composer is unavailable on the server, build `vendor/` locally from the reviewed lockfile and upload it via SFTP. New-platform STRATO packages do not offer cron jobs, so payment reservation cleanup needs a supported alternative before payments are implemented.

Laravel's document root must expose only the `public/` directory. Never expose the project root, `.env`, `vendor/` or private storage. STRATO's newer shared-hosting platform may not offer cron jobs; an approved alternative is required for scheduled maintenance before payment processing is implemented.

## Next development milestones

1. Finish the remaining non-payment APIs and admin workflows and add regression tests.
2. Verify shared-hosting feasibility using the actual STRATO package before trying a deployment.
3. Match the Laravel schema to the exact STRATO database service, then build a one-way migration utility with ID preservation and data-integrity checks.
4. Perform staging migration only after a fresh verified PostgreSQL dump; compare row counts, IDs, relationships, inventory and totals.
5. Implement Mollie and production email only when the owner confirms readiness, with external calls mocked in CI and a complete staging lifecycle test.
6. Cut over only with a final backup, controlled write freeze, explicit owner approval and a documented rollback to Node.js/PostgreSQL.