<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Core\Http\ProblemDetails;
use App\Modules\Organisation\Actions\CreateStreamAction;
use App\Modules\Organisation\Actions\DeleteStreamAction;
use App\Modules\Organisation\Actions\UpdateStreamAction;
use App\Modules\Organisation\Http\Requests\CreateStreamRequest;
use App\Modules\Organisation\Http\Requests\UpdateStreamRequest;
use App\Modules\Organisation\Http\Resources\StreamResource;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class StreamController
{
    public function index(Request $request): JsonResponse
    {
        $streams = Stream::query()
            ->withCount('departments')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => StreamResource::collection($streams),
            'meta' => [
                'total' => $streams->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function store(CreateStreamRequest $request, CreateStreamAction $action): JsonResponse
    {
        $stream = $action->execute(
            code: (string) $request->validated('code'),
            name: (string) $request->validated('name')
        );

        return response()->json([
            'data' => new StreamResource($stream),
            'links' => [
                'self' => url("/api/v1/streams/{$stream->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(UpdateStreamRequest $request, string $id, UpdateStreamAction $action): JsonResponse
    {
        /** @var Stream $stream */
        $stream = Stream::withCount('departments')->findOrFail($id);

        if ($request->has('code') && $request->input('code') !== $stream->code) {
            return ProblemDetails::response(
                title: 'Unprocessable Content',
                detail: 'Stream code is immutable and cannot be changed.',
                status: Response::HTTP_UNPROCESSABLE_ENTITY,
                type: ProblemDetails::type('unprocessable'),
                errors: [
                    'code' => ['Stream code is immutable and cannot be changed.'],
                ]
            );
        }

        $updated = $action->execute($stream, (string) $request->validated('name'));

        return response()->json([
            'data' => new StreamResource($updated),
            'links' => [
                'self' => url("/api/v1/streams/{$updated->id}"),
            ],
        ]);
    }

    public function destroy(Request $request, string $id, DeleteStreamAction $action): JsonResponse
    {
        /** @var Stream $stream */
        $stream = Stream::findOrFail($id);

        $action->execute($stream);

        return response()->json([
            'data' => [
                'message' => 'Stream deleted successfully.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
        ]);
    }
}
