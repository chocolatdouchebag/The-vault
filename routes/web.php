<?php

use Illuminate\Support\Facades\Route;

$storefront = static fn () => response()->file(public_path('index.html'));

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
