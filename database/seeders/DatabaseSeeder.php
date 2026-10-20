<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Never load example products into a production environment.
     * No customer, order, payment or other live business data is seeded here.
     */
    public function run(): void
    {
        if (app()->environment('local', 'testing')) {
            $this->call(DemoCatalogSeeder::class);
        }
    }
}
