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

        $conn->table('activity_log', function (Blueprint $table): void {
            $table->index(['log_name', 'created_at'], 'activity_log_log_name_created_at_index');
            $table->index(['event', 'created_at'], 'activity_log_event_created_at_index');
        });

        $db = DB::connection('tenant');
        if (! $conn->hasTable('permissions') || ! $conn->hasTable('roles') || ! $conn->hasTable('role_permission')) {
            return;
        }

        $now = now();
        $perm = $db->table('permissions')->where('key', 'identity.audit.view')->first();
        if ($perm === null) {
            $permId = (string) Str::ulid();
            $db->table('permissions')->insert([
                'id' => $permId,
                'key' => 'identity.audit.view',
                'name' => 'Audit Log View',
                'module' => 'identity',
                'description' => 'Permission to view role-scoped tenant audit logs',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            $permId = $perm->id;
        }

        foreach (['super_admin', 'principal'] as $roleKey) {
            $role = $db->table('roles')->where('key', $roleKey)->first();
            if ($role !== null) {
                $db->table('role_permission')->insertOrIgnore([
                    'role_id' => $role->id,
                    'permission_id' => $permId,
                ]);
            }
        }
    }

    public function down(): void
    {
        $conn = Schema::connection('tenant');

        if ($conn->hasTable('activity_log')) {
            $conn->table('activity_log', function (Blueprint $table): void {
                $table->dropIndex('activity_log_log_name_created_at_index');
                $table->dropIndex('activity_log_event_created_at_index');
            });
        }

        if ($conn->hasTable('permissions')) {
            DB::connection('tenant')->table('permissions')->where('key', 'identity.audit.view')->delete();
        }
    }
};
