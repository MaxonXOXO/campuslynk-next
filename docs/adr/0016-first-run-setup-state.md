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

