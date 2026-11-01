# ADR-0009: PgBouncer Pool Mode for Multi-Tenant Architecture

**Status:** Proposed

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
2. Configure PgBouncer with `max_prepared_statements` enabled (supported in modern PgBouncer 1.21+ / PostgreSQL 17) to allow named prepared statements under transaction pooling.
3. In Laravel / PDO database configuration:
   - Disable persistent connections (`'persistent' => false`).
   - If using transaction pooling with drivers expecting session-level prepared statement persistence, configure PDO with `PDO::ATTR_EMULATE_PREPARES => true` or use PgBouncer's protocol-level prepared statement support.
4. Tenant database routing:
   - Because PostgreSQL physical connections are strictly bound to a single database during the startup handshake, PgBouncer maintains separate connection pools per `(user, dbname)` pair.
   - When Laravel connects to `tenant_<slug>`, it passes the target `dbname` in the connection string to PgBouncer. PgBouncer maps this to the corresponding PostgreSQL database pool.
5. **Testing requirement**: In Sprint 0 Step 2, per-request tenant database switching must be explicitly tested under PgBouncer transaction pooling to verify:
   - Clean connection release after request completion.
   - No cross-tenant connection or transaction leakage.
   - Proper handling of transactional domain events and audit logging.

## Consequences
- ✅ **Connection scalability**: Dozens of Octane workers and queue workers can multiplex over a small set of PostgreSQL backend connections without exhausting memory or max_connections.
- ✅ **ACID compliance**: Full multi-statement transaction support (`DB::transaction(...)`) is preserved, unlike statement pooling.
- ⚠ **Session-state restrictions**: Session-level PostgreSQL features (such as `SET search_path`, temporary tables, advisory locks spanning across transactions, and `LISTEN`/`NOTIFY`) cannot be held across transactions. Reverb / WebSockets and asynchronous notifications use Redis pub/sub rather than PostgreSQL `LISTEN`/`NOTIFY`.
- ⚠ Verification required in Step 2: Ensure tenant database connection cycling does not retain stale session variables.
