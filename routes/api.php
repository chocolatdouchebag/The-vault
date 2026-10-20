<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\ProductController;
use Illuminate\Support\Facades\Route;

// The original frontend expects cookie-backed sessions on its /api endpoints.
// Keep the API prefix and response format, but explicitly add Laravel's web
// middleware so sessions and cookies work on shared hosting.
Route::middleware(['web', 'throttle:api'])->group(function (): void {
    Route::get('/health', HealthController::class)->name('api.health');
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
});
