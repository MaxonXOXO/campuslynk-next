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

        DB::connection('tenant')->statement(
            'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check'
        );
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'pending', 'deactivated', 'rejected'))"
        );

        $conn->table('users', function (Blueprint $table) use ($conn): void {
            if (! $conn->hasColumn('users', 'status_reason')) {
                $table->text('status_reason')->nullable()->after('status');
            }
            if (! $conn->hasColumn('users', 'deactivated_at')) {
                $table->timestamp('deactivated_at')->nullable()->after('status_reason');
            }
            if (! $conn->hasColumn('users', 'deactivated_by_user_id')) {
                $table->char('deactivated_by_user_id', 26)->nullable()->after('deactivated_at');
            }
        });

        $this->syncExistingTenantPermissions();
    }

    public function down(): void
    {
        $conn = Schema::connection('tenant');

        // Map any deactivated/rejected users back to suspended so the narrower CHECK constraint succeeds.
        DB::connection('tenant')->table('users')
            ->whereIn('status', ['deactivated', 'rejected'])
            ->update(['status' => 'suspended']);

        DB::connection('tenant')->statement(
            'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check'
        );
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'pending'))"
        );

        $conn->table('users', function (Blueprint $table) use ($conn): void {
            $drops = array_values(array_filter(
                ['status_reason', 'deactivated_at', 'deactivated_by_user_id'],
                fn (string $col): bool => $conn->hasColumn('users', $col)
            ));
            if ($drops !== []) {
                $table->dropColumn($drops);
            }
        });
    }

    private function syncExistingTenantPermissions(): void
    {
        $db = DB::connection('tenant');
        if (! Schema::connection('tenant')->hasTable('permissions') || ! Schema::connection('tenant')->hasTable('roles')) {
            return;
        }

        $now = now();
        $requiredPermissions = [
            'identity.user.suspend' => ['name' => 'User Suspend', 'module' => 'identity'],
            'identity.user.unlock' => ['name' => 'User Unlock', 'module' => 'identity'],
            'identity.user.reset_password' => ['name' => 'User Reset Password', 'module' => 'identity'],
            'identity.user.deactivate' => ['name' => 'User Deactivate', 'module' => 'identity'],
        ];

        $permIds = [];
        foreach ($requiredPermissions as $key => $meta) {
            $existing = $db->table('permissions')->where('key', $key)->first();
            if ($existing !== null) {
                $permIds[$key] = $existing->id;
            } else {
                $id = (string) Str::ulid();
                $db->table('permissions')->insert([
                    'id' => $id,
                    'key' => $key,
                    'name' => $meta['name'],
                    'module' => $meta['module'],
                    'description' => "Permission to {$meta['name']}",
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $permIds[$key] = $id;
            }
        }

        $superAdmin = $db->table('roles')->where('key', 'super_admin')->first();
        if ($superAdmin !== null) {
            $db->table('role_permission')->insertOrIgnore([
                'role_id' => $superAdmin->id,
                'permission_id' => $permIds['identity.user.deactivate'],
            ]);
        }

        $principal = $db->table('roles')->where('key', 'principal')->first();
        if ($principal !== null) {
            foreach ($permIds as $permId) {
                $db->table('role_permission')->insertOrIgnore([
                    'role_id' => $principal->id,
                    'permission_id' => $permId,
                ]);
            }

            $deptManage = $db->table('permissions')->where('key', 'organisation.department.manage')->first();
            if ($deptManage !== null) {
                $db->table('role_permission')
                    ->where('role_id', $principal->id)
                    ->where('permission_id', $deptManage->id)
                    ->delete();
            }
        }
    }
};
