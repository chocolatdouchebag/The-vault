<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class AdminProductImageController extends Controller
{
    public function index(string $productId): JsonResponse
    {
        $id = $this->positiveId($productId);
        if ($id === null) {
            return response()->json(['error' => 'Invalid product'], 400);
        }

        try {
            if (!DB::table('products')->where('id', $id)->exists()) {
                return response()->json(['error' => 'Treasure not found'], 404);
            }

            $images = DB::table('product_images')
                ->where('product_id', $id)
                ->orderByDesc('is_primary')
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get([
                    'id',
                    'product_id',
                    'image_url',
                    'alt_text',
                    'sort_order',
                    'is_primary',
                    'created_at',
                ])
                ->map(function (object $image): object {
                    $image->is_primary = (bool) $image->is_primary;
                    $image->sort_order = (int) $image->sort_order;
                    return $image;
                });

            return response()->json($images)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not load product images'], 500);
        }
    }

    public function store(Request $request, string $productId): JsonResponse
    {
        $id = $this->positiveId($productId);
        if ($id === null) {
            return response()->json(['error' => 'Invalid product'], 400);
        }

        $imageUrl = trim((string) $request->input('image_url', ''));
        if (!$this->isAllowedImageUrl($imageUrl)) {
            return response()->json(['error' => 'Enter a valid HTTP(S) or root-relative image URL'], 400);
        }

        $altText = trim((string) $request->input('alt_text', ''));
        if (mb_strlen($altText) > 500) {
            return response()->json(['error' => 'Image alt text is too long'], 400);
        }

        $rawSortOrder = $request->input('sort_order');
        $sortOrder = null;
        if ($rawSortOrder !== null && $rawSortOrder !== '') {
            $sortOrder = filter_var($rawSortOrder, FILTER_VALIDATE_INT);
            if ($sortOrder === false || $sortOrder < 0 || $sortOrder > 2147483647) {
                return response()->json(['error' => 'Enter a valid image sort order'], 400);
            }
        }

        $primary = filter_var(
            $request->input('is_primary', false),
            FILTER_VALIDATE_BOOLEAN,
            FILTER_NULL_ON_FAILURE
        );
        if ($primary === null) {
            return response()->json(['error' => 'Invalid primary-image value'], 400);
        }

        try {
            $imageId = DB::transaction(function () use ($id, $imageUrl, $altText, $sortOrder, $primary) {
                // Lock the product row so concurrent changes to its primary image serialize.
                $product = DB::table('products')
                    ->where('id', $id)
                    ->lockForUpdate()
                    ->first(['id']);

                if (!$product) {
                    return null;
                }

                if ($primary) {
                    $this->clearPrimary($id);
                }

                $nextSortOrder = $sortOrder;
                if ($nextSortOrder === null) {
                    $nextSortOrder = (int) (DB::table('product_images')
                        ->where('product_id', $id)
                        ->max('sort_order') ?? -1) + 1;
                }

                return DB::table('product_images')->insertGetId([
                    'product_id' => $id,
                    'image_url' => $imageUrl,
                    'alt_text' => $altText !== '' ? $altText : null,
                    'sort_order' => $nextSortOrder,
                    'is_primary' => $primary,
                    'primary_slot' => $primary ? 1 : null,
                    'created_at' => now(),
                ]);
            });

            if ($imageId === null) {
                return response()->json(['error' => 'Treasure not found'], 404);
            }

            return response()->json([
                'success' => true,
                'image' => $this->findImage($id, (int) $imageId),
            ], 201)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not add product image'], 500);
        }
    }

    public function setPrimary(string $productId, string $imageId): JsonResponse
    {
        $id = $this->positiveId($productId);
        $photoId = $this->positiveId($imageId);
        if ($id === null || $photoId === null) {
            return response()->json(['error' => 'Invalid product image'], 400);
        }

        try {
            $found = DB::transaction(function () use ($id, $photoId) {
                $product = DB::table('products')
                    ->where('id', $id)
                    ->lockForUpdate()
                    ->first(['id']);

                if (!$product) {
                    return false;
                }

                $image = DB::table('product_images')
                    ->where('product_id', $id)
                    ->where('id', $photoId)
                    ->lockForUpdate()
                    ->first(['id']);

                if (!$image) {
                    return false;
                }

                $this->clearPrimary($id);
                DB::table('product_images')
                    ->where('product_id', $id)
                    ->where('id', $photoId)
                    ->update([
                        'is_primary' => true,
                        'primary_slot' => 1,
                    ]);

                return true;
            });

            if (!$found) {
                return response()->json(['error' => 'Product image not found'], 404);
            }

            return response()->json([
                'success' => true,
                'image' => $this->findImage($id, $photoId),
            ])->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not set primary product image'], 500);
        }
    }

    public function destroy(string $productId, string $imageId): JsonResponse
    {
        $id = $this->positiveId($productId);
        $photoId = $this->positiveId($imageId);
        if ($id === null || $photoId === null) {
            return response()->json(['error' => 'Invalid product image'], 400);
        }

        try {
            $deleted = DB::transaction(function () use ($id, $photoId) {
                $product = DB::table('products')
                    ->where('id', $id)
                    ->lockForUpdate()
                    ->first(['id']);

                if (!$product) {
                    return false;
                }

                $image = DB::table('product_images')
                    ->where('product_id', $id)
                    ->where('id', $photoId)
                    ->lockForUpdate()
                    ->first(['id', 'is_primary']);

                if (!$image) {
                    return false;
                }

                DB::table('product_images')
                    ->where('product_id', $id)
                    ->where('id', $photoId)
                    ->delete();

                if ($image->is_primary) {
                    $next = DB::table('product_images')
                        ->where('product_id', $id)
                        ->orderBy('sort_order')
                        ->orderBy('id')
                        ->first(['id']);

                    $this->clearPrimary($id);
                    if ($next) {
                        DB::table('product_images')
                            ->where('product_id', $id)
                            ->where('id', $next->id)
                            ->update([
                                'is_primary' => true,
                                'primary_slot' => 1,
                            ]);
                    }
                }

                return true;
            });

            if (!$deleted) {
                return response()->json(['error' => 'Product image not found'], 404);
            }

            return response()->json(['success' => true])->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not delete product image'], 500);
        }
    }

    private function clearPrimary(int $productId): void
    {
        DB::table('product_images')
            ->where('product_id', $productId)
            ->update([
                'is_primary' => false,
                'primary_slot' => null,
            ]);
    }

    private function findImage(int $productId, int $imageId): ?object
    {
        $image = DB::table('product_images')
            ->where('product_id', $productId)
            ->where('id', $imageId)
            ->first([
                'id',
                'product_id',
                'image_url',
                'alt_text',
                'sort_order',
                'is_primary',
                'created_at',
            ]);

        if ($image) {
            $image->is_primary = (bool) $image->is_primary;
            $image->sort_order = (int) $image->sort_order;
        }

        return $image;
    }

    private function positiveId(string $value): ?int
    {
        if (!ctype_digit($value)) {
            return null;
        }

        $id = filter_var($value, FILTER_VALIDATE_INT);
        return $id !== false && $id > 0 ? $id : null;
    }

    private function isAllowedImageUrl(string $url): bool
    {
        if ($url === '' || mb_strlen($url) > 1000 || preg_match('/[\x00-\x1F\x7F\\\\]/', $url)) {
            return false;
        }

        if (str_starts_with($url, '/') && !str_starts_with($url, '//')) {
            return true;
        }

        $parts = parse_url($url);
        if (!is_array($parts) || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)) {
            return false;
        }

        return !empty($parts['host'])
            && !isset($parts['user'])
            && filter_var($url, FILTER_VALIDATE_URL) !== false;
    }
}
