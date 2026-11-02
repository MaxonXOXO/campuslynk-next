<?php

declare(strict_types=1);

namespace App\Modules\Identity\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class WithoutImpersonation
{
    /**
     * Marker middleware flagging routes that carry side effects on GET
     * and must be blocked during read-only impersonation sessions (ADR-0004).
     */
    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }
}
