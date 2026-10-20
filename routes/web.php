<?php

use App\Http\Controllers\SitemapController;
use Illuminate\Support\Facades\Route;

// Serve the existing custom Vault front end, without changing its assets.
$storefront = static function () {
    $path = public_path('index.html');

    abort_unless(is_file($path) && is_readable($path), 503, 'Storefront unavailable');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache',
    ]);
};

Route::get('/sitemap.xml', SitemapController::class)->name('sitemap');
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
