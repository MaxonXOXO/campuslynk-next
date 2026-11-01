# Academic Suite (CampusLynk / Carmel LINX)

> **Sprint 0 — Step 1 Skeleton**: Multi-tenant Academic Management System for Kerala Polytechnic Colleges (Pilot: Carmel Polytechnic College).
> Dual deployment profiles: **On-Premise** appliance (`onprem`) and **Cloud SaaS** (`cloud`) from a single codebase.

---

## 1. Pinned Component Versions

All dependencies are verified and pinned:

| Component | Pinned Version | Status / Notes |
|---|---|---|
| **PHP** | `8.4.27` | CLI + FrankenPHP runner |
| **Laravel** | `12.70.2` | Headless API only |
| **Pest** | `3.8.7` | `pest-plugin-laravel: 3.2.0` |
| **Larastan** | `3.13.2` | Level 8 strict static analysis |
| **Laravel Pint** | `1.32.1` | Laravel code style preset |
| **PostgreSQL** | `17-alpine` | Official image; database-per-tenant architecture |
| **PgBouncer** | `v1.23.0` | `edoburu/pgbouncer`, transaction pooling mode (ADR-0009) |
| **Redis** | `7-alpine` | Cache, queues & session storage |
| **Node.js** | `22.18.0 LTS` | Runtime environment |
| **pnpm** | `9.15.9` | Monorepo package manager |
| **Turborepo** | `2.11.10` | High-performance monorepo build orchestrator |
| **Next.js** | `15.2.1` | App Router standalone output |
| **React / React DOM** | `19.0.0` | Server Components first |
| **Tailwind CSS** | `4.0.9` | v4 `@import "tailwindcss";` pipeline |
| **TypeScript** | `5.8.2` | Strict mode across all packages |
| **Vitest** | `3.0.7` | Unit testing in `packages/core` |
| **ESLint** | `9.21.0` | Flat config across workspace packages |

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
```bash
# Start all services (api, web, postgres, pgbouncer, redis)
docker compose -f deploy/compose/onprem/docker-compose.yml up -d --build

# View container status
docker compose -f deploy/compose/onprem/docker-compose.yml ps

# Tear down stack
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
