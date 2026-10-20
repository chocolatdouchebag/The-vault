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
}
