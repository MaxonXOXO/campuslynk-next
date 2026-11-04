<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Models\Stream;

final class UpdateStreamAction
{
    public function execute(Stream $stream, string $name): Stream
    {
        $stream->update([
            'name' => trim($name),
        ]);

        return $stream;
    }
}
