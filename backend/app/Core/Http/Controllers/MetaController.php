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

        return response()->json([
            'data' => [
                'server_version' => '1.0.0',
                'api_version' => 'v1',
                'min_client_version' => '1.0.0',
                'capabilities' => [],
                'deprecations' => [],
            ],
            'meta' => [
                'tenant' => $tenant->slug,
                'tenant_name' => $tenant->name,
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/meta'),
            ],
        ]);
    }
}
