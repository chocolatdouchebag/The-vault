<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSameOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        $expectedOrigin = $request->getSchemeAndHttpHost();
        $configuredUrl = trim((string) config('app.url'));
        $configuredOrigin = parse_url($configuredUrl, PHP_URL_SCHEME)
            && parse_url($configuredUrl, PHP_URL_HOST)
            ? strtolower((string) parse_url($configuredUrl, PHP_URL_SCHEME).'://'.(string) parse_url($configuredUrl, PHP_URL_HOST)
                .(parse_url($configuredUrl, PHP_URL_PORT) ? ':'.parse_url($configuredUrl, PHP_URL_PORT) : ''))
            : null;

        $allowed = array_filter([
            strtolower($expectedOrigin),
            $configuredOrigin,
        ]);

        $origin = $request->headers->get('Origin');
        if ($origin && !in_array(strtolower($origin), $allowed, true)) {
            return response()->json(['error' => 'Cross-site request blocked'], 403);
        }

        $referer = $request->headers->get('Referer');
        if (!$origin && $referer) {
            $refererOrigin = parse_url($referer, PHP_URL_SCHEME) && parse_url($referer, PHP_URL_HOST)
                ? strtolower((string) parse_url($referer, PHP_URL_SCHEME).'://'.(string) parse_url($referer, PHP_URL_HOST)
                    .(parse_url($referer, PHP_URL_PORT) ? ':'.parse_url($referer, PHP_URL_PORT) : ''))
                : null;

            if (!$refererOrigin || !in_array($refererOrigin, $allowed, true)) {
                return response()->json(['error' => 'Cross-site request blocked'], 403);
            }
        }

        return $next($request);
    }
}
