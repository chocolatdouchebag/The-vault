<?php

use Illuminate\Support\Facades\Route;

// Read the frontend shell as a response body so Laravel's tests (and PHP's
// shared-hosting handler) can serve the same file as the Node.js edition.
$storefront = static function () {
    $path = public_path('index.html');

    abort_unless(is_file($path) && is_readable($path), 503, 'Storefront unavailable');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache',
    ]);
};

Route::get('/', $storefront);
Route::get('/product/{idOrSlug}', $storefront);

foreach ([
    'treasures',
    'new-arrivals',
    'ledger',
    'merchant',
    'faq',
    'contact',
    'shipping',
    'returns',
    'privacy',
    'terms',
    'withdrawal',
    'accessibility',
    'payment-result',
] as $page) {
    Route::get('/'.$page, $storefront);
}
