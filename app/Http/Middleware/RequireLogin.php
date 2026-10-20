<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireLogin
{
    public function handle(Request $request, Closure $next): Response
    {
        $userId = $request->session()->get('userId');
        $expiresAt = (int) $request->session()->get('authExpiresAt', 0);

        if (!$userId || ($expiresAt > 0 && now()->timestamp >= $expiresAt)) {
            $request->session()->forget(['userId', 'isAdmin', 'user', 'authExpiresAt']);

            return response()->json(['error' => 'Login required'], 401);
        }

        return $next($request);
    }
}
