<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class WithdrawalController extends Controller
{
    private const STATUSES = ['received', 'reviewing', 'completed', 'rejected'];

    public function store(Request $request): JsonResponse
    {
        $email = mb_strtolower(trim((string) $request->input('email', '')));
        $reason = trim((string) $request->input('reason', ''));
        $rawOrderId = $request->input('order_id');
        $orderId = null;

        if ($rawOrderId !== null && $rawOrderId !== '') {
            $orderId = filter_var($rawOrderId, FILTER_VALIDATE_INT);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 254) {
            return response()->json(['error' => 'Enter a valid email address'], 400);
        }
        if (mb_strlen($reason) > 2000) {
            return response()->json(['error' => 'Reason is too long'], 400);
        }
        if ($orderId === false || ($orderId !== null && $orderId < 1)) {
            return response()->json(['error' => 'Invalid order number'], 400);
        }

        try {
            if ($orderId !== null) {
                $matchingOrder = DB::table('orders')
                    ->where('id', $orderId)
                    ->whereRaw('LOWER(customer_email) = ?', [$email])
                    ->exists();

                if (!$matchingOrder) {
                    return response()->json([
                        'error' => 'Order not found for that email address',
                    ], 404);
                }
            }

            $submittedAt = now();
            $requestId = DB::table('withdrawal_requests')->insertGetId([
                'order_id' => $orderId,
                'email' => $email,
                'reason' => $reason !== '' ? $reason : null,
                'status' => 'received',
                'submitted_at' => $submittedAt,
            ]);

            // Email delivery is deliberately deferred until the owner configures
            // and tests the production email provider.
            return response()->json([
                'success' => true,
                'requestId' => $requestId,
                'submittedAt' => $submittedAt->toISOString(),
                'confirmationEmailSent' => false,
            ], 201);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Could not submit withdrawal request'], 500);
        }
    }

    public function adminIndex(): JsonResponse
    {
        try {
            $requests = DB::table('withdrawal_requests')
                ->orderByDesc('submitted_at')
                ->orderByDesc('id')
                ->get([
                    'id',
                    'order_id',
                    'email',
                    'reason',
                    'status',
                    'submitted_at',
                ]);

            return response()->json($requests)->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Failed to load withdrawal requests'], 500);
        }
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (!ctype_digit($id) || (int) $id < 1) {
            return response()->json(['error' => 'Invalid withdrawal request'], 400);
        }

        $status = trim((string) $request->input('status', ''));
        if (!in_array($status, self::STATUSES, true)) {
            return response()->json(['error' => 'Invalid withdrawal status'], 400);
        }

        try {
            $existing = DB::table('withdrawal_requests')->where('id', (int) $id)->first();
            if (!$existing) {
                return response()->json(['error' => 'Withdrawal request not found'], 404);
            }

            DB::table('withdrawal_requests')
                ->where('id', (int) $id)
                ->update(['status' => $status]);

            $updated = DB::table('withdrawal_requests')
                ->where('id', (int) $id)
                ->first([
                    'id',
                    'order_id',
                    'email',
                    'reason',
                    'status',
                    'submitted_at',
                ]);

            return response()->json([
                'success' => true,
                'withdrawal' => $updated,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Failed to update withdrawal request'], 500);
        }
    }
}
