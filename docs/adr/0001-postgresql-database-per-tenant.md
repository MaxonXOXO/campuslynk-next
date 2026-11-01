# ADR-0001: PostgreSQL with one database per college

**Status:** Decided · **Supersedes:** the MySQL assumptions in the first versions of `architecture_blueprint.md` and `foundation_spec.md` (both rewritten for v3)

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
