<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Jobs\CommitStaffImportJob;
use App\Modules\Identity\Models\StaffImportBatch;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

final class CommitStaffImportAction
{
    public function execute(
        User $actor,
        string $batchId,
        string $commonPassword,
        bool $autoApprove = false,
        ?string $idempotencyKey = null,
    ): StaffImportBatch {
        // Hash ONCE in the commit request so plaintext never enters the queue or DB
        $passwordHash = Hash::make($commonPassword);

        /** @var StaffImportBatch $batch */
        $batch = DB::connection('tenant')->transaction(function () use (
            $actor,
            $batchId,
            $passwordHash,
            $autoApprove,
            $idempotencyKey
        ): StaffImportBatch {
            if ($idempotencyKey !== null && trim($idempotencyKey) !== '') {
                /** @var StaffImportBatch|null $existing */
                $existing = StaffImportBatch::where('idempotency_key', trim($idempotencyKey))->first();
                if ($existing !== null) {
                    return $existing;
                }
            }

            /** @var StaffImportBatch $locked */
            $locked = StaffImportBatch::query()
                ->whereKey($batchId)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status !== 'previewed') {
                throw new UserLifecycleConflictException(
                    "Import batch [{$locked->id}] has already been {$locked->status}.",
                    'import-already-committed'
                );
            }

            $locked->status = 'queued';
            $locked->auto_approve = $autoApprove;
            if ($idempotencyKey !== null && trim($idempotencyKey) !== '') {
                $locked->idempotency_key = trim($idempotencyKey);
            }
            $locked->save();

            activity('identity')
                ->event('staff_import.committed')
                ->performedOn($locked)
                ->causedBy($actor)
                ->withProperties([
                    'batch_id' => $locked->id,
                    'auto_approve' => $locked->auto_approve,
                    'valid_rows' => $locked->valid_rows,
                ])
                ->log("Committed staff import batch [{$locked->filename}] for background processing.");

            CommitStaffImportJob::dispatch($locked->id, $passwordHash, $actor->id, $autoApprove)
                ->afterCommit();

            return $locked;
        });

        return $batch;
    }
}
