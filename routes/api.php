<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\ProductController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class)->name('api.health');
Route::get('/products', [ProductController::class, 'index'])->name('api.products.index');
Route::get('/products/{idOrSlug}', [ProductController::class, 'show'])->name('api.products.show');
