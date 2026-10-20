<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Browser fetch() POST requests send Origin. Set it by default in tests so
        // normal write-flow tests model the existing same-origin storefront.
        $this->withHeader('Origin', (string) config('app.url'));
    }
}
