<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $conn = Schema::connection('tenant');

        $conn->table('users', function (Blueprint $table) use ($conn): void {
            if (! $conn->hasColumn('users', 'first_activated_at')) {
                $table->timestamp('first_activated_at')->nullable()->after('last_login_at');
            }
            if (! $conn->hasColumn('users', 'rejected_at')) {
                $table->timestamp('rejected_at')->nullable()->after('deactivated_at');
            }
        });

        if (! $conn->hasTable('staff_profiles')) {
            $conn->create('staff_profiles', function (Blueprint $table): void {
                $table->char('id', 26)->primary();
                $table->char('user_id', 26)->unique();
                $table->char('requested_department_id', 26)->nullable()->index();
                $table->string('designation', 100)->nullable();
                $table->string('employee_id', 64)->nullable();
                $table->char('import_batch_id', 26)->nullable()->index();
                $table->timestamps();

                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }

        if (! $conn->hasTable('staff_import_batches')) {
            $conn->create('staff_import_batches', function (Blueprint $table): void {
                $table->char('id', 26)->primary();
                $table->char('uploaded_by_user_id', 26)->index();
                $table->string('filename', 255);
                $table->string('file_hash', 64);
                $table->string('idempotency_key', 100)->nullable()->unique();
                $table->string('status', 24)->default('previewed');
                $table->boolean('auto_approve')->default(false);
                $table->unsignedInteger('total_rows')->default(0);
                $table->unsignedInteger('valid_rows')->default(0);
                $table->unsignedInteger('duplicate_rows')->default(0);
                $table->unsignedInteger('invalid_rows')->default(0);
                $table->unsignedInteger('created_count')->default(0);
                $table->unsignedInteger('skipped_duplicate_count')->default(0);
                $table->unsignedInteger('failed_count')->default(0);
                $table->jsonb('error_summary')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
            });
        }

        if (! $conn->hasTable('staff_import_rows')) {
            $conn->create('staff_import_rows', function (Blueprint $table): void {
                $table->char('id', 26)->primary();
                $table->char('batch_id', 26)->index();
                $table->unsignedInteger('row_number');
                $table->string('status', 24);
                $table->jsonb('payload');
                $table->jsonb('errors')->nullable();
                $table->char('created_user_id', 26)->nullable();
                $table->timestamps();

                $table->foreign('batch_id')->references('id')->on('staff_import_batches')->cascadeOnDelete();
            });
        }

        $this->syncPermissions();
    }

    public function down(): void
    {
        $conn = Schema::connection('tenant');

        $conn->dropIfExists('staff_import_rows');
        $conn->dropIfExists('staff_import_batches');
        $conn->dropIfExists('staff_profiles');

        $conn->table('users', function (Blueprint $table) use ($conn): void {
            $drops = array_values(array_filter(
                ['first_activated_at', 'rejected_at'],
                fn (string $col): bool => $conn->hasColumn('users', $col)
            ));
            if ($drops !== []) {
                $table->dropColumn($drops);
            }
        });
    }

    private function syncPermissions(): void
    {
        $db = DB::connection('tenant');
        if (! Schema::connection('tenant')->hasTable('permissions') || ! Schema::connection('tenant')->hasTable('roles')) {
            return;
        }

        $now = now();
        $importPerm = $db->table('permissions')->where('key', 'identity.user.import')->first();
        if ($importPerm === null) {
            $importPermId = (string) Str::ulid();
            $db->table('permissions')->insert([
                'id' => $importPermId,
                'key' => 'identity.user.import',
                'name' => 'User Import',
                'module' => 'identity',
                'description' => 'Permission to bulk import staff accounts',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            $importPermId = $importPerm->id;
        }

        foreach (['super_admin', 'principal'] as $roleKey) {
            $role = $db->table('roles')->where('key', $roleKey)->first();
            if ($role !== null) {
                $db->table('role_permission')->insertOrIgnore([
                    'role_id' => $role->id,
                    'permission_id' => $importPermId,
                ]);
            }
        }

        $approvePerm = $db->table('permissions')->where('key', 'identity.user.approve')->first();
        $coordRole = $db->table('roles')->where('key', 'academic_coordinator')->first();
        if ($approvePerm !== null && $coordRole !== null) {
            $db->table('role_permission')->insertOrIgnore([
                'role_id' => $coordRole->id,
                'permission_id' => $approvePerm->id,
            ]);
        }
    }
};
