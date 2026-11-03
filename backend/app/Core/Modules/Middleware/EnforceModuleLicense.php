<?php

declare(strict_types=1);

namespace App\Core\Modules\Middleware;

use App\Core\Modules\ModuleRegistry;
use App\Core\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceModuleLicense
{
    public function __construct(
        protected TenantContext $tenantContext,
        protected ModuleRegistry $moduleRegistry,
    ) {}

    public function handle(Request $request, Closure $next, string $slug): Response
    {
        // 1. Core baseline modules (identity, organisation) are always permitted
        if ($this->moduleRegistry->isCore($slug)) {
            return $next($request);
        }

        // 2. Active tenant context check
        $tenant = $this->tenantContext->getTenant();
        if ($tenant === null) {
            return new JsonResponse([
                'type' => 'https://academic-suite.net/errors/tenant-context-missing',
                'title' => 'Tenant Context Missing',
                'status' => 403,
                'detail' => 'Module access requires an active tenant context.',
            ], 403, [
                'Content-Type' => 'application/problem+json',
            ]);
        }

        // 3. Verify module enabled in tenant license
        $license = $tenant->license;
        /** @var array<string> $modules */
        $modules = is_array($license?->modules) ? $license->modules : [];

        if (! in_array($slug, $modules, true)) {
            return new JsonResponse([
                'type' => 'https://academic-suite.net/errors/module-not-licensed',
                'title' => 'Module Not Licensed',
                'status' => 403,
                'detail' => sprintf('The module [%s] is not enabled under your institutional licence.', $slug),
            ], 403, [
                'Content-Type' => 'application/problem+json',
            ]);
        }

        return $next($request);
    }
}
