<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\StaffImportBatch;
use App\Modules\Identity\Models\StaffImportRow;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Identity\Services\StaffImportParser;
use App\Modules\Organisation\Contracts\ScopeDirectoryContract;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

final class PreviewStaffImportAction
{
    public function __construct(
        private readonly StaffImportParser $parser,
        private readonly ScopeDirectoryContract $scopeDirectory,
    ) {}

    /**
     * @return array{
     *     batch: StaffImportBatch,
     *     rows_preview: list<array{row_number: int, status: string, payload: array<string, mixed>, errors: list<string>}>
     * }
     */
    public function execute(User $actor, UploadedFile $file): array
    {
        $parsedRows = $this->parser->parse($file);
        $realPath = (string) $file->getRealPath();
        $fileHash = hash_file('sha256', $realPath) ?: '';

        // Load department scope lookup (scope_label => scope_id, plus scope_id => scope_id)
        $deptRows = $this->scopeDirectory->query()
            ->where('scope_type', 'department')
            ->get(['scope_id', 'scope_label']);

        $deptByCode = [];
        $deptIds = [];
        foreach ($deptRows as $dept) {
            if (is_string($dept->scope_id ?? null) && is_string($dept->scope_label ?? null)) {
                $deptIds[$dept->scope_id] = true;
                // scope_label is d_<code> (e.g. d_ce)
                $code = strtoupper(preg_replace('/^d_/', '', $dept->scope_label) ?? '');
                if ($code !== '') {
                    $deptByCode[$code] = $dept->scope_id;
                }
            }
        }

        // Collect all normalised identifiers across the file to batch-query existing DB duplicates
        $allHandles = [];
        foreach ($parsedRows as $row) {
            $d = $row['data'];
            if (! empty($d['email'])) {
                $allHandles[] = UserIdentifier::normalise($d['email'], 'email');
            }
            if (! empty($d['mobile'])) {
                $allHandles[] = UserIdentifier::normalise($d['mobile'], 'mobile');
            }
            if (! empty($d['registration_number'])) {
                $allHandles[] = UserIdentifier::normalise($d['registration_number'], 'registration_number');
            }
        }

        $existingHandles = [];
        if ($allHandles !== []) {
            $existingHandles = UserIdentifier::query()
                ->whereIn('value_normalised', array_values(array_unique($allHandles)))
                ->pluck('value_normalised')
                ->flip()
                ->all();
        }

        $seenInFile = [];
        $validCount = 0;
        $dupCount = 0;
        $invalidCount = 0;
        $rowsToInsert = [];
        $previewList = [];

        foreach ($parsedRows as $row) {
            $rowNum = $row['row_number'];
            $d = $row['data'];
            $errors = [];

            $name = trim($d['name'] ?? '');
            $email = isset($d['email']) && trim($d['email']) !== '' ? strtolower(trim($d['email'])) : null;
            $mobile = isset($d['mobile']) && trim($d['mobile']) !== '' ? trim($d['mobile']) : null;
            $regNo = isset($d['registration_number']) && trim($d['registration_number']) !== '' ? trim($d['registration_number']) : null;
            $deptCodeRaw = strtoupper(trim($d['requested_department_code'] ?? ''));
            $deptIdRaw = trim($d['requested_department_id'] ?? '');
            $designation = isset($d['designation']) && trim($d['designation']) !== '' ? trim($d['designation']) : null;
            $employeeId = isset($d['employee_id']) && trim($d['employee_id']) !== '' ? trim($d['employee_id']) : null;

            if (mb_strlen($name) < 2 || mb_strlen($name) > 100) {
                $errors[] = 'Name must be between 2 and 100 characters.';
            }
            if ($email === null && $mobile === null && $regNo === null) {
                $errors[] = 'At least one identifier (email, mobile, or registration_number) is required.';
            }
            if ($email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                $errors[] = 'Invalid email format.';
            }
            if ($mobile !== null && preg_match('/^[0-9+\-\s]{10,20}$/', $mobile) !== 1) {
                $errors[] = 'Invalid mobile format (10-20 digits/symbols).';
            }
            if ($regNo !== null && preg_match('/^[a-zA-Z0-9\-_]{3,32}$/', $regNo) !== 1) {
                $errors[] = 'Invalid registration_number format.';
            }

            $resolvedDeptId = null;
            if ($deptIdRaw !== '') {
                if (! isset($deptIds[$deptIdRaw])) {
                    $errors[] = "Unknown requested_department_id [{$deptIdRaw}].";
                } else {
                    $resolvedDeptId = $deptIdRaw;
                }
            } elseif ($deptCodeRaw !== '') {
                if (! isset($deptByCode[$deptCodeRaw])) {
                    $errors[] = "Unknown requested_department_code [{$deptCodeRaw}].";
                } else {
                    $resolvedDeptId = $deptByCode[$deptCodeRaw];
                }
            }

            $rowHandles = [];
            if ($email !== null) {
                $rowHandles[] = UserIdentifier::normalise($email, 'email');
            }
            if ($mobile !== null) {
                $rowHandles[] = UserIdentifier::normalise($mobile, 'mobile');
            }
            if ($regNo !== null) {
                $rowHandles[] = UserIdentifier::normalise($regNo, 'registration_number');
            }

            $isDuplicate = false;
            foreach ($rowHandles as $handle) {
                if (isset($existingHandles[$handle]) || isset($seenInFile[$handle])) {
                    $isDuplicate = true;
                    break;
                }
            }

            if ($errors !== []) {
                $status = 'invalid';
                $invalidCount++;
            } elseif ($isDuplicate) {
                $status = 'duplicate';
                $dupCount++;
                $errors[] = 'Duplicate email, mobile, or registration_number.';
            } else {
                $status = 'valid';
                $validCount++;
                foreach ($rowHandles as $handle) {
                    $seenInFile[$handle] = true;
                }
            }

            $payload = [
                'name' => $name,
                'email' => $email,
                'mobile' => $mobile,
                'registration_number' => $regNo,
                'requested_department_id' => $resolvedDeptId,
                'designation' => $designation,
                'employee_id' => $employeeId,
            ];

            $rowsToInsert[] = [
                'row_number' => $rowNum,
                'status' => $status,
                'payload' => $payload,
                'errors' => $errors !== [] ? $errors : null,
            ];

            if (count($previewList) < 100) {
                $previewList[] = [
                    'row_number' => $rowNum,
                    'status' => $status,
                    'payload' => $payload,
                    'errors' => $errors,
                ];
            }
        }

        /** @var StaffImportBatch $batch */
        $batch = DB::connection('tenant')->transaction(function () use (
            $actor,
            $file,
            $fileHash,
            $parsedRows,
            $validCount,
            $dupCount,
            $invalidCount,
            $rowsToInsert
        ): StaffImportBatch {
            /** @var StaffImportBatch $createdBatch */
            $createdBatch = StaffImportBatch::create([
                'uploaded_by_user_id' => $actor->id,
                'filename' => $file->getClientOriginalName(),
                'file_hash' => $fileHash,
                'status' => 'previewed',
                'total_rows' => count($parsedRows),
                'valid_rows' => $validCount,
                'duplicate_rows' => $dupCount,
                'invalid_rows' => $invalidCount,
            ]);

            foreach ($rowsToInsert as $item) {
                StaffImportRow::create([
                    'batch_id' => $createdBatch->id,
                    'row_number' => $item['row_number'],
                    'status' => $item['status'],
                    'payload' => $item['payload'],
                    'errors' => $item['errors'],
                ]);
            }

            return $createdBatch;
        });

        activity('identity')
            ->event('staff_import.previewed')
            ->performedOn($batch)
            ->causedBy($actor)
            ->withProperties([
                'batch_id' => $batch->id,
                'total_rows' => $batch->total_rows,
                'valid_rows' => $batch->valid_rows,
                'duplicate_rows' => $batch->duplicate_rows,
                'invalid_rows' => $batch->invalid_rows,
            ])
            ->log("Previewed staff import batch [{$batch->filename}] ({$batch->valid_rows} valid rows).");

        return [
            'batch' => $batch,
            'rows_preview' => $previewList,
        ];
    }
}
