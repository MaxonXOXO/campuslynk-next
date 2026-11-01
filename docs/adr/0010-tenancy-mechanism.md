# ADR-0010: Tenancy Core Implementation Mechanism

**Status:** Proposed  
**Date:** 2026-11-01  
**Deciders:** Core Engineering Team  
**Consulted:** `foundation_spec.md` (§1, §3.1, §4), `architecture_blueprint.md` (v3), ADR-0001, ADR-0002, ADR-0009  

---

## Context and Problem Statement

Academic Suite (CampusLynk / Carmel LINX) requires a robust multi-tenant foundation on PostgreSQL 17 that operates identically across two deployment profiles:
1. **On-Premise Appliance (`DEPLOY_PROFILE=onprem`)**: Fixed single-tenant deployment for a polytechnic college running on an on-premise hardware appliance with locked domain routing and no tenant switching.
2. **Cloud SaaS (`DEPLOY_PROFILE=cloud`)**: Dynamic multi-tenant deployment hosting multiple independent institutions, with request routing via subdomains (`{slug}.academic.kerala.gov.in`) or administrative header (`X-Tenant`), backed by PgBouncer transaction pooling (ADR-0009).

Per **ADR-0001**, our architectural baseline is **database-per-tenant isolation** (`landlord` database for institution registry, plus an isolated `tenant_<slug>` database per college). Furthermore, defense-in-depth requires:
- `REVOKE CONNECT ON DATABASE tenant_<slug> FROM PUBLIC;`
- Restricted dedicated PostgreSQL login user `tenant_<slug>_u` per tenant database.
- A privileged landlord provisioning connection (`pgsql_admin` directly to PostgreSQL port 5432) separated from runtime unprivileged pooled connections routed through PgBouncer (port 6432).
- Zero memory leakage and safe state reset between requests when running under **FrankenPHP / Laravel Octane worker mode**.

We must decide whether to adopt the third-party package `stancl/tenancy` or implement a lightweight, purpose-built tenancy core in `app/Core/Tenancy`.

---

## 2026 Registry Verification (`stancl/tenancy`)

A query against Packagist (`composer show stancl/tenancy --all`) conducted on 2026-11-01 confirmed:
- **v4 release status**: `stancl/tenancy` v4 is **not** released as a stable release on Packagist. The highest stable release remains `v3.10.1` (alongside `dev-master` and `3.x-dev`).
- **Laravel 12 compatibility**: `stancl/tenancy` v3 is architected around older Laravel lifecycles; running pre-release branches (`dev-master`) in production introduces severe supply-chain stability risks.
- **Database manager limitations**: `stancl/tenancy`'s built-in `PostgreSQLDatabaseManager` only executes basic `CREATE DATABASE` / `CREATE SCHEMA` statements. It does not natively support restricted per-tenant login roles, database permission revoking (`REVOKE CONNECT`), or dual connection routing (direct PostgreSQL for provisioning vs. PgBouncer for runtime transactions).

---

## Comparison of Options

| Evaluation Criterion | Option A: `stancl/tenancy` (v3 / dev-master) | Option B: Thin Custom Tenancy Core (`app/Core/Tenancy`) |
|---|---|---|
| **Package Dependency & Supply Chain** | Heavy third-party dependency; v4 not tagged stable on Packagist; risk of abandoned or lagging updates for future Laravel versions. | **Zero external dependencies**. Native to Laravel 12 on PHP 8.4; 100% under our direct control. |
| **PostgreSQL Role & Security Model (ADR-0001)** | Missing. Requires subclassing and overriding package database managers to inject `REVOKE CONNECT`, `CREATE USER`, and password rotation. | **Built-in by design**. `TenantProvisioner` executes parameterized DDL: `CREATE DATABASE`, `CREATE USER tenant_<slug>_u`, `REVOKE CONNECT ... FROM PUBLIC`, and `GRANT CONNECT`. |
| **Dual Connection Topology (ADR-0009)** | Confuses runtime vs administrative connections unless extensive custom driver hooks are patched into the package. | **Strictly separated**. Dedicated named connection `pgsql_admin` (direct port 5432) used exclusively for tenant DDL; runtime `tenant` connection routed through PgBouncer (port 6432). |
| **FrankenPHP / Octane Worker Mode Safety** | Risky. `stancl/tenancy` relies on heavy global singletons, service provider re-registrations, and event listeners that can leak tenant context across requests in persistent workers. | **Deterministic lifecycle**. Middleware `ResolveTenant` explicitly manages `TenantContext::setTenant(...)` and registers an Octane/FrankenPHP teardown hook executing `TenantContext::forget()` + `DB::purge('tenant')`. |
| **Dual Deployment Profiles (`onprem` vs `cloud`)** | Awkward. Requires disabling or faking multi-tenant resolution for on-premise single-tenant installations. | **First-class support**. Respects `config('app_profile.deploy_profile')`. When `onprem`, binds directly to the single local tenant without subdomain checks; when `cloud`, enforces strict host/header agreement. |
| **Maintenance Burden** | High cognitive overhead learning package-specific abstractions, debugging internal package events, and maintaining workarounds. | **Low & transparent**. Approximately 350–400 lines of clean, strictly typed PHP (level 8 Larastan compliant), readable by any senior Laravel engineer in 15 minutes. |
| **Artisan & Queue Integration** | Package-specific commands (`tenants:run`, etc.). | Native Laravel integration: standard commands with `--tenant=` option (`tenants:migrate`, `tenants:seed`), and standard queue job payloads carrying tenant context. |

---

## Decision

We will **adopt Option B: A thin, custom tenancy core in `app/Core/Tenancy`**.

The implementation consists of:
1. **Landlord Database Schema (`database/migrations/landlord/`)**:
   - `tenants` table (`id` UUID, `slug` unique string, `name`, `domain` nullable unique string, `status` enum `active`/`suspended`, timestamps).
2. **Tenant Context & Connection Management (`app/Core/Tenancy/`)**:
   - `TenantContext` service container singleton holding current `Tenant` entity.
   - Dynamic `tenant` connection configuration: `config(['database.connections.tenant.database' => ...])` followed by `DB::purge('tenant')` and `DB::reconnect('tenant')`.
   - `ResolveTenant` HTTP middleware:
     - In `onprem` mode: resolves the single preconfigured institution tenant.
     - In `cloud` mode: parses request host subdomain or `X-Tenant` header, verifies tenant is `active`, and returns RFC 7807 problem details (HTTP 404/403) on invalid or mismatched identification.
   - Cleanup hook: guarantees `DB::purge('tenant')` and `TenantContext::forget()` execute in `terminate()` middleware and FrankenPHP request lifecycle events.
3. **Provisioning Engine (`app/Core/Tenancy/Services/TenantProvisioner.php`)**:
   - Uses `pgsql_admin` connection.
   - Runs `CREATE DATABASE tenant_<slug>`, creates dedicated login user `tenant_<slug>_u`, revokes public connect, and grants connect to the tenant user.
   - Runs tenant migrations (`database/migrations/tenant/`).
4. **Artisan Tooling**:
   - `php artisan tenants:migrate [--tenant=slug]`
   - `php artisan tenants:seed [--tenant=slug]`

---

## Consequences

### Positive
- **Zero Package Lock-in**: No risk of upstream stalls, breaking changes in minor updates, or incompatibility with future Laravel / PHP releases.
- **Strict Compliance with ADR-0001 & ADR-0009**: Native execution of PostgreSQL security best practices and PgBouncer transaction pooling without hacks.
- **Octane & FrankenPHP Native**: Bulletproof request boundary isolation with no risk of cross-tenant data leakage in long-running worker processes.
- **Full Testability**: Easily mockable and testable with Pest feature tests covering cross-tenant isolation, unauthorized tenancy access, and teardown cleanliness.

### Negative / Trade-offs
- The team owns the tenancy routing and CLI command maintenance (approximately ~400 lines of thoroughly tested core code).
- Tenant-aware queue workers require an explicit `TenantAwareJob` trait or middleware to set tenant context during job processing (planned for Sprint 0 Step 3).

---

## Verification Requirements (Part 1.2 – 1.8)

Prior to marking Step 2 complete, the custom tenancy core must pass all 12 test suites:
1. Landlord migration creates `tenants` table.
2. `TenantProvisioner` creates isolated PostgreSQL database with restricted role.
3. `ResolveTenant` middleware resolves tenant from subdomain.
4. `ResolveTenant` middleware resolves tenant from `X-Tenant` header.
5. `ResolveTenant` middleware rejects inactive/suspended tenant (HTTP 403).
6. `ResolveTenant` middleware returns 404 for unknown tenant slug.
7. Cross-tenant isolation test: queries executed in Tenant A context cannot see Tenant B data.
8. Connection purge test: switching tenants executes `DB::purge('tenant')` and closes stale handles.
9. FrankenPHP worker mode teardown test: `TenantContext::forget()` leaves zero residue in memory.
10. `tenants:migrate` runs tenant migrations against all active tenants.
11. `tenants:migrate --tenant=slug` targets only the specified tenant.
12. Dual deployment profile verification: `onprem` locks to single local tenant; `cloud` enforces dynamic resolution.
