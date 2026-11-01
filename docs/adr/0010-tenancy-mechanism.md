# ADR-0010: Tenancy Core Implementation Mechanism

**Status:** Decided  
**Date:** 2026-11-01  
**Deciders:** Core Engineering Team  
**Consulted:** `docs/foundation_spec.md` (§1, §3.1, §4, §6, §8), `docs/architecture_blueprint.md` (v3 §3), ADR-0001, ADR-0002, ADR-0009  

---

## Context and Problem Statement

Academic Suite (CampusLynk / Carmel LINX) requires a multi-tenant foundation on PostgreSQL 17 that operates across two deployment profiles:
1. **On-Premise Appliance (`DEPLOY_PROFILE=onprem`)**: A single-tenant hardware appliance for a polytechnic college (e.g., Carmel Polytechnic College) with strict domain registration and no cross-tenant switching.
2. **Cloud SaaS (`DEPLOY_PROFILE=cloud`)**: Dynamic multi-tenant deployment hosting multiple independent institutions, with request routing via institutional domains (e.g., `app.carmelpoly.in`) or administrative header (`X-Tenant`), backed by PgBouncer transaction pooling (ADR-0009).

Per **ADR-0001**, our architectural baseline is **database-per-tenant isolation** (`landlord` database for institution registry, plus an isolated `tenant_<slug>` database per college). Furthermore, defense-in-depth requires:
- `REVOKE CONNECT ON DATABASE tenant_<slug> FROM PUBLIC;`
- Dedicated restricted PostgreSQL login user `tenant_<slug>_u` per tenant database (no superuser, no createdb, no createrole).
- A privileged landlord provisioning connection (`pgsql_admin` directly to PostgreSQL port 5432) separated from runtime unprivileged pooled connections routed through PgBouncer (`tenant` on port 6432).
- Zero memory leakage and safe state reset between requests when running under **FrankenPHP / Laravel Octane worker mode**.

We evaluated whether to adopt the third-party package `stancl/tenancy` or implement a purpose-built tenancy core in `app/Core/Tenancy`.

---

## 2026 Registry Verification (`stancl/tenancy`)

On 2026-11-01, we queried Packagist via Composer CLI:
```text
$ composer show stancl/tenancy --all
name     : stancl/tenancy
descrip. : Automatic multi-tenancy for your Laravel application.
keywords : laravel, tenancy, multi-tenancy, multi-database
versions : dev-master, 3.x-dev, v3.10.1, v3.10.0, v3.9.1, v3.9.0, v3.8.5, v3.8.4, v3.8.3, v3.8.2, v3.8.1, v3.8.0, v3.7.4, v3.7.3, v3.7.2, v3.7.1, v3.7.0, v3.6.1, v3.6.0, v3.5.9, v3.5.8, v3.5.7, v3.5.6, v3.5.5, v3.5.4, v3.5.3, v3.5.2, v3.5.1, v3.5.0, v3.4.6, v3.4.5, v3.4.4, v3.4.3, v3.4.2, v3.4.1, v3.4.0, v3.3.0, v3.2.1, v3.2.0, v3.1.7, v3.1.6, v3.1.5, v3.1.4, v3.1.3, v3.1.2, v3.1.1, v3.1.0, v3.0.0, v3.0.0-rc1, 2.x-dev, v2.3.12, v2.3.11, v2.3.10, v2.3.9, v2.3.8, v2.3.7, v2.3.6, v2.3.5, v2.3.4, v2.3.3, v2.3.2, v2.3.1, v2.3.0, v2.2.8, v2.2.7, v2.2.6, v2.2.5, v2.2.4, v2.2.3, v2.2.2, v2.2.1, v2.2.0, v2.1.2, v2.1.1, v2.1.0, v2.0.1, v2.0.0, v2.0.0-rc2, v2.0.0-rc1, 1.x-dev, v1.8.0, v1.7.3, v1.7.2, v1.7.1, v1.7.0, v1.6.1, v1.6.0, v1.5.1, v1.5.0, v1.4.0, v1.3.1, v1.3.0, v1.2.0, v1.1.3, v1.1.2, v1.1.1, v1.1.0, v1.0.0, dev-doctum, dev-validate-dbconfig, dev-throw-command-fail, dev-coverage, dev-syncmaster-in-tenant-context, dev-boilerplate-dev, dev-boilerplate-temp, dev-august, dev-database-cache-bootstrapper, dev-configurable-tenants-relationship, dev-may25, dev-configurable-force-rls-2, dev-path-identification-tests, dev-laravel-11-bc, dev-merge-3.x
type     : library
license  : MIT License (MIT) (OSI approved) https://spdx.org/licenses/MIT.html#licenseText
source   : [git] https://github.com/archtechx/tenancy.git c4cf5dc6d557fb7404feb11a6ddfe0985ddd9526
dist     : [zip] https://api.github.com/repos/archtechx/tenancy/zipball/c4cf5dc6d557fb7404feb11a6ddfe0985ddd9526 c4cf5dc6d557fb7404feb11a6ddfe0985ddd9526
names    : stancl/tenancy

autoload
psr-4
Stancl\Tenancy\ => src/

requires
ext-json *
php ^8.0
facade/ignition-contracts ^1.0.2
ramsey/uuid ^4.7.3
stancl/jobpipeline ^1.8.0
stancl/virtualcolumn ^1.5.0
illuminate/support ^10.0|^11.0|^12.0|^13.0
```

**Key Findings:**
1. **v4 is not released as stable on Packagist**: Only `v3.10.1` is tagged stable; v4 remains in untagged `dev-master` development. Relying on `dev-master` in production violates stability and reproducibility policies.
2. **Database manager limitations**: `stancl/tenancy` v3's `PostgreSQLDatabaseManager` only executes basic `CREATE DATABASE` / `CREATE SCHEMA`. It does not support per-tenant role provisioning (`CREATE ROLE tenant_<slug>_u`), `REVOKE CONNECT ON DATABASE ... FROM PUBLIC`, or splitting administrative provisioning (`pgsql_admin`) from transaction-pooled runtime access (`tenant`).
3. **FrankenPHP / Octane worker mode**: `stancl/tenancy` maintains heavy global singletons and event listeners that can retain state across requests in persistent workers.

---

## Comparison of Options

| Evaluation Criterion | Option A: `stancl/tenancy` (v3 / dev-master) | Option B: Custom Tenancy Core (`app/Core/Tenancy`) |
|---|---|---|
| **Maintenance Burden vs Flexibility** | High cognitive overhead; must maintain workarounds and custom database manager subclasses to implement our PostgreSQL security model; upstream v4 migration will break overrides. | **High flexibility, targeted maintenance**. Directly matches `docs/foundation_spec.md` without translation layers or unwanted features. |
| **Long-term Dependency Risk** | High. Package updates have lagged behind Laravel major versions; v4 has had prolonged development with breaking API churn. | **Zero external package risk**. Self-contained in Laravel 12 on PHP 8.4; fully audited and maintained by the project team. |
| **PostgreSQL Role Hardening (ADR-0001)** | Missing. Requires custom extensions to create per-tenant login roles, execute `REVOKE CONNECT ... FROM PUBLIC`, and manage encrypted passwords in `tenant_databases`. | **First-class native implementation**. `TenantProvisioner` validates slugs against `^[a-z][a-z0-9_]{2,40}$`, securely quotes identifiers (`quote_ident` / `format('%I')`) and passwords (`format('%L')`), and provisions least-privilege roles. |
| **Connection Separation (ADR-0009)** | Conflates administrative DDL with runtime pooled queries unless extensively patched. | **Explicit connection topology**. Provisioning uses direct `pgsql_admin` (port 5432); runtime transactions use `tenant` through PgBouncer (port 6432). |
| **FrankenPHP / Octane Worker Mode Safety** | Risky. Tenant state is held in static package properties requiring complex event listeners to flush. | **Deterministic exception-safe lifecycle**. Middleware wraps execution in `try { ... } finally { $context->forget(); }` plus registers FrankenPHP/Octane termination listeners. |
| **Dual Deployment Profiles (`onprem` vs `cloud`)** | Awkward. Requires bypass logic to simulate single-tenant operation on on-prem appliances. | **Native profile branching**. In `onprem`, accepts only registered domains of the single tenant; in `cloud`, performs dynamic lookup with host/header consistency. |

---

## Decision

We **adopt Option B: A purpose-built custom tenancy core in `app/Core/Tenancy`**.

### Architectural Specification

#### 1. Landlord Schema (`database/migrations/landlord/`)
Uses ULID public IDs across all tables:
- `tenants`: `id` (ULID char 26 PK), `slug` (varchar 40 unique), `name` (varchar 255), `status` (`provisioning|active|suspended|failed`), `deploy_profile` (`onprem|cloud`), timestamps.
- `domains`: `id` (ULID char 26 PK), `tenant_id` (FK `tenants.id` on delete cascade), `domain` (varchar 255 unique), `is_primary` (boolean default false), timestamps. Multiple domains per tenant are supported (e.g., `app.carmelpoly.in`, `portal.carmelpoly.in`).
- `tenant_databases`: `id` (ULID char 26 PK), `tenant_id` (FK `tenants.id` on delete cascade), `host` (varchar 255), `port` (integer), `database` (varchar 63), `username` (varchar 63), `password` (text, encrypted via `Crypt::encryptString`), timestamps. Supports moving tenants across database hosts.
- `licenses`: `id` (ULID char 26 PK), `tenant_id` (FK `tenants.id` on delete cascade), `plan` (varchar 50), `modules` (json), `valid_until` (timestamp), `signature` (text nullable), timestamps.
- `schema_versions`: `id` (ULID char 26 PK), `tenant_id` (FK `tenants.id` on delete cascade), `version` (varchar 50), `migrated_at` (timestamp), timestamps.
- `platform_users`: `id` (ULID char 26 PK), `email` (unique), `password_hash`, `name`, timestamps (table only, no auth logic in Sprint 0).

#### 2. Connection Topology & Runtime Role Isolation
- **`landlord`**: Application connection to the landlord database via PgBouncer.
- **`tenant`**: Dynamic runtime connection configured per request using credentials from `tenant_databases`. A fresh config array is created per request, and `DB::purge('tenant')` is invoked on both set and teardown to prevent stale connection reuse.
- **`pgsql_admin`**: Privileged direct connection to PostgreSQL (port 5432, `CREATEDB` + `CREATEROLE`) used **only** by `app/Core/Tenancy` provisioning code.
- **"No default tenant" rule**: Default connection throws `UnconfiguredDefaultConnectionException` if queried before a tenant context is established. Models must explicitly declare their connection or use the `UsesTenantConnection` trait.

#### 3. Strict Resolver (`ResolveTenant` Middleware)
- **Domain lookup**: Resolves tenant by querying the `domains` table (e.g., `app.carmelpoly.in`).
- **On-Premise Profile (`onprem`)**: Accepts **only the registered domains of the single tenant**. Unknown hosts receive HTTP **404**.
- **Host and Header Agreement**: When both host domain and `X-Tenant` header are present, both must resolve to the identical tenant; otherwise the request is rejected with HTTP 400.
- **Redis Caching**: Lookups cached in Redis for 5 minutes (`tenant:domain:{domain}`), invalidated on tenant or domain mutation.
- **Status Handling**: Unknown tenant → **404** (RFC 7807 problem details); `suspended` or expired license → **403**; `provisioning` → **503**; `failed` → **500**.
- **Exempt Routes**: `/up` and `/api/v1/health` require no tenant context.
- **Meta Probe**: `GET /api/v1/meta` (tenant-resolved, unauthenticated) returning `server_version`, `api_version`, `min_client_version`, `capabilities: []`, `deprecations: []` in the standard envelope.

#### 4. Exception-Safe Teardown & Worker Safety
- `ResolveTenant` executes:
  ```php
  try {
      $this->tenantContext->setTenant($tenant);
      return $next($request);
  } finally {
      $this->tenantContext->forget();
  }
  ```
- Additionally, an application-level request termination hook (`app()->terminating(...)` and FrankenPHP/Octane worker hook) guarantees teardown even on fatal errors.
- Teardown resets:
  1. Purges `tenant` connection (`DB::purge('tenant')`) and clears dynamic connection config.
  2. Resets cache prefix to landlord default.
  3. Resets filesystem root.
  4. Flushes tenant keys from log context.
  5. Clears `TenantContext` singleton state.

#### 5. Queue Fail-Closed
- Tenant-scoped queued jobs carry `tenant_id` in their payload.
- Queue worker re-initializes `TenantContext` upon `JobProcessing`.
- If a job has no `tenant_id` and does not implement `LandlordJobContract`, it **fails closed** immediately (`MissingTenantContextException`), preventing cross-tenant or unauthenticated queue execution.

#### 6. DDL Safety & Role Hardening
- Slugs validated with strict regex: `^[a-z][a-z0-9_]{2,40}$`.
- All DDL statements construct identifiers using PostgreSQL `quote_ident()` / `format('%I')` and literal quoting `format('%L')` for passwords:
  ```sql
  CREATE DATABASE %I OWNER %I;
  CREATE ROLE %I WITH LOGIN PASSWORD %L;
  REVOKE CONNECT ON DATABASE %I FROM PUBLIC;
  GRANT CONNECT ON DATABASE %I TO %I;
  ```
- Hostile slug attempts (quotes, semicolons, reserved words, uppercase) are rejected at validation before reaching PostgreSQL.

#### 7. PgBouncer Transaction Pooling Constraints
- Under PgBouncer transaction pooling (`pool_mode = transaction`), tenant connections must never issue session-level commands (`SET`, `SET ROLE`, temporary tables, `LISTEN/NOTIFY`, or multi-transaction advisory locks).
- Enforced via Pest architecture tests inspecting query executions and codebase AST.

#### 8. Commands
- `app:install`: On-premise appliance installer; fails if `DEPLOY_PROFILE != onprem` or a tenant exists; runs landlord migrations, then provisions the Carmel institution tenant (`carmel`).
- `tenants:create {name} {slug} {domain}`: Cloud profile tenant provisioning; refuses second tenant when `onprem`.
- `tenants:migrate {--tenant=}`: Runs tenant migrations across tenants, updates `schema_versions`, continues past failing tenants, and outputs a summary table with non-zero exit code on failure.

---

## Implementation Size & Ownership Estimate

A realistic codebase size estimate for the custom tenancy core is approximately **800 to 1,200 lines of strictly-typed PHP (level 8 Larastan compliant)** across:
- Migrations: 6 landlord migrations + 1 tenant migration (~250 lines)
- Models & Contracts: `Tenant`, `Domain`, `TenantDatabase`, `License`, `SchemaVersion`, `PlatformUser`, `TenantAwareJob` (~250 lines)
- Services & Context: `TenantContext`, `TenantProvisioner` (~300 lines)
- Middleware & Bootstrappers: `ResolveTenant`, database/cache/queue/filesystem/logging bootstrappers (~250 lines)
- Artisan Commands: `app:install`, `tenants:create`, `tenants:migrate` (~200 lines)

The ownership cost is directly protected by the 12 exit test groups below.

---

## Exit Criteria: The 12 Test Groups (Prompt 02 §1.8)

All 12 test suites must pass against PostgreSQL 17:
1. **Isolation, direct**: Role for tenant A cannot connect to tenant B's database or to `landlord`.
2. **Isolation, `PUBLIC` revoke**: A freshly created unrelated role cannot connect to a tenant database.
3. **Isolation, via PgBouncer**: Both isolation checks verified through PgBouncer.
4. **Pooling safety**: Alternating requests for two tenants repeatedly on persistent worker connections see only their own data with zero cross-tenant leakage.
5. **Strict resolver**: Unknown host → 404; suspended tenant → 403; host and `X-Tenant` mismatch → rejected; exempt routes work without tenant; non-exempt routes without tenant → 404; `GET /api/v1/meta` probes correctly.
6. **`onprem` profile verification**: Accepts only registered domains of the single tenant.
7. **Context teardown**: Assert `tenant` connection, cache prefix, and log context are fully reset after request execution.
8. **Queue fail-closed**: Queued job without tenant context fails closed; job with context runs against the correct tenant.
9. **Provisioning idempotency & cleanup**: Hostile slugs rejected; simulated mid-way provisioning failure cleanly drops database and role without orphans.
10. **`tenants:migrate` command**: Updates `schema_versions` and correctly handles and reports failing tenants.
11. **`app:install` command**: Clean install creates `tenant_carmel`, domain, and passes tests 1–3; executing twice fails safely.
12. **Architecture tests**: `DB::connection('landlord')` and `pgsql_admin` appear only in `app/Core/Tenancy` and `app/Modules/Platform`; no model implicitly uses default connection; no prohibited session SQL.
