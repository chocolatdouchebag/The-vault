<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Throwable;

class SitemapController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $configuredBaseUrl = trim((string) config('services.fligaliga.public_url'));
        $baseUrl = rtrim($configuredBaseUrl ?: $request->getSchemeAndHttpHost(), '/');

        $paths = [
            '/',
            '/treasures',
            '/new-arrivals',
            '/ledger',
            '/merchant',
            '/faq',
            '/contact',
            '/shipping',
            '/returns',
            '/privacy',
            '/terms',
            '/withdrawal',
            '/accessibility',
            '/withdrawal-form.html',
        ];

        try {
            $products = Product::query()
                ->where('is_active', true)
                ->where('status', 'active')
                ->get(['id', 'name']);

            foreach ($products as $product) {
                $slug = Str::slug((string) $product->name);
                if ($slug !== '') {
                    $paths[] = '/product/'.$slug.'-'.$product->id;
                }
            }
        } catch (Throwable $exception) {
            report($exception);

            return response('Sitemap unavailable', 500)
                ->header('Content-Type', 'text/plain; charset=UTF-8');
        }

        $urls = array_map(
            static fn (string $path): string => htmlspecialchars(
                $baseUrl.$path,
                ENT_XML1 | ENT_QUOTES,
                'UTF-8'
            ),
            $paths
        );

        $body = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            .implode('', array_map(
                static fn (string $url): string => '<url><loc>'.$url.'</loc></url>',
                $urls
            ))
            .'</urlset>';

        return response($body, 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=600',
        ]);
    }
}
