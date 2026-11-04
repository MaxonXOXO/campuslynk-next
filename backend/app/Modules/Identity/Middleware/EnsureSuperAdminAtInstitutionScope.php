<?php

declare(strict_types=1);

namespace App\Modules\Identity\Middleware;

use App\Core\Http\ProblemDetails;
use App\Modules\Identity\Models\RoleAssignment;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdminAtInstitutionScope
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null) {
            return ProblemDetails::response(
                title: 'Unauthorized',
                detail: 'Authentication required.',
                status: 401,
                type: ProblemDetails::type('unauthorized')
            );
        }

        $token = $user->currentAccessToken();
        if (is_array($token->abilities) && in_array('impersonation:read_only', $token->abilities, true)) {
            return ProblemDetails::response(
                title: 'Forbidden',
                detail: 'Setup endpoints cannot be accessed during an impersonation session.',
                status: 403,
                type: ProblemDetails::type('forbidden')
            );
        }

        $now = now();
        $isSuperAdmin = RoleAssignment::query()
            ->where('user_id', $user->getAuthIdentifier())
            ->where('scope_type', 'institution')
            ->whereRaw('is_active is true')
            ->where(function ($query) use ($now): void {
                $query->whereNull('valid_from')->orWhere('valid_from', '<=', $now);
            })
            ->where(function ($query) use ($now): void {
                $query->whereNull('valid_to')->orWhere('valid_to', '>', $now);
            })
            ->whereHas('role', function ($query): void {
                $query->where('key', 'super_admin');
            })
            ->exists();

        if (! $isSuperAdmin) {
            return ProblemDetails::response(
                title: 'Forbidden',
                detail: 'Access requires super_admin role at institution scope.',
                status: 403,
                type: ProblemDetails::type('forbidden')
            );
        }

        return $next($request);
    }
}
