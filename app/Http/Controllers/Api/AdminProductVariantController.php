<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\QueryException;
use Throwable;

class AdminProductVariantController extends Controller
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

            $variants = DB::table('product_variants')
                ->where('product_id', $id)
                ->orderBy('id')
                ->get([
                    'id',
                    'product_id',
                    'sku',
                    'name',
                    'price',
                    'stock',
                    'attributes',
                    'is_active',
                    'created_at',
                    'updated_at',
                ])
                ->map(fn (object $variant): object => $this->normalize($variant));

            return response()->json($variants)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not load product variants'], 500);
        }
    }

    public function store(Request $request, string $productId): JsonResponse
    {
        $id = $this->positiveId($productId);
        if ($id === null) {
            return response()->json(['error' => 'Invalid product'], 400);
        }

        try {
            if (!DB::table('products')->where('id', $id)->exists()) {
                return response()->json(['error' => 'Treasure not found'], 404);
            }

            $payload = $this->validatedPayload($request);
            if ($payload instanceof JsonResponse) {
                return $payload;
            }

            if ($this->skuInUse($payload['sku'])) {
                return response()->json(['error' => 'This SKU is already in use'], 409);
            }

            $now = now();
            $variantId = DB::table('product_variants')->insertGetId(array_merge($payload, [
                'product_id' => $id,
                'created_at' => $now,
                'updated_at' => $now,
            ]));

            return response()->json([
                'success' => true,
                'variant' => $this->findVariant($id, (int) $variantId),
            ], 201)->header('Cache-Control', 'no-store');
        } catch (QueryException $exception) {
            if (isset($payload['sku']) && $this->skuInUse($payload['sku'])) {
                return response()->json(['error' => 'This SKU is already in use'], 409);
            }

            report($exception);
            return response()->json(['error' => 'Could not add product variant'], 500);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['error' => 'Could not add product variant'], 500);
        }
    }

    public function update(Request $request, string $productId, string $variantId): JsonResponse
    {
        $id = $this->positiveId($productId);
        $variantKey = $this->positiveId($variantId);
        if ($id === null || $variantKey === null) {
            return response()->json(['error' => 'Invalid product variant'], 400);
        }

        try {
            $existing = DB::table('product_variants')
                ->where('product_id', $id)
                ->where('id', $variantKey)
                ->first();

            if (!$existing) {
                return response()->json(['error' => 'Product variant not found'], 404);
            }

            $payload = $this->validatedPayload($request, $existing);
            if ($payload instanceof JsonResponse) {
                return $payload;
            }

            if ($this->skuInUse($payload['sku'], $variantKey)) {
                return response()->json(['error' => 'This SKU is already in use'], 409);
            }

            DB::table('product_variants')
                ->where('product_id', $id)
                ->where('id', $variantKey)
                ->update(array_merge($payload, ['updated_at' => now()]));

            return response()->json([
                'success' => true,
                'variant' => $this->findVariant($id, $variantKey),
            ])->header('Cache-Control', 'no-store');
        } catch (QueryException $exception) {
            if (isset($payload['sku']) && $this->skuInUse($payload['sku'], $variantKey)) {
                return response()->json(['error' => 'This SKU is already in use'], 409);
            }

            report($exception);
            return response()->json(['error' => 'Could not update product variant'], 500);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['error' => 'Could not update product variant'], 500);
        }
    }

    public function destroy(string $productId, string $variantId): JsonResponse
    {
        $id = $this->positiveId($productId);
        $variantKey = $this->positiveId($variantId);
        if ($id === null || $variantKey === null) {
            return response()->json(['error' => 'Invalid product variant'], 400);
        }

        try {
            $updated = DB::table('product_variants')
                ->where('product_id', $id)
                ->where('id', $variantKey)
                ->update([
                    'is_active' => false,
                    'updated_at' => now(),
                ]);

            if ($updated === 0) {
                $exists = DB::table('product_variants')
                    ->where('product_id', $id)
                    ->where('id', $variantKey)
                    ->exists();

                if (!$exists) {
                    return response()->json(['error' => 'Product variant not found'], 404);
                }
            }

            return response()->json(['success' => true])->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not disable product variant'], 500);
        }
    }

    private function validatedPayload(Request $request, ?object $existing = null): array|JsonResponse
    {
        $rawName = $request->exists('name') ? $request->input('name') : ($existing->name ?? '');
        if (!is_string($rawName) && !is_numeric($rawName)) {
            return response()->json(['error' => 'Enter a valid variant name'], 400);
        }
        $name = trim((string) $rawName);
        if ($name === '' || mb_strlen($name) > 255) {
            return response()->json(['error' => 'Enter a valid variant name'], 400);
        }

        $rawSku = $request->exists('sku') ? $request->input('sku') : ($existing->sku ?? null);
        if ($rawSku !== null && !is_string($rawSku) && !is_numeric($rawSku)) {
            return response()->json(['error' => 'Enter a valid variant SKU'], 400);
        }
        $sku = $rawSku === null ? null : trim((string) $rawSku);
        $sku = $sku === '' ? null : $sku;
        if ($sku !== null && mb_strlen($sku) > 255) {
            return response()->json(['error' => 'Variant SKU is too long'], 400);
        }

        $rawPrice = $request->exists('price') ? $request->input('price') : ($existing->price ?? null);
        if ((!is_string($rawPrice) && !is_int($rawPrice) && !is_float($rawPrice))
            || !preg_match('/^\d{1,10}(?:\.\d{1,2})?$/', trim((string) $rawPrice))) {
            return response()->json(['error' => 'Enter a variant price with up to 2 decimal places'], 400);
        }
        $priceParts = explode('.', trim((string) $rawPrice), 2);
        $integerPart = ltrim($priceParts[0], '0');
        $integerPart = $integerPart === '' ? '0' : $integerPart;
        $fractionPart = str_pad($priceParts[1] ?? '', 2, '0');
        $price = $integerPart.'.'.$fractionPart;

        $rawStock = $request->exists('stock') ? $request->input('stock') : ($existing->stock ?? null);
        $stock = filter_var($rawStock, FILTER_VALIDATE_INT);
        if ($stock === false || $stock < 0 || $stock > 2147483647) {
            return response()->json(['error' => 'Enter a valid variant stock quantity'], 400);
        }

        if ($request->exists('attributes')) {
            $attributes = $request->input('attributes');
        } elseif ($existing !== null) {
            $sourceAttributes = $existing->attributes ?? '{}';
            $attributes = is_string($sourceAttributes)
                ? json_decode($sourceAttributes, true)
                : (array) $sourceAttributes;
        } else {
            $attributes = [];
        }

        if (!is_array($attributes) || ($attributes !== [] && array_is_list($attributes))) {
            return response()->json(['error' => 'Variant attributes must be a JSON object'], 400);
        }

        try {
            $attributesJson = json_encode((object) $attributes, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return response()->json(['error' => 'Variant attributes must be valid JSON data'], 400);
        }
        if (strlen($attributesJson) > 10000) {
            return response()->json(['error' => 'Variant attributes are too large'], 400);
        }

        $rawActive = $request->exists('is_active')
            ? $request->input('is_active')
            : ($existing->is_active ?? true);
        $active = filter_var($rawActive, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($active === null) {
            return response()->json(['error' => 'Invalid active state for variant'], 400);
        }

        return [
            'sku' => $sku,
            'name' => $name,
            'price' => $price,
            'stock' => $stock,
            'attributes' => $attributesJson,
            'is_active' => $active,
        ];
    }

    private function skuInUse(?string $sku, ?int $exceptVariantId = null): bool
    {
        if ($sku === null) {
            return false;
        }

        $query = DB::table('product_variants')->where('sku', $sku);
        if ($exceptVariantId !== null) {
            $query->where('id', '<>', $exceptVariantId);
        }

        return $query->exists();
    }

    private function findVariant(int $productId, int $variantId): ?object
    {
        $variant = DB::table('product_variants')
            ->where('product_id', $productId)
            ->where('id', $variantId)
            ->first([
                'id',
                'product_id',
                'sku',
                'name',
                'price',
                'stock',
                'attributes',
                'is_active',
                'created_at',
                'updated_at',
            ]);

        return $variant ? $this->normalize($variant) : null;
    }

    private function normalize(object $variant): object
    {
        $decoded = json_decode((string) ($variant->attributes ?? '{}'));
        $variant->attributes = $decoded instanceof \stdClass ? $decoded : new \stdClass();
        $variant->id = (int) $variant->id;
        $variant->product_id = (int) $variant->product_id;
        $variant->stock = (int) $variant->stock;
        $variant->is_active = (bool) $variant->is_active;

        return $variant;
    }

    private function positiveId(string $value): ?int
    {
        if (!ctype_digit($value)) {
            return null;
        }

        $id = filter_var($value, FILTER_VALIDATE_INT);
        return $id !== false && $id > 0 ? $id : null;
    }
}
