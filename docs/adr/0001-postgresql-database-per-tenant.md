# ADR-0001: PostgreSQL with one database per college

**Status:** Decided · **Supersedes:** the MySQL assumptions in the first versions of `docs/architecture_blueprint.md` and `docs/foundation_spec.md` (both rewritten for v3)

## Context
- The platform must run as cloud SaaS (AWS) and as an on-prem install on a college's own server, from one codebase, **both from day one**.
- Colleges need strong isolation, per-college backup/restore, and the ability to move between profiles.
- The role/regulation design relies on PostgreSQL features: JSONB, `ltree`, exclusion constraints (no double-booked staff or rooms), restored foreign keys.

## Decision
1. **Landlord database** (PostgreSQL) holds tenants, domains, plans/licences, per-tenant DB host and encrypted credentials, schema versions, platform users. Present in both profiles.
2. **One PostgreSQL database per college**, identical schema, with its **own DB role** that can connect only to that database.
3. Provisioning creates the database and role, **revokes `CONNECT` on the database from `PUBLIC`** (Postgres grants it by default), runs tenant migrations, seeds roles/permissions/regulations, and records `schema_version`.
4. Sanctum tokens live in the tenant database. A token from tenant A can never authenticate on tenant B.
5. Pool connections with **PgBouncer**; verify tenant switching under the chosen pool mode.
6. Pin PostgreSQL 17 for both profiles (18 only after testing, and the same major everywhere).
7. Commands: `app:install`, `tenants:create`, `tenants:migrate`, `tenants:backup`, `tenants:export`, `tenants:import`, `tenants:move`.
8. On-prem = landlord with exactly one tenant. No fork.

## Consequences
- ✅ Isolation enforced by the database server, not only by code.
- ✅ Per-college backup, restore, deletion, export; on-prem ↔ cloud moves are a normal operation.
- ⚠ Connection count scales with tenants × workers → PgBouncer is mandatory.
- ⚠ Migrations run N times; they must be backward compatible (expand → migrate → contract). CI must prove a fresh tenant DB equals a migrated one.
- ⚠ **To verify in Sprint 0:** whether stancl/tenancy v4 gives a permission-controlled PostgreSQL manager; if not, write a small custom manager for role creation and `REVOKE`.

## Threat Model and Limits of Tenant Isolation

It is vital to be transparent about what database-per-tenant with dedicated roles does and does not protect:

### Scope of Protection
The separation of tenant databases and per-tenant PostgreSQL roles (`tenant_<slug>` with `REVOKE CONNECT ON DATABASE ... FROM PUBLIC`) provides robust isolation against:
1. **Application Bugs & Logic Flaws:** An application query failing to append a tenant filter cannot accidentally read or mutate data belonging to another college because the active database connection has no visibility into other databases.
2. **Connection Pollution in Persistent Workers (FrankenPHP/Octane):** Long-running worker processes resetting state between requests are prevented from cross-tenant pollution even if memory or ORM state leaks, because the underlying database connection handle connects only to the authenticated tenant's database.
3. **SQL Injection in Tenant Context:** A SQL injection vulnerability within tenant-scoped business logic or dynamic reporting queries cannot cross database boundaries or access landlord tables, as the tenant role lacks privileges or connection rights to other databases.

### Fundamental Limits (API Process Trust Boundary)
The public API container process holds:
- **`landlord_app` credentials:** Enabling it to query the landlord database (`tenants`, `tenant_databases`, `domains`).
- **`APP_KEY`:** Enabling it to decrypt encrypted tenant database credentials via `Crypt::decryptString()`.

Therefore, per-tenant database roles **do not protect against full API Remote Code Execution (RCE)** or arbitrary process memory inspection. An attacker achieving arbitrary code execution within the API container could read `APP_KEY`, decrypt all tenant database credentials, and connect to any tenant database.

### Architectural Mitigations
- **No Database Superuser or Admin Credentials in API/Worker Containers:** The superuser (`postgres`) and administrative role (`provisioner` with `CREATEDB`/`CREATEROLE`) are exclusively isolated to the `ops` container and offline provisioning scripts. The API container receives only runtime roles (`landlord_app` and per-tenant roles via PgBouncer).
- **Least-Privilege Database Roles:** `landlord_app` has `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and is explicitly denied connection to any tenant database. Tenant roles are denied access to the landlord database.
- **Worker Memory Isolation & Sanitization:** Octane worker-loop hooks explicitly disconnect tenant connections and purge container bindings on request termination.
- **Secrets Management:** `APP_KEY` and database passwords are never committed to version control, checked against known placeholders at boot time in production, and can be rotated per the key rotation strategy documented in ADR-0012.

### Accepted Residual Risk
If the API application container itself is fully compromised via an unpatched RCE vulnerability, tenant data isolation collapses to the boundary of the `APP_KEY` and host filesystem security. This is an accepted industry-standard trade-off for multi-tenant SaaS running on a unified application layer. For deployments requiring absolute hardware or process-level isolation, an on-premises deployment profile (`DEPLOY_PROFILE=onprem`) on dedicated infrastructure is mandated.

## Sprint 0 exit tests
- Tenant role cannot connect to another tenant's database.
- Unknown host returns 404; suspended tenant returns 403.
- Export a tenant from `onprem`, import into `cloud` (and back); row counts and checksums match.
- Fresh on-prem install in under 30 minutes.

## Operations
- On-prem is installed and updated by our team (college IT cell notified, or we install). A remote backdoor is not required; cloud updates ship via Docker.
- Assumed on-prem hardware is a high-end consumer PC: add UPS, scheduled encrypted offsite backups and a tested restore drill.
- A college may move between profiles later (`tenants:export` / `tenants:import`).
- Public reachability for parents is decided in ADR-0008.
