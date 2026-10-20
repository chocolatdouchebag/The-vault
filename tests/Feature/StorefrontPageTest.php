<?php

namespace Tests\Feature;

use Tests\TestCase;

class StorefrontPageTest extends TestCase
{
    public function test_homepage_returns_the_existing_vault_frontend(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('FLIGALIGA');
    }

    public function test_shared_product_url_returns_the_frontend_shell(): void
    {
        $this->get('/product/astral-compass-1')
            ->assertOk()
            ->assertSee('FLIGALIGA');
    }

    public function test_all_existing_storefront_page_routes_return_the_frontend_shell(): void
    {
        $pages = [
            '/treasures',
            '/new-arrivals',
            '/ledger',
            '/merchant',
            '/faq',
            '/contact',
            '/shipping',
            '/returns',
            '/privacy',
            '/terms',
            '/withdrawal',
            '/accessibility',
            '/payment-result',
        ];

        foreach ($pages as $path) {
            $this->get($path)
                ->assertOk()
                ->assertSee('FLIGALIGA');
        }
    }

    public function test_apache_default_document_uses_laravel_front_controller(): void
    {
        $path = public_path('.htaccess');

        $this->assertFileExists($path);
        $this->assertStringContainsString(
            'DirectoryIndex index.php',
            (string) file_get_contents($path)
        );
    }

    public function test_statutory_model_withdrawal_form_file_is_preserved(): void
    {
        $path = public_path('withdrawal-form.html');

        $this->assertFileExists($path);
        $this->assertFileIsReadable($path);
        $this->assertStringContainsString(
            'FLIGALIGA',
            (string) file_get_contents($path)
        );
    }
}
