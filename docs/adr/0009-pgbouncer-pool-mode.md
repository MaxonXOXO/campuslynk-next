# ADR-0009: PgBouncer Pool Mode for Multi-Tenant Architecture

**Status:** Decided · **Updated:** 2026-11-01 (Step 3 Tenancy Hardening)

## Context
- The Academic Suite multi-tenant architecture implements a database-per-tenant pattern in PostgreSQL 17 (`landlord` database plus `tenant_<slug>` for each college).
- In both deployment profiles (`onprem` and `cloud`), the Laravel 12 API, queue workers (Horizon), and background processes route queries through PgBouncer to prevent PostgreSQL connection exhaustion.
- PgBouncer offers three pooling modes:
  1. **Session pooling**: A physical server connection is dedicated to a client until the client disconnects.
  2. **Transaction pooling**: A server connection is assigned to a client only for the duration of a transaction (`BEGIN` to `COMMIT` / `ROLLBACK`, or single autocommit statement).
  3. **Statement pooling**: A server connection is assigned for only a single query statement. Multi-statement transactions are rejected.
- In later Sprint 0 steps, the API dynamically switches tenant database connections per HTTP request based on `ResolveTenant` middleware.

## Decision
1. **Adopt Transaction Pooling (`pool_mode = transaction`) as the primary PgBouncer pool mode.**
2. Configure PgBouncer with `max_prepared_statements` enabled (supported in modern PgBouncer 1.21+ / PostgreSQL 17).
3. **Prepared Statements & Emulation (Empirical Verification):**
   - We tested protocol-level native prepared statements (`PDO::ATTR_EMULATE_PREPARES => false`) against PgBouncer transaction pooling.
   - **Empirical finding:** PHP 8.4's `pdo_pgsql` driver generates named prepared statements (`pdo_stmt_0000000X`) and issues explicit `DEALLOCATE` commands when PDOStatement instances are garbage collected or recycled across transactions. Under PgBouncer transaction pooling, connections are released back to the pool at transaction boundaries, causing subsequent statements to route to backend connections that never prepared the named statement. This triggers PostgreSQL `ERROR: prepared statement "pdo_stmt_0000000X" does not exist`, which aborts the entire transaction block with `SQLSTATE[25P02]`.
   - **Resolution:** Set `PDO::ATTR_EMULATE_PREPARES => true` across `config/database.php` and `DatabaseBootstrapper`. A dedicated test (`TenancyHardeningTest`) proves that parameter bindings containing single quotes, double quotes, backslashes, null bytes, and multibyte UTF-8 (Malayalam characters and emojis) are safely bound without injection risk.
4. **Tenant database routing & dynamic authentication:**
   - Because PostgreSQL physical connections are strictly bound to a single database during the startup handshake, PgBouncer maintains separate connection pools per `(user, dbname)` pair.
   - Dynamic per-tenant routing without editing configuration files is achieved via PgBouncer's wildcard database fallback:
     ```ini
     [databases]
     * = host=postgres port=5432 auth_user=pgbouncer_auth auth_query="SELECT usename, passwd FROM user_search($1)"
     ```
   - When Laravel connects to `tenant_<slug>` as user `tenant_<slug>_u`, PgBouncer intercepts the request, routes to the upstream PostgreSQL server on port 5432, and verifies credentials via dedicated `pgbouncer_auth` executing the `SECURITY DEFINER` function `user_search(uname text)`.
   - **Provisioning Credential Isolation (A7 & Prompt 04b):** The privileged administrative connection (`pgsql_admin` directly to PostgreSQL port 5432 with `CREATEDB` and `CREATEROLE`) uses the `provisioner` role and is restricted exclusively to the `ops` service profile (`docker compose run --rm ops php artisan ...`). The public web-facing `api` container runtime environment contains only the least-privilege `landlord_app` role (`NOSUPERUSER, NOCREATEDB, NOCREATEROLE`) routed through PgBouncer on port 6432, with zero access to any tenant databases.
5. **Container image pinning**:
   - The PgBouncer container image is pinned by immutable SHA-256 multi-arch manifest digest across all Docker Compose topologies (`onprem`, `cloud`, and `compose.dev.yml`):
     `edoburu/pgbouncer:v1.26.0-p0@sha256:b17551c776ef7e5769ef80b956d20f85e2fd25dd8912d31d58f782aad495b711`
6. **Testing requirement**: In Sprint 0 Step 2 & 3, per-request tenant database switching and connection pooling safety are verified via:
   - Zero cross-tenant data leakage over 200+ rapid alternating HTTP keep-alive requests (`HttpLeakTest`).
   - Clean connection release after request completion via `try/finally` and Octane `RequestTerminated` listener.
   - Proper handling of transactional domain events and audit logging.

## Consequences
- ✅ **Connection scalability**: Dozens of Octane workers and queue workers can multiplex over a small set of PostgreSQL backend connections without exhausting memory or max_connections.
- ✅ **ACID compliance**: Full multi-statement transaction support (`DB::transaction(...)`) is preserved, unlike statement pooling.
- ✅ **Runtime safety**: Emulated prepares prevent transaction abortion due to cross-connection DEALLOCATE mismatches under transaction pooling.
- ⚠ **Session-state restrictions**: Session-level PostgreSQL features (such as `SET search_path`, temporary tables, advisory locks spanning across transactions, and `LISTEN`/`NOTIFY`) cannot be held across transactions. Reverb / WebSockets and asynchronous notifications use Redis pub/sub rather than PostgreSQL `LISTEN`/`NOTIFY`.

