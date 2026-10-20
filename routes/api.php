<?php

use App\Http\Controllers\Api\AdminProductController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CartController;
use App\Http\Controllers\Api\CheckoutPlaceholderController;
use App\Http\Controllers\Api\ContactPlaceholderController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PublicConfigController;
use App\Http\Controllers\Api\WithdrawalController;
use Illuminate\Support\Facades\Route;

// The original frontend expects cookie-backed sessions on its /api endpoints.
// Keep the API prefix and response format, but explicitly add Laravel's web
// middleware so sessions and cookies work on shared hosting.
Route::middleware(['web', 'throttle:api'])->group(function (): void {
    Route::get('/health', HealthController::class)->name('api.health');
    Route::get('/public-config', PublicConfigController::class)->name('api.public-config');
    Route::get('/products', [ProductController::class, 'index'])->name('api.products.index');
    Route::get('/products/{idOrSlug}', [ProductController::class, 'show'])->name('api.products.show');

    Route::post('/register', [AuthController::class, 'register'])
        ->middleware(['same.origin', 'throttle:register'])
        ->name('api.register');
    Route::post('/login', [AuthController::class, 'login'])
        ->middleware(['same.origin', 'throttle:login'])
        ->name('api.login');
    Route::post('/logout', [AuthController::class, 'logout'])
        ->middleware('same.origin')
        ->name('api.logout');
    Route::get('/me', [AuthController::class, 'me'])->name('api.me');

    Route::get('/admin/products', [AdminProductController::class, 'index'])
        ->middleware('admin.required')
        ->name('api.admin.products.index');
    Route::post('/admin/product', [AdminProductController::class, 'store'])
        ->middleware(['same.origin', 'admin.required'])
        ->name('api.admin.products.store');
    Route::patch('/admin/product/{id}', [AdminProductController::class, 'update'])
        ->middleware(['same.origin', 'admin.required'])
        ->name('api.admin.products.update');
    Route::delete('/admin/product/{id}', [AdminProductController::class, 'destroy'])
        ->middleware(['same.origin', 'admin.required'])
        ->name('api.admin.products.destroy');

    Route::get('/cart', [CartController::class, 'index'])
        ->middleware('login.required')
        ->name('api.cart.index');
    Route::post('/cart', [CartController::class, 'store'])
        ->middleware(['same.origin', 'login.required'])
        ->name('api.cart.store');
    Route::post('/cart/update', [CartController::class, 'update'])
        ->middleware(['same.origin', 'login.required'])
        ->name('api.cart.update');
    Route::post('/cart/empty', [CartController::class, 'empty'])
        ->middleware(['same.origin', 'login.required'])
        ->name('api.cart.empty');

    Route::get('/orders/{id}', [OrderController::class, 'show'])
        ->middleware('login.required')
        ->name('api.orders.show');
    Route::get('/orders/{id}/items', [OrderController::class, 'items'])
        ->middleware('login.required')
        ->name('api.orders.items');
    Route::get('/admin/orders', [OrderController::class, 'adminIndex'])
        ->middleware('admin.required')
        ->name('api.admin.orders.index');

    // Intentionally disabled until payment setup and full lifecycle testing are approved.
    Route::post('/checkout', CheckoutPlaceholderController::class)
        ->middleware(['same.origin', 'login.required'])
        ->name('api.checkout');

    Route::post('/contact', ContactPlaceholderController::class)
        ->middleware(['same.origin', 'throttle:contact'])
        ->name('api.contact');

    // Withdrawal requests can be submitted without an account, using the email
    // associated with an optional order to validate ownership.
    Route::post('/withdrawal', [WithdrawalController::class, 'store'])
        ->middleware(['same.origin', 'throttle:withdrawal'])
        ->name('api.withdrawal.store');
    Route::get('/admin/withdrawals', [WithdrawalController::class, 'adminIndex'])
        ->middleware('admin.required')
        ->name('api.admin.withdrawals.index');
    Route::patch('/admin/withdrawals/{id}', [WithdrawalController::class, 'update'])
        ->middleware(['same.origin', 'admin.required'])
        ->name('api.admin.withdrawals.update');
});
