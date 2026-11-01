<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use Illuminate\Database\Eloquent\Model;

class TestUnscopedModel extends Model
{
    protected $table = 'unscoped_items';
}
