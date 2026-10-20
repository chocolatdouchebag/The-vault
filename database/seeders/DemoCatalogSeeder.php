<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DemoCatalogSeeder extends Seeder
{
    /**
     * Create synthetic storefront examples with existing public images.
     * This must never run against a production environment or live database.
     */
    public function run(): void
    {
        if (!app()->environment('local', 'testing')) {
            throw new RuntimeException(
                'DemoCatalogSeeder is restricted to local/testing environments. No rows were seeded.'
            );
        }

        $now = now();
        $products = [
            [
                'name' => 'Arcane Wand',
                'price' => '19.9900000000',
                'stock' => 4,
                'image_url' => '/assets/arcane-wand.jpg',
                'description' => 'A mysterious wand, included as synthetic development catalogue data.',
                'category' => 'Artifacts',
                'rarity' => 'Rare',
                'origin' => 'Demo collection',
                'condition' => 'Good',
                'provenance' => 'Synthetic development example; not a real stock record.',
                'is_featured' => true,
                'is_new_arrival' => false,
            ],
            [
                'name' => 'Astral Compass',
                'price' => '24.9900000000',
                'stock' => 3,
                'image_url' => '/assets/astral-compass.jpg',
                'description' => 'A curious compass for a wandering collector.',
                'category' => 'Artifacts',
                'rarity' => 'Very Rare',
                'origin' => 'Demo collection',
                'condition' => 'Good',
                'provenance' => 'Synthetic development example; not a real stock record.',
                'is_featured' => true,
                'is_new_arrival' => true,
            ],
            [
                'name' => 'Mariner Lantern',
                'price' => '16.5000000000',
                'stock' => 6,
                'image_url' => '/assets/mariner-lantern.jpg',
                'description' => 'An atmospheric lantern from the fictional Vault catalogue.',
                'category' => 'Oddities',
                'rarity' => 'Uncommon',
                'origin' => 'Demo collection',
                'condition' => 'Used',
                'provenance' => 'Synthetic development example; not a real stock record.',
                'is_featured' => false,
                'is_new_arrival' => true,
            ],
            [
                'name' => 'Sealed Mystery Box',
                'price' => '29.9500000000',
                'stock' => 5,
                'image_url' => '/assets/sealed-box.jpg',
                'description' => 'A sealed mystery box for testing catalogue cards and filters.',
                'category' => 'Mystery Boxes',
                'rarity' => 'Unique',
                'origin' => 'Demo collection',
                'condition' => 'Sealed',
                'provenance' => 'Synthetic development example; not a real stock record.',
                'is_featured' => false,
                'is_new_arrival' => false,
            ],
        ];

        foreach ($products as $product) {
            DB::table('products')->updateOrInsert(
                [
                    'name' => $product['name'],
                    'image_url' => $product['image_url'],
                ],
                array_merge($product, [
                    'is_active' => true,
                    'status' => 'active',
                    'fulfillment_method' => 'stock',
                    'category_id' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
            );
        }
    }
}
