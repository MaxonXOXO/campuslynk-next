<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the tenant-scoped files metadata table (ADR-0018).
     */
    public function up(): void
    {
        Schema::connection('tenant')->create('files', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('owner_type', 100);
            $table->char('owner_id', 26);
            $table->string('category', 64);
            $table->string('disk', 32);
            $table->string('path', 255)->unique();
            $table->string('original_name', 255);
            $table->string('mime_type', 128);
            $table->unsignedBigInteger('size_bytes');
            $table->char('checksum_sha256', 64);
            $table->string('visibility', 16)->default('private');
            $table->char('created_by', 26)->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['owner_type', 'owner_id'], 'files_owner_idx');
            $table->index('category', 'files_category_idx');
            $table->index('deleted_at', 'files_deleted_at_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::connection('tenant')->dropIfExists('files');
    }
};
