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

        // PostgreSQL CHECK constraints and case-insensitive unique index
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_type_check CHECK (type IN ('staff', 'student', 'parent'))"
        );
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'pending'))"
        );
        DB::connection('tenant')->statement(
            'ALTER TABLE users ADD CONSTRAINT users_identifier_presence_check CHECK (email IS NOT NULL OR mobile IS NOT NULL OR registration_number IS NOT NULL)'
        );
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_mobile_e164_check CHECK (mobile IS NULL OR mobile ~ '^\+[1-9][0-9]{7,14}$')"
        );
        DB::connection('tenant')->statement(
            "ALTER TABLE users ADD CONSTRAINT users_reg_number_not_phone_check CHECK (registration_number IS NULL OR (registration_number !~ '^\+[0-9]+' AND registration_number !~ '^[6-9][0-9]{9}$'))"
        );
        DB::connection('tenant')->statement(
            'CREATE UNIQUE INDEX users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL'
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::connection('tenant')->dropIfExists('users');
    }
};
