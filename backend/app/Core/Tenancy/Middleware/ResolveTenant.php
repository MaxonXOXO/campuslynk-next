<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Middleware;

use App\Core\Http\ProblemDetails;
use App\Core\Tenancy\Models\Domain;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class ResolveTenant
{
    public function __construct(
        protected TenantContext $tenantContext
    ) {}

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Exempt routes: healthcheck and framework up probe require no tenant context
        if ($this->isExemptRoute($request)) {
            return $next($request);
        }

        $deployProfile = config('app_profile.deploy_profile', 'onprem');
        $host = strtolower($request->getHost());
        $header = $request->header('X-Tenant');
        $header = is_string($header) && trim($header) !== '' ? trim($header) : null;

        // 2. Resolve tenant by domain
        $tenantByDomain = $this->resolveTenantByDomain($host);

        // 3. In on-prem profile, only registered domains of the single tenant are permitted
        if ($deployProfile === 'onprem' && $tenantByDomain === null) {
            return ProblemDetails::response(
                title: 'Tenant Not Found',
                detail: sprintf('Host [%s] is not a registered domain for this institution.', $host),
                status: Response::HTTP_NOT_FOUND
            );
        }

        // 4. Resolve tenant by X-Tenant header if provided
        $tenantByHeader = null;
        if ($header !== null) {
            $tenantByHeader = $this->resolveTenantByIdentifier($header);

            if ($tenantByHeader === null) {
                return ProblemDetails::response(
                    title: 'Tenant Not Found',
                    detail: sprintf('No tenant matches the X-Tenant identifier [%s].', $header),
                    status: Response::HTTP_NOT_FOUND
                );
            }
        }

        // 5. Host and Header Agreement
        if ($tenantByDomain !== null && $tenantByHeader !== null) {
            if ($tenantByDomain->id !== $tenantByHeader->id) {
                return ProblemDetails::response(
                    title: 'Tenant Mismatch',
                    detail: 'The Host domain and X-Tenant header resolve to different tenants.',
                    status: Response::HTTP_BAD_REQUEST
                );
            }
        }

        /** @var Tenant|null $tenant */
        $tenant = $tenantByDomain ?? $tenantByHeader;

        if ($tenant === null) {
            return ProblemDetails::response(
                title: 'Tenant Not Found',
                detail: sprintf('No tenant matches the requested host [%s].', $host),
                status: Response::HTTP_NOT_FOUND
            );
        }

        // 6. Tenant Status & License Verification
        if ($tenant->hasFailed()) {
            return ProblemDetails::response(
                title: 'Tenant Failed',
                detail: 'Tenant provisioning failed.',
                status: Response::HTTP_INTERNAL_SERVER_ERROR
            );
        }

        if ($tenant->isProvisioning()) {
            return ProblemDetails::response(
                title: 'Tenant Provisioning',
                detail: 'Tenant is currently being provisioned. Please try again shortly.',
                status: Response::HTTP_SERVICE_UNAVAILABLE
            );
        }

        if ($tenant->isSuspended()) {
            return ProblemDetails::response(
                title: 'Tenant Suspended',
                detail: 'Access to this institution has been suspended.',
                status: Response::HTTP_FORBIDDEN
            );
        }

        if ($tenant->license === null) {
            return ProblemDetails::response(
                title: 'License Required',
                detail: 'No active license found for this institution.',
                status: Response::HTTP_FORBIDDEN
            );
        }

        if ($tenant->license->isPastGrace()) {
            return ProblemDetails::response(
                title: 'License Expired',
                detail: 'The license and grace period for this institution have expired.',
                status: Response::HTTP_FORBIDDEN
            );
        }

        // 7. Exception-safe context lifecycle
        try {
            $this->tenantContext->setTenant($tenant);

            return $next($request);
        } finally {
            $this->tenantContext->forget();
        }
    }

    /**
     * Check if the request route is exempt from tenant resolution.
     */
    protected function isExemptRoute(Request $request): bool
    {
        return $request->is('up')
            || $request->is('api/v1/health')
            || $request->routeIs('api.v1.health');
    }

    /**
     * Resolve a tenant by host domain (cached for 5 minutes).
     */
    protected function resolveTenantByDomain(string $host): ?Tenant
    {
        $ttl = (int) config('tenancy.cache.resolver_ttl_seconds', 300);
        $cacheKey = 'tenant:domain:'.$host;

        /** @var string|null $tenantId */
        $tenantId = Cache::remember($cacheKey, $ttl, function () use ($host): ?string {
            $domain = Domain::where('domain', $host)->first();

            return $domain?->tenant_id;
        });

        if ($tenantId === null) {
            return null;
        }

        $tenantCacheKey = 'tenant:entity:'.$tenantId;

        return Cache::remember($tenantCacheKey, $ttl, function () use ($tenantId): ?Tenant {
            return Tenant::with(['database', 'license'])->find($tenantId);
        });
    }

    /**
     * Resolve a tenant by slug or ULID.
     */
    protected function resolveTenantByIdentifier(string $identifier): ?Tenant
    {
        return Tenant::with(['database', 'license'])
            ->where('slug', $identifier)
            ->orWhere('id', $identifier)
            ->first();
    }
}
