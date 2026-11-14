# ADR-0016: First-Run Setup State, Settings Schemas, and Wizard Lifecycle

**Status:** Decided  
**Date:** 2026-11-03  
**Deciders:** Core Engineering Team  
**Consulted:** ADR-0004, ADR-0006, ADR-0010, ADR-0011, ADR-0015  

---

## Context

Following the multi-tenant decoupling in ADR-0015, institutions require a guided first-run onboarding sequence for Super Admins upon initial deployment. The onboarding wizard configures:
1. Institution profile & branding metadata (`institution_profile`, `branding`).
2. Academic calendar fundamentals (`calendar_basics`: working days, daily period count, period timings, day order format).
3. Student/Parent registration policy (`signup_policy`: self-registration toggles, manual/auto approval mode).
4. Structural prerequisites: Streams, academic departments, and academic year calendar records.

We require an authoritative architectural standard on how setup state is persisted, validated, gated, and finalized without adding rigid database columns or polluting core runtime middleware.

---

## Decision

### 1. Setup State in Schema-Validated `setup` Setting (Not a Column)
Setup state is stored entirely within a single JSONB record in the `tenant_settings` table under the key `setup`, validated against `contracts/json-schemas/setup-state.schema.json`.
- **No Dedicated Table/Column:** Institutional setup completion is an onboarding lifecycle concern rather than a transactional domain entity. Adding a `setup_completed_at` column to `tenants` or creating a dedicated database table would introduce schema migrations for ephemeral state.
- **Fail-Closed JSON Schema:** The `setup` setting, along with `institution_profile`, `calendar_basics`, and `signup_policy`, is registered in `TenantSetting::SCHEMA_MAP`. Writes fail closed if payloads fail strict schema validation.
- **Granular Step Progress:** The setting tracks per-step completion timestamps (`steps.institution_profile.completed_at`, `steps.calendar_basics.completed_at`, `steps.signup_policy.completed_at`) alongside the top-level `completed_at`.

### 2. Derived + Recorded Completion Model
Setup completion is both **derived** (validated against live prerequisites) and **recorded** (timestamped at finalization):
- **Derived Prerequisites:** Finalizing setup requires active completion of all three wizard steps (`institution_profile`, `calendar_basics`, `signup_policy`) AND verification that at least one Stream, one Department, and one Academic Year exist in the tenant database.
- **Recorded Timestamp:** Calling `POST /api/v1/setup/complete` writes `setup.completed_at = now()`. A subsequent call returns **HTTP 409 Conflict** (`setup-already-completed`).
- **Idempotent Step Re-saves:** Re-saving an earlier step (`PUT /api/v1/setup/steps/{step}`) updates that step's configuration while strictly preserving `setup.completed_at`. Additionally, a step's own completion timestamp (`steps.{step}.completed_at`) is kept on re-save rather than overwritten. Re-configuring institutional settings post-setup does not invalidate setup completion or re-lock the institution.

### 3. Super Admin-Only Access & No Global Request Gating
- **Strict Role Scoping:** Setup endpoints (`/api/v1/setup/*`) require `auth:sanctum`, non-expired credentials (`must_change_password = false`), and the `super_admin` role assigned at `institution` scope. Non-super-admin staff and students receive **HTTP 403 Forbidden** RFC 7807 problem details.
- **No Global Request Gating:** Incomplete setup does **not** gate or intercept standard API endpoints (e.g., login, me, departments, batches). Determining whether to redirect an administrator to the setup wizard is strictly a frontend UI concern. Standard endpoints remain accessible so Super Admins can seed structural entities.

### 4. Structural Prerequisite Creation via Existing Endpoints
Streams, departments, and academic years are not duplicated or created through wizard-specific endpoints. Instead:
- The Super Admin creates structural entities using the authoritative domain endpoints (`POST /api/v1/departments`, `POST /api/v1/academic-years`, or seeder profiles).
- The wizard status endpoint (`GET /api/v1/setup/status`) returns read-only counts (`prerequisites.streams_count`, `prerequisites.departments_count`, `prerequisites.academic_years_count`) alongside step progress.

### 5. Signup Policy Storage Inertness
The `signup_policy` setting (`student_self_registration_enabled`, `parent_self_registration_enabled`, `approval_mode`) is stored and validated during first-run setup but is inert at runtime. It establishes canonical tenant configuration ahead of the dedicated Self-Registration and Registration Queue ADR.

### 6. Dynamic Problem-Type Base URI
RFC 7807 problem detail type URIs resolve dynamically via `config/errors.php` (`PROBLEM_TYPE_BASE_URL`, defaulting to `https://errors.campuslynk.net`) through `ProblemDetails::type($slug)`. Problem type URIs are stable, non-dereferenceable identifiers, and no hardcoded legacy domains (`academic-suite.net`, `api.academic-suite.com`) remain in `backend/app`.

---

## Consequences
- ✅ Clean, schema-validated setup lifecycle with zero tenant column bloat.
- ✅ Clear separation: Wizard guides configuration; authoritative domain actions manage streams, departments, and academic years.
- ✅ Resilient post-setup editing: Institutional settings can be tuned anytime without breaking completion status.
- ✅ Fully decoupled problem-type configuration ready for production domain registration.

---

## Decision Amendment — 2026-11-12: Optional Sign-Up Policy at Finalization

**Status:** Decided

**Scope:** Supersedes the requirement in Decision §2 to explicitly complete `signup_policy` before finalization. The remaining setup lifecycle and authorization decisions continue to apply.

### Rationale

The sign-up preferences are currently inert pending the dedicated Self-Registration module. Requiring an explicit save of unchanged, disabled defaults adds a mandatory onboarding operation without an active registration workflow. Successful finalization can initialize the canonical policy while still preserving administrator-selected preferences.

### Amended Contract

- `POST /api/v1/setup/complete` still requires the `institution_profile` and `calendar_basics` setting rows **and** their nonempty completion timestamps, plus at least one Stream, Department, and Academic Year. Missing prerequisites return **HTTP 422** (`setup-prerequisites-missing`, `errors.missing`). An unsaved `signup_policy` is not a missing prerequisite.
- Successful completion initializes a missing `signup_policy` through the existing schema-validated `TenantSetting` write path with:
  - `student_self_registration_enabled = false`
  - `parent_self_registration_enabled = false`
  - `approval_mode = manual`
- Existing policy values, `created_at`, and `updated_at` are preserved. An existing policy row without a step completion timestamp receives only the missing `setup.steps.signup_policy.completed_at`; the policy row is not re-saved. Existing step timestamps are preserved, including when a missing policy row must be recreated.
- Policy initialization, any missing policy step timestamp, and `setup.completed_at` are persisted in **one tenant transaction** after all prerequisites pass. The status response is resolved within that transaction. A failed completion leaves no partially initialized policy or completion markers.
- Completion locks existing setup/configuration rows in deterministic key order before checking the recorded completion state. The required profile/calendar timestamps imply an existing `setup` row, which serializes finalization even when no policy row exists to lock. One live prerequisite row of each kind is also locked until commit. Transaction retries handle deadlocks; a repeated call or a losing concurrent completion returns **HTTP 409** (`setup-already-completed`) after observing the winner's recorded timestamp.
- `GET /api/v1/setup/status` remains read-only. Each step's `is_completed` requires both a nonempty completion timestamp and its setting row. Missing settings report `settings_exist = false`, `values = null`, and `is_completed = false` even if a historical timestamp remains. Policy defaults appear only after explicit saving or successful initialization at finalization.
- `PUT /api/v1/setup/steps/signup_policy` remains available for explicit preferences before or after setup completion, preserving the existing re-save timestamp semantics.

### Writer Attribution

`tenant_settings` has no writer column or automatic setting-save audit hook. Automatic policy creation therefore uses the existing tenant-local `organisation` activity log and its authenticated-causer resolution. The event `signup_policy.defaults_initialized`, subject `TenantSetting` / `signup_policy`, and property `source = setup_completion` attribute creation to the completing administrator and distinguish automatic initialization from an explicit save. Existing policy rows are not re-attributed by completion.

This amendment adds no migration, setting-schema fields, or response fields.

### Revisit Trigger

Revisit this decision when the dedicated **Self-Registration module** begins consuming `signup_policy`, before those preferences enable live student/parent registration or registration-queue approval. Its ADR must reassess whether policy review or explicit confirmation is required, define how existing automatically initialized policies are treated, and retain distinguishable writer provenance.

---

## Implementation Note — 2026-11-14: Shared Setup Write Lock and Synchronous Audit

- **One write-lock protocol:** `SaveSetupStepAction` and `CompleteSetupAction` must acquire the `setup` row lock in a separate first query inside their tenant transaction, before reading or writing any other configuration row. `LockSetupStateAction` provides this shared mutex. Completion subsequently locks the remaining settings in key order; an explicit save locks its target step. The structural lock order remains Stream → Department → Academic Year.
- **Concurrent first saves:** If `setup` is absent, initialization uses the schema-validated model path and `createOrFirst`'s savepoint-protected unique-key conflict handling, followed by a fresh locking read. Unrecorded step markers do not make a step complete. A failed completion rolls back any newly initialized mutex along with its policy and completion markers.
- **Fresh configuration snapshot:** Do not combine `setup` and the remaining settings into one locking SELECT. Under PostgreSQL `READ COMMITTED`, that statement can wait on `setup` yet still miss a policy inserted by the transaction it waited for. Acquiring the mutex first and then issuing fresh configuration queries preserves that committed custom policy.
- **Synchronous audit assumption:** The transactional audit guarantee assumes `activitylog.enabled = true` and `activitylog.buffer.enabled = false` (`ACTIVITYLOG_BUFFER_ENABLED=false`). The `signup_policy.defaults_initialized` event must be persisted synchronously on the tenant connection. Buffered logging flushes outside the completion transaction and does not provide this atomicity guarantee.
- **Late-failure rollback:** An exception after the audit insert or after the last status query rolls back the policy, setup completion markers, and audit together. Retrying the failed completion creates exactly one policy and one initialization event. Existing policy values and recorded timestamps retain their preservation semantics.
