<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthApiTest extends TestCase
{
    public function test_health_endpoint_reports_database_connectivity(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['ok' => true]);
    }
}
