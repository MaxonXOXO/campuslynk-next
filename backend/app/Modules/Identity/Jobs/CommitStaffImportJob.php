<?php

declare(strict_types=1);

namespace App\Modules\Identity\Jobs;

use App\Core\Tenancy\Jobs\TenantJob;
use App\Modules\Identity\Contracts\IssuesTemporaryPasswordContract;
use App\Modules\Identity\Events\UserApproved;
use App\Modules\Identity\Models\StaffImportBatch;
use App\Modules\Identity\Models\StaffImportRow;
use App\Modules\Identity\Models\StaffProfile;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class CommitStaffImportJob extends TenantJob
{
    public function __construct(
        public readonly string $batchId,
        public readonly string $passwordHash,
        public readonly string $actorUserId,
        public readonly bool $autoApprove = false,
    ) {}

    public function handle(IssuesTemporaryPasswordContract $temporaryPasswordIssuer): void
    {
        /** @var StaffImportBatch|null $batch */
        $batch = StaffImportBatch::find($this->batchId);
        if ($batch === null || $batch->status === 'completed') {
            return;
        }

        /** @var User|null $actor */
        $actor = User::find($this->actorUserId);

        $batch->forceFill([
            'status' => 'processing',
            'started_at' => $batch->started_at ?? Carbon::now(),
        ])->save();

        $createdCount = $batch->created_count;
        $skippedCount = $batch->skipped_duplicate_count;
        $failedCount = $batch->failed_count;
        /** @var list<array<string, mixed>> $errorSummary */
        $errorSummary = is_array($batch->error_summary) ? $batch->error_summary : [];

        // Capture any invalid/duplicate rows from preview into error_summary before purging
        StaffImportRow::query()
            ->where('batch_id', $batch->id)
            ->whereIn('status', ['invalid', 'duplicate'])
            ->orderBy('row_number')
            ->chunkById(50, function ($rows) use (&$errorSummary): void {
                foreach ($rows as $row) {
                    if (count($errorSummary) < 500) {
                        $errorSummary[] = [
                            'row_number' => $row->row_number,
                            'status' => $row->status,
                            'payload' => $row->payload,
                            'errors' => $row->errors ?? [],
                        ];
                    }
                }
            });

        // Process valid rows in chunks of 50 with per-row transactions (resumable)
        StaffImportRow::query()
            ->where('batch_id', $batch->id)
            ->where('status', 'valid')
            ->orderBy('row_number')
            ->chunkById(50, function ($rows) use (
                $batch,
                $actor,
                $temporaryPasswordIssuer,
                &$createdCount,
                &$skippedCount,
                &$failedCount,
                &$errorSummary
            ): void {
                foreach ($rows as $row) {
                    try {
                        $result = DB::connection('tenant')->transaction(function () use (
                            $row,
                            $batch,
                            $actor,
                            $temporaryPasswordIssuer
                        ): string {
                            $payload = $row->payload;
                            $handles = [];
                            if (! empty($payload['email'])) {
                                $handles[] = UserIdentifier::normalise((string) $payload['email'], 'email');
                            }
                            if (! empty($payload['mobile'])) {
                                $handles[] = UserIdentifier::normalise((string) $payload['mobile'], 'mobile');
                            }
                            if (! empty($payload['registration_number'])) {
                                $handles[] = UserIdentifier::normalise((string) $payload['registration_number'], 'registration_number');
                            }

                            if ($handles !== [] && UserIdentifier::whereIn('value_normalised', $handles)->exists()) {
                                $row->update([
                                    'status' => 'skipped',
                                    'errors' => ['Duplicate identifier detected at commit time.'],
                                ]);

                                return 'skipped';
                            }

                            $expiresAt = $this->autoApprove
                                ? $temporaryPasswordIssuer->resolveExpiresAt()
                                : null;

                            /** @var User $user */
                            $user = User::create([
                                'type' => 'staff',
                                'name' => (string) $payload['name'],
                                'email' => $payload['email'] ?? null,
                                'mobile' => $payload['mobile'] ?? null,
                                'registration_number' => $payload['registration_number'] ?? null,
                                'password' => $this->passwordHash,
                                'must_change_password' => true,
                                'temporary_password_expires_at' => $expiresAt,
                                'status' => $this->autoApprove ? 'active' : 'pending',
                            ]);

                            StaffProfile::create([
                                'user_id' => $user->id,
                                'requested_department_id' => $payload['requested_department_id'] ?? null,
                                'designation' => $payload['designation'] ?? null,
                                'employee_id' => $payload['employee_id'] ?? null,
                                'import_batch_id' => $batch->id,
                            ]);

                            $row->update([
                                'status' => 'committed',
                                'created_user_id' => $user->id,
                            ]);

                            if ($this->autoApprove && $actor !== null) {
                                DB::connection('tenant')->afterCommit(function () use ($user, $actor): void {
                                    UserApproved::dispatch($user, $actor);
                                });
                            }

                            return 'created';
                        });

                        if ($result === 'created') {
                            $createdCount++;
                        } else {
                            $skippedCount++;
                            if (count($errorSummary) < 500) {
                                $errorSummary[] = [
                                    'row_number' => $row->row_number,
                                    'status' => 'skipped',
                                    'payload' => $row->payload,
                                    'errors' => ['Duplicate identifier detected at commit time.'],
                                ];
                            }
                        }
                    } catch (\Throwable $e) {
                        $failedCount++;
                        $row->update([
                            'status' => 'failed',
                            'errors' => [$e->getMessage()],
                        ]);
                        if (count($errorSummary) < 500) {
                            $errorSummary[] = [
                                'row_number' => $row->row_number,
                                'status' => 'failed',
                                'payload' => $row->payload,
                                'errors' => [$e->getMessage()],
                            ];
                        }
                    }
                }
            });

        $batch->forceFill([
            'status' => 'completed',
            'created_count' => $createdCount,
            'skipped_duplicate_count' => $skippedCount,
            'failed_count' => $failedCount,
            'error_summary' => $errorSummary,
            'completed_at' => Carbon::now(),
        ])->save();

        // Purge staged import rows after completion (counts and error_summary remain on batch)
        StaffImportRow::where('batch_id', $batch->id)->delete();
    }
}
