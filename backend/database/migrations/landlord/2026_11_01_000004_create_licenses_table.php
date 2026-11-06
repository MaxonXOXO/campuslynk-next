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

        Schema::connection($conn)->create('licenses', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_id')->unique()->constrained('tenants')->cascadeOnDelete();
            $table->string('plan', 50);
            $table->json('modules');
            $table->timestamp('valid_until');
            $table->text('signature')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $conn = $this->getConnection() ?? 'pgsql_admin';
        Schema::connection($conn)->dropIfExists('licenses');
    }
};
