# FLIGALIGA Laravel Shared-Hosting Plan

## Decision

Build a separate Laravel/PHP version of the custom FLIGALIGA Vault application for STRATO shared hosting. Preserve the current Node.js + PostgreSQL version as a recovery source until the Laravel version has passed staging and a deliberate cutover is approved.

## Protected recovery points

- Baseline code: `main` at commit `a9d984535af19046d6d56c69b88a2e1d13e2c5dd` (2026-10-08).
- Immutable-by-convention code snapshot branch: `backup/node-postgres-2026-10-20`.
- Current Node.js/PostgreSQL working copy and local archive are retained on the user's machine.
- Local PostgreSQL custom-format dump was verified with `pg_restore --list`. It contains 10 tables and 34 rows in total (products 10, product_variants 8, product_images 7, cart 3, users 2, order_items 2, orders 1, categories 1, withdrawal_requests 0, session 0).
- Backup file and `.env` must remain local/private and must never be committed or attached to CI artifacts.

No migration, restore, schema update, or production write is permitted against the original PostgreSQL database during Laravel development.

## Current hosting research

STRATO's official shared-hosting documentation says PHP and MySQL/MariaDB are available. STRATO recommends PHP 8.4. Its current documentation also says cron jobs are unavailable on its new shared-hosting platform (they are available only on some legacy plans). Exact feature availability must be verified for the user's actual package in the control panel before deployment.

Laravel 13's official deployment requirements include PHP >= 8.3 and the Ctype, cURL, DOM, Fileinfo, Filter, Hash, Mbstring, OpenSSL, PCRE, PDO, Session, Tokenizer and XML extensions. The hosting plan must provide the needed extensions (especially `pdo_mysql`) and allow Laravel's storage/cache directories to be writable.

Laravel 13's official database docs list first-party support for MariaDB 10.3+ and MySQL 5.7+, but the exact STRATO engine/version and plan limits still need verification. Do not assume the current MySQL 8.4 CI environment is identical to the production database.

## Architecture target

- PHP 8.4 and Laravel 13, subject to actual hosting PHP/runtime compatibility.
- Database driver chosen only after inspecting STRATO's exact service version: Laravel supports MySQL and MariaDB, but migration definitions and constraints must be tested against the real target engine.
- Keep `public/index.html`, existing CSS, browser JavaScript and image assets as the visual starting point. Retain API endpoints and JSON response shapes where it is practical to avoid needless front-end rewrites.
- Laravel controllers/services should implement authentication, product catalogue and admin, cart, checkout, payment lifecycle, customer/admin order views, contact, withdrawal requests, sessions, email and rate limiting.
- Use Laravel's password hasher to support existing bcrypt hashes only after a compatibility test. Rehash a user's password safely after a successful login if needed; never bulk-reset password hashes.
- Keep Mollie and Resend integrations configurable by environment. All automated tests must mock external payment/email services; no live payment or email credentials in CI.
- Configure the website document root to Laravel's `public/` directory. If STRATO doesn't let us configure a document root, prove a safe deployment layout before proceeding; never expose `.env`, source, `vendor/` or storage to public access.
- Install Composer dependencies with production settings. If shared hosting does not provide Composer/SSH, validate whether a local production dependency build can be uploaded safely and repeatably via SFTP/Git.
- Replace in-process Node.js timer cleanup with a supported shared-hosting approach. Because cron is missing on STRATO's newer platform, assess (a) an authenticated external scheduler with a rotated secret and replay/rate limits, (b) supported legacy-plan cron, or (c) safe on-demand expiry reconciliation. Do not silently omit payment-reservation cleanup.

## Key existing application features to preserve

- Public storefront, product detail routes, search/filtering, catalogue sections and assets.
- Registration, login/logout, sessions and admin authorization.
- Product administration, stock management, product variants and product images.
- Cart, checkout validation, stock reservation, immutable order totals/items and delivery details.
- Mollie payment initiation, webhook verification, paid/failed/cancelled/expired transitions and idempotency.
- Order receipt and payment-confirmation emails via Resend, plus contact and withdrawal confirmation emails.
- Customer order status, admin order overview, withdrawal workflow, sitemap, privacy/security headers, rate limits and analytics-consent integration.
- Dutch/EU business and customer-policy text remains a pre-launch content task.

## Milestones and acceptance criteria

### 0. Hosting feasibility — do this before coding or buying anything
- [ ] Confirm exact STRATO package and whether it uses new or legacy shared-hosting platform.
- [ ] Confirm PHP 8.4 availability and required Laravel extensions via official package details or a minimal, temporary diagnostic page that is removed immediately afterward.
- [ ] Confirm exact database product/version (MySQL or MariaDB), database limits, remote-access policy and supported TLS settings.
- [ ] Confirm document-root layout, SFTP/SSH/Git availability, Composer deployment path, application file permissions, request timeouts and max upload size.
- [ ] Confirm how scheduled expiry cleanup can run on this plan without storing secrets in a readable cron command.
- [ ] Produce a small non-production Laravel health-check deployment against a disposable database. Do not point it at PostgreSQL or the live website.

### 1. Laravel foundation
- [ ] Scaffold a clean Laravel application on this branch.
- [ ] Add safe environment examples, deployment notes and CI dependency/test steps; no real secrets.
- [ ] Create initial native Laravel migrations and Eloquent models for the existing data model.
- [ ] Write schema compatibility tests against the exact target database engine.
- [ ] Include a non-production sample data seeder; never seed real user/customer data into tests.

### 2. Port and test features in low-risk-to-high-risk order
- [ ] Product catalogue/detail API and frontend asset serving.
- [ ] Registration, login, logout, session behavior and admin gate.
- [ ] Admin product CRUD, catalogue fields, images and variant handling.
- [ ] Cart operations and stock validation.
- [ ] Orders/withdrawals/admin order views.
- [ ] Mollie checkout and webhook lifecycle, stock reservation/release, retries and duplicate webhook idempotency.
- [ ] Resend email templates and idempotency tracking.
- [ ] Contact flow, rate limiting, security headers, sitemap and analytics configuration.
- [ ] Automated route tests plus integration tests with mocked external providers.

### 3. Staging data migration and cutover (only after milestones above)
- [ ] Make a fresh, verified source PostgreSQL dump.
- [ ] Create an empty staging database on the exact STRATO engine/version.
- [ ] Build a one-way migration path with explicit column mapping, ID preservation, type/length/decimal preflight, row-count checks and transaction/rollback handling where the database permits it.
- [ ] Verify counts, IDs, relationships, stock quantities, product pricing and order totals; check password-hash compatibility without revealing hashes.
- [ ] Run checkout and payment lifecycle end-to-end in a staging environment.
- [ ] Document freeze, final backup, DNS/deployment cutover, and rollback to the Node.js/PostgreSQL version.
- [ ] Do not cut over or enable live payments until the owner explicitly approves it.

## Initial working rule

Keep `main`, `backup/node-postgres-2026-10-20`, the existing `mysql-migration` branch and the PostgreSQL database unchanged. All Laravel work happens only on `feature/laravel-shared-hosting` until review. Never commit the database dump, private `.env`, real customer records or live provider credentials.
