<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // PostgreSQL 17 trusted extensions created under tenant database owner privilege
        DB::statement('CREATE EXTENSION IF NOT EXISTS "ltree"');
        DB::statement('CREATE EXTENSION IF NOT EXISTS "btree_gist"');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('DROP EXTENSION IF EXISTS "btree_gist"');
        DB::statement('DROP EXTENSION IF EXISTS "ltree"');
    }
};
