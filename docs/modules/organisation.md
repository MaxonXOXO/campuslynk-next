# Organisation Module Documentation

## 1. Overview
The **Organisation** module (`App\Modules\Organisation`) establishes the academic and organizational backbone of the institution. It manages:
- **Institutional Hierarchy:** Streams (`AIDED`, `SF`), Departments (academic and administrative), Programs, Regulations, and Academic Years.
- **Dual Scope Trees (`ltree`):** Implements ADR-0005, ADR-0013, and ADR-0014, maintaining permanent academic roots alongside dynamic governance pathways.
- **Semester Governance Resolution:** Handles split academic governance (e.g. Kerala Polytechnic S1/S2 General Department administration vs S3+ parent department administration).
- **Batch Lifecycle & Promotion:** Automated semester transitions, dynamic re-calculation of managing departments, and event-driven cleanup of first-year assignments.

---

## 2. Architecture & Public Contracts

Following the system architecture rules:
- **Never access another module's Models directly.** Consume services or listen to domain events.
- The Organisation module provides:
  - `GovernanceResolverContract`: Resolves the managing department ID for a given batch given its program, home department, and semester.
  - `ScopeTreeContract`: Constructs standard dot-separated `ltree` paths (`inst.stream.dept.prog.batch`).
  - `BatchSemesterPromoted`: Domain event published when a batch advances a semester. Identity module listens to this event (`ArchiveFirstYearBatchAssignmentsListener`) to automatically retire S1/S2 tutors and mentors when advancing to S3.

### Dual Scope Paths (ADR-0005, ADR-0013 & ADR-0014)
Every batch maintains two native PostgreSQL `ltree` paths:
1. `home_path`: Permanent affiliation path:
   `{institution}.{stream}.{home_department}.{program}.{batch}`
   *(Example: `i_carmel.s_aided.d_ce.p_dce.b_civil_2026_2029`)*
2. `managing_path`: Dynamic governance path:
   `{institution}.{stream}.{managing_department}.{program}.{batch}`
   *(Example in S1/S2: `i_carmel.s_aided.d_gen_aided.p_dce.b_civil_2026_2029`)*
   *(Example in S3+: `i_carmel.s_aided.d_ce.p_dce.b_civil_2026_2029`)*

**Access Rules:**
- **Governance / Write Actions:** Evaluated against `managing_path` only. HOD of Civil Engineering cannot approve marks, modify attendance, or promote a semester 1 batch.
- **Read / Analytics Actions:** Evaluated against `home_path` OR `managing_path`. HOD of Civil Engineering can always inspect student lists and performance of Civil students in semester 1.

---

## 3. Data Model & PostgreSQL Integrity

### Schema Tables (`tenant` connection)
1. `institutions`: Root organization entity.
2. `streams`: Funding streams (`AIDED`, `SF`, `SHARED`).
3. `departments`: Academic branches and administrative offices (`code`, `name`, `stream_id`, `funding_stream`, `kind`, `scope_label`).
4. `programs`: Academic degree/diploma programs (`code`, `name`, `department_id`, `duration_semesters`, `scope_label`).
5. `regulations`: Curriculum regulations (`code` REV2021/REV2026, `name`, `is_active`).
6. `academic_years`: Institutional calendar years (`label`, `start_date`, `end_date`, `is_current`).
7. `batches`: Cohort batches (`program_id`, `home_department_id`, `managing_department_id`, `academic_year_id`, `regulation_id`, `entry_type`, `current_semester`, `status`, `home_path`, `managing_path`).
8. `sub_batches`: Typed sub-cohorts (`batch_id`, `type` lab/mentoring/workshop, `name`, `capacity`).
9. `department_semester_governance`: Dynamic governance rules mapping home department and semester ranges (`semester_from` to `semester_to`) to a managing department.
10. `academic_calendar_events`: Institutional diary events.

### Events Emitted
- `App\Modules\Organisation\Events\BatchSemesterPromoted`: Dispatched when a batch is promoted to a higher semester, triggering automatic archival of first-year tutor/mentor assignments when crossing from S2 to S3.

### PostgreSQL Integrity & GiST Constraints
1. **LTree GiST Indexes:**
   ```sql
   CREATE INDEX batches_home_path_gist ON batches USING gist (home_path);
   CREATE INDEX batches_managing_path_gist ON batches USING gist (managing_path);
   ```
2. **Semester Governance Exclusion Constraint:**
   Prevents overlapping semester ranges for the same home department using `btree_gist`:
   ```sql
   ALTER TABLE department_semester_governance
   ADD CONSTRAINT dept_sem_gov_no_overlap
   EXCLUDE USING gist (
       home_department_id WITH =,
       int4range(semester_from, semester_to, '[]') WITH &&
   );
   ```
3. **Academic Year Date Range Exclusion Constraint:**
   Prevents overlapping calendar dates across academic years:
   ```sql
   ALTER TABLE academic_years
   ADD CONSTRAINT academic_years_no_date_overlap
   EXCLUDE USING gist (
       daterange(start_date, end_date, '[]') WITH &&
   );
   ```

---

## 4. HTTP API Endpoints

All endpoints are prefixed with `/api/v1` and protected by `auth:sanctum` and permission middleware:

| Method | Endpoint | Permission Required | Description |
|---|---|---|---|
| `GET` | `/departments` | `organisation.batch.view` | List institution departments |
| `POST` | `/departments` | `organisation.department.manage` | Create institution department |
| `GET` | `/departments/{id}` | `organisation.batch.view` | Get department details |
| `PUT` | `/departments/{id}` | `organisation.department.manage` | Update department details / active status |
| `GET` | `/programs` | `organisation.batch.view` | List academic programs |
| `POST` | `/programs` | `organisation.department.manage` | Create academic program |
| `GET` | `/programs/{id}` | `organisation.batch.view` | Get program details |
| `PUT` | `/programs/{id}` | `organisation.department.manage` | Update academic program |
| `GET` | `/academic-years` | `organisation.batch.view` | List academic years |
| `POST` | `/academic-years` | `organisation.academic_calendar.manage` | Create academic year |
| `GET` | `/academic-years/{id}` | `organisation.batch.view` | Get academic year details |
| `PUT` | `/academic-years/{id}` | `organisation.academic_calendar.manage` | Update academic year |
| `GET` | `/regulations` | `organisation.batch.view` | List academic regulations |
| `GET` | `/workshop-sections` | `organisation.batch.view` | List workshop trade sections |
| `GET` | `/governance-rules` | `organisation.department.manage` | List semester governance rules |
| `PUT` | `/governance-rules/{id}` | `organisation.department.manage` | Update semester governance rule |
| `GET` | `/batches` | `organisation.batch.view` | List batches visible to user (filtered via `visibleTo` query scope) |
| `POST` | `/batches` | `organisation.batch.create` | Create a new academic batch |
| `GET` | `/batches/{id}` | `organisation.batch.view` | Retrieve batch details |
| `PUT` | `/batches/{id}` | `organisation.batch.create` | Update batch name / status |
| `POST` | `/batches/{id}/promote` | `organisation.batch.promote_semester` | Advance batch to next semester and transition managing department |
| `GET` | `/batches/{batchId}/sub-batches` | `organisation.batch.view` | List sub-batches for a batch |
| `POST` | `/batches/{batchId}/sub-batches` | `organisation.batch.create` | Create a typed sub-batch |
| `GET` | `/sub-batches/{id}` | `organisation.batch.view` | View sub-batch details |
| `PUT` | `/sub-batches/{id}` | `organisation.batch.create` | Update sub-batch details |
| `DELETE` | `/sub-batches/{id}` | `organisation.batch.create` | Delete sub-batch |

