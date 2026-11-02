# ADR-0012: Separation of Tenant Database Owner Role and Runtime DML Role

**Status:** Proposed  
**Date:** 2026-11-01  
**Deciders:** Core Architecture Team  
**Consulted:** ADR-0001, ADR-0009, ADR-0010  

---

## Context

Under our current multi-tenant architecture on PostgreSQL 17 (ADR-0001, ADR-0010):
1. During tenant provisioning (`TenantProvisioner`), a dedicated login role `tenant_<slug>_u` is created with least-privilege hygiene flags (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`).
2. The tenant database `tenant_<slug>` is created with `OWNER "tenant_<slug>_u"`.
3. The Laravel application (and persistent workers under Octane) connects through PgBouncer as `tenant_<slug>_u` to execute both runtime transactional DML queries (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) and tenant schema migrations (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`).

### Problem Statement: Security Risk of Role Ownership

Because `tenant_<slug>_u` is the database owner:
- In the event of an application-level SQL injection vulnerability or compromised connection string, an attacker executing commands through the runtime connection has database owner privileges.
- An owner can execute destructive DDL statements such as `DROP TABLE`, `TRUNCATE TABLE`, `DROP SCHEMA`, or alter permissions and grants.
- Although cross-tenant database isolation remains absolute (the role cannot connect to other tenant databases or the landlord database), within its own database boundary, the runtime role possesses excessive privilege over data structure and lifecycle.

---

## Proposed Options

### Option 1: Status Quo (Single Tenant Role as Owner & Runtime)
- **Mechanism**: The single role `tenant_<slug>_u` owns the database, runs migrations, and serves runtime API queries.
- **Pros**:
  - Simplicity: Only one PostgreSQL role per tenant.
  - Connection pooling: PgBouncer requires only one pool entry `(tenant_<slug>_u, tenant_<slug>)`.
  - Migration execution: `tenants:migrate` runs using the same runtime connection configuration without role elevation.
- **Cons**:
  - Destructive DDL attacks are possible if runtime DML is compromised.
  - Violates the principle of least privilege at the database layer.

### Option 2: Split Owner/Migration Role vs. Runtime DML Role
- **Mechanism**:
  1. **Owner Role (`tenant_<slug>_owner`)**:
     - `NOLOGIN` (or locked login credentials).
     - Owns database `tenant_<slug>` and all tables, sequences, and schemas.
     - DDL migrations execute either via `pgsql_admin` switching to owner (`SET ROLE "tenant_<slug>_owner"`), or via dedicated migration credentials through the privileged `ops` service.
  2. **Runtime Role (`tenant_<slug>_app`)**:
     - `WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`.
     - Granted only DML permissions:
       ```sql
       GRANT CONNECT ON DATABASE "tenant_<slug>" TO "tenant_<slug>_app";
       GRANT USAGE ON SCHEMA public TO "tenant_<slug>_app";
       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "tenant_<slug>_app";
       GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "tenant_<slug>_app";
       ALTER DEFAULT PRIVILEGES FOR ROLE "tenant_<slug>_owner" IN SCHEMA public
           GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "tenant_<slug>_app";
       ALTER DEFAULT PRIVILEGES FOR ROLE "tenant_<slug>_owner" IN SCHEMA public
           GRANT USAGE, SELECT ON SEQUENCES TO "tenant_<slug>_app";
       ```
     - Denied DDL (`CREATE`, `DROP`, `ALTER`, `TRUNCATE`).
- **Pros**:
  - Complete defense-in-depth: Runtime web requests physically cannot drop tables or alter schema even under severe SQL injection.
  - Aligns with defense-grade compliance standards (SOC2, ISO 27001).
- **Cons & Operational Cost**:
  - Two PostgreSQL roles per institution (2N roles across N tenants).
  - Schema migrations cannot run through normal runtime connections; they must be executed by an administrative migration worker or the `ops` service with owner privileges.
  - PostgreSQL `DEFAULT PRIVILEGES` must be meticulously maintained for any newly created schemas or tables.
  - More complex credential management in `tenant_databases` (storing both owner and app credentials or managing role assumption).

---

## Recommendation & Next Steps

We recommend keeping Option 2 **Proposed** for Sprint 0. The current single role is strictly hardened with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`, `REVOKE CONNECT ... FROM PUBLIC`, strict regex slug validation, identifier quoting, and transaction pooling isolation.

The split between owner and runtime roles should be scheduled for Sprint 1 / Production Hardening once tenant migrations are fully automated within the deployment pipeline.

---

## Appendix: Application Key (`APP_KEY`) Rotation & Credential Re-encryption (Proposed)

### Problem
The Laravel `APP_KEY` encrypts and decrypts every tenant's database password stored in `landlord.tenant_databases.password` via `Crypt::encryptString()` / `Crypt::decryptString()`. If the master `APP_KEY` must be rotated (e.g., following scheduled annual compliance rotation, staff offboarding, or credential compromise), all existing ciphertext records in `tenant_databases` would become unreadable, taking all tenants offline.

### Proposed Rotation Protocol (Zero-Downtime Expand-Migrate-Contract)
1. **Multi-Key Decryption Support (`previous_keys`):**
   - Configure Laravel's encrypter with support for a list of previous valid keys (`config('app.previous_keys')`).
   - The runtime encrypter attempts decryption using the primary `APP_KEY`; if MAC verification fails, it iterates through `previous_keys` to decrypt existing payloads.
2. **Re-encryption Maintenance Command (`tenants:reencrypt-credentials`):**
   - An operator invokes `php artisan tenants:reencrypt-credentials --old-key=<OLD_KEY> --new-key=<NEW_KEY>` via the `ops` profile service.
   - The command connects to the landlord database, loads all `tenant_databases` rows, decrypts each password using the old key, re-encrypts using the new key, and updates the record within a single transactional boundary.
3. **Key Decommissioning:**
   - Once all rows in `tenant_databases` and encrypted tenant settings are verified to decrypt under the new key, the old key is purged from `previous_keys` across all application container configurations.

---

## Appendix B: Cross-Container Secrets Initialization Architecture (Prompt 05, Decided)

### Context & Problem
In multi-container setups (`api`, `ops`, `postgres`, `pgbouncer`, `redis`), secrets cannot be generated inside one application container during `app:install`. PostgreSQL role passwords (`academic_admin`, `provisioner`, `landlord_app`, `pgbouncer_auth`) must exist at the exact moment the PostgreSQL engine initializes its data directory (`docker-entrypoint-initdb.d`), well before `ops` or `api` runs `app:install`. Furthermore, both `api` and `ops` must share the exact same `APP_KEY` from boot time so that credentials encrypted by `ops` can be decrypted by `api`.

### Solution: Pre-Boot Secrets Generation
1. **Dedicated Host Initializer Scripts:**
   - `deploy/compose/onprem/init-secrets.ps1` (PowerShell)
   - `deploy/compose/onprem/init-secrets.sh` (POSIX shell)
   Executed on the host machine on a clean checkout **before the first `docker compose up`**.
2. **Generated Environment Artifact (`.env`):**
   - Unique 32-byte AES-256 `APP_KEY`.
   - Distinct, cryptographically random 32-character passwords for every role: `POSTGRES_ADMIN_PASSWORD` (superuser), `PROVISIONER_PASSWORD` (`ops`), `LANDLORD_APP_PASSWORD` (`api`/workers), `PGBOUNCER_AUTH_PASSWORD` (PgBouncer lookup), and `REDIS_PASSWORD`.
   - Restrictive file permissions (`chmod 600` on POSIX, ACL restriction on Windows).
   - Refuses to overwrite an existing `.env` unless `--force` / `-Force` is provided.
3. **Dynamic Database Role Provisioning (`deploy/docker/postgres-init.sh`):**
   - Mounted into `/docker-entrypoint-initdb.d/01-init.sh`.
   - Reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, `PROVISIONER_PASSWORD`, `LANDLORD_APP_PASSWORD`, and `PGBOUNCER_AUTH_PASSWORD` from container environment variables.
   - Idempotently creates or alters roles with their respective environment-supplied secrets.
4. **Appliance Install Validation (`app:install`):**
   - Does **not** attempt to generate keys within ephemeral containers.
   - Verifies that a valid, non-placeholder, 32-byte `APP_KEY` exists in configuration and halts with actionable operator guidance if unconfigured.


