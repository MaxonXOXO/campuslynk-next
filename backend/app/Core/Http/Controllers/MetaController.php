<?php

declare(strict_types=1);

namespace App\Core\Http\Controllers;

use App\Core\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MetaController
{
    public function __invoke(Request $request, TenantContext $context): JsonResponse
    {
        $tenant = $context->tenant();

        $licenseStatus = $tenant->license?->status() ?? 'expired';

        return response()->json([
            'data' => [
                'server_version' => '1.0.0',
                'api_version' => 'v1',
                'min_client_version' => '1.0.0',
                'capabilities' => [],
                'deprecations' => [],
                'license' => [
                    'status' => $licenseStatus,
                ],
                'licence' => [
                    'status' => $licenseStatus,
                ],
            ],
            'meta' => [
                'tenant' => [
                    'slug' => $tenant->slug,
                    'name' => $tenant->name,
                ],
                'license' => [
                    'status' => $licenseStatus,
                ],
                'licence' => [
                    'status' => $licenseStatus,
                ],
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/meta'),
            ],
        ]);
    }
}
