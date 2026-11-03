<?php

declare(strict_types=1);

namespace App\Core\Modules\Contracts;

interface ModuleManifestContract
{
    /**
     * Unique lowercase snake_case module identifier (e.g. 'identity', 'organisation', 'attendance').
     */
    public function slug(): string;

    /**
     * Human-readable module name (e.g. 'Identity', 'Organisation', 'Attendance').
     */
    public function name(): string;

    /**
     * True for core baseline modules (identity, organisation); false for licensed feature modules.
     */
    public function isCore(): bool;

    /**
     * Returns the list of three-part permission keys (module.resource.action) owned by this module.
     *
     * @return list<string>
     */
    public function permissions(): array;

    /**
     * Loads the module's Routes/api.php under /api/v1.
     */
    public function registerRoutes(): void;
}
