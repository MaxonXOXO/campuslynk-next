# Rules for AI agents
- Read docs/glossary.md, relevant docs/adr/*, and the target module's README.md before coding.
- New feature = new Action + FormRequest + Policy check + Resource + Pest feature test.
- Never access another module's Models; use its Contracts or Events.
- Never query the landlord connection outside Core/Tenancy or Modules/Platform.
- Every new endpoint: add a cross-tenant test and an unauthorised-role test.
- Permissions are <module>.<resource>.<action>, declared in <Module>Module::permissions(); never hard-code role names in logic.
- Governance/write checks use managing_department; read checks may use home_department too (ADR-0005).
- Never hard-code subject IDs, course codes or regulation rules; use assessment_schemes and workflow_definitions.
- The frontend never calculates marks; the backend Action does.
- Long-running work returns 202 + /api/v1/jobs/{id}.
- After backend API changes: run `composer contract` then `pnpm gen:api`; commit both.
- Migrations must be backward compatible (expand → migrate → contract) and work on a fresh tenant DB.
- Do not edit app/Core without an ADR in docs/adr/.
- Definition of done: `composer check && pnpm check` passes.

## How to run checks

### Backend (`backend/`)
- Lint: `composer lint` (Pint --test)
- Static analysis: `composer analyse` (Larastan level 8)
- Unit & feature tests: `composer test` (Pest 3)
- Combined check: `composer check` (runs lint + analyse + test)

### Frontend (`frontend/`)
- Lint: `pnpm lint` (ESLint)
- Typecheck: `pnpm typecheck` (tsc strict)
- Unit tests: `pnpm test` (Vitest)
- Build: `pnpm build`
- Combined check: `pnpm check` (runs lint + typecheck + test)

### Docker Stack
- On-prem stack: `docker compose -f deploy/compose/onprem/docker-compose.yml up -d`
- Cloud stack: `docker compose -f deploy/compose/cloud/docker-compose.yml up -d`
- Local dev stack: `docker compose -f compose.dev.yml up -d`
- Health check verification: `curl http://localhost:8000/api/v1/health`
