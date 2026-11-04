<?php

declare(strict_types=1);

namespace App\Core\Http;

use Illuminate\Http\JsonResponse;

class ProblemDetails
{
    /**
     * Resolve a problem type URI for the given slug.
     */
    public static function type(string $slug): string
    {
        $baseUrl = rtrim((string) config('errors.problem_types.base_url', 'https://errors.campuslynk.net'), '/');
        $trimmedSlug = ltrim(trim($slug), '/');

        return "{$baseUrl}/{$trimmedSlug}";
    }

    /**
     * Create an RFC 7807 problem details JSON response.
     *
     * @param  array<string, mixed>  $errors
     */
    public static function response(
        string $title,
        string $detail,
        int $status,
        string $type = 'about:blank',
        array $errors = []
    ): JsonResponse {
        return response()->json([
            'type' => $type,
            'title' => $title,
            'status' => $status,
            'detail' => $detail,
            'errors' => $errors,
        ], $status, [
            'Content-Type' => 'application/problem+json',
        ]);
    }
}
