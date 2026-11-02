# Organisation Module (`App\Modules\Organisation`)

## 1. Purpose
The Organisation module manages the academic and structural spine of an institution tenant. It defines streams, institution identity, academic and administrative departments, diploma/degree programs, academic regulations, academic calendar years, batches, mentoring sub-batches, and central workshop trade sections.

Crucially, it implements **ADR-0005** (Department Governance Matrix) and **ADR-0013** (Scope Tree LTREE Labels and Dual Paths). It maintains dual `ltree` scope paths (`home_path` and `managing_path`) on batches and sub-batches, enabling dynamic governance routing (such as First-Year S1/S2 students being managed by General Department while belonging to their parent academic branch).

## 2. Public Contracts (`Contracts/`)
- `ScopeTreeContract`: Resolves scope paths, ancestor/descendant relationships, and node hierarchy.
- `GovernanceResolverContract`: Resolves the managing department for any home department and semester range.

## 3. Entities & Models (`Models/` - Module Private)
- `Stream`: Funding/management streams (`AIDED`, `SF`, `SHARED`).
- `Institution`: Institutional profile and root scope anchor.
- `Department`: Academic, general, or administrative branches (`kind`: `academic`, `general`, `administrative`).
- `DepartmentSemesterGovernance`: Semester-based governance mapping with `btree_gist` exclusion constraint preventing overlapping semester intervals for any home department.
- `Program`: Academic qualification (e.g., DCE, DME, DCT).
- `Regulation`: Curricular framework (e.g., REV2021, REV2026).
- `AcademicYear`: Calendar year with `daterange` exclusion constraint preventing overlapping operational periods.
- `Batch`: Cohort of students (`academic_year_id`, `program_id`, `regulation_id`, `home_department_id`, `managing_department_id`, `current_semester`, `home_path`, `managing_path`).
- `SubBatch`: Mentoring or laboratory subdivisions (`batch_id`, `name`, `home_path`, `managing_path`).
- `WorkshopSection`: Trade sections of the central workshop (`fitting`, `welding`, `smithy`, etc.).

## 4. Permissions Declared (`organisation.*`)
Declared in `OrganisationModule::permissions()`:
- `organisation.department.manage`
- `organisation.batch.view`
- `organisation.batch.create`
- `organisation.batch.promote_semester`
- `organisation.batch.graduate`
- `organisation.batch.delete`
- `organisation.batch.assign_tutor`
- `organisation.batch.assign_mentor`
- `organisation.batch.manage_roll_numbers`
- `organisation.batch.bulk_import_students`
- `organisation.course_offering.manage`
- `organisation.course_offering.assign_staff`
- `organisation.timetable.manage`
- `organisation.day_order.set`
- `organisation.academic_calendar.manage`

## 5. Domain Events (`Events/`)
- `BatchCreated`: Dispatched when a new student batch is created.
- `BatchUpdated`: Dispatched when batch metadata or status changes.
- `BatchSemesterPromoted`: Dispatched when a batch advances to the next semester. Triggers governance re-resolution and listener updates (e.g. invalidating temporary S1/S2 mentoring/tutor assignments).
- `GovernanceRuleUpdated`: Dispatched when department semester governance rules are modified.

## 6. Architecture Boundary
Per `AGENTS.md` and `docs/foundation_spec.md` §4:
- Other modules must **never** import `App\Modules\Organisation\Models\*`.
- External modules interact with the organisation structure exclusively through `Contracts/`, domain `Events/`, or public `Http/Resources/`.

