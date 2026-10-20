<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminProductVariantTest extends TestCase
{
    use RefreshDatabase;

    private function product(string $name = 'Variant Test Product'): int
    {
        return DB::table('products')->insertGetId([
            'name' => $name,
            'price' => '29.9900000000',
            'stock' => 8,
            'category' => 'Artifacts',
            'is_active' => true,
            'status' => 'active',
        ]);
    }

    private function signIn(bool $isAdmin = true): void
    {
        $id = DB::table('users')->insertGetId([
            'username' => $isAdmin ? 'variant-admin' : 'variant-customer',
            'password' => Hash::make('A-Strong-Password-2026'),
            'is_admin' => $isAdmin,
        ]);

        $this->withSession([
            'userId' => $id,
            'isAdmin' => $isAdmin,
            'authExpiresAt' => now()->addMinutes(30)->timestamp,
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'sku' => 'AW-GOLD-001',
            'name' => 'Gold finish',
            'price' => '19.99',
            'stock' => 4,
            'attributes' => ['finish' => 'gold', 'size' => 'standard'],
            'is_active' => true,
        ], $overrides);
    }

    public function test_guest_cannot_list_product_variants(): void
    {
        $productId = $this->product();

        $this->getJson('/api/admin/product/'.$productId.'/variants')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Login required');
    }

    public function test_non_admin_cannot_create_a_variant(): void
    {
        $this->signIn(false);
        $productId = $this->product();

        $this->postJson('/api/admin/product/'.$productId.'/variants', $this->payload())
            ->assertForbidden()
            ->assertJsonPath('error', 'Admin only');

        $this->assertSame(0, DB::table('product_variants')->count());
    }

    public function test_admin_can_create_and_list_variant_with_json_attributes(): void
    {
        $this->signIn();
        $productId = $this->product();

        $created = $this->postJson('/api/admin/product/'.$productId.'/variants', $this->payload())
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('variant.product_id', $productId)
            ->assertJsonPath('variant.sku', 'AW-GOLD-001')
            ->assertJsonPath('variant.name', 'Gold finish')
            ->assertJsonPath('variant.stock', 4)
            ->assertJsonPath('variant.is_active', true)
            ->assertJsonPath('variant.attributes.finish', 'gold')
            ->assertJsonPath('variant.attributes.size', 'standard');

        $this->assertEquals(19.99, (float) $created->json('variant.price'));
        $variantId = (int) $created->json('variant.id');
        $this->assertGreaterThan(0, $variantId);

        $this->getJson('/api/admin/product/'.$productId.'/variants')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $variantId)
            ->assertJsonPath('0.attributes.finish', 'gold');
    }

    public function test_variant_sku_must_be_unique_and_invalid_attributes_are_rejected(): void
    {
        $this->signIn();
        $productId = $this->product();

        $this->postJson('/api/admin/product/'.$productId.'/variants', $this->payload())
            ->assertCreated();

        $otherProductId = $this->product('Second Variant Test Product');
        $this->postJson('/api/admin/product/'.$otherProductId.'/variants', $this->payload([
            'name' => 'Another finish',
        ]))
            ->assertConflict()
            ->assertJsonPath('error', 'This SKU is already in use');

        $this->postJson('/api/admin/product/'.$otherProductId.'/variants', $this->payload([
            'sku' => 'AW-SILVER-001',
            'attributes' => ['gold', 'silver'],
        ]))
            ->assertBadRequest()
            ->assertJsonPath('error', 'Variant attributes must be a JSON object');

        $this->assertSame(1, DB::table('product_variants')->count());
    }

    public function test_admin_can_update_and_soft_disable_a_variant(): void
    {
        $this->signIn();
        $productId = $this->product();
        $created = $this->postJson('/api/admin/product/'.$productId.'/variants', $this->payload())
            ->assertCreated();
        $variantId = (int) $created->json('variant.id');

        $updated = $this->patchJson('/api/admin/product/'.$productId.'/variants/'.$variantId, $this->payload([
            'sku' => 'AW-BLUE-002',
            'name' => 'Blue finish',
            'price' => '21.50',
            'stock' => 7,
            'attributes' => ['finish' => 'blue'],
        ]))
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('variant.sku', 'AW-BLUE-002')
            ->assertJsonPath('variant.name', 'Blue finish')
            ->assertJsonPath('variant.stock', 7)
            ->assertJsonPath('variant.attributes.finish', 'blue');
        $this->assertEquals(21.50, (float) $updated->json('variant.price'));

        $this->deleteJson('/api/admin/product/'.$productId.'/variants/'.$variantId)
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('product_variants', [
            'id' => $variantId,
            'product_id' => $productId,
            'is_active' => 0,
        ]);
    }

    public function test_variant_cannot_be_assigned_to_a_different_product_on_update(): void
    {
        $this->signIn();
        $firstProduct = $this->product('First Product');
        $secondProduct = $this->product('Second Product');

        $created = $this->postJson('/api/admin/product/'.$firstProduct.'/variants', $this->payload())
            ->assertCreated();
        $variantId = (int) $created->json('variant.id');

        $this->patchJson('/api/admin/product/'.$secondProduct.'/variants/'.$variantId, $this->payload([
            'sku' => 'AW-OTHER-PRODUCT',
        ]))
            ->assertNotFound()
            ->assertJsonPath('error', 'Product variant not found');
    }
}
