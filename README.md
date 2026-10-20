# FLIGALIGA — The Vault (Laravel/PHP migration)

This branch is the main development path for the future MySQL/MariaDB version of FLIGALIGA. It preserves the existing custom storefront assets while porting the API and data layer to Laravel.

## Important recovery rule

- The original Node.js/PostgreSQL website and database dump are archival recovery sources on `main` and `backup/node-postgres-2026-10-20`; keep them untouched.
- Work on the Laravel port only on `feature/laravel-shared-hosting`.
- Do not point Laravel at the original PostgreSQL database. Keep its backup private and unchanged.
- Checkout/payment processing remains disabled until the payment lifecycle and hosting have been deliberately verified.

## Start here

Read **[LARAVEL_README.md](LARAVEL_README.md)** for local setup, current feature coverage, transfer commands, and hosting safety gates. The detailed execution checklist lives in **[LARAVEL_SHARED_HOSTING_PLAN.md](LARAVEL_SHARED_HOSTING_PLAN.md)**.

For local development, use PHP 8.3+ and Composer with the example's SQLite database, then run `php artisan serve`. `npm start` is intentionally guarded on this branch so it cannot accidentally start the legacy Node application; npm is retained for the isolated PostgreSQL-to-Laravel transfer and validation tools.

## Current priority

Finish hardening the migration and then polish the storefront and admin experience on this Laravel/MySQL version. Commit the reviewed `composer.lock` so dependency versions are reproducible, continue regression testing, and keep the transfer verifier read-only. The current synthetic transfer tests are useful safeguards but do not prove a real data transfer.

The intended future hosting target is the STRATO **Standard** package. It has not been purchased, and there is no launch or cutover planned yet. Hosting-specific validation can wait until the local MySQL version is ready for that stage.

Laravel feature tests run in CI on PHP 8.3 and 8.4. Database schema and synthetic transfer checks run on MySQL 8.4 and MariaDB 10.11. These tests are not a substitute for a real staging transfer, hosting compatibility check, or production cutover review.
