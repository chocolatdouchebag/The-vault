<?php

namespace App\\Http\\Controllers\\Api;

use App\\Http\\Controllers\\Controller;
use App\\Models\\Product;
use Illuminate\\Http\\JsonResponse;
use Illuminate\\Http\\Request;
use Throwable;

class AdminProductController extends Controller
{
    private const CATEGORIES = ['Artifacts', 'Collectibles', 'Oddities', 'Mystery Boxes'];
    private const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];

    public function index(): JsonResponse
    {
        try {
            return response()->json(Product::query()->orderByDesc('id')->get())
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Failed to load products'], 500);
        }
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $this->validatedPayload($request);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        try {
            $product = Product::query()->create($payload);

            return response()->json(['success' => true, 'id' => $product->id], 201);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Failed to add product'], 500);
        }
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (!ctype_digit($id) || (int) $id < 1) {
            return response()->json(['error' => 'Invalid product'], 400);
        }

        $payload = $this->validatedPayload($request);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        try {
            $product = Product::query()->find((int) $id);
            if (!$product) {
                return response()->json(['error' => 'Treasure not found'], 404);
            }

            $product->fill($payload);
            $product->save();

            return response()->json(['success' => true, 'product' => $product->fresh()], 200);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Failed to update product'], 500);
        }
    }

    public function destroy(string $id): JsonResponse|\\Illuminate\\Http\\Response
    {
        if (!ctype_digit($id) || (int) $id < 1) {
            return response()->json(['error' => 'Invalid product'], 400);
        }

        try {
            $product = Product::query()->find((int) $id);
            if (!$product) {
                return response()->json(['error' => 'Treasure not found'], 404);
            }

            // Keep historical orders and references intact: removal from the public
            // catalogue is a soft-disable rather than a destructive delete.
            $product->is_active = false;
            $product->save();

            return response('', 200);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Failed to remove product from the catalogue'], 500);
        }
    }

    /**
     * Match the existing admin form's validation and JSON error messages.
     *
     * @return array<string, mixed>|JsonResponse
     */
    private function validatedPayload(Request $request): array|JsonResponse
    {
        $name = trim((string) $request->input('name', ''));
        $description = trim((string) $request->input('description', ''));
        $image = trim((string) $request->input('image_url', ''));
        $category = trim((string) $request->input('category', ''));
        $rarity = trim((string) $request->input('rarity', ''));
        $origin = trim((string) $request->input('origin', ''));
        $condition = trim((string) $request->input('condition', ''));
        $provenance = trim((string) $request->input('provenance', ''));
        $rawPrice = $request->input('price');
        $rawStock = $request->input('stock');

        $price = is_numeric($rawPrice) ? (float) $rawPrice : NAN;
        $stock = filter_var($rawStock, FILTER_VALIDATE_INT);

        if ($name === '' || mb_strlen($name) > 160) {
            return response()->json(['error' => 'Enter a valid treasure name'], 400);
        }
        if (mb_strlen($description) > 5000) {
            return response()->json(['error' => 'Description is too long'], 400);
        }
        if (!is_finite($price) || $price <= 0 || $price > 99999999.99) {
            return response()->json(['error' => 'Enter a valid price'], 400);
        }
        if ($stock === false || $stock < 0 || $stock > 2147483647) {
            return response()->json(['error' => 'Enter a valid stock quantity'], 400);
        }
        if (!in_array($category, self::CATEGORIES, true)) {
            return response()->json(['error' => 'Select a valid category'], 400);
        }
        if ($rarity !== '' && !in_array($rarity, self::RARITIES, true)) {
            return response()->json(['error' => 'Select a valid rarity'], 400);
        }
        if (mb_strlen($image) > 1000) {
            return response()->json(['error' => 'Image URL is too long'], 400);
        }
        if (mb_strlen($origin) > 200) {
            return response()->json(['error' => 'Origin is too long'], 400);
        }
        if (mb_strlen($condition) > 120) {
            return response()->json(['error' => 'Condition is too long'], 400);
        }
        if (mb_strlen($provenance) > 2000) {
            return response()->json(['error' => 'Provenance is too long'], 400);
        }

        return [
            'name' => $name,
            'description' => $description,
            'price' => number_format($price, 10, '.', ''),
            'stock' => $stock,
            'image_url' => $image !== '' ? $image : null,
            'category' => $category,
            'rarity' => $rarity !== '' ? $rarity : null,
            'origin' => $origin !== '' ? $origin : null,
            'condition' => $condition !== '' ? $condition : null,
            'provenance' => $provenance !== '' ? $provenance : null,
            'is_featured' => $request->input('is_featured') === true,
            'is_new_arrival' => $request->input('is_new_arrival') === true,
        ];
    }
}
