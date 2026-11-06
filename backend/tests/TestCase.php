<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Feature\Tenancy\TenancyTestHelper;

abstract class TestCase extends BaseTestCase
{
    use TenancyTestHelper;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ensureTestEnvironmentBootstrapped();
    }
}
