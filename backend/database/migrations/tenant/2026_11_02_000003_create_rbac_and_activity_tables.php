<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Roles table
        Schema::create('roles', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('key', 64)->unique();
            $table->string('name', 128);
            $table->string('scope_type', 32);
            $table->string('stream', 32)->default('both');
            $table->boolean('is_singleton')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 2. Permissions table
        Schema::create('permissions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('key', 128)->unique();
            $table->string('name', 128);
            $table->string('module', 64)->index();
            $table->text('description')->nullable();
            $table->timestamps();
        });

        // 3. Role-Permission pivot table
        Schema::create('role_permission', function (Blueprint $table) {
            $table->ulid('role_id');
            $table->ulid('permission_id');
            $table->timestamps();

            $table->primary(['role_id', 'permission_id']);
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
        });

        // 4. Role Assignments table
        Schema::create('role_assignments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->ulid('user_id');
            $table->ulid('role_id');
            $table->string('scope_type', 32);
            $table->ulid('scope_id')->nullable();
            $table->string('scope_label', 64);
            $table->boolean('is_singleton')->default(false);
            $table->timestampTz('valid_from')->useCurrent();
            $table->timestampTz('valid_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->ulid('assigned_by_user_id')->nullable();
            $table->string('order_record', 255)->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->foreign('assigned_by_user_id')->references('id')->on('users')->nullOnDelete();

            $table->index(['user_id', 'is_active']);
            $table->index('scope_label');
        });

        // Singleton exclusion constraint: Only ONE active singleton role per scope at any time interval
        DB::statement("
            ALTER TABLE role_assignments
            ADD CONSTRAINT role_assignments_singleton_no_overlap
            EXCLUDE USING gist (
                role_id WITH =,
                scope_label WITH =,
                tstzrange(valid_from, coalesce(valid_to, 'infinity'::timestamptz), '[)') WITH &&
            ) WHERE (is_singleton = true)
        ");

        // 5. Delegation Rules table
        Schema::create('delegation_rules', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('assigner_role_key', 64);
            $table->string('assignee_role_key', 64);
            $table->string('scope_constraint', 64);
            $table->boolean('requires_order_record')->default(false);
            $table->timestamps();

            $table->unique(['assigner_role_key', 'assignee_role_key']);
            $table->index('assigner_role_key');
        });

        // 6. Activity Log table (Multi-tenant with ULID keys and JSONB payload)
        Schema::create('activity_log', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('log_name', 255)->nullable()->index();
            $table->text('description');
            $table->string('subject_type', 255)->nullable();
            $table->string('subject_id', 36)->nullable();
            $table->index(['subject_type', 'subject_id']);
            $table->string('event', 255)->nullable();
            $table->string('causer_type', 255)->nullable();
            $table->string('causer_id', 36)->nullable();
            $table->index(['causer_type', 'causer_id']);
            $table->jsonb('attribute_changes')->nullable();
            $table->jsonb('properties')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_log');
        Schema::dropIfExists('delegation_rules');
        Schema::dropIfExists('role_assignments');
        Schema::dropIfExists('role_permission');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }
};

