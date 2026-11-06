<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
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

        Schema::connection($conn)->create('tenants', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('slug', 40)->unique();
            $table->string('name', 255);
            $table->string('status', 20)->default('provisioning'); // provisioning, active, suspended, failed
            $table->string('deploy_profile', 20)->default('onprem'); // onprem, cloud
            $table->timestamps();
        });

        DB::connection($conn)->statement(
            "ALTER TABLE tenants ADD CONSTRAINT tenants_status_check CHECK (status IN ('provisioning', 'active', 'suspended', 'failed'))"
        );
        DB::connection($conn)->statement(
            "ALTER TABLE tenants ADD CONSTRAINT tenants_deploy_profile_check CHECK (deploy_profile IN ('onprem', 'cloud'))"
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $conn = $this->getConnection() ?? 'pgsql_admin';
        Schema::connection($conn)->dropIfExists('tenants');
    }
};
