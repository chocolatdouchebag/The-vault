<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminProductImageTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $username, bool $isAdmin = false): int
    {
        return DB::table('users')->insertGetId([
            'username' => $username,
            'password' => Hash::make('A-Strong-Password-2026'),
            'is_admin' => $isAdmin,
        ]);
    }

    private function signIn(int $userId, bool $isAdmin = false): void
    {
        $this->withSession([
            'userId' => $userId,
            'isAdmin' => $isAdmin,
            'authExpiresAt' => now()->addMinutes(30)->timestamp,
        ]);
    }

    private function product(string $name = 'Image Test Product'): int
    {
        return DB::table('products')->insertGetId([
            'name' => $name,
            'price' => '14.9900000000',
            'stock' => 3,
            'is_active' => true,
            'status' => 'active',
        ]);
    }

    private function image(int $productId, string $url, int $sortOrder, bool $primary = false): int
    {
        return DB::table('product_images')->insertGetId([
            'product_id' => $productId,
            'image_url' => $url,
            'alt_text' => 'Synthetic test image',
            'sort_order' => $sortOrder,
            'is_primary' => $primary,
            'primary_slot' => $primary ? 1 : null,
            'created_at' => now(),
        ]);
    }

    public function test_guest_cannot_list_product_gallery_images(): void
    {
        $productId = $this->product();

        $this->getJson('/api/admin/product/'.$productId.'/images')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Login required');
    }

    public function test_admin_can_list_and_add_gallery_images_and_set_primary_safely(): void
    {
        $productId = $this->product();
        $oldPrimaryId = $this->image($productId, '/assets/original-primary.jpg', 0, true);
        $this->signIn($this->user('gallery-admin', true), true);

        $this->postJson('/api/admin/product/'.$productId.'/images', [
            'image_url' => '/assets/new-primary.jpg',
            'alt_text' => 'New primary angle',
            'is_primary' => true,
        ])->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('image.image_url', '/assets/new-primary.jpg')
            ->assertJsonPath('image.is_primary', true);

        $newPrimaryId = (int) DB::table('product_images')
            ->where('product_id', $productId)
            ->where('image_url', '/assets/new-primary.jpg')
            ->value('id');

        $this->assertGreaterThan(0, $newPrimaryId);
        $this->assertDatabaseHas('product_images', [
            'id' => $oldPrimaryId,
            'is_primary' => 0,
            'primary_slot' => null,
        ]);
        $this->assertDatabaseHas('product_images', [
            'id' => $newPrimaryId,
            'is_primary' => 1,
            'primary_slot' => 1,
            'alt_text' => 'New primary angle',
        ]);

        $this->getJson('/api/admin/product/'.$productId.'/images')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.id', $newPrimaryId)
            ->assertJsonPath('0.is_primary', true)
            ->assertJsonMissingPath('0.primary_slot');
    }

    public function test_admin_rejects_unsafe_image_urls_without_inserting_a_row(): void
    {
        $productId = $this->product();
        $this->signIn($this->user('gallery-url-admin', true), true);

        $this->postJson('/api/admin/product/'.$productId.'/images', [
            'image_url' => 'javascript:alert(1)',
            'alt_text' => 'Unsafe test URL',
        ])->assertBadRequest()
            ->assertJsonPath('error', 'Enter a valid HTTP(S) or root-relative image URL');

        $this->assertSame(0, DB::table('product_images')->where('product_id', $productId)->count());
    }

    public function test_setting_and_deleting_primary_image_promotes_the_next_image(): void
    {
        $productId = $this->product();
        $firstId = $this->image($productId, '/assets/gallery-first.jpg', 0, true);
        $secondId = $this->image($productId, '/assets/gallery-second.jpg', 1, false);
        $this->signIn($this->user('gallery-primary-admin', true), true);

        $this->patchJson('/api/admin/product/'.$productId.'/images/'.$secondId.'/primary')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('image.id', $secondId)
            ->assertJsonPath('image.is_primary', true);

        $this->assertDatabaseHas('product_images', [
            'id' => $firstId,
            'is_primary' => 0,
            'primary_slot' => null,
        ]);
        $this->assertDatabaseHas('product_images', [
            'id' => $secondId,
            'is_primary' => 1,
            'primary_slot' => 1,
        ]);

        $this->deleteJson('/api/admin/product/'.$productId.'/images/'.$secondId)
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('product_images', ['id' => $secondId]);
        $this->assertDatabaseHas('product_images', [
            'id' => $firstId,
            'is_primary' => 1,
            'primary_slot' => 1,
        ]);
    }

    public function test_admin_cannot_change_an_image_belonging_to_another_product(): void
    {
        $firstProductId = $this->product('First Image Product');
        $secondProductId = $this->product('Second Image Product');
        $imageId = $this->image($secondProductId, '/assets/owned-by-second.jpg', 0, true);
        $this->signIn($this->user('gallery-owner-admin', true), true);

        $this->patchJson('/api/admin/product/'.$firstProductId.'/images/'.$imageId.'/primary')
            ->assertNotFound()
            ->assertJsonPath('error', 'Product image not found');

        $this->deleteJson('/api/admin/product/'.$firstProductId.'/images/'.$imageId)
            ->assertNotFound()
            ->assertJsonPath('error', 'Product image not found');

        $this->assertDatabaseHas('product_images', [
            'id' => $imageId,
            'product_id' => $secondProductId,
            'is_primary' => 1,
            'primary_slot' => 1,
        ]);
    }
}
