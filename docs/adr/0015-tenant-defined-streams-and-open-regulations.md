# ADR-0015: Tenant-Defined Streams, Open Regulations and Hardened Settings

**Status:** Decided

## Context
During the Sprint 0 Step 6.6 read-only architectural audit (Prompt 06e), several tenant-coupling and schema-rigidity assumptions were identified that blocked true tenant-agnostic first-run onboarding:
1. **Hardcoded Stream Constraint:** Migration `2026_11_02_000002_create_organisation_spine_tables.php` enforced `CHECK (funding_stream IN ('AIDED', 'SF', 'SHARED'))` on `departments`. This assumed all institutions follow Kerala polytechnic management categories. Furthermore, `TenantBaselineSeeder` hard-coded these three streams into every tenant's baseline.
2. **Hardcoded Curriculum Revision Constraint:** `regulations.code` enforced `CHECK (code IN ('REV2021', 'REV2026'))`. This directly contradicted ADR-0006, which decided that curriculum regulations must be data-driven without database migrations or code changes when new regulations arrive (e.g., `REV2031` or state boards outside Kerala).
3. **Department Code Collision Across Streams:** `departments.code` carried a global `UNIQUE(code)` constraint. In institutional practice, an academic branch has one canonical code (e.g. `CE` for Civil Engineering) that may be offered concurrently under multiple funding streams (e.g., Aided Civil and Self-Financing Civil). The schema prevented sharing canonical codes.
4. **Identifier Rejection:** `user_identifiers.kind` check constraint permitted only `'email'`, `'mobile'`, and `'registration_number'`. Slashed admission numbers (such as `5842/25`), common in Indian polytechnic and engineering admissions, could not be stored under a distinct admission number kind.
5. **Fail-Open Tenant Settings:** `TenantSetting` validated only keys mapped in `SCHEMA_MAP`, allowing unvalidated arbitrary keys to be persisted to `tenant_settings`.
6. **Incomplete Super Admin Bootstrap:** Commands `app:install` and `tenants:create` provisioned a staff user but did not insert a `role_assignments` record linking them to `super_admin`, and fell back to Carmel-specific default options.

## Decision
1. **Streams and Regulations as Tenant Data:**
   - Drop the `funding_stream` column and `chk_departments_funding_stream` check constraint via forward migration `2026_11_03_000001_generalise_tenant_spine_and_identifiers.php`.
   - Every stream reference is resolved via foreign key `stream_id` referencing `streams.id`.
   - Drop `chk_regulations_code` from `regulations` table. Regulations are pure data rows.
   - `TenantBaselineSeeder` retains only tenant-agnostic RBAC roles, permissions, delegation rules, and workshop section archetypes.
   - Streams (`AIDED`, `SF`, `SHARED`) and regulations (`REV2021`, `REV2026`) are moved into the optional `KeralaPolytechnicProfileSeeder`. Tenants provisioned with `--seed-profile=none` or `--seed-profile=baseline` migrate and seed cleanly without Kerala-specific entities.

2. **Scoped Department Code Uniqueness:**
   - Replace `UNIQUE(code)` on `departments` with composite `UNIQUE(code, stream_id)`.
   - Distinct funding streams can share the canonical branch code (`CE`, `ME`, `EEE`).
   - `scope_label` remains strictly unique across the entire tenant. When a canonical code is reused in another stream, `CreateDepartmentAction` dynamically disambiguates the scope label with the stream code suffix (e.g., `d_ce` for the first stream and `d_ce_sf` for the second), ensuring ltree GiST path resolution is never corrupted.

3. **Expanded Identifier Kinds:**
   - Extend `chk_user_identifiers_kind` to include `'admission_number'` (`CHECK (kind IN ('email', 'mobile', 'registration_number', 'admission_number'))`).
   - `UserIdentifier::normalise` / `normaliseValue` handles alphanumeric handles and slashed formats (`5842/25`) case-insensitively without stripping the slash.

4. **Fail-Closed Settings Foundation:**
   - `TenantSetting::booted()` enforces fail-closed validation: saving any key not declared in `TenantSetting::SCHEMA_MAP` throws an `InvalidArgumentException`.
   - Added canonical schemas `auth-token-lifetime-web-hours.schema.json` and `auth-token-lifetime-mobile-days.schema.json` in `contracts/json-schemas/` and mapped them in `SCHEMA_MAP`.
   - `LoginAction` dynamically reads token lifetimes from `tenant_settings`, falling back to 12 hours (web) and 30 days (mobile) when absent.

5. **Bootstrap Transaction & Dynamic Password Rules:**
   - `app:install` and `tenants:create` create the initial staff user and their `role_assignments` record (`super_admin`, institution scope) in the exact same database transaction.
   - Removed Carmel defaults from `AppInstallCommand` and `config/tenancy.php`; required options `--domain`, `--name`, and `--slug` must be explicitly provided or entered interactively.
   - `PasswordPolicyRule` derives institutional banned terms dynamically from the active tenant's name and slug rather than static hardcoded dictionary entries.

6. **Stream Management API (Sprint 0, Step 6.6c):**
   - Endpoints: `GET /api/v1/streams` (lists streams ordered by name with `departments_count`), `POST /api/v1/streams` (create), `PATCH /api/v1/streams/{id}` (rename only), `DELETE /api/v1/streams/{id}` (delete).
   - **Immutable Code:** Stream `code` is immutable after creation. Attempting to change `code` via `PATCH` yields HTTP 422 problem+json. This immutability guarantees stream scope labels (`s_{code}`) and downstream department scope labels (`d_{dept}_{stream}`) remain stable, preventing corruption of PostgreSQL ltree paths and role assignments.
   - **Delete Restriction:** A stream may be deleted only when zero departments reference it. Attempting to delete a referenced stream returns HTTP 409 problem+json with problem type `stream-in-use`.
   - **Authorisation:** Stream mutations require `organisation.stream.manage`, granted to `super_admin` at institution scope. Listing requires `organisation.batch.view`.

7. **Known Limitation (Deferred):**
   - Governance in `department_semester_governance` is keyed on `home_department_id`, not `program_id`.
   - *Rationale for Deferral:* In Kerala polytechnics and most Indian diploma institutions, all diploma programs under a home department share identical semester governance (e.g., all engineering programs under Civil Engineering are governed by the General Department for S1/S2).
   - *Trigger for Revisiting:* Adding support for multi-program departments where individual programs follow distinct semester governance paths (e.g., autonomous colleges with dual-track 3-year diploma vs 4-year degree programs under a shared engineering division).

## Consequences
- Tenancy baseline is decoupled from the pilot institution; fresh institutions can configure arbitrary streams and curriculums.
- Multiple streams can share the same canonical department code without collision.
- Student accounts can be identified and authenticated by admission numbers with slashes.
- System security is hardened with fail-closed configuration and transactional super-admin provisioning.

