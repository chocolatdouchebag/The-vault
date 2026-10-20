<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Throwable;

class CartController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        try {
            $items = DB::table('cart')
                ->join('products', 'cart.product_id', '=', 'products.id')
                ->leftJoin('product_variants', 'cart.variant_id', '=', 'product_variants.id')
                ->where('cart.user_id', (int) $request->session()->get('userId'))
                ->orderByDesc('cart.id')
                ->get([
                    'cart.id',
                    'cart.product_id',
                    'cart.variant_id',
                    'cart.quantity',
                    'products.name',
                    DB::raw('COALESCE(product_variants.price, products.price) AS price'),
                    'products.category',
                    'products.image_url',
                    'product_variants.name AS variant_name',
                    'product_variants.attributes AS variant_attributes',
                    'product_variants.is_active AS variant_is_active',
                    DB::raw('CASE WHEN cart.variant_id IS NULL THEN products.stock ELSE COALESCE(product_variants.stock, 0) END AS stock'),
                ])
                ->map(function (object $item): object {
                    $item->id = (int) $item->id;
                    $item->product_id = (int) $item->product_id;
                    $item->variant_id = $item->variant_id === null ? null : (int) $item->variant_id;
                    $item->quantity = (int) $item->quantity;
                    $item->stock = (int) $item->stock;
                    if ($item->variant_is_active !== null) {
                        $item->variant_is_active = (bool) $item->variant_is_active;
                        $decoded = json_decode((string) ($item->variant_attributes ?? '{}'));
                        $item->variant_attributes = $decoded instanceof \stdClass ? $decoded : new \stdClass();
                    }

                    return $item;
                });

            return response()->json($items)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not load cart'], 500);
        }
    }

    public function store(Request $request): JsonResponse|Response
    {
        $productId = filter_var($request->input('product_id'), FILTER_VALIDATE_INT);
        if ($productId === false || $productId < 1) {
            return response()->json(['error' => 'Invalid product'], 400);
        }

        $rawVariantId = $request->input('variant_id');
        $variantId = null;
        if ($rawVariantId !== null && $rawVariantId !== '') {
            $variantId = filter_var($rawVariantId, FILTER_VALIDATE_INT);
            if ($variantId === false || $variantId < 1) {
                return response()->json(['error' => 'Invalid product option'], 400);
            }
        }

        $userId = (int) $request->session()->get('userId');

        try {
            $result = DB::transaction(function () use ($productId, $variantId, $userId) {
                $product = DB::table('products')
                    ->where('id', $productId)
                    ->where('is_active', true)
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->first(['id', 'stock']);

                if (!$product) {
                    return response()->json(['error' => 'Treasure not found'], 404);
                }

                $hasVariants = DB::table('product_variants')
                    ->where('product_id', $productId)
                    ->exists();

                if ($variantId === null && $hasVariants) {
                    return response()->json(['error' => 'Select a product option before adding it to cart'], 400);
                }

                if ($variantId !== null) {
                    $variant = DB::table('product_variants')
                        ->where('id', $variantId)
                        ->where('product_id', $productId)
                        ->where('is_active', true)
                        ->lockForUpdate()
                        ->first(['id', 'stock']);

                    if (!$variant) {
                        return response()->json(['error' => 'Selected product option is not available'], 404);
                    }

                    $stock = (int) $variant->stock;
                    $outOfStockMessage = 'This option is currently out of stock';
                } else {
                    $stock = (int) $product->stock;
                    $outOfStockMessage = 'This treasure is currently out of stock';
                }

                if ($stock < 1) {
                    return response()->json(['error' => $outOfStockMessage], 409);
                }

                $itemQuery = DB::table('cart')
                    ->where('user_id', $userId)
                    ->where('product_id', $productId);
                if ($variantId === null) {
                    $itemQuery->whereNull('variant_id');
                } else {
                    $itemQuery->where('variant_id', $variantId);
                }
                $item = $itemQuery->lockForUpdate()->first(['id', 'quantity']);

                if (!$item) {
                    DB::table('cart')->insert([
                        'user_id' => $userId,
                        'product_id' => $productId,
                        'variant_id' => $variantId,
                        'quantity' => 1,
                    ]);

                    return null;
                }

                if ((int) $item->quantity >= $stock) {
                    return response()->json(['error' => 'You cannot add more than the available stock'], 409);
                }

                DB::table('cart')
                    ->where('id', $item->id)
                    ->where('user_id', $userId)
                    ->update(['quantity' => (int) $item->quantity + 1]);

                return null;
            });

            return $result instanceof JsonResponse ? $result : response('', 200);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not add to cart'], 500);
        }
    }

    public function update(Request $request): JsonResponse|Response
    {
        $cartId = filter_var($request->input('id'), FILTER_VALIDATE_INT);
        $quantity = filter_var($request->input('quantity'), FILTER_VALIDATE_INT);

        if ($cartId === false || $cartId < 1 || $quantity === false) {
            return response()->json(['error' => 'Invalid cart update'], 400);
        }

        $userId = (int) $request->session()->get('userId');

        try {
            $result = DB::transaction(function () use ($cartId, $quantity, $userId) {
                $cartRow = DB::table('cart')
                    ->where('id', $cartId)
                    ->where('user_id', $userId)
                    ->lockForUpdate()
                    ->first(['id', 'product_id', 'variant_id']);

                if (!$cartRow) {
                    return response()->json(['error' => 'Cart item not found'], 404);
                }

                if ($quantity <= 0) {
                    DB::table('cart')
                        ->where('id', $cartId)
                        ->where('user_id', $userId)
                        ->delete();

                    return null;
                }

                $product = DB::table('products')
                    ->where('id', $cartRow->product_id)
                    ->where('is_active', true)
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->first(['id', 'stock']);

                if (!$product) {
                    return response()->json(['error' => 'Cart product is no longer available'], 409);
                }

                if ($cartRow->variant_id !== null) {
                    $variant = DB::table('product_variants')
                        ->where('id', $cartRow->variant_id)
                        ->where('product_id', $cartRow->product_id)
                        ->where('is_active', true)
                        ->lockForUpdate()
                        ->first(['id', 'stock']);

                    if (!$variant) {
                        return response()->json(['error' => 'Cart option is no longer available'], 409);
                    }

                    $stock = (int) $variant->stock;
                } else {
                    $hasVariants = DB::table('product_variants')
                        ->where('product_id', $cartRow->product_id)
                        ->exists();

                    if ($hasVariants) {
                        return response()->json(['error' => 'Select a product option before updating this cart item'], 409);
                    }

                    $stock = (int) $product->stock;
                }

                if ($quantity > $stock) {
                    return response()->json(['error' => 'Requested quantity exceeds available stock'], 409);
                }

                DB::table('cart')
                    ->where('id', $cartId)
                    ->where('user_id', $userId)
                    ->update(['quantity' => $quantity]);

                return null;
            });

            return $result instanceof JsonResponse ? $result : response('', 200);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not update cart'], 500);
        }
    }

    public function empty(Request $request): Response|JsonResponse
    {
        try {
            DB::table('cart')
                ->where('user_id', (int) $request->session()->get('userId'))
                ->delete();

            return response('', 200);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not empty cart'], 500);
        }
    }
}
