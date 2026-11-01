<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;

class SampleBroadcastEvent implements ShouldBroadcast
{
    public function __construct(public string $message = 'hello') {}

    /**
     * @return array<Channel>
     */
    public function broadcastOn(): array
    {
        return [new Channel('test-channel')];
    }
}
