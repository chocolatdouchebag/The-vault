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
- Public product catalogue and shareable product detail routes.
- Registration, login, logout, session-backed identity and admin authorization.
- Compatibility with existing Node.js bcrypt hashes, with rehash only after successful login.
- Admin product listing/create/update/soft-disable endpoints.
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
- Contact-message and transactional email delivery (deferred), dedicated image/variant management UI, and remaining admin pages.
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

## STRATO deployment gates

Before purchase or deployment, verify the exact package, PHP extensions (especially `pdo_mysql`), MySQL/MariaDB engine and version, database limits, SFTP/SSH and Composer availability, document-root layout, writable `storage/` and `bootstrap/cache/`, request limits and scheduled-task support.

Laravel's document root must expose only the `public/` directory. Never expose the project root, `.env`, `vendor/` or private storage. STRATO's newer shared-hosting platform may not offer cron jobs; an approved alternative is required for scheduled maintenance before payment processing is implemented.

## Next development milestones

1. Finish the remaining non-payment APIs and admin workflows and add regression tests.
2. Verify shared-hosting feasibility using the actual STRATO package before trying a deployment.
3. Match the Laravel schema to the exact STRATO database service, then build a one-way migration utility with ID preservation and data-integrity checks.
4. Perform staging migration only after a fresh verified PostgreSQL dump; compare row counts, IDs, relationships, inventory and totals.
5. Implement Mollie and production email only when the owner confirms readiness, with external calls mocked in CI and a complete staging lifecycle test.
6. Cut over only with a final backup, controlled write freeze, explicit owner approval and a documented rollback to Node.js/PostgreSQL.