<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class ContactPlaceholderController extends Controller
{
    public function __invoke(): JsonResponse
    {
        // Do not report success or silently discard messages before an email provider
        // and destination are configured and the delivery path has been tested.
        return response()->json([
            'error' => 'The contact service is not configured yet. Please email fligaliga@hotmail.com directly.',
        ], 503);
    }
}
