<?php

namespace Tests\Unit;

use Illuminate\Support\Str;
use PHPUnit\Framework\TestCase;

class SlugTest extends TestCase
{
    public function test_product_slugs_match_the_vault_url_convention(): void
    {
        $this->assertSame('astral-compass', Str::slug('Astral Compass'));
        $this->assertSame('arcane-wand', Str::slug('Arcane Wand'));
    }
}
