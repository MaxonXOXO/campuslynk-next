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
                // Allow safe read-only methods and impersonation termination
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
