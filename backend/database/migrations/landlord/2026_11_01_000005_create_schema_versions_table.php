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

        Schema::connection($conn)->create('schema_versions', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('version', 50);
            $table->timestamp('migrated_at');
            $table->timestamps();

            $table->unique(['tenant_id', 'version']);
            $table->index('tenant_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $conn = $this->getConnection() ?? 'pgsql_admin';
        Schema::connection($conn)->dropIfExists('schema_versions');
    }
};
