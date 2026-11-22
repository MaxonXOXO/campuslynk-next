<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('tenant')->table('users', function (Blueprint $table): void {
            $table->timestamp('temporary_password_expires_at')->nullable()->after('must_change_password');
            $table->timestamp('locked_until')->nullable()->after('last_login_at');
        });

        Schema::connection('tenant')->table('role_assignments', function (Blueprint $table): void {
            $table->string('reason', 500)->nullable()->after('order_record');
        });
    }

    public function down(): void
    {
        Schema::connection('tenant')->table('role_assignments', function (Blueprint $table): void {
            $table->dropColumn('reason');
        });

        Schema::connection('tenant')->table('users', function (Blueprint $table): void {
            $table->dropColumn(['temporary_password_expires_at', 'locked_until']);
        });
    }
};
