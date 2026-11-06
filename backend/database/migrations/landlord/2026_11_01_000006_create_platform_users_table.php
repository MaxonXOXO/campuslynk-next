<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql_admin';

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $conn = $this->getConnection() ?? 'pgsql_admin';

        Schema::connection($conn)->create('platform_users', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('email', 255)->unique();
            $table->string('password_hash', 255);
            $table->string('name', 255);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $conn = $this->getConnection() ?? 'pgsql_admin';
        Schema::connection($conn)->dropIfExists('platform_users');
    }
};
