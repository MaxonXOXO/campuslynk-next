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
        // 1. Streams (AIDED, SF, SHARED)
        Schema::create('streams', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('code', 32)->unique();
            $table->string('name', 100);
            $table->string('scope_label', 32)->unique();
            $table->timestamps();
        });

        // 2. Institution (Root scope node)
        Schema::create('institution', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('name', 255);
            $table->string('code', 50)->unique();
            $table->string('scope_label', 32)->unique();
            $table->timestamps();
        });

        // 3. Departments
        Schema::create('departments', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('code', 32)->unique();
            $table->string('name', 150);
            $table->string('stream_id', 26);
            $table->string('funding_stream', 32);
            $table->string('kind', 32);
            $table->boolean('is_active')->default(true);
            $table->string('scope_label', 32)->unique();
            $table->timestamps();

            $table->foreign('stream_id')->references('id')->on('streams')->onDelete('restrict');
        });

        DB::statement("ALTER TABLE departments ADD CONSTRAINT chk_departments_funding_stream CHECK (funding_stream IN ('AIDED', 'SF', 'SHARED'))");
        DB::statement("ALTER TABLE departments ADD CONSTRAINT chk_departments_kind CHECK (kind IN ('academic', 'general', 'administrative'))");

        // 4. Programs
        Schema::create('programs', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('department_id', 26);
            $table->string('code', 32)->unique();
            $table->string('name', 150);
            $table->smallInteger('duration_semesters')->default(6);
            $table->string('scope_label', 32)->unique();
            $table->timestamps();

            $table->foreign('department_id')->references('id')->on('departments')->onDelete('restrict');
        });

        // 5. Regulations (REV2021, REV2026)
        Schema::create('regulations', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('code', 32)->unique();
            $table->string('name', 100);
            $table->smallInteger('effective_from_year');
            $table->jsonb('config_json')->default('{}');
            $table->timestamps();
        });

        DB::statement("ALTER TABLE regulations ADD CONSTRAINT chk_regulations_code CHECK (code IN ('REV2021', 'REV2026'))");

        // 6. Academic Years (with btree_gist exclusion constraint preventing date overlap)
        Schema::create('academic_years', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('label', 32)->unique();
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_current')->default(false);
            $table->timestamps();
        });

        DB::statement('ALTER TABLE academic_years ADD CONSTRAINT chk_academic_years_dates CHECK (start_date < end_date)');
        DB::statement("ALTER TABLE academic_years ADD CONSTRAINT academic_years_no_overlap EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)");

        // 7. Workshop Sections (Central Workshop Trade Sections)
        Schema::create('workshop_sections', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('code', 32)->unique();
            $table->string('name', 100);
            $table->string('scope_label', 32)->unique();
            $table->timestamps();
        });

        // 8. Department Semester Governance (S1/S2 General Dept Rules & Exclusion Constraint)
        Schema::create('department_semester_governance', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('home_department_id', 26);
            $table->smallInteger('semester_from');
            $table->smallInteger('semester_to');
            $table->string('managing_department_id', 26);
            $table->timestamps();

            $table->foreign('home_department_id')->references('id')->on('departments')->onDelete('cascade');
            $table->foreign('managing_department_id')->references('id')->on('departments')->onDelete('restrict');
        });

        DB::statement('ALTER TABLE department_semester_governance ADD CONSTRAINT chk_dept_sem_gov_range CHECK (semester_from BETWEEN 1 AND 6 AND semester_to BETWEEN 1 AND 6 AND semester_from <= semester_to)');
        DB::statement("ALTER TABLE department_semester_governance ADD CONSTRAINT dept_sem_gov_no_overlap EXCLUDE USING gist (home_department_id WITH =, int4range(semester_from, semester_to, '[]') WITH &&)");

        // 9. Batches (with PostgreSQL ltree paths and GiST indexes)
        Schema::create('batches', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('program_id', 26);
            $table->string('home_department_id', 26);
            $table->string('managing_department_id', 26);
            $table->string('academic_year_id', 26);
            $table->string('regulation_id', 26);
            $table->string('name', 100);
            $table->string('entry_type', 32)->default('regular');
            $table->smallInteger('current_semester')->default(1);
            $table->string('status', 32)->default('active');
            $table->string('scope_label', 32)->unique();
            $table->timestamps();

            $table->foreign('program_id')->references('id')->on('programs')->onDelete('restrict');
            $table->foreign('home_department_id')->references('id')->on('departments')->onDelete('restrict');
            $table->foreign('managing_department_id')->references('id')->on('departments')->onDelete('restrict');
            $table->foreign('academic_year_id')->references('id')->on('academic_years')->onDelete('restrict');
            $table->foreign('regulation_id')->references('id')->on('regulations')->onDelete('restrict');
        });

        DB::statement("ALTER TABLE batches ADD CONSTRAINT chk_batches_entry_type CHECK (entry_type IN ('regular', 'lateral'))");
        DB::statement('ALTER TABLE batches ADD CONSTRAINT chk_batches_current_semester CHECK (current_semester BETWEEN 1 AND 6)');
        DB::statement("ALTER TABLE batches ADD CONSTRAINT chk_batches_status CHECK (status IN ('active', 'graduated', 'archived'))");
        DB::statement('ALTER TABLE batches ADD COLUMN home_path ltree NOT NULL');
        DB::statement('ALTER TABLE batches ADD COLUMN managing_path ltree NOT NULL');
        DB::statement('CREATE INDEX batches_home_path_gist ON batches USING gist (home_path)');
        DB::statement('CREATE INDEX batches_managing_path_gist ON batches USING gist (managing_path)');

        // 10. Sub-batches (Lab, Mentoring, Workshop)
        Schema::create('sub_batches', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('batch_id', 26);
            $table->string('kind', 32);
            $table->string('name', 100);
            // Nullable without FK: course_offerings table is introduced in Step 6 (Assessment / Curriculum module)
            $table->string('course_offering_id', 26)->nullable();
            $table->string('scope_label', 32)->unique();
            $table->timestamps();

            $table->foreign('batch_id')->references('id')->on('batches')->onDelete('cascade');
        });

        DB::statement("ALTER TABLE sub_batches ADD CONSTRAINT chk_sub_batches_kind CHECK (kind IN ('lab', 'mentoring', 'workshop'))");
        DB::statement('ALTER TABLE sub_batches ADD COLUMN home_path ltree NOT NULL');
        DB::statement('ALTER TABLE sub_batches ADD COLUMN managing_path ltree NOT NULL');
        DB::statement('CREATE INDEX sub_batches_home_path_gist ON sub_batches USING gist (home_path)');
        DB::statement('CREATE INDEX sub_batches_managing_path_gist ON sub_batches USING gist (managing_path)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sub_batches');
        Schema::dropIfExists('batches');
        Schema::dropIfExists('department_semester_governance');
        Schema::dropIfExists('workshop_sections');
        Schema::dropIfExists('academic_years');
        Schema::dropIfExists('regulations');
        Schema::dropIfExists('programs');
        Schema::dropIfExists('departments');
        Schema::dropIfExists('institution');
        Schema::dropIfExists('streams');
    }
};

