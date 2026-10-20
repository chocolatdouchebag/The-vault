# FLIGALIGA Laravel Shared-Hosting Plan

## Decision

Build a separate Laravel/PHP version of the custom FLIGALIGA Vault application for STRATO shared hosting. On this branch, `.env.example` uses a fresh local SQLite database, `.env.strato.example` documents the STRATO MySQL/MariaDB target, and the legacy Node/PostgreSQL example is preserved as `.env.node-postgres.example`. Preserve the current Node.js + PostgreSQL version as a recovery source until the Laravel version has passed staging and a deliberate cutover is approved.

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

## Current development scope (pre-launch)

The webshop is not finished yet. Treat payment processing, merchant onboarding and business-registration-dependent tasks as deferred milestones, not blockers for the current foundation. The owner does not yet have a Mollie account or KvK registration.

Current priority:
1. Make the existing Vault frontend load under Laravel and keep the current routes/JSON contracts working.
2. Port and test authentication, sessions, product catalogue, product administration, cart, customer/admin order views, withdrawal requests and safe non-payment placeholders. Dedicated product-image/variant management remains future work.
3. Keep payment initiation disabled by default. Do not add live credentials or enable live checkout. A placeholder UI may remain, but it must not claim that a payment is being processed or accepted.
4. Defer Mollie checkout/webhooks, production payment email workflow, business registration details, and legal/merchant launch checks until the owner confirms readiness. Preserve clear TODOs and the design notes for later.
5. Once the owner has a Mollie account and KvK details, implement the actual payment and notification flows behind tests, then run a complete staging checkout before launch.

This is a development sequence only, not a claim that the website or checkout is production-ready.

## Key existing application features to preserve

- Public storefront, product detail routes, search/filtering, catalogue sections and assets.
- Registration, login/logout, sessions and admin authorization.
- Product administration, stock management, product variants and product images.
- Cart, checkout validation, stock reservation, immutable order totals/items and delivery details.
- Mollie payment initiation, webhook verification, paid/failed/cancelled/expired transitions and idempotency.
- Order receipt, payment-confirmation, contact and withdrawal confirmation emails are part of the original Node.js version; the Laravel port intentionally defers sending them until the owner is ready to configure/test a provider.
- Customer order status, admin order overview, withdrawal request/admin status workflow, sitemap, privacy/security headers, rate limits, public analytics configuration endpoint and existing analytics-consent frontend.
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
- [x] Scaffold a clean Laravel application on this branch.
- [x] Add safe environment examples, deployment notes and CI dependency/test steps; no real secrets.
- [x] Create baseline native Laravel migrations for the existing data tables, plus User and Product models; add further domain models as order and withdrawal features expand.
- [x] Add schema and feature-test matrix coverage for MySQL 8.4 and MariaDB 10.11 in CI. The exact STRATO engine/version remains a hosting-feasibility gate.
- [x] Include a synthetic demo catalogue seeder that refuses to run outside local/testing; no customer, order or payment data is seeded.

### 2. Port and test features in low-risk-to-high-risk order
- [x] Product catalogue/detail API and existing frontend asset serving.
- [x] Registration, login, logout, cookie-backed session behavior and admin authorization; Node bcrypt migration path covered by regression tests.
- [x] Admin product create/list/update/soft-disable API and catalogue fields. Dedicated product-image/variant management UI and routes remain future work.
- [x] Cart read/add/update/empty operations with ownership checks, stock bounds and transactional row locking.
- [x] Customer order read endpoints and admin order summary with item details.
- [x] Withdrawal request submission with optional order-email ownership check, admin listing/status update, plus tests; confirmation email remains disabled until a provider is configured.
- [ ] Mollie checkout and webhook lifecycle, stock reservation/release, retries and duplicate webhook idempotency (deliberately deferred until the owner has Mollie and approves payment work).
- [ ] Resend email templates and idempotency tracking (deferred; no email credentials configured).
- [x] Public analytics configuration endpoint, dynamic sitemap, existing security headers and rate limit definitions.
- [x] Contact endpoint safely reports that delivery is not configured; no false success response.
- [ ] Real contact/withdrawal/order email delivery and idempotency tracking (deferred until email provider setup).
- [x] Automated feature tests for storefront routes, authentication/session compatibility, catalogue, admin products, cart, customer/admin orders, withdrawal requests, public config, sitemap, security headers and same-origin write protection. CI also checks storefront JavaScript syntax.
- [x] Synthetic PostgreSQL-to-Laravel transfer regression tests against MySQL 8.4 and MariaDB 10.11 (IDs, row counts, decimal scale, timestamp microseconds, JSON, foreign keys and primary-image uniqueness slot).
- [ ] External payment/email provider integration tests remain deferred because those flows are not implemented/configured yet.

### 3. Staging data migration and cutover (only after milestones above)
- [ ] Make a fresh, verified source PostgreSQL dump.
- [ ] Create an empty staging database on the exact STRATO engine/version.
- [x] Build a guarded one-way transfer utility for the ten PostgreSQL business tables into a fully migrated but otherwise empty Laravel MySQL/MariaDB target; validates source/target tables and types, preserves IDs/JSON/precise timestamps, handles primary-image uniqueness, checks row counts/keys and rolls back failed data transactions. Synthetic MySQL 8.4 and MariaDB 10.11 transfer tests pass.
- [ ] Run a real-data staging transfer and compare business data before any cutover; not attempted.
- [ ] Verify counts, IDs, relationships, stock quantities, product pricing and order totals; check password-hash compatibility without revealing hashes.
- [ ] Run checkout and payment lifecycle end-to-end in a staging environment.
- [ ] Document freeze, final backup, DNS/deployment cutover, and rollback to the Node.js/PostgreSQL version.
- [ ] Do not cut over or enable live payments until the owner explicitly approves it.

## Initial working rule

Keep `main`, `backup/node-postgres-2026-10-20`, the existing `mysql-migration` branch and the PostgreSQL database unchanged. All Laravel work happens only on `feature/laravel-shared-hosting` until review. Never commit the database dump, private `.env`, real customer records or live provider credentials.
