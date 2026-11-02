<?php

declare(strict_types=1);

namespace App\Modules\Identity\Middleware;

use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function __construct(
        protected ScopeAuthorizer $authorizer
    ) {}

    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/unauthorized',
                'title' => 'Unauthorized',
                'status' => 401,
                'detail' => 'Authentication required.',
            ], 401, ['Content-Type' => 'application/problem+json']);
        }

        if (! $this->authorizer->can($user, $permission)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => "User does not possess the required permission [{$permission}].",
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        return $next($request);
    }
}
