<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Drop chk_departments_funding_stream and the funding_stream column
        DB::statement('ALTER TABLE departments DROP CONSTRAINT IF EXISTS chk_departments_funding_stream');

        if (Schema::hasColumn('departments', 'funding_stream')) {
            Schema::table('departments', function (Blueprint $table): void {
                $table->dropColumn('funding_stream');
            });
        }

        // 2. Replace UNIQUE(code) with UNIQUE(code, stream_id) on departments
        Schema::table('departments', function (Blueprint $table): void {
            $table->dropUnique('departments_code_unique');
            $table->unique(['code', 'stream_id'], 'departments_code_stream_id_unique');
        });

        // 3. Drop regulations.code check constraint (REV2021/REV2026)
        DB::statement('ALTER TABLE regulations DROP CONSTRAINT IF EXISTS chk_regulations_code');

        // 4. Extend user_identifiers check constraint to include 'admission_number'
        DB::statement('ALTER TABLE user_identifiers DROP CONSTRAINT IF EXISTS user_identifiers_kind_check');
        DB::statement('ALTER TABLE user_identifiers DROP CONSTRAINT IF EXISTS chk_user_identifiers_kind');
        DB::statement("ALTER TABLE user_identifiers ADD CONSTRAINT user_identifiers_kind_check CHECK (kind IN ('email', 'mobile', 'registration_number', 'admission_number'))");
    }

    /**
     * Reverse the migrations.
     *
     * CAUTION: Rollback will fail with a uniqueness violation error once two or more departments
     * share the same branch code across distinct streams (e.g. Aided CE and Self-Financing CE).
     * This rollback is not fully reversible without manual data deduplication.
     */
    public function down(): void
    {
        // 4. Revert user_identifiers check constraint
        DB::statement('ALTER TABLE user_identifiers DROP CONSTRAINT IF EXISTS user_identifiers_kind_check');
        DB::statement('ALTER TABLE user_identifiers DROP CONSTRAINT IF EXISTS chk_user_identifiers_kind');
        DB::statement("ALTER TABLE user_identifiers ADD CONSTRAINT user_identifiers_kind_check CHECK (kind IN ('email', 'mobile', 'registration_number'))");

        // 3. Revert regulations check constraint
        DB::statement("ALTER TABLE regulations ADD CONSTRAINT chk_regulations_code CHECK (code IN ('REV2021', 'REV2026'))");

        // 2. Revert UNIQUE(code, stream_id) back to UNIQUE(code)
        Schema::table('departments', function (Blueprint $table): void {
            $table->dropUnique('departments_code_stream_id_unique');
            $table->unique('code', 'departments_code_unique');
        });

        // 1. Revert funding_stream column and check constraint
        if (! Schema::hasColumn('departments', 'funding_stream')) {
            Schema::table('departments', function (Blueprint $table): void {
                $table->string('funding_stream', 32)->nullable();
            });
            DB::statement("ALTER TABLE departments ADD CONSTRAINT chk_departments_funding_stream CHECK (funding_stream IN ('AIDED', 'SF', 'SHARED'))");
        }
    }
};
