# ADR-0005: Scope tree with home and managing department

**Status:** Decided

## Context
First-year (S1/S2) batches of CE/ME/EEE are governed by `GEN_AIDED`, and EL/CT/AU by `GEN_SF`, while their home branch stays CE/ME/etc. An ancestor-only scope walk (Sub-batch → Batch → Program → Department → Stream → Institution) or a single `ltree` path cannot express "two departments both have relationships to the same batch, with different read vs governance authority".

Additionally, inside a single batch, students are simultaneously partitioned along three orthogonal axes: Lab batches (per course offering), Mentoring groups (Group A / Group B for the batch), and Workshop batches (rotating across the 6 central workshop trade sections).

## Decision
1. **Scope types:** `institution`, `stream`, `department`, `program`, `batch`, `sub_batch`, `course_offering`, `workshop_section`, `own`.
2. **Home vs Managing Department:** Every batch has `home_department_id` (permanent, e.g. `CE`) and `current_semester` (1..6). The effective **managing department** (`managing_department_id`) is derived from a configurable table, not hard-coded branch logic:
   `department_semester_governance(home_department_id, semester_from, semester_to, managing_department_id)`.
   - Aided default: `CE`, `ME`, `EEE` semesters 1–2 → `GEN_AIDED`; semesters 3–6 → `home_department_id`.
   - SF default: `EL`, `CT`, `AU` semesters 1–2 → `GEN_SF`; semesters 3–6 → `home_department_id`.
3. **Course Offerings:** Each `course_offering` stores `managing_department_id` resolved at creation and re-resolved on semester promotion.
4. **Read vs Governance (Write) Resolution in `ScopeAuthorizer`:**
   - **Governance / Write / Approval permissions** (e.g. `organisation.batch.assign_tutor`, `attendance.session.unlock`, `assessment.cia_consolidated.lock_hod`, `assessment.marks.override`, `attendance.student_leave.approve`) match **only** the `managing_department_id` ancestry (up to `stream` and `institution`).
   - **Read / Analytics / Directory permissions** (e.g. `organisation.batch.view`, `attendance.own.view` and report permissions, `assessment.progress_report.view`, `mentoring.diary.view`) match **either** `managing_department_id` **or** `home_department_id` ancestry.
   - *Result:* During S1/S2, the General Dept Coordinator (`GEN_AIDED` / `GEN_SF`) has full HOD governance over S1/S2 batches, while the home branch HOD (e.g. `CE` HOD) has read-only visibility into their incoming S1/S2 cohort without being able to override S1/S2 marks or unlock S1/S2 attendance unless explicitly granted a cross-department assignment.
5. **Typed Sub-batches (`sub_batches.kind`):**
   - Replaces the generic `sections` concept (polytechnics do not use multiple sections per branch).
   - `sub_batches` carries `kind ∈ ('lab', 'mentoring', 'workshop')` and nullable `course_offering_id`.
   - A student can simultaneously belong to one `mentoring` sub-batch (e.g. Group A), one `workshop` sub-batch (e.g. Workshop Batch 1), and one `lab` sub-batch per practical/practicum `course_offering`.
6. **Explicit Assessment Scheme:** Each `course_offering` carries an explicit `assessment_scheme_id`. No hard-coded subject-ID exceptions (the legacy code special-cased two subject IDs across four files).
7. **Stream (`AIDED` / `SF` / `SHARED`):** Stored on `departments`, `staff_profiles`, and derived for `batches` via `home_department.funding_stream`. Used as a first-class scope type for stream-level roles (`academic_coordinator`, `sf_office`, `admin`).

## Consequences
- General Dept Coordinators get HOD-level control of S1/S2 with zero special-case `if ($semester <= 2)` branches in controllers or policies.
- Exit tests enforced in CI:
  1. `GEN_AIDED` Coordinator **can** assign tutors, unlock attendance, and lock CIA for `CE S2`, but **cannot** for `CE S4`.
  2. `CE` HOD **can** view student profiles and analytics for `CE S2` (via `home_department_id`), **cannot** lock CIA or unlock attendance for `CE S2`, and **can** perform all HOD governance actions on `CE S4`.
- A semester promotion action (`PromoteBatchSemesterAction`) advances `batches.current_semester`, re-resolves `managing_department_id`, archives S1/S2 tutor assignments when crossing S2 → S3, and notifies the home department HOD to assign S3 tutors.

Permission names follow the catalogue in `docs/role_and_permission_spec.md` §5 (`<module>.<resource>.<action>`, spelling `organisation`).
