<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class OrderController extends Controller
{
    public function show(Request $request, string $id): JsonResponse
    {
        if (!ctype_digit($id) || (int) $id < 1) {
            return response()->json(['error' => 'Invalid order number'], 400);
        }

        try {
            $order = DB::table('orders')
                ->where('id', (int) $id)
                ->where('user_id', (int) $request->session()->get('userId'))
                ->first([
                    'id',
                    'total',
                    'status',
                    'created_at',
                    'customer_name',
                    'customer_email',
                ]);

            if (!$order) {
                return response()->json(['error' => 'Order not found'], 404);
            }

            return response()->json($order)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not load order'], 500);
        }
    }

    public function items(Request $request, string $id): JsonResponse
    {
        if (!ctype_digit($id) || (int) $id < 1) {
            return response()->json(['error' => 'Invalid order number'], 400);
        }

        try {
            $items = DB::table('order_items')
                ->join('orders', 'orders.id', '=', 'order_items.order_id')
                ->join('products', 'products.id', '=', 'order_items.product_id')
                ->where('order_items.order_id', (int) $id)
                ->where('orders.user_id', (int) $request->session()->get('userId'))
                ->orderBy('order_items.product_id')
                ->get([
                    'order_items.product_id',
                    'order_items.quantity',
                    'order_items.price',
                    'products.name',
                    'products.category',
                ]);

            return response()->json($items)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not load order items'], 500);
        }
    }

    public function adminIndex(): JsonResponse
    {
        try {
            $orders = DB::table('orders')
                ->join('users', 'users.id', '=', 'orders.user_id')
                ->orderByDesc('orders.id')
                ->get([
                    'orders.id',
                    'orders.user_id',
                    'orders.total',
                    'orders.status',
                    'orders.created_at',
                    'orders.customer_name',
                    'orders.customer_email',
                    'orders.shipping_address_line1',
                    'orders.shipping_postcode',
                    'orders.shipping_city',
                    'orders.shipping_country',
                    'users.username',
                ]);

            $items = DB::table('order_items')
                ->join('products', 'products.id', '=', 'order_items.product_id')
                ->get([
                    'order_items.order_id',
                    'products.name',
                    'order_items.quantity',
                    'order_items.price',
                ]);

            $itemsByOrder = [];
            foreach ($items as $item) {
                $itemsByOrder[(string) $item->order_id][] = [
                    'name' => $item->name,
                    'quantity' => $item->quantity,
                    'price' => $item->price,
                ];
            }

            $response = [];
            foreach ($orders as $order) {
                $record = (array) $order;
                $record['items'] = $itemsByOrder[(string) $order->id] ?? [];
                $response[] = $record;
            }

            return response()->json($response)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Failed to load orders'], 500);
        }
    }
}
