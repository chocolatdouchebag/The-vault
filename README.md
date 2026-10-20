# FLIGALIGA — The Vault (Laravel/PHP migration)

This branch is the isolated Laravel/PHP edition intended for later shared-hosting evaluation. It preserves the existing custom storefront assets while porting the API and data layer to Laravel and MySQL/MariaDB.

## Important recovery rule

- The original Node.js/PostgreSQL website remains a protected recovery source on `main` and `backup/node-postgres-2026-10-20`.
- Work on the Laravel port only on `feature/laravel-shared-hosting`.
- Do not point Laravel at the original PostgreSQL database. Keep its backup private and unchanged.
- Checkout/payment processing remains disabled until the payment lifecycle and hosting have been deliberately verified.

## Start here

Read **[LARAVEL_README.md](LARAVEL_README.md)** for local setup, current feature coverage, transfer commands, and hosting safety gates. The detailed execution checklist lives in **[LARAVEL_SHARED_HOSTING_PLAN.md](LARAVEL_SHARED_HOSTING_PLAN.md)**.

For local development, use PHP 8.3+ and Composer with the example's SQLite database, then run `php artisan serve`. `npm start` is intentionally guarded on this branch so it cannot accidentally start the legacy Node application; npm is retained for the isolated PostgreSQL-to-Laravel transfer and validation tools.

## Current status

Laravel feature tests run in CI on PHP 8.3 and 8.4. Database schema and synthetic transfer checks run on MySQL 8.4 and MariaDB 10.11. These tests are not a substitute for a real staging transfer, hosting compatibility check, or production cutover review. No hosting package has been selected yet.
