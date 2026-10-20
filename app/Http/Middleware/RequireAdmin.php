<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class RequireAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $userId = $request->session()->get('userId');
        $expiresAt = (int) $request->session()->get('authExpiresAt', 0);

        if (!$userId || ($expiresAt > 0 && now()->timestamp >= $expiresAt)) {
            $request->session()->forget(['userId', 'isAdmin', 'user', 'authExpiresAt']);

            return response()->json(['error' => 'Login required'], 401);
        }

        try {
            $isAdmin = DB::table('users')->where('id', $userId)->value('is_admin');

            if (!$isAdmin) {
                return response()->json(['error' => 'Admin only'], 403);
            }

            $request->session()->put('isAdmin', true);

            return $next($request);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Admin check failed'], 500);
        }
    }
}
