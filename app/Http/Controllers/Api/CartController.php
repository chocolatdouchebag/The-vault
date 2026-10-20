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
                ->where('cart.user_id', (int) $request->session()->get('userId'))
                ->orderByDesc('cart.id')
                ->get([
                    'cart.id',
                    'cart.product_id',
                    'cart.quantity',
                    'products.name',
                    'products.price',
                    'products.category',
                    'products.image_url',
                ]);

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

        $userId = (int) $request->session()->get('userId');

        try {
            $result = DB::transaction(function () use ($productId, $userId) {
                $product = DB::table('products')
                    ->where('id', $productId)
                    ->where('is_active', true)
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->first(['id', 'stock']);

                if (!$product) {
                    return response()->json(['error' => 'Treasure not found'], 404);
                }

                $stock = (int) $product->stock;
                if ($stock < 1) {
                    return response()->json(['error' => 'This treasure is currently out of stock'], 409);
                }

                $item = DB::table('cart')
                    ->where('user_id', $userId)
                    ->where('product_id', $productId)
                    ->lockForUpdate()
                    ->first(['id', 'quantity']);

                if (!$item) {
                    DB::table('cart')->insert([
                        'user_id' => $userId,
                        'product_id' => $productId,
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
                $item = DB::table('cart')
                    ->join('products', 'cart.product_id', '=', 'products.id')
                    ->where('cart.id', $cartId)
                    ->where('cart.user_id', $userId)
                    ->where('products.is_active', true)
                    ->where('products.status', 'active')
                    ->lockForUpdate()
                    ->first(['cart.id', 'products.stock']);

                if (!$item) {
                    return response()->json(['error' => 'Cart item not found'], 404);
                }

                if ($quantity <= 0) {
                    DB::table('cart')
                        ->where('id', $cartId)
                        ->where('user_id', $userId)
                        ->delete();

                    return null;
                }

                if ($quantity > (int) $item->stock) {
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
