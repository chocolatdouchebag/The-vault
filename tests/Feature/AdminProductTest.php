<?php

namespace Tests\\Feature;

use Illuminate\\Foundation\\Testing\\RefreshDatabase;
use Illuminate\\Support\\Facades\\DB;
use Illuminate\\Support\\Facades\\Hash;
use Tests\\TestCase;

class AdminProductTest extends TestCase
{
    use RefreshDatabase;

    private function user(bool $isAdmin): int
    {
        return DB::table('users')->insertGetId([
            'username' => $isAdmin ? 'catalogue-admin' : 'catalogue-customer',
            'password' => Hash::make('A-Strong-Password-2026'),
            'is_admin' => $isAdmin,
        ]);
    }

    private function authenticate(int $userId): void
    {
        $this->withSession([
            'userId' => $userId,
            'isAdmin' => true,
            'authExpiresAt' => now()->addMinutes(30)->timestamp,
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Arcane Wand',
            'description' => 'A curious treasure for testing.',
            'price' => 19.99,
            'stock' => 4,
            'image_url' => '/assets/arcane-wand.jpg',
            'category' => 'Artifacts',
            'rarity' => 'Rare',
            'origin' => 'North Sea',
            'condition' => 'Good',
            'provenance' => 'Synthetic test item',
            'is_featured' => true,
            'is_new_arrival' => false,
        ], $overrides);
    }

    public function test_guest_cannot_read_admin_catalogue(): void
    {
        $this->getJson('/api/admin/products')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Login required');
    }

    public function test_non_admin_user_cannot_create_a_product(): void
    {
        $this->authenticate($this->user(false));

        $this->postJson('/api/admin/product', $this->payload())
            ->assertForbidden()
            ->assertJsonPath('error', 'Admin only');

        $this->assertSame(0, DB::table('products')->count());
    }

    public function test_admin_can_create_and_list_a_product(): void
    {
        $this->authenticate($this->user(true));

        $create = $this->postJson('/api/admin/product', $this->payload())
            ->assertCreated()
            ->assertJsonPath('success', true);

        $productId = (int) $create->json('id');
        $this->assertGreaterThan(0, $productId);

        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'name' => 'Arcane Wand',
            'category' => 'Artifacts',
            'stock' => 4,
            'is_active' => 1,
            'is_featured' => 1,
        ]);

        $this->getJson('/api/admin/products')
            ->assertOk()
            ->assertJsonPath('0.id', $productId)
            ->assertJsonPath('0.slug', 'arcane-wand');
    }

    public function test_admin_product_validation_rejects_invalid_price_and_category(): void
    {
        $this->authenticate($this->user(true));

        $this->postJson('/api/admin/product', $this->payload(['price' => 0]))
            ->assertBadRequest()
            ->assertJsonPath('error', 'Enter a valid price');

        $this->postJson('/api/admin/product', $this->payload(['category' => 'Unlisted Category']))
            ->assertBadRequest()
            ->assertJsonPath('error', 'Select a valid category');

        $this->assertSame(0, DB::table('products')->count());
    }

    public function test_admin_can_update_product_details(): void
    {
        $this->authenticate($this->user(true));
        $id = DB::table('products')->insertGetId([
            'name' => 'Old Treasure',
            'price' => '9.9900000000',
            'stock' => 1,
            'category' => 'Oddities',
            'is_active' => true,
            'status' => 'active',
        ]);

        $this->patchJson('/api/admin/product/'.$id, $this->payload([
            'name' => 'Updated Treasure',
            'price' => 28.50,
            'stock' => 12,
            'is_featured' => false,
        ]))
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('product.id', $id)
            ->assertJsonPath('product.name', 'Updated Treasure')
            ->assertJsonPath('product.slug', 'updated-treasure');

        $this->assertDatabaseHas('products', [
            'id' => $id,
            'name' => 'Updated Treasure',
            'stock' => 12,
            'is_featured' => 0,
        ]);
    }

    public function test_admin_removes_product_from_public_catalogue_without_deleting_history(): void
    {
        $this->authenticate($this->user(true));
        $id = DB::table('products')->insertGetId([
            'name' => 'Hidden Treasure',
            'price' => '5.0000000000',
            'stock' => 2,
            'category' => 'Collectibles',
            'is_active' => true,
            'status' => 'active',
        ]);

        $this->deleteJson('/api/admin/product/'.$id)->assertOk();

        $this->assertDatabaseHas('products', ['id' => $id, 'is_active' => 0]);
        $this->getJson('/api/products/'.$id)
            ->assertNotFound()
            ->assertJsonPath('error', 'Treasure not found');
    }
}
