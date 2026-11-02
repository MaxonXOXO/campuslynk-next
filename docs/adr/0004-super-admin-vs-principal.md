# ADR-0004: Super Admin (college IT head) above Principal

**Status:** Decided

## Context
Confirmed: Super Admin is the college's IT cell head and sits above the Principal in the system hierarchy. The Principal is the academic head. The Super Admin needs authority over system operations and user accounts, but must not hold unilateral academic approval powers.

## Decision
**Super Admin holds technical and administrative powers:**
- **Users:** create, update, approve registration, suspend, reset password (via audited flow), manage security/MFA settings.
- **Role Appointments (Technical vs Academic):**
  - `super_admin` can bootstrap the `principal` account, `admin` / `sf_office` accounts, and base staff designations (`lecturer`, `demonstrator`, etc.), and can assign `hod` / coordinators when executing an official order on behalf of the Principal.
  - `principal` can directly appoint and revoke `hod`, `gen_dept_coordinator`, `academic_coordinator`, and `workshop_superintendent`.
  - `hod` (and General Dept Coordinators for S1/S2) appoints `tutor`, `mentor`, and `course_teacher` within their managed department scope.
- **System:** tenant settings, backups (`tenants:backup`), licence/plan view, online status, audit-log view.
- **Impersonation (Strictly Read-Only for ALL Target Users):**
  - Allowed only with a mandatory ticket/reason (minimum 10 characters), time-limited (max 30 minutes), fully audited, and visible in both the tenant audit log and the impersonated user's security log.
  - When impersonating **any user** (staff, faculty, student, or parent without exception), the session is **strictly read-only** (`GET` / `HEAD` / `OPTIONS` only; all state-mutating requests `POST`/`PUT`/`PATCH`/`DELETE` are blocked by middleware with HTTP 403 Problem Details, with the sole exception of `POST /api/v1/impersonation/stop`). This guarantees the IT head cannot enter marks, approve leave, submit assessments, vote in surveys, or perform any state change on behalf of another user.
  - Nested impersonation (starting an impersonation while already in an impersonation session) is strictly prohibited.
  - Routes with side effects on `GET` carry a route attribute/middleware (`without_impersonation` / `side_effects`) and are blocked in impersonation sessions as well.
  - **Role keys:** stream is carried by scope, so there is one `gen_dept_coordinator` (scoped to `GEN_AIDED` or `GEN_SF`) and one `academic_coordinator` (scoped to stream `SF`).

**Super Admin does not, by role, hold academic or HR approvals:**
- CIA consolidation lock, marks override, series/ESE mark entry.
- Staff leave approval at any stage.
- Course-file / NBA sign-offs.
These stay with Principal, HOD, Tutor, Coordinators. A Super Admin who is also a faculty member (e.g. a Lecturer or Tutor) receives those academic permissions only through an explicit, scoped `role_assignment` for that academic role.

**Hierarchy vs permission:** "above the Principal" governs who can administer accounts and technical infrastructure. It is not a bundle of every permission. Permissions are granted per role, never inferred from rank.

**Safeguards:** mandatory second factor (TOTP or Passkey); at least two active Super Admin accounts per tenant recommended; documented recovery path (Platform Owner can restore access with a logged break-glass action) for when the IT head leaves.

## Consequences
- Prevents the IT account from silently changing academic records, either directly or via impersonation.
- Keeps the permission catalogue (`identity.*`, `office.system_settings.*`, `office.backup.*`) strictly separated from `assessment.*` and `office.staff_leave.*` when seeding.

## Resolved Items
- **Impersonating `student` or `parent` accounts:** Resolved. Impersonation of all users is read-only across all roles without exception.
- The delegation table in `docs/role_and_permission_spec.md` §4 is the implementation reference; `admin` cannot assign HOD or coordinators.
