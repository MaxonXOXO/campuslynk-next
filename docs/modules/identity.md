# Identity Module Documentation

## 1. Overview
The **Identity** module (`App\Modules\Identity`) is the foundational security and authorization engine of the Academic Suite. It manages:
- **Multi-Tenant User Lifecycle:** Staff, student, and parent user accounts scoped per tenant database with Argon2id credentials.
- **Identifier Normalisation & Collision Defence:** Deterministic collision prevention across email, E.164 mobile numbers, and 10-digit registration numbers.
- **Scoped Role-Based Access Control (RBAC):** Hierarchical role assignments over institutional `ltree` scopes with temporal validity windows and PostgreSQL-enforced singleton constraints.
- **Delegation Matrix Enforcement:** Multi-tier role assignment validation ensuring users can only assign roles permitted by their own role and within their assigned scope.
- **Audited Impersonation Engine:** Super Admin administrative assistance with strict read-only restrictions for academic authority roles (ADR-0004) and complete audit logging via Spatie Activitylog.

---

## 2. Architecture & Public Contracts

Following the system architecture rules:
- **Never access another module's Models directly.** Consume services or listen to domain events.
- External modules interact with Identity via:
  - `ScopeAuthorizer`: The central authorization engine for checking permissions and scoping Eloquent queries.
  - `HasScopedVisibility`: Trait for Eloquent models implementing `ScopedResource`.
  - `RoleAssigned`, `RoleRevoked`: Domain events emitted upon role changes.

### Key Services & Actions
- `ScopeAuthorizer`:
  - `can(Authenticatable $user, string $permission, ?ScopedResource $resource = null): bool`
    - Evaluates dual-path scope matching:
      - **Governance/Write permissions:** Evaluated strictly against `$resource->getManagingScopePath()`.
      - **Read/Analytics permissions:** Evaluated against `$resource->getManagingScopePath()` OR `$resource->getHomeScopePath()`.
  - `scopeQuery(Builder $query, Authenticatable $user, string $permission, ...): Builder`
    - Pushes `ltree` ancestry matching down to PostgreSQL using GiST indexing (`path ~ '*.label.*'::lquery`), eliminating N+1 permission checks across paginated lists.
- `AssignRoleAction`:
  - Validates assignment against `delegation_rules`.
  - Checks scope constraint and order record requirements.
  - Persists assignment to `role_assignments` and logs security audit record in `activity_log`.
- `RevokeRoleAction`:
  - Deactivates role assignment (`is_active = false`, `valid_to = now()`).
  - Logs audit entry and emits `RoleRevoked`.
- `ImpersonateUserAction`:
  - Enforces caller is `super_admin`.
  - Determines if target user possesses academic approval authority (e.g., `principal`, `hod`, `tutor`, coordinators).
  - Issues short-lived Sanctum token (max 30 minutes) tagged with `['impersonation:read_only']` for academic roles.
  - Logs impersonation start and reason to `activity_log`.

---

## 3. Data Model & PostgreSQL Integrity

### Schema Tables (`tenant` connection)
1. `users`: Core tenant identity accounts (`id` ULID, `type`, `name`, `email`, `mobile`, `registration_number`, `password`, `status`, `must_change_password`, `last_login_at`).
2. `roles`: Role catalogue (`id` ULID, `key`, `name`, `scope_type`, `stream`, `is_singleton`). Seeded with the 21 institutional roles.
3. `permissions`: Declared module capabilities (`id` ULID, `key`, `name`, `module`, `description`). Synced dynamically via `php artisan permissions:sync`.
4. `role_permission`: Pivot table binding permissions to roles.
5. `role_assignments`: User role bindings (`id` ULID, `user_id`, `role_id`, `scope_type`, `scope_label`, `valid_from`, `valid_to`, `is_singleton`, `is_active`, `order_record`, `assigned_by`).
6. `delegation_rules`: Matrix defining which assigner role can grant which assignee role, under what scope constraint (`institution`, `stream`, `department`, `managing_department`, `workshop_section`, `batch`).
7. `activity_log`: Tenant-scoped audit trail (using ULID subject/causer keys).

### Singleton Exclusion Constraint (`btree_gist`)
To prevent race conditions and concurrent role collisions (e.g. two users being assigned HOD of the same department simultaneously), `role_assignments` uses PostgreSQL's `btree_gist` extension:
```sql
ALTER TABLE role_assignments
ADD CONSTRAINT role_assignments_singleton_excl
EXCLUDE USING gist (
    role_id WITH =,
    scope_label WITH =,
    tstzrange(valid_from, coalesce(valid_to, 'infinity'::timestamptz), '[)') WITH &&
)
WHERE (is_singleton is true);
```

---

## 4. HTTP API Endpoints

All endpoints are prefixed with `/api/v1` and protected by `auth:sanctum` and permission middleware:

| Method | Endpoint | Permission Required | Description |
|---|---|---|---|
| `POST` | `/auth/login` | None (Public) | Authenticate by email, mobile, or registration number |
| `POST` | `/auth/logout` | Authenticated | Revoke current access token |
| `POST` | `/auth/password/change` | Authenticated | Change user password and revoke other tokens |
| `GET` | `/me` | Authenticated | Return authenticated user profile and roles |
| `GET` | `/users` | `identity.user.view` | List users with pagination and filtering |
| `POST` | `/users` | `identity.user.create` | Create a new user account |
| `GET` | `/users/{id}` | `identity.user.view` | Retrieve user details and role assignments |
| `PUT` | `/users/{id}` | `identity.user.update` | Update user details or status |
| `GET` | `/roles` | `identity.role.view` | List assignable roles |
| `POST` | `/roles/assign` | `identity.role.assign` | Assign scoped role to user |
| `POST` | `/roles/revoke` | `identity.role.revoke` | Revoke active role assignment |
| `POST` | `/impersonation` | `identity.impersonation.start` | Start audited impersonation session (max 30m) |
| `POST` | `/impersonation/stop` | Authenticated | End active impersonation session |
