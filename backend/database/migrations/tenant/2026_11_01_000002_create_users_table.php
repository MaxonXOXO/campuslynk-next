<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::connection('tenant')->create('users', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('type', 20)->default('staff');
            $table->string('name', 255);
            $table->string('email', 255)->nullable();
            $table->string('mobile', 20)->nullable()->unique();
            $table->string('registration_number', 50)->nullable()->unique();
            $table->string('password', 255);
            $table->boolean('must_change_password')->default(false);
            $table->string('status', 20)->default('active');
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });

        // PostgreSQL CHECK constraints on users
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_type_check CHECK (type IN ('staff', 'student', 'parent'))"
        );
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'pending'))"
        );
        DB::connection('tenant')->statement(
            'ALTER TABLE users ADD CONSTRAINT users_identifier_presence_check CHECK (email IS NOT NULL OR mobile IS NOT NULL OR registration_number IS NOT NULL)'
        );

        // Unified User Identifiers Table (Single Unique Constraint across all kinds)
        Schema::connection('tenant')->create('user_identifiers', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind', 30); // 'email', 'mobile', 'registration_number'
            $table->string('value', 255);
            $table->string('value_normalised', 255)->unique();
            $table->timestamps();
        });

        DB::connection('tenant')->statement(
            "ALTER TABLE user_identifiers ADD CONSTRAINT user_identifiers_kind_check CHECK (kind IN ('email', 'mobile', 'registration_number'))"
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::connection('tenant')->dropIfExists('user_identifiers');
        Schema::connection('tenant')->dropIfExists('users');
    }
};
