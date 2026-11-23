<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\BulkApproveUsersAction;
use App\Modules\Identity\Actions\CommitStaffImportAction;
use App\Modules\Identity\Actions\PreviewStaffImportAction;
use App\Modules\Identity\Http\Requests\CommitStaffImportRequest;
use App\Modules\Identity\Http\Requests\PreviewStaffImportRequest;
use App\Modules\Identity\Models\StaffImportBatch;
use App\Modules\Identity\Models\StaffProfile;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\StaffImportParser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StaffImportController
{
    public function template(): StreamedResponse
    {
        $headers = StaffImportParser::TEMPLATE_HEADERS;

        return response()->streamDownload(function () use ($headers): void {
            $out = fopen('php://output', 'w');
            if ($out !== false) {
                fputcsv($out, $headers);
                fputcsv($out, ['Dr. Asha Nair', 'asha@college.edu', '+919876543210', '', 'CE', 'Lecturer', 'EMP-001']);
                fclose($out);
            }
        }, 'staff_import_template.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function preview(PreviewStaffImportRequest $request, PreviewStaffImportAction $action): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $file = $request->file('file');
        abort_if($file === null, 422, 'Import file is required.');

        $result = $action->execute($actor, $file);
        $batch = $result['batch'];

        return response()->json([
            'data' => [
                'batch' => $this->formatBatch($batch),
                'rows_preview' => $result['rows_preview'],
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/staff-imports/{$batch->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function commit(CommitStaffImportRequest $request, string $id, CommitStaffImportAction $action): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $commonPassword = (string) $request->validated('common_password');
        $autoApprove = (bool) ($request->validated('auto_approve') ?? false);
        $idempotencyKey = $request->validated('idempotency_key');

        $batch = $action->execute(
            actor: $actor,
            batchId: $id,
            commonPassword: $commonPassword,
            autoApprove: $autoApprove,
            idempotencyKey: is_string($idempotencyKey) ? $idempotencyKey : null,
        );

        return response()->json([
            'data' => $this->formatBatch($batch),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/staff-imports/{$batch->id}"),
            ],
        ], Response::HTTP_ACCEPTED, ['Cache-Control' => 'no-store']);
    }

    public function show(string $id): JsonResponse
    {
        /** @var StaffImportBatch $batch */
        $batch = StaffImportBatch::findOrFail($id);

        return response()->json([
            'data' => $this->formatBatch($batch),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/staff-imports/{$batch->id}"),
            ],
        ]);
    }

    public function failedRows(string $id): StreamedResponse
    {
        /** @var StaffImportBatch $batch */
        $batch = StaffImportBatch::findOrFail($id);
        $summary = is_array($batch->error_summary) ? $batch->error_summary : [];

        return response()->streamDownload(function () use ($summary): void {
            $out = fopen('php://output', 'w');
            if ($out === false) {
                return;
            }
            fputcsv($out, ['row_number', 'status', 'name', 'email', 'mobile', 'registration_number', 'errors']);
            foreach ($summary as $item) {
                $payload = is_array($item['payload'] ?? null) ? $item['payload'] : [];
                $errors = is_array($item['errors'] ?? null) ? implode('; ', array_map('strval', $item['errors'])) : '';
                fputcsv($out, [
                    (string) ($item['row_number'] ?? ''),
                    $this->safeCsvCell((string) ($item['status'] ?? '')),
                    $this->safeCsvCell((string) ($payload['name'] ?? '')),
                    $this->safeCsvCell((string) ($payload['email'] ?? '')),
                    $this->safeCsvCell((string) ($payload['mobile'] ?? '')),
                    $this->safeCsvCell((string) ($payload['registration_number'] ?? '')),
                    $this->safeCsvCell($errors),
                ]);
            }
            fclose($out);
        }, "staff_import_{$batch->id}_failed.csv", [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function approveBatch(Request $request, string $id, BulkApproveUsersAction $action): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        /** @var StaffImportBatch $batch */
        $batch = StaffImportBatch::findOrFail($id);

        /** @var list<string> $pendingUserIds */
        $pendingUserIds = StaffProfile::query()
            ->where('import_batch_id', $batch->id)
            ->whereHas('user', fn ($q) => $q->where('status', 'pending'))
            ->pluck('user_id')
            ->all();

        $result = $pendingUserIds === []
            ? ['results' => [], 'summary' => ['approved' => 0, 'failed' => 0]]
            : $action->execute($actor, $pendingUserIds);

        return response()->json([
            'data' => $result,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'batch_id' => $batch->id,
            ],
            'links' => [
                'self' => url("/api/v1/staff-imports/{$batch->id}/approve"),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatBatch(StaffImportBatch $batch): array
    {
        return [
            'id' => $batch->id,
            'filename' => $batch->filename,
            'status' => $batch->status,
            'auto_approve' => $batch->auto_approve,
            'total_rows' => $batch->total_rows,
            'valid_rows' => $batch->valid_rows,
            'duplicate_rows' => $batch->duplicate_rows,
            'invalid_rows' => $batch->invalid_rows,
            'created_count' => $batch->created_count,
            'skipped_duplicate_count' => $batch->skipped_duplicate_count,
            'failed_count' => $batch->failed_count,
            'started_at' => $batch->started_at?->toIso8601String(),
            'completed_at' => $batch->completed_at?->toIso8601String(),
            'created_at' => $batch->created_at?->toIso8601String(),
        ];
    }

    private function safeCsvCell(string $value): string
    {
        if ($value !== '' && in_array($value[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
            return "'".$value;
        }

        return $value;
    }
}
