<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Product extends Model
{
    protected $table = 'products';

    protected $guarded = [];

    protected $hidden = [
        'unique_name_image_hash',
    ];

    protected $appends = ['slug'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_featured' => 'boolean',
            'is_new_arrival' => 'boolean',
        ];
    }

    public function getSlugAttribute(): string
    {
        return Str::slug((string) $this->name);
    }
}
