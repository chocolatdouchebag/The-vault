"use strict";

console.error("This is the Laravel/PHP branch; the legacy Node.js server is intentionally disabled here.");
console.error("");
console.error("To run this branch locally, see LARAVEL_README.md and use:");
console.error("  composer install");
console.error("  cp .env.example .env");
console.error("  php artisan key:generate");
console.error("  touch database/database.sqlite");
console.error("  php artisan migrate");
console.error("  php artisan serve");
console.error("");
console.error("Keep your PostgreSQL recovery source and its private dump untouched.");
process.exitCode = 1;
