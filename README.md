# Academic Suite (CampusLynk / Carmel LINX)

> **Sprint 0 — Step 1 Skeleton**: Multi-tenant Academic Management System for Kerala Polytechnic Colleges (Pilot: Carmel Polytechnic College).
> Dual deployment profiles: **On-Premise** appliance (`onprem`) and **Cloud SaaS** (`cloud`) from a single codebase.

---

## 1. Pinned Component Versions

All dependencies are verified against official registries (`npm view`, `composer show`, Docker Hub) as stable releases at least two weeks old with zero known high/critical security advisories:

| Component | Pinned Version | Verification / Notes |
|---|---|---|
| **PHP** | `8.4.27` | CLI + `dunglas/frankenphp:1-php8.4-bookworm` runner |
| **Laravel** | `12.70.2` | Headless API only (`composer show laravel/framework`) |
| **Pest** | `3.8.7` | `pest-plugin-laravel: 3.2.0` (`composer show pestphp/pest`) |
| **Larastan** | `3.13.2` | Level 8 strict static analysis (`composer show larastan/larastan`) |
| **Laravel Pint** | `1.32.1` | Laravel code style preset (`composer show laravel/pint`) |
| **PostgreSQL** | `17-alpine` | Official image; database-per-tenant architecture (ADR-0001) |
| **PgBouncer** | `v1.26.0-p0` | Pinned by digest `edoburu/pgbouncer:v1.26.0-p0@sha256:b17551c776ef7e5769ef80b956d20f85e2fd25dd8912d31d58f782aad495b711` (ADR-0009) |
| **Redis** | `7-alpine` | Cache, queues & session storage |
| **Node.js** | `22.18.0 LTS` | Runtime environment (`node:22-alpine` in Docker) |
| **pnpm** | `9.15.9` | Monorepo package manager (`packageManager` field) |
| **Turborepo** | `2.11.9` | Monorepo build orchestrator (`npm view turbo`) |
| **Next.js** | `16.4.2` | Patched 16.x stable release (resolves CVE-2025-29927 & PostCSS advisories); standalone output |
| **React / React DOM** | `19.3.1` | Server Components first (`@types/react: 19.3.0`) |
| **Tailwind CSS** | `4.3.3` | v4 `@import "tailwindcss";` + `@tailwindcss/postcss: 4.3.3` |
| **PostCSS** | `8.5.30` | CSS pipeline processor |
| **TypeScript** | `5.9.3` | Unified strict mode version across all workspace packages |
| **Vitest** | `4.1.12` | Unit testing in `packages/core` (resolves tinypool / @vitest/mocker advisories) |
| **ESLint** | `9.39.5` | Flat config across workspace packages + `typescript-eslint: 8.71.2` |

### Note on `frontend/.npmrc` (`node-linker=hoisted`)
For Windows host compatibility (avoiding `EPERM` symlink privilege errors and MAX_PATH limits when running Next.js and Turborepo on Windows without Developer Mode / elevated administrator privileges), `frontend/.npmrc` configures `node-linker=hoisted`.
- **Trade-off**: Unlike pnpm's default isolated symlinked `node_modules` layout, `node-linker=hoisted` flattens dependencies into the workspace root `node_modules` (similar to npm/Yarn classic). This means a workspace package could accidentally import a transitive ("phantom") dependency not explicitly listed in its own `package.json`.
- **Mitigation**: Keep each package's `package.json` explicit and minimal, enforce TypeScript module resolution checks (`pnpm typecheck`), and verify that the Linux container build (`deploy/docker/Dockerfile.web`) installs and builds cleanly with `--frozen-lockfile`.

---

## 2. Prerequisites

To run and verify the stack locally:
- **Docker Desktop** (or Docker Engine on Linux) with Compose V2
- **Node.js 22 LTS** (`>=22.0.0`)
- **pnpm 9** (`pnpm@9.15.9` installed via `corepack enable` or `npm install -g pnpm@9.15.9`)
- **PHP 8.4** with extensions (`pdo_pgsql`, `pgsql`, `redis`, `bcmath`, `intl`, `zip`)
- **Composer 2** (`>=2.8.0`)

---

## 3. Quick Start (Docker Stack)

### On-Premise Profile (`onprem`)

#### 1. Generate Environment Secrets (First install)
Before the first `docker compose up`, generate a dedicated `.env` with unique `APP_KEY` and random passwords for every PostgreSQL role:
```powershell
# Windows (PowerShell)
.\deploy\compose\onprem\init-secrets.ps1

# Linux / macOS (POSIX Shell)
sh deploy/compose/onprem/init-secrets.sh
```

#### 2. Start Services
```bash
# Start all services (api, web, postgres, pgbouncer, redis)
docker compose -f deploy/compose/onprem/docker-compose.yml up -d --build

# View container status
docker compose -f deploy/compose/onprem/docker-compose.yml ps
```

#### 3. Run Landlord Migrations & Appliance Install (via Ops Service)
```bash
# Run landlord migrations
docker compose -f deploy/compose/onprem/docker-compose.yml run --rm ops php artisan landlord:migrate

# Install appliance & bootstrap first Super Admin
docker compose -f deploy/compose/onprem/docker-compose.yml run --rm ops php artisan app:install \
  --slug=carmel \
  --name="Carmel Polytechnic College" \
  --domain=app.carmelpoly.in \
  --admin-name="Carmel Administrator" \
  --admin-email="admin@app.carmelpoly.in"
```

#### 4. Tear down stack
```bash
docker compose -f deploy/compose/onprem/docker-compose.yml down -v
```

### Cloud SaaS Profile (`cloud`)
```bash
docker compose -f deploy/compose/cloud/docker-compose.yml up -d --build
```

### Local Development Stack (with hot-reload and volume bind mounts)
```bash
docker compose -f compose.dev.yml up -d
```

---

## 4. Service URLs & Endpoints

| Service | URL | Description |
|---|---|---|
| **Web Frontend** | [http://localhost:3000](http://localhost:3000) | Next.js Server Component displaying API health |
| **API Health** | [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health) | Standard JSON envelope `{ data, meta, links }` |
| **API Up Route** | [http://localhost:8000/up](http://localhost:8000/up) | Laravel default healthcheck |
| **PgBouncer** | `localhost:6432` | PostgreSQL connection pooler (`pool_mode = transaction`) |
| **PostgreSQL 17** | `localhost:5432` | Direct PostgreSQL port (database: `landlord`) |
| **Redis 7** | `localhost:6379` | Key-value store |

---

## 5. Quality Gates & Local Checks

### Backend Quality Suite
Run from the `backend/` directory:
```bash
cd backend

# 1. Code style check
composer lint

# 2. Level 8 static analysis
composer analyse

# 3. Pest tests (Feature & Architecture)
composer test

# 4. Combined check (all three)
composer check
```

### Frontend Quality Suite
Run from the `frontend/` directory:
```bash
cd frontend

# 1. ESLint
pnpm lint

# 2. TypeScript strict type checking
pnpm typecheck

# 3. Vitest unit tests
pnpm test

# 4. Production Next.js build
pnpm build

# 5. Combined check (lint + typecheck + test)
pnpm check
```

---

## 6. Architecture & Documentation Index

- `AGENTS.md` — Mandatory rules for AI coding agents.
- `docs/foundation_spec.md` — Core foundation specification (Sprint 0-9).
- `docs/architecture_blueprint.md` — Target system architecture (v3).
- `docs/role_and_permission_spec.md` — Scoped RBAC, designations, and governance model.
- `docs/glossary.md` — Authoritative domain terminology.
- `docs/adr/` — Architecture Decision Records (0001 through 0009).
  - `0001`: PostgreSQL database-per-tenant.
  - `0002`: API versioning, envelopes & compatibility.
  - `0009`: PgBouncer transaction pooling mode.

