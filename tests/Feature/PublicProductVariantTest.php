<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PublicProductVariantTest extends TestCase
{
    use RefreshDatabase;

    public function test_product_detail_returns_active_variants_and_hides_disabled_variants(): void
    {
        $productId = DB::table('products')->insertGetId([
            'name' => 'Astral Compass',
            'price' => '24.9900000000',
            'stock' => 10,
            'category' => 'Artifacts',
            'is_active' => true,
            'status' => 'active',
        ]);

        DB::table('product_variants')->insert([
            'product_id' => $productId,
            'sku' => 'COMPASS-GOLD',
            'name' => 'Gold finish',
            'price' => '29.50',
            'stock' => 3,
            'attributes' => json_encode(['finish' => 'gold', 'material' => 'brass']),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('product_variants')->insert([
            'product_id' => $productId,
            'sku' => 'COMPASS-OLD',
            'name' => 'Retired finish',
            'price' => '20.00',
            'stock' => 99,
            'attributes' => json_encode(['finish' => 'retired']),
            'is_active' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->getJson('/api/products/astral-compass-'.$productId)
            ->assertOk()
            ->assertJsonPath('id', $productId)
            ->assertJsonCount(1, 'variants')
            ->assertJsonPath('variants.0.name', 'Gold finish')
            ->assertJsonPath('variants.0.stock', 3)
            ->assertJsonPath('variants.0.attributes.finish', 'gold')
            ->assertJsonMissing(['name' => 'Retired finish']);

        $variant = $response->json('variants.0');
        $this->assertEquals(29.50, (float) $variant['price']);
        $this->assertArrayNotHasKey('sku', $variant, 'Internal stock keeping units should not be exposed publicly.');
    }
}
