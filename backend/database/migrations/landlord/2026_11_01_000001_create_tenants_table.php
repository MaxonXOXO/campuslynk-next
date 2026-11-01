<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::connection('landlord')->create('tenants', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('slug', 40)->unique();
            $table->string('name', 255);
            $table->string('status', 20)->default('provisioning'); // provisioning, active, suspended, failed
            $table->string('deploy_profile', 20)->default('onprem'); // onprem, cloud
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::connection('landlord')->dropIfExists('tenants');
    }
};
