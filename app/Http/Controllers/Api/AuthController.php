<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Throwable;

class AuthController extends Controller
{
    // Deliberately not a real user's hash. It keeps the missing-user login path
    // doing a password verification too, reducing username-enumeration timing leaks.
    private const DUMMY_PASSWORD_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

    public function register(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        $username = trim((string) $request->input('username', ''));
        $password = (string) $request->input('password', '');

        if (mb_strlen($username) < 3 || mb_strlen($username) > 64) {
            return response()->json(['error' => 'Username must be 3 to 64 characters'], 400);
        }

        if (mb_strlen($password) < 12 || mb_strlen($password) > 128) {
            return response()->json(['error' => 'Password must be 12 to 128 characters'], 400);
        }

        try {
            if (DB::table('users')->where('username', $username)->exists()) {
                return response()->json(['error' => 'User already exists'], 409);
            }

            DB::table('users')->insert([
                'username' => $username,
                'password' => Hash::make($password),
                'is_admin' => false,
            ]);

            return response('', 200);
        } catch (QueryException $exception) {
            // Concurrent registrations can race past the exists() check.
            if (in_array((string) $exception->getCode(), ['23000', '23505'], true)) {
                return response()->json(['error' => 'User already exists'], 409);
            }

            report($exception);

            return response()->json(['error' => 'Registration failed'], 500);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Registration failed'], 500);
        }
    }

    public function login(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        $username = trim((string) $request->input('username', ''));
        $password = (string) $request->input('password', '');

        try {
            $user = User::query()->where('username', $username)->first();
            $hash = $user?->password ?: self::DUMMY_PASSWORD_HASH;
            $valid = Hash::check($password, $hash);

            if (!$user || !$valid) {
                return response()->json(['error' => 'Invalid login'], 401);
            }

            // Existing Node bcrypt hashes are retained. Laravel will rehash on
            // a later password update if its configured algorithm/cost changes.
            $request->session()->regenerate();
            $minutes = $user->is_admin ? 120 : 10080;
            $request->session()->put([
                'userId' => $user->id,
                'isAdmin' => (bool) $user->is_admin,
                'user' => [
                    'id' => $user->id,
                    'username' => $user->username,
                    'isAdmin' => (bool) $user->is_admin,
                ],
                'authExpiresAt' => now()->addMinutes($minutes)->timestamp,
            ]);

            return response('', 204);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Login failed'], 500);
        }
    }

    public function logout(Request $request): \Illuminate\Http\Response
    {
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response('', 200);
    }

    public function me(Request $request): JsonResponse
    {
        $response = response()->json(null)->header('Cache-Control', 'no-store');
        $userId = $request->session()->get('userId');
        $expiresAt = (int) $request->session()->get('authExpiresAt', 0);

        if (!$userId || ($expiresAt > 0 && now()->timestamp >= $expiresAt)) {
            if ($userId) {
                $request->session()->forget(['userId', 'isAdmin', 'user', 'authExpiresAt']);
            }

            return $response;
        }

        try {
            $user = User::query()->select(['id', 'username', 'is_admin'])->find($userId);

            if (!$user) {
                $request->session()->forget(['userId', 'isAdmin', 'user', 'authExpiresAt']);

                return $response;
            }

            $minutes = $user->is_admin ? 120 : 10080;
            $request->session()->put([
                'isAdmin' => (bool) $user->is_admin,
                'user' => [
                    'id' => $user->id,
                    'username' => $user->username,
                    'isAdmin' => (bool) $user->is_admin,
                ],
                'authExpiresAt' => now()->addMinutes($minutes)->timestamp,
            ]);

            return response()->json([
                'id' => $user->id,
                'username' => $user->username,
                'isAdmin' => (bool) $user->is_admin,
            ])->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not load account'], 500)
                ->header('Cache-Control', 'no-store');
        }
    }
}
