<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SecurityAndOriginTest extends TestCase
{
    use RefreshDatabase;

    public function test_storefront_has_the_expected_security_headers(): void
    {
        $response = $this->get('/')->assertOk();

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

        $policy = (string) $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("default-src 'self'", $policy);
        $this->assertStringContainsString("frame-ancestors 'none'", $policy);
        $this->assertStringContainsString('https://www.googletagmanager.com', $policy);
    }

    public function test_cross_origin_registration_is_rejected_before_writing_a_user(): void
    {
        $this->withHeader('Origin', 'https://attacker.example')
            ->postJson('/api/register', [
                'username' => 'cross-origin-user',
                'password' => 'A-Strong-Password-2026',
            ])
            ->assertForbidden()
            ->assertJsonPath('error', 'Cross-site request blocked');

        $this->assertSame(0, DB::table('users')->count());
    }
}
