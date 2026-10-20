# FLIGALIGA Laravel edition (development branch)

This is the isolated Laravel/PHP port of the custom FLIGALIGA Vault storefront. It is work in progress and is not production-ready.

## Safety / branch separation

- This work lives on \`feature/laravel-shared-hosting\`.
- \`main\` and \`backup/node-postgres-2026-10-20\` preserve the original Node.js/PostgreSQL app.
- \`mysql-migration\` remains a separate database migration experiment/reference.
- The PostgreSQL source database and its local backup are not modified by this application scaffold.
- Never commit a real \`.env\`, PostgreSQL dump, customer records or live payment/email credentials.

## Local setup

Requirements: PHP >= 8.3 and Laravel's documented PHP extensions; Composer; PDO MySQL for a STRATO-like database, or PDO SQLite for the isolated tests.

1. Copy \`.env.laravel.example\` to \`.env\`.
2. Install PHP dependencies with \`composer install\` (the first dependency resolution creates \`composer.lock\`; commit it after reviewing the resolved versions).
3. Run \`php artisan key:generate\`.
4. For a local sandbox only, use a disposable MySQL/MariaDB database and configure its credentials in \`.env\`. Do not use the existing PostgreSQL database as the Laravel target.
5. Run \`php artisan migrate\` only after confirming \`DB_DATABASE\` refers to a new disposable database.
6. Run \`php artisan test\`, then \`php artisan serve\` and visit \`http://127.0.0.1:8000\`.

The existing static Vault frontend assets remain in \`public/\`. This first milestone ports only the health endpoint and public product catalogue. Authentication, cart, admin, checkout, Mollie lifecycle, notifications and withdrawals must be ported and tested before the application is usable as a full webshop.

## STRATO deployment gates

Before purchase or deployment, confirm the exact package, PHP version/extensions, database engine/version, database limits, SSH/SFTP and Composer availability, document-root configuration and scheduled-task capability. Point the web document root at Laravel's \`public/\` directory; never expose the project root or \`.env\`. STRATO's newer shared-hosting platform may not provide cron jobs, so payment reservation cleanup requires an approved alternative.

## Tests and migration

Tests use SQLite in memory; the real target schema must also be tested against the exact MySQL/MariaDB version from the STRATO account. The current PostgreSQL database dump is a rollback asset; no cutover is authorized until route-level, payment, row-count, integrity and rollback tests pass.
