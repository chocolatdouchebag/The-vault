<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderAndCheckoutTest extends TestCase
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

    private function order(int $userId): int
    {
        return DB::table('orders')->insertGetId([
            'user_id' => $userId,
            'total' => '12.9900000000',
            'status' => 'pending',
            'customer_name' => 'Test Customer',
            'customer_email' => 'customer@example.test',
            'shipping_address_line1' => '1 Test Street',
            'shipping_postcode' => '1234 AB',
            'shipping_city' => 'Haarlem',
            'shipping_country' => 'NL',
        ]);
    }

    public function test_guest_cannot_read_order_details(): void
    {
        $userId = $this->user('order-owner');
        $orderId = $this->order($userId);

        $this->getJson('/api/orders/'.$orderId)
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Login required');
    }

    public function test_customer_can_read_only_their_own_order_and_items(): void
    {
        $ownerId = $this->user('order-owner');
        $otherId = $this->user('other-order-owner');
        $orderId = $this->order($ownerId);
        $otherOrderId = $this->order($otherId);

        $productId = DB::table('products')->insertGetId([
            'name' => 'Ordered Treasure',
            'price' => '12.9900000000',
            'stock' => 2,
            'category' => 'Artifacts',
            'is_active' => true,
            'status' => 'active',
        ]);
        DB::table('order_items')->insert([
            'order_id' => $orderId,
            'product_id' => $productId,
            'quantity' => 1,
            'price' => '12.9900000000',
            'price_each' => '12.9900000000',
        ]);

        $this->signIn($ownerId);

        $this->getJson('/api/orders/'.$orderId)
            ->assertOk()
            ->assertJsonPath('id', $orderId)
            ->assertJsonPath('customer_email', 'customer@example.test');

        $this->getJson('/api/orders/'.$otherOrderId)
            ->assertNotFound()
            ->assertJsonPath('error', 'Order not found');

        $this->getJson('/api/orders/'.$orderId.'/items')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Ordered Treasure')
            ->assertJsonPath('0.quantity', 1);
    }

    public function test_admin_order_overview_includes_items(): void
    {
        $adminId = $this->user('order-admin', true);
        $ownerId = $this->user('order-customer');
        $orderId = $this->order($ownerId);
        $productId = DB::table('products')->insertGetId([
            'name' => 'Admin View Treasure',
            'price' => '12.9900000000',
            'stock' => 2,
            'category' => 'Oddities',
            'is_active' => true,
            'status' => 'active',
        ]);
        DB::table('order_items')->insert([
            'order_id' => $orderId,
            'product_id' => $productId,
            'quantity' => 2,
            'price' => '12.9900000000',
            'price_each' => '12.9900000000',
        ]);

        $this->signIn($adminId, true);

        $this->getJson('/api/admin/orders')
            ->assertOk()
            ->assertJsonPath('0.id', $orderId)
            ->assertJsonPath('0.username', 'order-customer')
            ->assertJsonPath('0.items.0.name', 'Admin View Treasure')
            ->assertJsonPath('0.items.0.quantity', 2);
    }

    public function test_checkout_placeholder_never_creates_an_order_or_reserves_cart_stock(): void
    {
        $userId = $this->user('checkout-customer');
        $this->signIn($userId);
        $productId = DB::table('products')->insertGetId([
            'name' => 'Checkout Placeholder Treasure',
            'price' => '15.0000000000',
            'stock' => 3,
            'category' => 'Collectibles',
            'is_active' => true,
            'status' => 'active',
        ]);
        DB::table('cart')->insert([
            'user_id' => $userId,
            'product_id' => $productId,
            'quantity' => 1,
        ]);

        $this->postJson('/api/checkout', [
            'customer_name' => 'Test Customer',
            'customer_email' => 'customer@example.test',
            'shipping_address_line1' => '1 Test Street',
            'shipping_postcode' => '1234 AB',
            'shipping_city' => 'Haarlem',
            'shipping_country' => 'NL',
            'accept_terms' => true,
        ])
            ->assertStatus(503)
            ->assertJsonPath('error', 'Online checkout is not configured yet.');

        $this->assertSame(0, DB::table('orders')->count());
        $this->assertSame(1, DB::table('cart')->where('user_id', $userId)->count());
        $this->assertDatabaseHas('products', ['id' => $productId, 'stock' => 3]);
    }
}
