<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        RateLimiter::for('api', fn (Request $request) =>
            Limit::perMinute(240)->by($request->ip() ?: 'unknown'));

        RateLimiter::for('login', fn (Request $request) =>
            Limit::perMinutes(15, 12)->by($request->ip() ?: 'unknown'));

        RateLimiter::for('register', fn (Request $request) =>
            Limit::perHour(8)->by($request->ip() ?: 'unknown'));

        RateLimiter::for('contact', fn (Request $request) =>
            Limit::perHour(5)->by($request->ip() ?: 'unknown'));

        RateLimiter::for('withdrawal', fn (Request $request) =>
            Limit::perHour(10)->by($request->ip() ?: 'unknown'));
    }
}
