<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProductCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_catalogue_includes_active_products_and_slug(): void
    {
        DB::table('products')->insert([
            'name' => 'Arcane Wand',
            'price' => '19.9900000000',
            'stock' => 4,
            'is_active' => true,
            'status' => 'active',
        ]);

        DB::table('products')->insert([
            'name' => 'Hidden Treasure',
            'price' => '5.0000000000',
            'stock' => 1,
            'is_active' => false,
            'status' => 'active',
        ]);

        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Arcane Wand')
            ->assertJsonPath('0.slug', 'arcane-wand');
    }

    public function test_product_detail_accepts_slug_with_numeric_id_suffix(): void
    {
        $id = DB::table('products')->insertGetId([
            'name' => 'Astral Compass',
            'price' => '24.9900000000',
            'stock' => 2,
            'is_active' => true,
            'status' => 'active',
        ]);

        $this->getJson('/api/products/astral-compass-'.$id)
            ->assertOk()
            ->assertJsonPath('id', $id)
            ->assertJsonPath('slug', 'astral-compass');
    }

    public function test_product_detail_exposes_images_in_primary_then_sort_order(): void
    {
        $id = DB::table('products')->insertGetId([
            'name' => 'Gallery Compass',
            'price' => '24.9900000000',
            'stock' => 2,
            'is_active' => true,
            'status' => 'active',
        ]);

        DB::table('product_images')->insert([
            [
                'product_id' => $id,
                'image_url' => '/assets/gallery-later.jpg',
                'alt_text' => 'Additional angle',
                'sort_order' => 2,
                'is_primary' => false,
                'primary_slot' => null,
                'created_at' => now(),
            ],
            [
                'product_id' => $id,
                'image_url' => '/assets/gallery-primary.jpg',
                'alt_text' => 'Primary image',
                'sort_order' => 9,
                'is_primary' => true,
                'primary_slot' => 1,
                'created_at' => now(),
            ],
            [
                'product_id' => $id,
                'image_url' => '/assets/gallery-first-secondary.jpg',
                'alt_text' => 'First additional angle',
                'sort_order' => 0,
                'is_primary' => false,
                'primary_slot' => null,
                'created_at' => now(),
            ],
        ]);

        $this->getJson('/api/products/gallery-compass-'.$id)
            ->assertOk()
            ->assertJsonCount(3, 'images')
            ->assertJsonPath('images.0.image_url', '/assets/gallery-primary.jpg')
            ->assertJsonPath('images.0.is_primary', true)
            ->assertJsonPath('images.1.image_url', '/assets/gallery-first-secondary.jpg')
            ->assertJsonPath('images.2.image_url', '/assets/gallery-later.jpg')
            ->assertJsonMissingPath('images.0.primary_slot');
    }

    public function test_hidden_product_is_not_publicly_retrievable(): void
    {
        $id = DB::table('products')->insertGetId([
            'name' => 'Archived Treasure',
            'price' => '12.0000000000',
            'stock' => 1,
            'is_active' => true,
            'status' => 'archived',
        ]);

        $this->getJson('/api/products/'.$id)
            ->assertNotFound()
            ->assertJsonPath('error', 'Treasure not found');
    }
}
