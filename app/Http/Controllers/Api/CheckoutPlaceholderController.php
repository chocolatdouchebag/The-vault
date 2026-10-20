<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CheckoutPlaceholderController extends Controller
{
    /**
     * Payment is intentionally disabled until the owner is ready to configure Mollie
     * and complete the staged payment lifecycle. Never create an order or reserve stock
     * while this placeholder is active.
     */
    public function __invoke(Request $request): JsonResponse
    {
        return response()->json([
            'error' => 'Online checkout is not configured yet.',
        ], 503);
    }
}
