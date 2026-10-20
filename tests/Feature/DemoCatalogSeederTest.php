<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DemoCatalogSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_catalogue_is_synthetic_repeatable_and_uses_existing_assets(): void
    {
        $this->seed();

        $expected = [
            'Arcane Wand' => '/assets/arcane-wand.jpg',
            'Astral Compass' => '/assets/astral-compass.jpg',
            'Mariner Lantern' => '/assets/mariner-lantern.jpg',
            'Sealed Mystery Box' => '/assets/sealed-box.jpg',
        ];

        foreach ($expected as $name => $imageUrl) {
            $this->assertDatabaseHas('products', [
                'name' => $name,
                'image_url' => $imageUrl,
                'is_active' => 1,
                'status' => 'active',
            ]);
        }

        $this->seed();
        $this->assertSame(4, DB::table('products')->count());
        $this->assertSame(
            4,
            DB::table('products')
                ->where('provenance', 'like', 'Synthetic development example%')
                ->count()
        );
    }

    public function test_demo_catalogue_seeder_refuses_non_development_environments(): void
    {
        $this->app->detectEnvironment(fn () => 'production');

        try {
            $this->seed(\Database\Seeders\DemoCatalogSeeder::class);
            $this->fail('The demo seeder should reject production environments.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString(
                'restricted to local/testing environments',
                $exception->getMessage()
            );
        } finally {
            $this->app->detectEnvironment(fn () => 'testing');
        }

        $this->assertSame(0, DB::table('products')->count());
    }
}
