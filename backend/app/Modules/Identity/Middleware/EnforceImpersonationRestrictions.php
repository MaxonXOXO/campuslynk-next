<?php

declare(strict_types=1);

namespace App\Modules\Identity\Middleware;

use App\Modules\Identity\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceImpersonationRestrictions
{
    /**
     * Enforce ADR-0004 read-only restrictions for impersonation sessions.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User) {
            $token = $user->currentAccessToken();

            if (is_array($token->abilities) && in_array('impersonation:read_only', $token->abilities, true)) {
                // 1. Prohibit endpoints explicitly flagged with side effects or without_impersonation
                $route = $request->route();
                if ($route !== null) {
                    $middleware = $route->gatherMiddleware();
                    $hasSideEffects = in_array('without_impersonation', $middleware, true)
                        || in_array(WithoutImpersonation::class, $middleware, true)
                        || in_array('side_effects', $middleware, true)
                        || ($route->getAction('without_impersonation') === true);

                    if ($hasSideEffects) {
                        return response()->json([
                            'type' => 'https://api.academic-suite.com/errors/forbidden',
                            'title' => 'Impersonation Prohibited',
                            'status' => 403,
                            'detail' => 'Endpoints with side effects cannot be executed during an impersonation session.',
                        ], 403, ['Content-Type' => 'application/problem+json']);
                    }
                }

                // 2. Allow only safe read-only methods and impersonation termination
                $method = strtoupper($request->method());
                $isSafeMethod = in_array($method, ['GET', 'HEAD', 'OPTIONS'], true);
                $isStopEndpoint = $request->is('api/v1/impersonation/stop');

                if (! $isSafeMethod && ! $isStopEndpoint) {
                    return response()->json([
                        'type' => 'https://api.academic-suite.com/errors/forbidden',
                        'title' => 'Read-Only Impersonation Session',
                        'status' => 403,
                        'detail' => 'State-mutating operations are strictly prohibited during a read-only impersonation session.',
                    ], 403, ['Content-Type' => 'application/problem+json']);
                }
            }
        }

        return $next($request);
    }
}
