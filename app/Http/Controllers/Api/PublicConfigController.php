<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class PublicConfigController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'analyticsMeasurementId' => trim((string) config('services.fligaliga.analytics_measurement_id')) ?: null,
        ])->header('Cache-Control', 'public, max-age=300');
    }
}
