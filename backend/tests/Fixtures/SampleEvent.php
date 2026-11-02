<?php

declare(strict_types=1);

namespace Tests\Fixtures;

class SampleEvent
{
    public function __construct(public string $payload = 'event_data') {}
}
