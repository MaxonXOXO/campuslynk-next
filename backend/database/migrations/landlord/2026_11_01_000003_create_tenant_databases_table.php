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

        Schema::connection($conn)->create('tenant_databases', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_id')->unique()->constrained('tenants')->cascadeOnDelete();
            $table->string('host', 255);
            $table->integer('port');
            $table->string('database', 63);
            $table->string('username', 63);
            $table->text('password');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $conn = $this->getConnection() ?? 'pgsql_admin';
        Schema::connection($conn)->dropIfExists('tenant_databases');
    }
};
