# Rules for AI Agents (Engineering Architecture & Quality Standard)

> Authoritative engineering standard for CampusLynk Academic Suite. All AI agents, contributors, and automated pipelines must follow these non-negotiable rules.

---

## 1. Core Architecture & Non-Negotiables

- **Module Isolation & Encapsulation (ADR-0007)**:
  - `App\Modules\<A>` must **never** directly import or reference `App\Modules\<B>\Models`, `Actions`, `Http\Controllers`, `Http\Requests`, or `Policies`.
  - Modules communicate **exclusively** via:
    1. **Domain Events** (`App\Modules\<A>\Events\*` dispatched via Laravel event bus).
    2. **Contracts & Interfaces** (`App\Modules\<A>\Contracts\*` or `App\Core\Contracts\*`).
  - Cross-module encapsulation is strictly enforced at CI level via Pest architecture tests in `tests/Architecture/ModuleBoundaryTest.php`.

- **Clean Action Pipeline (ADR-0006)**:
  - Controller -> Action -> Model.
  - Controllers are strictly thin HTTP adapters: validate input via `FormRequest`, invoke an Action, and return an Eloquent `JsonResource`.
  - Controllers must **never** contain domain logic and must **never** execute raw database queries, `DB::statement`, `DB::insert`, `DB::update`, `DB::delete`, or `DB::raw`. All writes go through an Action.
  - Every Action in `App\Modules\*\Actions` must be declared `final class` and implement a single public `execute(...)` method.

- **Strict Typing & Core Integrity**:
  - Every single PHP file in `app/Core` and `app/Modules` must declare `declare(strict_types=1);` as its very first statement.
  - Do **not** modify `app/Core` without an approved Architectural Decision Record (ADR) documented in `docs/adr/`.

---

## 2. Tenancy & Database Rules

- **Database-per-Tenant Isolation (ADR-0001, ADR-0002, ADR-0003, ADR-0010)**:
  - Every tenant owns an isolated PostgreSQL database. The application executes queries solely within the resolved tenant context.
  - Every Eloquent model in `App\Modules\*` (excluding Platform landlord models using `App\Core\Tenancy\Models\LandlordModel`) must use:
    - `App\Core\Tenancy\Concerns\UsesTenantConnection`
    - `Illuminate\Database\Eloquent\Concerns\HasUlids`
  - All primary keys and foreign keys must use ULIDs (char(26)).
  - Background landlord tasks must implement `App\Core\Tenancy\Contracts\LandlordJobContract`.

- **PgBouncer & Runtime Safety (ADR-0011, ADR-0012)**:
  - PgBouncer operates in transaction pooling mode (`pool_mode=transaction`).
  - Disable PDO emulated prepares (`emulated prepares = false`) on tenant database drivers to eliminate connection state leaks.
  - Application worker runtime (`FrankenPHP` / Laravel Octane) executes with state resetters between requests.
  - Unprivileged application role (`landlord_app`) enforces least privilege; owner operations run via separate migrations.

- **Migration Discipline**:
  - Migrations must support zero-downtime execution following the `expand → migrate → contract` rollback pattern.
  - Every migration must execute cleanly on a fresh tenant database and support rolling back cleanly without data loss.

---

## 3. Scoped RBAC & PostgreSQL ltree (ADR-0004, ADR-0005, ADR-0013)

- **Permission Canonical Format**:
  - Permissions strictly follow the format: `<module>.<resource>.<action>` (e.g., `identity.user.create`, `organisation.batch.view`).
  - Synchronize permissions across modules using `php artisan permissions:sync`.
  - Validate scope labels via `App\Core\Authorization\ScopeLabelValidator::validateScopeLabel(...)`.

- **Managing vs. Home Path Scoping (ADR-0005)**:
  - Governance and write operations (`.create`, `.update`, `.delete`, `.manage`, `.promote_semester`) match **only** `managing_department` (`managing_path`).
  - Read and directory operations (`.view`, `.view_own`, `.audit_report`, `.export`) match **either** `managing_department` **or** `home_department` (`home_path`).
  - Scoped models implement `App\Core\Contracts\ScopedResource`, use `App\Core\Concerns\HasScopedVisibility`, and expose the `visibleTo` Eloquent query scope for PostgreSQL `ltree` matching.

- **Singleton Exclusion & Concurrency (ADR-0013)**:
  - Singleton roles (`principal`, `hod`) are constrained to exactly one active assignment per scope using PostgreSQL `btree_gist` exclusion constraints.
  - Never bypass the database exclusion constraint; handle concurrent assignment conflicts with 409 Conflict Problem Details.

- **Audited Impersonation (ADR-0004)**:
  - Impersonation sessions expire in 30 minutes.
  - Middleware `impersonation:read_only` strictly blocks all mutating verbs (`POST`, `PUT`, `PATCH`, `DELETE`) with 403 RFC 7807 Problem Details.
  - Security audit commands run under `without_impersonation` context to ensure raw actor provenance.

---

## 4. Module Creation Recipe

When building a new domain module (e.g., `Attendance`, `Assessment`, `Leave`):

1. **Scaffold with Generator**:
   ```bash
   php artisan make:module <ModuleName>
   ```
   *Validates StudlyCase name, generates canonical directory structure, module manifest, route stub, test stub, and documentation.*

2. **Declare Manifest**:
   - Implement `App\Core\Modules\Contracts\ModuleManifestContract`.
   - Define `slug()`, `name()`, `isCore()`, and `permissions()`.
   - Core modules are always enabled; non-core modules are gated by `module:{slug}` middleware.
   - Run `php artisan permissions:sync` to register new permissions.

3. **Database & Models**:
   - Place migrations in `app/Modules/<Name>/Database/Migrations/`.
   - Use ULID primary keys and `UsesTenantConnection`.

4. **Actions & Endpoints**:
   - Write `final class` Actions implementing `execute(...)`.
   - Create FormRequests and JSON Resources.
   - Register routes in `app/Modules/<Name>/Routes/api.php` under `api/v1` with `auth:sanctum`, `permission:<module>.<resource>.<action>`, and `module:{slug}`.

5. **OpenAPI Sync & Client Generation**:
   - Add new endpoints to `contracts/openapi.yaml`.
   - Run `composer contract` to verify 1:1 route synchronization.
   - Run `pnpm --filter @academic-suite/api-client generate` and commit updated TypeScript clients.

---

## 5. Frontend Rules

- **Strict Monorepo Discipline (ADR-0008)**:
  - Apps: `frontend/apps/web/` (Next.js application).
  - Packages:
    - `@academic-suite/ui` (`frontend/packages/ui/`): Authoritative UI component library.
    - `@academic-suite/core` (`frontend/packages/core/`): Shared business logic and utilities.
    - `@academic-suite/api-client` (`frontend/packages/api-client/`): Strongly typed OpenAPI API client.
    - `@academic-suite/config` (`frontend/packages/config/`): ESLint, TypeScript, and Tailwind configurations.

- **Component & Styling Constraints**:
  - UI components come **only** from `@academic-suite/ui`.
  - **Never** create local UI components in `apps/web/src/components/ui/`.
  - **Never** hardcode CSS color literals (hex `#fff`, `rgb()`, or raw Tailwind colors). Always use semantic design tokens (`bg-primary`, `text-muted-foreground`).
  - Bilingual typography safety: Provide full `Malayalam` font fallbacks (Noto Sans Malayalam) preventing layout shifts.

- **API Integration (ADR-0009)**:
  - **Never** use raw `fetch()` or `axios` for backend API communication.
  - Always consume typed methods via `@academic-suite/api-client` (e.g., `apiClient.batches.list()`, `apiClient.auth.login()`).
  - Errors are parsed transparently into typed `ApiError` instances containing RFC 7807 `ProblemDetails`.

---

## 6. ADR Architecture Mapping

| ADR | Title | Authoritative Section in AGENTS.md |
| :--- | :--- | :--- |
| **ADR-0001** | Database-per-Tenant Isolation | §2 Tenancy & Database Rules |
| **ADR-0002** | Landlord Isolation & Least Privilege | §2 Tenancy & Database Rules |
| **ADR-0003** | ULID Primary & Foreign Keys | §2 Tenancy & Database Rules |
| **ADR-0004** | Role Delegation & Universal Impersonation | §3 Scoped RBAC & PostgreSQL ltree |
| **ADR-0005** | Scoped RBAC with PostgreSQL ltree | §3 Scoped RBAC & PostgreSQL ltree |
| **ADR-0006** | Action-Based Architecture Pipeline | §1 Core Architecture & Non-Negotiables |
| **ADR-0007** | Strict Module Encapsulation | §1 Core Architecture & §4 Module Creation |
| **ADR-0008** | Monorepo Strict Structure & UI Discipline | §5 Frontend Rules |
| **ADR-0009** | Strongly Typed OpenAPI Client Pipeline | §5 Frontend Rules & §6 Quality Gates |
| **ADR-0010** | Tenant Routing & Domain Resolution | §2 Tenancy & Database Rules |
| **ADR-0011** | PgBouncer Pooling Safety & Emulated Prepares | §2 Tenancy & Database Rules |
| **ADR-0012** | Owner vs Runtime Least-Privilege Roles | §2 Tenancy & Database Rules |
| **ADR-0013** | Singleton Role Exclusion Constraints | §3 Scoped RBAC & PostgreSQL ltree |

---

## 7. Quality Gates & Definition of Done

No pull request or feature branch may be merged unless all checks pass cleanly without warnings or skipped tests.

### Backend Verification (`backend/`)
- **Lint**: `composer lint` (Laravel Pint --test)
- **Static Analysis**: `composer analyse` (Larastan Level 8)
- **Contract Drift Gate**: `composer contract` (OpenAPI 1:1 synchronization test)
- **Unit & Feature Tests**: `composer test` (Pest 3)
- **Full Backend Check**: `composer check` (Runs lint + analyse + test)

### Frontend Verification (`frontend/`)
- **Generate API Client**: `pnpm --filter @academic-suite/api-client generate`
- **Lint**: `pnpm run lint` (ESLint across monorepo + discipline check)
- **Typecheck**: `pnpm run typecheck` (tsc strict across all packages and apps)
- **Unit Tests**: `pnpm run test` (Vitest unit tests)
- **Full Frontend Check**: `pnpm run check` (Runs lint + typecheck + test)

### Feature Acceptance Criteria:
Every new endpoint or feature requires:
1. `final` Action class with `execute(...)` method.
2. Dedicated `FormRequest` with complete validation rules.
3. Explicit `permission:<module>.<resource>.<action>` middleware.
4. Eloquent `JsonResource` following `{ data, meta, links }` envelope.
5. Pest feature tests covering:
   - Successful execution (200 / 201).
   - Unauthorized role rejection (403).
   - Cross-tenant isolation verification.
6. Synchronized OpenAPI spec in `contracts/openapi.yaml`.
7. Generated and committed `@academic-suite/api-client` types.
