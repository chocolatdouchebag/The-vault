<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Database\Eloquent\Builder;
use Throwable;

class ProductController extends Controller
{
    private function publicProducts(bool $withImages = false): Builder
    {
        $query = Product::query()
            ->where('is_active', true)
            ->where('status', 'active');

        if ($withImages) {
            // Only expose public image fields, not the database-only primary_slot.
            $query->with('images:id,product_id,image_url,alt_text,sort_order,is_primary,created_at');
        }

        return $query;
    }

    public function index(): JsonResponse
    {
        try {
            $products = $this->publicProducts()
                ->orderByDesc('is_featured')
                ->orderByDesc('is_new_arrival')
                ->orderByDesc('id')
                ->get();

            return response()
                ->json($products)
                ->header('Cache-Control', 'public, no-cache, stale-while-revalidate=30');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'error' => 'Catalogue temporarily unavailable',
            ], 503);
        }
    }

    public function show(string $idOrSlug): JsonResponse
    {
        try {
            $key = strtolower(trim($idOrSlug));
            $product = null;

            if (ctype_digit($key)) {
                $product = $this->publicProducts(true)->whereKey((int) $key)->first();
            } else {
                if (preg_match('/(?:^|-)(\d+)$/', $key, $matches) === 1) {
                    $product = $this->publicProducts(true)->whereKey((int) $matches[1])->first();
                }

                if (!$product) {
                    $product = $this->publicProducts(true)
                        ->get()
                        ->first(fn (Product $candidate) => strtolower($candidate->slug) === $key);
                }
            }

            if (!$product) {
                return response()->json(['error' => 'Treasure not found'], 404);
            }

            return response()
                ->json($product)
                ->header('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'error' => 'Treasure temporarily unavailable',
            ], 503);
        }
    }
}
