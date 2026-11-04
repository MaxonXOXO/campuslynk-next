<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Authorization\ScopeLabelValidator;
use App\Modules\Organisation\Models\Stream;

final class CreateStreamAction
{
    public function execute(string $code, string $name): Stream
    {
        $cleanCode = trim($code);
        $scopeLabel = 's_'.strtolower((string) preg_replace('/[^a-zA-Z0-9_]/', '_', $cleanCode));

        ScopeLabelValidator::validate($scopeLabel);

        /** @var Stream $stream */
        $stream = Stream::create([
            'code' => $cleanCode,
            'name' => trim($name),
            'scope_label' => $scopeLabel,
        ]);

        return $stream;
    }
}
