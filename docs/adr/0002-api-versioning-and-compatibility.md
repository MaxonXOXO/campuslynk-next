# ADR-0002: API versioning, compatibility and long-running work

**Status:** Decided

## Context
We install and update on-prem servers on our own schedule. A college server can therefore run an older API than the cloud while the **same mobile app** talks to both. The web app ships with its own API and is not affected.

## Decision
1. All routes under `/api/v1`. OpenAPI generated (Scramble), committed to `contracts/openapi.yaml`, diffed in CI; typed client generated from it.
2. `GET /api/v1/meta` (unauthenticated, tenant-resolved) returns `{ server_version, api_version, min_client_version, capabilities[], deprecations[] }`. Clients check it on start and adapt or prompt for update.
3. **Compatibility window: clients support the current and previous server minor version (N-1).** Breaking changes need a new major (`/api/v2`) or an expand → migrate → contract sequence with a deprecation period.
4. Deprecations are announced with `Deprecation` / `Sunset` headers and listed in `/meta`.
5. **Long-running work** (imports, ETL, PDFs, QP generation, bulk student upload) returns `202 Accepted` with `Location: /api/v1/jobs/{id}`; clients poll or subscribe via Reverb. One shared `jobs` resource, no per-module variants.
6. **JSON-column shapes** (scheme component trees, rubric schemas, attendance rule JSON) have JSON Schemas, validated on write, with TypeScript types generated from them.
7. Per-record permission flags (`can_edit`, `can_lock`) are returned in resource `meta`; clients never re-derive scope logic. `/me` capabilities drive navigation only.
8. POST endpoints that may be retried accept `Idempotency-Key`. Offline attendance sync is idempotent on the client UUID.
9. Rate limits and token scopes are per tenant from the start.

## Consequences
- Mobile releases can lag server releases safely.
- Extra CI work: contract diff, JSON Schema validation, compatibility tests against N-1.
