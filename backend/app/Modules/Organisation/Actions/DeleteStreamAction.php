<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Exceptions\StreamInUseException;
use App\Modules\Organisation\Models\Stream;

final class DeleteStreamAction
{
    public function execute(Stream $stream): void
    {
        if ($stream->departments()->exists()) {
            throw new StreamInUseException('Cannot delete stream because one or more departments reference it.');
        }

        $stream->delete();
    }
}
