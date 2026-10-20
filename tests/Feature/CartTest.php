<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CartTest extends TestCase
{
    use RefreshDatabase;

    private function signIn(): int
    {
        $id = DB::table('users')->insertGetId([
            'username' => 'cart-customer',
            'password' => Hash::make('A-Strong-Password-2026'),
            'is_admin' => false,
        ]);

        $this->withSession([
            'userId' => $id,
            'isAdmin' => false,
            'authExpiresAt' => now()->addDay()->timestamp,
        ]);

        return $id;
    }

    private function product(int $stock = 3, bool $active = true): int
    {
        return DB::table('products')->insertGetId([
            'name' => 'Cart Test Treasure',
            'price' => '12.9900000000',
            'stock' => $stock,
            'category' => 'Collectibles',
            'is_active' => $active,
            'status' => 'active',
        ]);
    }

    public function test_guest_cannot_read_or_add_to_cart(): void
    {
        $productId = $this->product();

        $this->getJson('/api/cart')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Login required');

        $this->postJson('/api/cart', ['product_id' => $productId])
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Login required');

        $this->assertSame(0, DB::table('cart')->count());
    }

    public function test_add_to_cart_respects_available_stock_and_returns_cart_rows(): void
    {
        $userId = $this->signIn();
        $productId = $this->product(1);

        $this->postJson('/api/cart', ['product_id' => $productId])->assertOk();
        $this->postJson('/api/cart', ['product_id' => $productId])
            ->assertConflict()
            ->assertJsonPath('error', 'You cannot add more than the available stock');

        $this->assertDatabaseHas('cart', [
            'user_id' => $userId,
            'product_id' => $productId,
            'quantity' => 1,
        ]);

        $this->getJson('/api/cart')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.product_id', $productId)
            ->assertJsonPath('0.name', 'Cart Test Treasure')
            ->assertJsonPath('0.quantity', 1);
    }

    public function test_inactive_products_cannot_be_added_to_cart(): void
    {
        $this->signIn();
        $productId = $this->product(3, false);

        $this->postJson('/api/cart', ['product_id' => $productId])
            ->assertNotFound()
            ->assertJsonPath('error', 'Treasure not found');

        $this->assertSame(0, DB::table('cart')->count());
    }

    public function test_cart_update_enforces_stock_and_zero_quantity_removes_item(): void
    {
        $userId = $this->signIn();
        $productId = $this->product(3);
        $cartId = DB::table('cart')->insertGetId([
            'user_id' => $userId,
            'product_id' => $productId,
            'quantity' => 1,
        ]);

        $this->postJson('/api/cart/update', ['id' => $cartId, 'quantity' => 3])->assertOk();
        $this->assertDatabaseHas('cart', ['id' => $cartId, 'quantity' => 3]);

        $this->postJson('/api/cart/update', ['id' => $cartId, 'quantity' => 4])
            ->assertConflict()
            ->assertJsonPath('error', 'Requested quantity exceeds available stock');

        $this->postJson('/api/cart/update', ['id' => $cartId, 'quantity' => 0])->assertOk();
        $this->assertDatabaseMissing('cart', ['id' => $cartId]);
    }

    private function variant(int $productId, string $name, string $price, int $stock, bool $active = true): int
    {
        return DB::table('product_variants')->insertGetId([
            'product_id' => $productId,
            'sku' => strtoupper(str_replace(' ', '-', $name)),
            'name' => $name,
            'price' => $price,
            'stock' => $stock,
            'attributes' => json_encode(['finish' => $name]),
            'is_active' => $active,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_variant_products_require_a_variant_and_keep_each_option_in_a_separate_cart_row(): void
    {
        $userId = $this->signIn();
        $productId = $this->product(50);
        $gold = $this->variant($productId, 'Gold finish', '10.50', 2);
        $silver = $this->variant($productId, 'Silver finish', '12.75', 4);

        $this->postJson('/api/cart', ['product_id' => $productId])
            ->assertBadRequest()
            ->assertJsonPath('error', 'Select a product option before adding it to cart');

        $this->postJson('/api/cart', ['product_id' => $productId, 'variant_id' => $gold])->assertOk();
        $this->postJson('/api/cart', ['product_id' => $productId, 'variant_id' => $gold])->assertOk();
        $this->postJson('/api/cart', ['product_id' => $productId, 'variant_id' => $gold])
            ->assertConflict()
            ->assertJsonPath('error', 'You cannot add more than the available stock');
        $this->postJson('/api/cart', ['product_id' => $productId, 'variant_id' => $silver])->assertOk();

        $this->assertSame(2, DB::table('cart')->where('user_id', $userId)->count());
        $this->assertDatabaseHas('cart', [
            'user_id' => $userId,
            'product_id' => $productId,
            'variant_id' => $gold,
            'quantity' => 2,
        ]);
        $this->assertDatabaseHas('cart', [
            'user_id' => $userId,
            'product_id' => $productId,
            'variant_id' => $silver,
            'quantity' => 1,
        ]);

        $cart = $this->getJson('/api/cart')->assertOk()->json();
        $goldRow = collect($cart)->firstWhere('variant_id', $gold);
        $silverRow = collect($cart)->firstWhere('variant_id', $silver);
        $this->assertSame('Gold finish', $goldRow['variant_name']);
        $this->assertSame(2, $goldRow['quantity']);
        $this->assertEquals(10.50, (float) $goldRow['price']);
        $this->assertSame('Silver finish', $silverRow['variant_name']);
        $this->assertEquals(12.75, (float) $silverRow['price']);
    }

    public function test_variant_cart_updates_enforce_variant_stock_instead_of_product_stock(): void
    {
        $userId = $this->signIn();
        $productId = $this->product(100);
        $variantId = $this->variant($productId, 'Limited finish', '15.25', 2);
        $cartId = DB::table('cart')->insertGetId([
            'user_id' => $userId,
            'product_id' => $productId,
            'variant_id' => $variantId,
            'quantity' => 1,
        ]);

        $this->postJson('/api/cart/update', ['id' => $cartId, 'quantity' => 3])
            ->assertConflict()
            ->assertJsonPath('error', 'Requested quantity exceeds available stock');

        $this->postJson('/api/cart/update', ['id' => $cartId, 'quantity' => 2])->assertOk();
        $this->assertDatabaseHas('cart', ['id' => $cartId, 'quantity' => 2]);
    }

    public function test_unavailable_and_foreign_variants_cannot_be_added_to_cart(): void
    {
        $this->signIn();
        $productId = $this->product();
        $otherProductId = $this->product(3);
        $disabled = $this->variant($productId, 'Disabled finish', '8.00', 3, false);
        $foreign = $this->variant($otherProductId, 'Foreign finish', '9.00', 3);

        $this->postJson('/api/cart', ['product_id' => $productId, 'variant_id' => $disabled])
            ->assertNotFound()
            ->assertJsonPath('error', 'Selected product option is not available');

        $this->postJson('/api/cart', ['product_id' => $productId, 'variant_id' => $foreign])
            ->assertNotFound()
            ->assertJsonPath('error', 'Selected product option is not available');

        $this->assertSame(0, DB::table('cart')->count());
    }

    public function test_empty_cart_only_removes_the_current_users_items(): void
    {
        $userId = $this->signIn();
        $productId = $this->product();

        DB::table('cart')->insert([
            'user_id' => $userId,
            'product_id' => $productId,
            'quantity' => 1,
        ]);

        DB::table('users')->insert([
            'username' => 'other-cart-customer',
            'password' => Hash::make('A-Strong-Password-2026'),
            'is_admin' => false,
        ]);
        $otherUserId = (int) DB::table('users')
            ->where('username', 'other-cart-customer')
            ->value('id');
        DB::table('cart')->insert([
            'user_id' => $otherUserId,
            'product_id' => $productId,
            'quantity' => 1,
        ]);

        $this->postJson('/api/cart/empty')->assertOk();

        $this->assertSame(0, DB::table('cart')->where('user_id', $userId)->count());
        $this->assertSame(1, DB::table('cart')->where('user_id', $otherUserId)->count());
    }
}
