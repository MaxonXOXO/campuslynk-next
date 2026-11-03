<?php

declare(strict_types=1);

namespace App\Core\Contracts;

interface ScopedResource
{
    /**
     * Get the managing scope path for governance/write authorization.
     */
    public function getManagingScopePath(): string;

    /**
     * Get the home scope path for read/directory authorization.
     */
    public function getHomeScopePath(): string;
}
