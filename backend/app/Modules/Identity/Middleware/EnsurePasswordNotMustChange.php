<?php

declare(strict_types=1);

namespace App\Modules\Identity\Middleware;

use App\Core\Http\ProblemDetails;
use App\Modules\Identity\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordNotMustChange
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User && $user->must_change_password) {
            // Allow password change and logout routes
            if ($request->is('api/v1/auth/password/change') || $request->is('api/v1/auth/logout')) {
                return $next($request);
            }

            return ProblemDetails::response(
                title: 'Password Change Required',
                detail: 'You must change your password before accessing other features.',
                status: Response::HTTP_FORBIDDEN
            );
        }

        return $next($request);
    }
}
