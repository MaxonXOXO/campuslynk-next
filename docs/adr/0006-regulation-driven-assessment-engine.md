# ADR-0006: Data-driven regulation & assessment engine (REV2021 & REV2026)

**Status:** Decided (rule defaults in item 3 await exam-cell confirmation)

## Context
The legacy application duplicated entire controller trees (`ClassroomController.php` at 7,505 LOC plus 11 sibling controllers) and ~60 database tables (`r21_*`, `r26_*`) to handle two Kerala SBTE curriculum revisions (`REV2021` and `REV2026`). Even worse, individual courses with non-standard component weights (AU `3055` / subject id `110` and CT `5002` / subject id `147`, both R21) were hard-coded by database ID inside four different files, and three regulation rules contradicted each other across PHP, JavaScript, and Blade print templates:
1. **R26 Theory CIA minimum:** enforced as `16/40` in JS/Blade, but commented out in PHP.
2. **R21 Theory ESE maximum:** set to `75` in one controller path and `100` in another.
3. **R26 Health & Physical Education (1009):** stored a 10-mark Log Book column in the DB that was ignored in the sum formula (`20 + 20 + 20 = 60`).

Because `REV2021` (senior batches) and `REV2026` (new batches from 2026 onwards) run concurrently in the same college, and a future `REV2031` will eventually arrive, regulation rules must be pure data evaluated by a single deterministic engine.

## Decision
1. **Eight-Table Assessment Schema:**
   Replace all `r21_*` and `r26_*` tables with 8 regulation-agnostic tables in the `Assessment` module:
   - `regulations`: `code` (`REV2021`, `REV2026`), `name`, `effective_from_year`, `activity_points_required_regular` (`60`), `activity_points_required_let` (`40`), `config_json`.
   - `assessment_schemes`: `(regulation_id, code, name, course_type, max_cia, max_ese, max_total, pass_rules_json, rounding_rule_json)`.
   - `assessment_components`: hierarchical tree (`parent_id`) of scoring blocks per scheme (`code`, `weight_max`, `entry_mode`, `aggregation_rule_json`, `attendance_slab_json`, `rubric_schema_json`).
   - `course_outcomes`: CO1..CO5 definitions per course.
   - `co_po_mappings`: CO × PO (PO1..PO7) and PSO (PSO1..PSO3) correlation levels (`0..3`).
   - `assessment_items`: concrete instances for a `course_offering` (e.g., *Series Test 1*, *Experiment 4*, *Review 2*) with `max_marks` and `co_weights_json`.
   - `assessment_scores`: `(assessment_item_id, student_id, marks_obtained, rubric_breakdown_json, is_absent, entered_by, locked_at)`.
   - `cia_summaries`: materialized, auditable per-student per-course-offering rollup (`component_totals_json`, `attendance_pct`, `attendance_marks`, `total_cia`, `ese_marks`, `total_marks`, `is_cia_eligible`, `pass_status`, `status`).

2. **All 13 Course Archetypes Seeded as Data (`assessment_schemes`)**, the keys discovered in the legacy inventory (components in `role_and_permission_spec.md` §6.1):
   - **REV2021 (6):** `r21_theory`, `r21_practical`, `r21_drawing`, `r21_workshop`, `r21_major_project`, `r21_seminar`.
   - **REV2026 (7):** `r26_theory`, `r26_practical`, `r26_practicum_basic`, `r26_practicum_core`, `r26_drawing`, `r26_english_1001`, `r26_health_1009`.
   - Every `course_offering` links to an explicit `assessment_scheme_id`. AU `3055` and CT `5002` simply point to `r21_theory`: zero subject-ID branching in code.
   - R26 workshop, project and internship schemes are not in the legacy inventory; add them as seed rows when those syllabi are loaded.

3. **Seeded defaults for the 3 legacy rule conflicts (configurable in `pass_rules_json`; PENDING exam-cell confirmation):**
   - **R26 Theory CIA minimum:** the legacy code disagrees with itself: `ConsolidatedCiaReportController` enforces `16/40`, `R26ClassroomController` has no standalone floor. Default until confirmed: **`min_cia: 16`** (the stricter rule that appears in printed reports). Changing it to 0 is one JSON value.
   - **R21 Theory ESE maximum:** seed `max_ese: 75` (total 125); the consolidated report's 100 is a display inconsistency. `min_ese_pct: 40`, `min_total_pct: 40`.
   - **R26 Health & Physical Education (`r26_health_1009`):** Attendance 5 + 8 activities 30 + 2 fitness tests 15 + Logbook 10 = 60 CIA, ESE 40. The legacy sum omitted the Logbook (effective max 50). Seed with the Logbook **included** and a flag to exclude it; the parity suite shows which legacy results change.

4. **Deterministic Rounding & Parity Gate:**
   - All intermediate component averages use `DECIMAL(8,4)` in PostgreSQL and `brick/math` (`BigDecimal`) in PHP; rounding (`HALF_UP` to 1 or 2 decimal places, or integer ceiling/floor at final CIA rollup) is declared in `rounding_rule_json` per scheme.
   - The frontend **never** computes CIA totals or eligibility in JavaScript; it renders the values returned by `CalculateCourseCiaAction`.
   - **Golden Parity Suite:** Before retiring any legacy marks screen, automated tests run `CalculateCourseCiaAction` against de-identified fixture snapshots extracted from the Carmel production backup across both `REV2021` and `REV2026`.

## Consequences
- Eliminates 12 duplicate controllers and ~60 regulation-specific tables.
- Adding a new scheme variant or a future `REV2031` regulation requires only a database seeder/admin form and zero PHP or Next.js code changes.
