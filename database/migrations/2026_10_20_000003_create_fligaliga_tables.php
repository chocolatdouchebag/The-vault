<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 255)->collation('utf8mb4_bin')->unique();
            $table->string('slug', 255)->collation('utf8mb4_bin')->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at', 6)->useCurrent();
            $table->timestamp('updated_at', 6)->useCurrent();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->text('name');
            $table->decimal('price', 30, 10);
            $table->text('image_url')->nullable();
            $table->integer('stock')->default(0);
            $table->text('description')->nullable();
            $table->text('category')->nullable();
            $table->timestamp('created_at', 6)->useCurrent();
            $table->timestamp('updated_at', 6)->useCurrent();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('category_id')->nullable();
            $table->string('status', 32)->default('active');
            $table->string('fulfillment_method', 32)->default('stock');
            $table->text('rarity')->nullable();
            $table->text('origin')->nullable();
            $table->text('condition')->nullable();
            $table->text('provenance')->nullable();
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_new_arrival')->default(false);
            $table->index('is_active', 'idx_products_active');
            $table->index('category_id', 'idx_products_category_id');
            $table->foreign('category_id')->references('id')->on('categories')->nullOnDelete();
        });

        // Generated columns preserve the original PostgreSQL uniqueness rules on
        // MySQL/MariaDB without attempting to index unrestricted TEXT columns.
        if (DB::getDriverName() !== 'sqlite') {
            Schema::table('products', function (Blueprint $table) {
                $table->char('unique_name_image_hash', 64)
                    ->nullable()
                    ->storedAs("CASE WHEN image_url IS NULL THEN NULL ELSE SHA2(CONCAT(CAST(name AS BINARY), 0x00, CAST(image_url AS BINARY)), 256) END");
                $table->unique('unique_name_image_hash', 'unique_name_image');
            });
        }

        Schema::create('product_variants', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('product_id');
            $table->string('sku', 255)->collation('utf8mb4_bin')->nullable()->unique('unique_product_variant_sku');
            $table->text('name')->nullable();
            $table->decimal('price', 12, 2)->default(0);
            $table->integer('stock')->default(0);
            if (DB::getDriverName() === 'sqlite') {
                $table->json('attributes')->default('{}');
            } else {
                // Match the PostgreSQL NOT NULL DEFAULT '{}'::jsonb contract.
                // MySQL JSON defaults must be expressions; JSON_OBJECT() works on MySQL/MariaDB.
                $table->json('attributes')->default(DB::raw('(JSON_OBJECT())'));
            }
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at', 6)->useCurrent();
            $table->timestamp('updated_at', 6)->useCurrent();
            $table->index('product_id', 'idx_product_variants_product');
            $table->index('is_active', 'idx_product_variants_active');
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
        });

        Schema::create('product_images', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('product_id');
            $table->text('image_url');
            $table->text('alt_text')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_primary')->default(false);
            // MySQL/MariaDB generated columns cannot safely reference this cascading FK
            // in all supported configurations. Store a nullable slot: 1 for primary,
            // NULL for ordinary images. The write service and import mapper must sync it.
            $table->unsignedTinyInteger('primary_slot')->nullable();
            $table->timestamp('created_at', 6)->useCurrent();
            $table->unique(['product_id', 'primary_slot'], 'unique_primary_product_image');
            $table->index(['product_id', 'sort_order'], 'idx_product_images_product');
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id')->nullable();
            $table->decimal('total', 30, 10);
            $table->string('status', 64)->collation('utf8mb4_bin')->nullable()->default('pending');
            $table->timestamp('created_at', 6)->nullable()->useCurrent();
            $table->timestamp('updated_at', 6)->useCurrent();
            $table->text('customer_name')->nullable();
            $table->string('customer_email', 254)->collation('utf8mb4_bin')->nullable();
            $table->text('shipping_address_line1')->nullable();
            $table->text('shipping_postcode')->nullable();
            $table->text('shipping_city')->nullable();
            $table->string('shipping_country', 255)->nullable()->default('NL');
            $table->string('payment_id', 255)->collation('utf8mb4_bin')->nullable()->unique('idx_orders_payment_id');
            $table->timestamp('paid_at', 6)->nullable();
            $table->timestamp('stock_released_at', 6)->nullable();
            $table->timestamp('payment_expires_at', 6)->nullable();
            $table->timestamp('order_received_email_sent_at', 6)->nullable();
            $table->timestamp('payment_confirmation_email_sent_at', 6)->nullable();
            $table->index('user_id', 'idx_orders_user');
            $table->index('created_at', 'idx_orders_created_at');
            $table->index('customer_email', 'idx_orders_customer_email');
            $table->index(['status', 'stock_released_at', 'payment_expires_at', 'id'], 'idx_orders_payment_pending_expiry');
            $table->foreign('user_id')->references('id')->on('users');
        });

        Schema::create('cart', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('product_id')->nullable();
            $table->integer('quantity')->default(1);
            $table->unsignedInteger('user_id')->nullable();
            $table->unsignedInteger('variant_id')->nullable();
            $table->unique(['user_id', 'product_id', 'variant_id'], 'unique_cart_user_product_variant');
            $table->index('user_id', 'idx_cart_user');
            $table->index('variant_id', 'idx_cart_variant');
            $table->foreign('product_id')->references('id')->on('products');
            $table->foreign('user_id')->references('id')->on('users');
            $table->foreign('variant_id')->references('id')->on('product_variants')->restrictOnDelete();
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('order_id')->nullable();
            $table->unsignedInteger('product_id')->nullable();
            $table->integer('quantity');
            $table->decimal('price', 30, 10);
            $table->decimal('price_each', 30, 10)->default(0);
            $table->unsignedInteger('variant_id')->nullable();
            $table->index('order_id', 'idx_order_items_order');
            $table->index('variant_id', 'idx_order_items_variant');
            $table->foreign('order_id')->references('id')->on('orders');
            $table->foreign('product_id')->references('id')->on('products');
            $table->foreign('variant_id')->references('id')->on('product_variants')->restrictOnDelete();
        });

        Schema::create('session', function (Blueprint $table) {
            $table->string('sid', 255)->collation('utf8mb4_bin')->primary();
            $table->json('sess');
            $table->timestamp('expire', 6);
            $table->index('expire', 'idx_session_expire');
        });

        Schema::create('withdrawal_requests', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('order_id')->nullable();
            $table->string('email', 254)->collation('utf8mb4_bin');
            $table->text('reason')->nullable();
            $table->string('status', 32)->collation('utf8mb4_bin')->default('received');
            $table->timestamp('submitted_at', 6)->useCurrent();
            $table->timestamp('confirmation_email_sent_at', 6)->nullable();
            $table->index('order_id', 'idx_withdrawal_order');
            $table->index('submitted_at', 'idx_withdrawal_submitted_at');
            $table->foreign('order_id')->references('id')->on('orders')->nullOnDelete();
        });

        // Preserve the PostgreSQL source's CHECK constraints on the actual
        // MySQL/MariaDB target. Laravel's SQLite tests intentionally skip these
        // engine-specific ALTER TABLE statements; database compatibility CI
        // exercises them against both supported target engines.
        if (DB::getDriverName() !== 'sqlite') {
            $checks = [
                "ALTER TABLE `products` ADD CONSTRAINT `products_price_non_negative` CHECK (`price` >= 0)",
                "ALTER TABLE `products` ADD CONSTRAINT `products_stock_non_negative` CHECK (`stock` >= 0)",
                "ALTER TABLE `products` ADD CONSTRAINT `products_status_valid` CHECK (BINARY `status` IN ('draft', 'active', 'archived'))",
                "ALTER TABLE `products` ADD CONSTRAINT `products_fulfillment_method_valid` CHECK (BINARY `fulfillment_method` IN ('stock', 'made_to_order', 'print_on_demand', 'external'))",
                "ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_price_non_negative` CHECK (`price` >= 0)",
                "ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_stock_non_negative` CHECK (`stock` >= 0)",
                "ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_attributes_object` CHECK (JSON_TYPE(`attributes`) = 'OBJECT')",
                "ALTER TABLE `product_images` ADD CONSTRAINT `product_images_sort_order_non_negative` CHECK (`sort_order` >= 0)",
                "ALTER TABLE `product_images` ADD CONSTRAINT `product_images_url_not_blank` CHECK (CHAR_LENGTH(TRIM(`image_url`)) > 0)",
                "ALTER TABLE `product_images` ADD CONSTRAINT `product_images_primary_state_valid` CHECK ((`is_primary` = 1 AND `primary_slot` IS NOT NULL AND `primary_slot` = 1) OR (`is_primary` = 0 AND `primary_slot` IS NULL))",
                "ALTER TABLE `orders` ADD CONSTRAINT `orders_total_non_negative` CHECK (`total` >= 0)",
                "ALTER TABLE `cart` ADD CONSTRAINT `cart_quantity_positive` CHECK (`quantity` > 0)",
                "ALTER TABLE `order_items` ADD CONSTRAINT `order_items_quantity_positive` CHECK (`quantity` > 0)",
                "ALTER TABLE `order_items` ADD CONSTRAINT `order_items_price_non_negative` CHECK (`price` >= 0)",
                "ALTER TABLE `order_items` ADD CONSTRAINT `order_items_price_each_non_negative` CHECK (`price_each` >= 0)",
                "ALTER TABLE `withdrawal_requests` ADD CONSTRAINT `withdrawal_status_valid` CHECK (BINARY `status` IN ('received', 'reviewing', 'completed', 'rejected'))",
                "ALTER TABLE `withdrawal_requests` ADD CONSTRAINT `withdrawal_email_not_blank` CHECK (CHAR_LENGTH(TRIM(`email`)) > 3)"
            ];

            foreach ($checks as $check) {
                DB::statement($check);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('withdrawal_requests');
        Schema::dropIfExists('session');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('cart');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('product_images');
        Schema::dropIfExists('product_variants');
        Schema::dropIfExists('products');
        Schema::dropIfExists('categories');
    }
};
