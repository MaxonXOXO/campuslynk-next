# Identity Module (`App\Modules\Identity`)

## 1. Purpose
The Identity module manages user authentication, account lifecycles, credentials, and user identifiers within each tenant context. It provides token issuance (Laravel Sanctum), rate-limited authentication, timing-attack-resistant constant-time credential verification, multi-identifier login resolution, password changes with forced first-login rotation, and session management.

## 2. Public Contracts (`Contracts/`)
- `AuthenticatesUserContract`: Interface for user authentication and token creation.
- `ChangesPasswordContract`: Interface for updating user passwords and revoking active sessions.

## 3. Entities & Models (`Models/` - Module Private)
- `User`: Core user model (`type`: `staff`, `student`, `parent`, `must_change_password`, `status`).
- `UserIdentifier`: Unified table for user login handles (`kind`: `email`, `mobile`, `registration_number`) with a single database-level `UNIQUE (value_normalised)` constraint.
- `PersonalAccessToken`: Custom Sanctum token model with ULID keys and explicit tenant isolation.

## 4. Permissions Declared (`identity.*`)
Declared in `IdentityModule::permissions()`:
- `identity.user.view`: View user records and directory listings.
- `identity.user.create`: Create staff and student accounts.
- `identity.user.update`: Update account profile and credentials.
- `identity.user.unlock`: Clear multi-tier rate limiting and administrative lockouts (restricted to Super Admin).
- `identity.user.approve`: Approve pending student/staff registrations.
- `identity.user.suspend`: Suspend active user accounts.
- `identity.user.delete`: Soft/hard delete user accounts.
- `identity.user.reset_password`: Issue password reset / one-time credentials.
- `identity.user.impersonate`: Audited time-limited impersonation session.
- `identity.role.assign`: Assign and revoke scoped user roles.
- `identity.online_status.view`: View active tenant user sessions.
- `identity.audit_log.view`: View security and audit trail events.

## 5. Domain Events (`Events/`)
- `LoginSucceeded`: Emitted on successful credential verification and token creation.
- `LoginFailed`: Emitted on failed authentication attempts.
- `AccountLockoutTriggered`: Emitted when an identifier exceeds Tier 2 rate-limiting thresholds.
- `PasswordChanged`: Emitted when a user updates their password.
- `TokenRevoked`: Emitted when an access token is revoked.

## 6. Architecture Boundary
Per `AGENTS.md` and `docs/foundation_spec.md` §4:
- Other modules must **never** import `App\Modules\Identity\Models\*`.
- Interactions must occur exclusively through `Contracts/`, `Events/`, or `Http/Resources/`.

