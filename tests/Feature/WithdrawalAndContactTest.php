<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WithdrawalAndContactTest extends TestCase
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

    private function order(int $userId, string $email): int
    {
        return DB::table('orders')->insertGetId([
            'user_id' => $userId,
            'total' => '24.9900000000',
            'status' => 'pending',
            'customer_name' => 'Test Customer',
            'customer_email' => $email,
            'shipping_address_line1' => '1 Test Street',
            'shipping_postcode' => '1234 AB',
            'shipping_city' => 'Haarlem',
            'shipping_country' => 'NL',
        ]);
    }

    public function test_withdrawal_request_can_be_submitted_without_sending_unconfigured_email(): void
    {
        $response = $this->postJson('/api/withdrawal', [
            'email' => ' Customer@Example.Test ',
            'reason' => 'Please review this synthetic test request.',
        ])->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('confirmationEmailSent', false);

        $requestId = (int) $response->json('requestId');
        $this->assertGreaterThan(0, $requestId);
        $this->assertDatabaseHas('withdrawal_requests', [
            'id' => $requestId,
            'email' => 'customer@example.test',
            'reason' => 'Please review this synthetic test request.',
            'status' => 'received',
        ]);
    }

    public function test_withdrawal_request_validates_optional_order_ownership_by_email(): void
    {
        $ownerId = $this->user('withdrawal-order-owner');
        $orderId = $this->order($ownerId, 'owner@example.test');

        $this->postJson('/api/withdrawal', [
            'email' => 'intruder@example.test',
            'order_id' => $orderId,
            'reason' => 'Testing ownership validation.',
        ])->assertNotFound()
            ->assertJsonPath('error', 'Order not found for that email address');

        $this->assertSame(0, DB::table('withdrawal_requests')->count());

        $this->postJson('/api/withdrawal', [
            'email' => 'OWNER@example.test',
            'order_id' => $orderId,
            'reason' => 'Valid owner request.',
        ])->assertCreated()
            ->assertJsonPath('success', true);

        $this->assertSame(1, DB::table('withdrawal_requests')->count());
    }

    public function test_guest_cannot_access_admin_withdrawal_queue(): void
    {
        $this->getJson('/api/admin/withdrawals')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Login required');
    }

    public function test_admin_can_list_and_update_withdrawal_requests(): void
    {
        $requestId = DB::table('withdrawal_requests')->insertGetId([
            'email' => 'customer@example.test',
            'reason' => 'Synthetic test request.',
            'status' => 'received',
            'submitted_at' => now(),
        ]);

        $this->signIn($this->user('withdrawal-admin', true), true);

        $this->getJson('/api/admin/withdrawals')
            ->assertOk()
            ->assertJsonPath('0.id', $requestId)
            ->assertJsonPath('0.status', 'received');

        $this->patchJson('/api/admin/withdrawals/'.$requestId, [
            'status' => 'reviewing',
        ])->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('withdrawal.id', $requestId)
            ->assertJsonPath('withdrawal.status', 'reviewing');

        $this->assertDatabaseHas('withdrawal_requests', [
            'id' => $requestId,
            'status' => 'reviewing',
        ]);
    }

    public function test_withdrawal_status_rejects_unknown_values(): void
    {
        $requestId = DB::table('withdrawal_requests')->insertGetId([
            'email' => 'customer@example.test',
            'reason' => 'Synthetic test request.',
            'status' => 'received',
            'submitted_at' => now(),
        ]);
        $this->signIn($this->user('withdrawal-admin-validation', true), true);

        $this->patchJson('/api/admin/withdrawals/'.$requestId, [
            'status' => 'sent_to_mollie',
        ])->assertBadRequest()
            ->assertJsonPath('error', 'Invalid withdrawal status');

        $this->assertDatabaseHas('withdrawal_requests', [
            'id' => $requestId,
            'status' => 'received',
        ]);
    }

    public function test_contact_endpoint_does_not_claim_success_until_delivery_is_configured(): void
    {
        config(['services.resend.key' => null]);

        $this->postJson('/api/contact', [
            'name' => 'Test Customer',
            'email' => 'customer@example.test',
            'message' => 'A synthetic contact message.',
        ])->assertStatus(503)
            ->assertJsonPath(
                'error',
                'The contact service is not configured yet. Please email fligaliga@hotmail.com directly.'
            );
    }
}
