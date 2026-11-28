<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Expand users with nullable avatar_file_id referencing files(id).
     */
    public function up(): void
    {
        Schema::connection('tenant')->table('users', function (Blueprint $table): void {
            $table->char('avatar_file_id', 26)->nullable()->after('last_name');
            $table->foreign('avatar_file_id', 'users_avatar_file_id_foreign')
                ->references('id')
                ->on('files')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::connection('tenant')->table('users', function (Blueprint $table): void {
            $table->dropForeign('users_avatar_file_id_foreign');
            $table->dropColumn('avatar_file_id');
        });
    }
};
