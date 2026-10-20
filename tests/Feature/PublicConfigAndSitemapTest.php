<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PublicConfigAndSitemapTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_config_returns_only_public_analytics_settings(): void
    {
        config(['services.fligaliga.analytics_measurement_id' => 'G-TEST123']);

        $this->getJson('/api/public-config')
            ->assertOk()
            ->assertJsonPath('analyticsMeasurementId', 'G-TEST123')
            ->assertHeader('Cache-Control', 'public, max-age=300');
    }

    public function test_public_config_returns_null_when_analytics_is_not_configured(): void
    {
        config(['services.fligaliga.analytics_measurement_id' => null]);

        $this->getJson('/api/public-config')
            ->assertOk()
            ->assertExactJson(['analyticsMeasurementId' => null]);
    }

    public function test_sitemap_lists_storefront_pages_and_active_products_only(): void
    {
        $productId = DB::table('products')->insertGetId([
            'name' => 'Astral Compass',
            'price' => '24.9900000000',
            'stock' => 2,
            'category' => 'Artifacts',
            'is_active' => true,
            'status' => 'active',
        ]);

        DB::table('products')->insert([
            'name' => 'Hidden Treasure',
            'price' => '5.0000000000',
            'stock' => 1,
            'category' => 'Oddities',
            'is_active' => false,
            'status' => 'active',
        ]);

        config(['services.fligaliga.public_url' => 'https://fligaliga.example.test']);

        $response = $this->get('/sitemap.xml')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml; charset=UTF-8')
            ->assertHeader('Cache-Control', 'public, max-age=600')
            ->assertSee('https://fligaliga.example.test/', false)
            ->assertSee(
                'https://fligaliga.example.test/product/astral-compass-'.$productId,
                false
            );

        $this->assertStringNotContainsString(
            'https://fligaliga.example.test/product/hidden-treasure-',
            $response->getContent()
        );
    }
}
