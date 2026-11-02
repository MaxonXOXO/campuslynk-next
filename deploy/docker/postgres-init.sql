-- -----------------------------------------------------------------------------
-- PostgreSQL 17 Initialization Script for Academic Suite (Sprint 0, Step 3)
-- -----------------------------------------------------------------------------
-- The official postgres:17 container automatically creates the database
-- specified by POSTGRES_DB ('landlord') and superuser POSTGRES_USER ('academic_admin').
--
-- Principle of Least Privilege Role Architecture (Prompt 04b, ADR-0001, ADR-0010):
-- 1. POSTGRES_USER (Superuser): Used ONLY by this init script. Never given to API,
--    queue workers, PgBouncer, or Ops runtime.
-- 2. pgbouncer_auth: Dedicated PgBouncer auth_user. Only permitted to execute the
--    SECURITY DEFINER user_search() function to look up SCRAM-SHA-256 verifiers.
-- 3. provisioner: Dedicated Ops service role. Has CREATEDB, CREATEROLE, pg_signal_backend,
--    and DDL on landlord database schema. Used by `ops` container for provisioning and migrations.
-- 4. landlord_app: Public API & queue runtime role. NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
--    NOREPLICATION. Permitted DML (SELECT, INSERT, UPDATE, DELETE) only on landlord schema.
--    Explicitly prohibited from connecting to any tenant database.
-- -----------------------------------------------------------------------------

REVOKE CONNECT ON DATABASE landlord FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable assignment cast from integer to boolean so that PDO / PgBouncer
-- emulated prepares binding 0/1 can be assigned directly to boolean columns.
UPDATE pg_cast SET castcontext = 'a' WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;
\c template1
UPDATE pg_cast SET castcontext = 'a' WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;
\c landlord

-- 1. PgBouncer Auth Role & Function
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pgbouncer_auth') THEN
        CREATE ROLE pgbouncer_auth WITH LOGIN PASSWORD 'secret' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END $$;

GRANT CONNECT ON DATABASE landlord TO pgbouncer_auth;
GRANT USAGE ON SCHEMA public TO pgbouncer_auth;

CREATE OR REPLACE FUNCTION user_search(uname text)
RETURNS TABLE (usename name, passwd text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT usename, passwd FROM pg_shadow WHERE usename = uname;
$$;

REVOKE ALL ON FUNCTION user_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_search(text) TO pgbouncer_auth;

-- 2. Provisioner Role (Ops Service for AppInstall, Tenant Provisioning, Migrations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'provisioner') THEN
        CREATE ROLE provisioner WITH LOGIN PASSWORD 'secret' NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION;
    END IF;
END $$;

GRANT pg_signal_backend TO provisioner;
GRANT CONNECT ON DATABASE landlord TO provisioner;
GRANT ALL ON SCHEMA public TO provisioner;
GRANT ALL ON ALL TABLES IN SCHEMA public TO provisioner;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO provisioner;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO provisioner;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO provisioner;

-- 3. Landlord App Runtime Role (Public API Container, Queue Workers)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'landlord_app') THEN
        CREATE ROLE landlord_app WITH LOGIN PASSWORD 'secret' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END $$;

GRANT CONNECT ON DATABASE landlord TO landlord_app;
GRANT USAGE ON SCHEMA public TO landlord_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO landlord_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO landlord_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO landlord_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO landlord_app;
ALTER DEFAULT PRIVILEGES FOR ROLE provisioner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO landlord_app;
ALTER DEFAULT PRIVILEGES FOR ROLE provisioner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO landlord_app;
