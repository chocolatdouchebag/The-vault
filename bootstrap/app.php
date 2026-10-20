<?php

use App\Http\Middleware\EnsureSameOrigin;
use App\Http\Middleware\RequireAdmin;
use App\Http\Middleware\RequireLogin;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(SecurityHeaders::class);
        $middleware->alias([
            'login.required' => RequireLogin::class,
            'admin.required' => RequireAdmin::class,
            'same.origin' => EnsureSameOrigin::class,
        ]);
        // Browser-side JavaScript keeps the existing same-origin protection
        // implemented by EnsureSameOrigin for mutating /api requests.
        $middleware->validateCsrfTokens(except: ['api/*']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
