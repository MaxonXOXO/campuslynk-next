<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Expand users with nullable first_name/last_name and personal_access_tokens
     * with nullable user_agent/ip_address metadata.
     */
    public function up(): void
    {
        Schema::connection('tenant')->table('users', function (Blueprint $table): void {
            $table->string('first_name', 100)->nullable()->after('name');
            $table->string('last_name', 100)->nullable()->after('first_name');
        });

        Schema::connection('tenant')->table('personal_access_tokens', function (Blueprint $table): void {
            $table->string('user_agent', 512)->nullable()->after('abilities');
            $table->string('ip_address', 45)->nullable()->after('user_agent');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::connection('tenant')->table('personal_access_tokens', function (Blueprint $table): void {
            $table->dropColumn(['user_agent', 'ip_address']);
        });

        Schema::connection('tenant')->table('users', function (Blueprint $table): void {
            $table->dropColumn(['first_name', 'last_name']);
        });
    }
};
