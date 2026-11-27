# ADR-0018: File Storage and Multi-Profile Adapters

- **Status:** Proposed
- **Date:** 2026-11-27
- **Deciders:** Max
- **Related:** ADR-0001 (PostgreSQL database-per-tenant), ADR-0008 (On-prem public reachability and TLS), ADR-0010 (Tenancy core implementation mechanism), ADR-0011 (Token lifetimes), ADR-0012 (Owner vs runtime role), ADR-0014 (Scope tree ltree labels)

## Context

CampusLynk-Next is a universal multi-tenant academic suite that must run from a single codebase across two primary deployment profiles, selected by configuration only:

1. **On-Premise (Single Server):** Fast NVMe for OS, PostgreSQL, Redis, and hot/small derived files, paired with a large secondary drive (HDD/array) for bulk originals.
2. **Cloud / VPS:** Containerized API (`FrankenPHP` / Laravel Octane) backed by block storage or S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces).

Today, `backend/config/filesystems.php` defines standard `local`, `public`, and `s3` disks, `FilesystemBootstrapper` mutates `filesystems.disks.local.root` per tenant, and neither `deploy/compose/onprem/docker-compose.yml` nor `deploy/compose/cloud/docker-compose.yml` mounts a persistent storage volume for `api`.

## Decision

### 1. Filesystem Abstraction & Deployment-Level Driver
- Application code depends **only** on Laravel's `Illuminate\Contracts\Filesystem\Filesystem` / `Storage::disk(...)` abstraction.
- Two adapters with identical application semantics: **local mounted volume** (`local`) and **S3-compatible** (`s3`).
- The driver is selected at **deployment level** via environment configuration. Per-tenant driver overrides are **out of scope for v1** (tracked as a follow-up).

### 2. Disks, Hot/Cold Split, and Config Surface
Three logical disks are configured in `config/filesystems.php`:

| Disk | Purpose | On-Premise Profile | Cloud / VPS Profile |
| --- | --- | --- | --- |
| `files_private` | Bulk originals & private uploads | Secondary bulk drive mount (`/var/lib/campuslynk/storage/private`) | S3-compatible bucket (private ACL) |
| `files_public` | Public institution assets (e.g. logo) | Secondary bulk drive mount (`/var/lib/campuslynk/storage/public`) with long cache headers | S3-compatible bucket/prefix with public-read or CDN |
| `files_hot` | Small regenerable derived files (avatar thumbnails, caches) & fast staging | Fast NVMe (`storage_path('app/hot')`) — losing it never loses user data | Local NVMe/ephemeral cache or S3 prefix |

Environment variables:
- `FILES_DRIVER` (`local` | `s3`)
- `FILES_PRIVATE_ROOT` / `FILES_PUBLIC_ROOT` / `FILES_HOT_ROOT` (for `local` profile)
- `FILES_S3_KEY`, `FILES_S3_SECRET`, `FILES_S3_REGION`, `FILES_S3_BUCKET`, `FILES_S3_ENDPOINT`, `FILES_S3_USE_PATH_STYLE_ENDPOINT` (for `s3` profile)
- `FILES_SERVE_MODE` (`x-accel` | `x-sendfile` | `presigned` | `proxy`)
- `FILES_PRESIGNED_TTL_SECONDS` (default `120`)

### 3. Key Naming & Tenant Metadata Table
- **Object/file keys:** `tenants/{tenant_id}/{category}/{ulid}` (e.g. `tenants/01J.../avatars/01J...`). Original filenames are **never** used in storage keys; they are stored only as metadata.
- **Database stores relative paths only** (never absolute filesystem paths or full S3 URLs).
- **Tenant `files` table** (in each tenant database, using `UsesTenantConnection` and ULID primary keys) is the **source of truth** for access control, quotas, and usage:
  - `id` (ULID), `owner_type`, `owner_id`, `category`, `disk`, `path`, `original_name`, `mime_type`, `size_bytes`, `checksum_sha256`, `visibility` (`private` | `public`), `created_by`, `deleted_at`, `created_at`, `updated_at`.
- Storage holds **bytes only**. Per-tenant usage and quota enforcement are computed from the `files` table (feeding the Control Panel storage card later). In v1, per-tenant quota is **unlimited by default** and configurable per deployment (`FILES_TENANT_QUOTA_BYTES`).

### 4. Access Control & Serving Strategy
- **Private by default.** Every private file download is authorized by the application using the same `ScopedResource` / permission rules as the rest of the API.
- **Public assets** (e.g. institution logo) are the only direct-served category.
- **Serving in On-Premise (`local`):**
  - Behind `nginx` (or Caddy), the API authorizes the request and returns an internal redirect header (`X-Accel-Redirect` for nginx, `X-Sendfile` for Apache/Caddy equivalent) pointing to the internal location mapped to `FILES_PRIVATE_ROOT`. PHP/Octane workers are not tied up streaming large files.
- **Serving in Cloud (`s3`):**
  - **Chosen:** Short-lived **presigned URLs** (`TTL = 120s`, configurable via `FILES_PRESIGNED_TTL_SECONDS`) issued after API authorization.
  - **Alternative considered:** *App-proxied streaming* (`StreamedResponse` through Octane). Rejected as default because it doubles bandwidth egress through the app tier and occupies Octane workers; retained only as a fallback (`FILES_SERVE_MODE=proxy`) for air-gapped or strict-CORS environments.

### 5. Upload Validation & Staging
- Validate MIME type **by file content** (magic bytes / `finfo`), not client-supplied `Content-Type` or extension.
- Enforce per-category file size caps from day one (`avatar`: 5 MB, `logo`: 2 MB, `import`: 25 MB, `document`: 50 MB) and **reject all executable uploads** (`.php`, `.sh`, `.exe`, `.bat`, `.js`, SVG with scripts, etc.).
- Rename on save to `{ulid}` (with safe extension if needed for content-type).
- Stage uploads on fast local temp (`files_hot` / `sys_get_temp_dir()`), compute `sha256` and size, then move/stream to target disk.
- Virus scanning (e.g. ClamAV) is deferred to a documented later step via a scanner hook before promotion from staging.

### 6. Orphan Cleanup, Deletion, and Retention
- **Soft delete first:** Deleting a file sets `deleted_at` on the `files` row immediately (revoking access).
- **Purge job:** A scheduled tenant-aware job permanently deletes blobs and hard-deletes rows after a configurable grace period (e.g. 30 days), and cleans up abandoned staging files older than 24 hours.
- **Tenant deletion:** When a tenant is deprovisioned, a landlord cleanup job deletes the `tenants/{tenant_id}/` prefix on all configured disks.

### 7. Health, Failure Behaviour, and Backups
- **Readiness check:** `/up` or `/api/v1/health/storage` verifies `files_hot` and `files_private` are writable/reachable.
- **Bulk disk full or unreachable:** Uploads fail cleanly with `503 Service Unavailable` (RFC 7807 Problem Details); the rest of the application (auth, dashboards, database reads/writes) continues operating normally.
- **Backup contract:** Database and file storage must be restorable to a consistent point-in-time.
  - *On-Premise:* Snapshot/rsync of `files_private` + `files_public` paired with `pg_dump` / WAL archive. **RAID is not a backup.**
  - *Cloud:* S3 versioning + cross-region/lifecycle backup paired with RDS automated snapshots/PITR.

### 8. Profile Migration (`storage:migrate`)
- A `php artisan storage:migrate {--from=} {--to=}` command is **in scope as a follow-up** (Stage C) to copy blobs by `files` table cursor and verify `checksum_sha256` before switching `FILES_DRIVER`.

### 9. Test Strategy & Octane Safety
- **CI:** Runs unit/feature tests against the `local` adapter on a temporary directory (`Storage::fake(...)` or `sys_get_temp_dir()`).
- **S3 CI job:** Run against a **MinIO** service container only on `main` and on PRs that touch storage paths (via path filters). If configured as a required status check, ensure skipped runs still report as passing so non-storage PRs are not blocked.
- **Octane safety:** Do **not** mutate `config('filesystems.disks...')` per request if avoidable; prefer explicit `tenants/{tenant_id}/...` key prefixes on shared disks, and ensure `FilesystemBootstrapper::revert()` restores any legacy `local` root override so `octane-worker-leak-test` remains clean.

## Implementation Slice Plan

1. **Slice 1 — Core File Service PR:**
   - `files` migration + `FileRecord` model (`UsesTenantConnection`, `HasUlids`).
   - `config/filesystems.php` disks (`files_private`, `files_public`, `files_hot`) + `FileStorageService` (upload staging, MIME-by-content validation, quota calculation, `X-Accel-Redirect` / presigned URL response builder).
   - Purge job + storage health check + Pest tests (including Octane leak & quota tests).
2. **Slice 2 — Profile & Settings Avatars PR:**
   - Avatar upload/delete endpoints using `FileStorageService` (`files_private` for original, `files_hot` for thumbnail).
   - Frontend avatar uploader in Profile & Settings.

