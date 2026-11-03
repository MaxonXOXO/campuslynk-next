# Organisation Module (`App\Modules\Organisation`)

## 1. Purpose
The Organisation module manages the academic and structural spine of an institution tenant. It defines streams, institution identity, academic and administrative departments, diploma/degree programs, academic regulations, academic calendar years, batches, mentoring sub-batches, and central workshop trade sections.

Crucially, it implements **ADR-0005** (Department Governance Matrix), **ADR-0013** (Scope Labels in PostgreSQL LTree), and **ADR-0014** (Dual Paths & Resilient Role Scoping). It maintains dual `ltree` scope paths (`home_path` and `managing_path`) on batches and sub-batches, enabling dynamic governance routing (such as First-Year S1/S2 students being managed by General Department while belonging to their parent academic branch).

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

## 6. HTTP API Endpoints (`/api/v1`)
All endpoints require `auth:sanctum` and permission middleware:

| Method | URI | Permission | Description |
|---|---|---|---|
| `GET` | `/departments` | `organisation.batch.view` | List all departments |
| `POST` | `/departments` | `organisation.department.manage` | Create department |
| `GET` | `/departments/{id}` | `organisation.batch.view` | Get department details |
| `PUT` | `/departments/{id}` | `organisation.department.manage` | Update department details / active status |
| `GET` | `/programs` | `organisation.batch.view` | List academic programs |
| `POST` | `/programs` | `organisation.department.manage` | Create program |
| `GET` | `/programs/{id}` | `organisation.batch.view` | Get program details |
| `PUT` | `/programs/{id}` | `organisation.department.manage` | Update program |
| `GET` | `/academic-years` | `organisation.batch.view` | List academic years |
| `POST` | `/academic-years` | `organisation.academic_calendar.manage` | Create academic year |
| `GET` | `/academic-years/{id}` | `organisation.batch.view` | Get academic year details |
| `PUT` | `/academic-years/{id}` | `organisation.academic_calendar.manage` | Update academic year |
| `GET` | `/regulations` | `organisation.batch.view` | List regulations (REV2021, REV2026) |
| `GET` | `/workshop-sections` | `organisation.batch.view` | List workshop trade sections |
| `GET` | `/governance-rules` | `organisation.department.manage` | List semester governance rules |
| `PUT` | `/governance-rules/{id}` | `organisation.department.manage` | Update governance rule |
| `GET` | `/batches` | `organisation.batch.view` | List visible batches (`visibleTo` query scope) |
| `POST` | `/batches` | `organisation.batch.create` | Create batch |
| `GET` | `/batches/{id}` | `organisation.batch.view` | Get batch details |
| `PUT` | `/batches/{id}` | `organisation.batch.create` | Update batch name / status |
| `POST` | `/batches/{id}/promote` | `organisation.batch.promote_semester` | Advance semester & update managing department |
| `GET` | `/batches/{batchId}/sub-batches` | `organisation.batch.view` | List sub-batches |
| `POST` | `/batches/{batchId}/sub-batches` | `organisation.batch.create` | Create sub-batch |
| `GET` | `/sub-batches/{id}` | `organisation.batch.view` | Get sub-batch details |
| `PUT` | `/sub-batches/{id}` | `organisation.batch.create` | Update sub-batch |
| `DELETE` | `/sub-batches/{id}` | `organisation.batch.create` | Delete sub-batch |

## 7. Architecture Boundary
Per `AGENTS.md` and `docs/foundation_spec.md` §4:
- Other modules must **never** import `App\Modules\Organisation\Models\*`.
- External modules interact with the organisation structure exclusively through `Contracts/`, domain `Events/`, or public `Http/Resources/`.

