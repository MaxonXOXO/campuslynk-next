-- -----------------------------------------------------------------------------
-- PostgreSQL 17 Initialization Script for Academic Suite (Sprint 0)
-- -----------------------------------------------------------------------------
-- The official postgres:17 container automatically creates the database
-- specified by POSTGRES_DB ('landlord') and user POSTGRES_USER ('academic_suite').
--
-- Defense-in-depth: Revoke CONNECT from PUBLIC on landlord database
-- to enforce explicit grant controls (ADR-0001).
-- -----------------------------------------------------------------------------

REVOKE CONNECT ON DATABASE landlord FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
