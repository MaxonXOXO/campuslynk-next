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
- `identity.user.import`: Preview and commit bulk staff import batches.
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

## 6. User Status Transitions

| From | To | Endpoint / Action | Authorized Actor (`UserPolicy`) | Side Effects |
| --- | --- | --- | --- | --- |
| `pending` | `active` | `POST /users/{id}/approve` (`ApproveUserAction`) | `identity.user.approve` + `callerRank > targetRank` (Super Admin, Principal) | Clears `status_reason`; user can now sign in. Non-pending returns `409`. |
| `pending` | `rejected` | `POST /users/{id}/reject` (`RejectUserAction`) | `identity.user.approve` + `callerRank > targetRank` | Requires `reason` (5–500 chars); revokes tokens. Non-pending returns `409`. |
| `active` | `suspended` | `POST /users/{id}/suspend` (`SuspendUserAction`) | `identity.user.suspend` + `callerRank > targetRank` | Revokes all Sanctum tokens; keeps `role_assignments`. Non-active returns `409`. |
| `suspended` | `active` | `POST /users/{id}/reactivate` (`ReactivateUserAction`) | `identity.user.suspend` + `callerRank > targetRank` | Restores `status = 'active'`. |
| `deactivated` | `active` | `POST /users/{id}/reactivate` (`ReactivateUserAction`) | `identity.user.suspend` + `callerRank > targetRank` | Restores `status = 'active'` **only**; previously ended `role_assignments` stay ended. |
| `rejected` | `active` | *Disallowed* (`ReactivateUserAction`) | *None* | Returns `409 Conflict` (`rejected` accounts cannot be reactivated). |
| `active` / `suspended` / `pending` | `deactivated` | `POST /users/{id}/deactivate` (`DeactivateUserAction`) | `identity.user.deactivate` + `callerRank > targetRank` | Requires `reason` (5–500 chars); refuses self & last active `super_admin`; revokes all tokens; end-dates all active `role_assignments` (`is_active = false`, `valid_to = now`). |

## 7. Staff Onboarding & Deferred Email Verification

- **Public self-registration** (`POST /api/v1/auth/register-staff`) is gated by tenant setting `auth.staff_self_registration_enabled` (default `false`) and a daily pending registration cap (`auth.staff_self_registration_daily_cap`, default `100`).
- **Email/mobile ownership verification** is consciously deferred until SMTP/SMS infrastructure is added; `UserApproved` and `UserRejected` domain events are dispatched after commit with a stub listener ready for future email notifications.

## 8. Architecture Boundary
Per `AGENTS.md` and `docs/foundation_spec.md` §4:
- Other modules must **never** import `App\Modules\Identity\Models\*`.
- Interactions must occur exclusively through `Contracts/`, `Events/`, or `Http/Resources/`.

