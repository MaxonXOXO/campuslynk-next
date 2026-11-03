# Rules for AI Agents (Engineering Architecture & Quality Standard)

> Authoritative engineering standard for CampusLynk Academic Suite. All AI agents, contributors, and automated pipelines must follow these non-negotiable rules.

---

## 1. Core Architecture & Non-Negotiables

- **Module Isolation & Encapsulation**:
  - `App\Modules\<A>` must **never** directly import or reference `App\Modules\<B>\Models`, `Actions`, `Http\Controllers`, `Http\Requests`, or `Policies`.
  - Modules communicate **exclusively** via:
    1. **Domain Events** (`App\Modules\<A>\Events\*` dispatched via Laravel event bus).
    2. **Contracts & Interfaces** (`App\Modules\<A>\Contracts\*` or `App\Core\Contracts\*`).
  - Cross-module encapsulation is strictly enforced at CI level via Pest architecture tests in `tests/Architecture/ModuleBoundaryTest.php`.

- **Clean Action Pipeline**:
  - Controller -> Action -> Model.
  - Controllers are strictly thin HTTP adapters: validate input via `FormRequest`, invoke an Action, and return an Eloquent `JsonResource`.
  - Controllers must **never** contain domain logic and must **never** execute raw database queries, `DB::statement`, `DB::insert`, `DB::update`, `DB::delete`, or `DB::raw`. All writes go through an Action.
  - Every Action in `App\Modules\*\Actions` must be declared `final class` and implement a single public `execute(...)` method.

- **Strict Typing & Core Integrity**:
  - Every single PHP file in `app/Core` and `app/Modules` must declare `declare(strict_types=1);` as its very first statement.
  - Do **not** modify `app/Core` without an approved Architectural Decision Record (ADR) documented in `docs/adr/`.

---

## 2. Tenancy & Database Rules

- **Database-per-Tenant Isolation (ADR-0001, ADR-0002)**:
  - Every tenant owns an isolated PostgreSQL database. The application executes queries solely within the resolved tenant context.
  - Every Eloquent model in `App\Modules\*` (excluding Platform landlord models) must use:
    - `App\Core\Tenancy\Concerns\UsesTenantConnection`
    - `Illuminate\Database\Eloquent\Concerns\HasUlids`
  - All primary keys and foreign keys must use ULIDs (char(26)).

- **Landlord Isolation**:
  - The `landlord` and `pgsql_admin` connections are strictly restricted to `App\Core\Tenancy` and `App\Modules\Platform`.
  - Application containers run as unprivileged `landlord_app` (`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`).
  - Direct credentials, raw SQL injection, and public schema queries across tenant databases are mechanically blocked.

- **Migration Discipline**:
  - Migrations must support zero-downtime execution following the `expand → migrate → contract` rollback pattern.
  - Every migration must execute cleanly on a fresh tenant database and support rolling back cleanly without data loss.

---

## 3. Scoped RBAC & PostgreSQL ltree (ADR-0004, ADR-0005, ADR-0013)

- **Permission Canonical Format**:
  - Permissions strictly follow the format: `<module>.<resource>.<action>` (e.g., `identity.user.create`, `organisation.batch.view`).
  - Permissions are declared exclusively within the module manifest via `<Name>Module::permissions()`.
  - Never hard-code role names or string literals in authorization logic. Always verify capabilities via `$user->can(...)` or `ScopeAuthorizer`.

- **Managing vs. Home Path Scoping (ADR-0005)**:
  - Governance and write operations (`.create`, `.update`, `.delete`, `.manage`, `.promote_semester`) match **only** the resource's `managing_department` (`managing_path`).
  - Read and directory operations (`.view`, `.view_own`, `.audit_report`, `.export`) match **either** `managing_department` **or** `home_department` (`home_path`).
  - Models implement `App\Core\Contracts\ScopedResource` and use `App\Core\Concerns\HasScopedVisibility` for PostgreSQL ltree matching.

- **Singleton Exclusion & Concurrency**:
  - Singleton roles (`principal`, `hod`) are constrained to exactly one active assignment per scope using PostgreSQL `btree_gist` exclusion constraints.
  - Never bypass the database exclusion constraint; handle concurrent assignment conflicts with 409 Conflict Problem Details.

- **Audited Impersonation (ADR-0004)**:
  - Impersonation sessions expire in 30 minutes.
  - Every impersonated session is universally read-only: all mutating verbs (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked with 403 RFC 7807 Problem Details.

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

3. **Database & Models**:
   - Place migrations in `app/Modules/<Name>/Database/Migrations/`.
   - Use ULID primary keys and `UsesTenantConnection`.

4. **Actions & Endpoints**:
   - Write `final class` Actions implementing `execute(...)`.
   - Create FormRequests and JSON Resources.
   - Register routes in `app/Modules/<Name>/Routes/api.php` under `api/v1` with `auth:sanctum`, `permission:<module>.<resource>.<action>`, and `module:<slug>`.

5. **OpenAPI Sync & Client Generation**:
   - Add new endpoints to `contracts/openapi.yaml`.
   - Run `composer contract` to verify 1:1 route synchronization.
   - Run `pnpm --filter @academic-suite/api-client generate` and commit updated TypeScript clients.

---

## 5. Frontend Rules

- **Strict Monorepo Discipline**:
  - Apps: `frontend/apps/web/` (Next.js application).
  - Packages:
    - `@academic-suite/ui` (`frontend/packages/ui/`): Authoritative UI component library.
    - `@academic-suite/core` (`frontend/packages/core/`): Shared business logic and utilities.
    - `@academic-suite/api-client` (`frontend/packages/api-client/`): Strongly typed OpenAPI API client.
    - `@academic-suite/config` (`frontend/packages/config/`): ESLint, TypeScript, and Tailwind configurations.

- **Component & Styling Constraints**:
  - UI components come **only** from `@academic-suite/ui`.
  - **Never** create local UI components in `apps/web/src/components/ui/`. Add new reusable components to `@academic-suite/ui` via the shadcn CLI.
  - **Never** hardcode CSS color literals (hex `#fff`, `rgb()`, or Tailwind raw color utilities `bg-blue-500`). Always use semantic design tokens (`bg-primary`, `text-muted-foreground`, `border-border`).

- **API Integration**:
  - **Never** use raw `fetch()` or `axios` for backend API communication.
  - Always consume typed methods via `@academic-suite/api-client` (e.g., `apiClient.batches.list()`, `apiClient.auth.login()`).
  - Errors are parsed transparently into typed `ApiError` instances containing RFC 7807 `ProblemDetails`.

---

## 6. Quality Gates & Definition of Done

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
