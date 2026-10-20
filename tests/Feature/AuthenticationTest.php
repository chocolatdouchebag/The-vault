<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_creates_a_hashed_non_admin_user(): void
    {
        $this->postJson('/api/register', [
            'username' => 'treasurehunter',
            'password' => 'A-Strong-Password-2026',
        ])->assertOk();

        $user = DB::table('users')->where('username', 'treasurehunter')->first();

        $this->assertNotNull($user);
        $this->assertFalse((bool) $user->is_admin);
        $this->assertNotSame('A-Strong-Password-2026', $user->password);
        $this->assertTrue(Hash::check('A-Strong-Password-2026', $user->password));
    }

    public function test_registration_validates_username_and_password_lengths(): void
    {
        $this->postJson('/api/register', [
            'username' => 'ab',
            'password' => 'short',
        ])->assertBadRequest()
            ->assertJsonPath('error', 'Username must be 3 to 64 characters');

        $this->assertSame(0, DB::table('users')->count());
    }

    public function test_duplicate_registration_returns_conflict(): void
    {
        $payload = [
            'username' => 'treasurehunter',
            'password' => 'A-Strong-Password-2026',
        ];

        $this->postJson('/api/register', $payload)->assertOk();

        $this->postJson('/api/register', $payload)
            ->assertConflict()
            ->assertJsonPath('error', 'User already exists');

        $this->assertSame(1, DB::table('users')->where('username', 'treasurehunter')->count());
    }

    public function test_login_and_me_support_existing_bcrypt_2b_hashes(): void
    {
        $password = 'Existing-Password-2026';
        $hash = Hash::make($password);
        // Node's bcrypt package commonly emits $2b$ prefixes. PHP's password
        // verifier must accept the same digest without resetting customer passwords.
        $nodeStyleHash = '$2b$'.substr($hash, 4);

        $userId = DB::table('users')->insertGetId([
            'username' => 'old-customer',
            'password' => $nodeStyleHash,
            'is_admin' => false,
        ]);

        $this->postJson('/api/login', [
            'username' => 'old-customer',
            'password' => $password,
        ])->assertNoContent();

        $this->getJson('/api/me')
            ->assertOk()
            ->assertExactJson([
                'id' => $userId,
                'username' => 'old-customer',
                'isAdmin' => false,
            ]);

        $normalizedHash = DB::table('users')->where('id', $userId)->value('password');
        $this->assertStringStartsWith('$2y
    }

    public function test_invalid_login_is_generic_and_does_not_start_a_session(): void
    {
        $this->postJson('/api/login', [
            'username' => 'nobody',
            'password' => 'Wrong-Password-2026',
        ])->assertUnauthorized()
            ->assertJsonPath('error', 'Invalid login');

        $this->getJson('/api/me')->assertOk()->assertContent('null');
    }

    public function test_expired_authentication_session_is_treated_as_logged_out(): void
    {
        $this->withSession([
            'userId' => 999,
            'isAdmin' => true,
            'authExpiresAt' => now()->subMinute()->timestamp,
        ])->getJson('/api/me')
            ->assertOk()
            ->assertExactJson(null);
    }

    public function test_logout_invalidates_the_session(): void
    {
        $id = DB::table('users')->insertGetId([
            'username' => 'logout-customer',
            'password' => Hash::make('A-Strong-Password-2026'),
            'is_admin' => false,
        ]);

        $this->withSession([
            'userId' => $id,
            'isAdmin' => false,
            'authExpiresAt' => now()->addDay()->timestamp,
        ]);

        $this->postJson('/api/logout')->assertOk();
        $this->getJson('/api/me')->assertOk()->assertExactJson(null);
    }
}
, $normalizedHash);
    }

    public function test_invalid_login_is_generic_and_does_not_start_a_session(): void
    {
        $this->postJson('/api/login', [
            'username' => 'nobody',
            'password' => 'Wrong-Password-2026',
        ])->assertUnauthorized()
            ->assertJsonPath('error', 'Invalid login');

        $this->getJson('/api/me')->assertOk()->assertContent('null');
    }

    public function test_expired_authentication_session_is_treated_as_logged_out(): void
    {
        $this->withSession([
            'userId' => 999,
            'isAdmin' => true,
            'authExpiresAt' => now()->subMinute()->timestamp,
        ])->getJson('/api/me')
            ->assertOk()
            ->assertExactJson(null);
    }

    public function test_logout_invalidates_the_session(): void
    {
        $id = DB::table('users')->insertGetId([
            'username' => 'logout-customer',
            'password' => Hash::make('A-Strong-Password-2026'),
            'is_admin' => false,
        ]);

        $this->withSession([
            'userId' => $id,
            'isAdmin' => false,
            'authExpiresAt' => now()->addDay()->timestamp,
        ]);

        $this->postJson('/api/logout')->assertOk();
        $this->getJson('/api/me')->assertOk()->assertExactJson(null);
    }
}
