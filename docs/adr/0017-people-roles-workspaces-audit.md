# ADR-00NN: People, role assignments, workspaces and audit

- **Status:** Proposed (updated 2026-11-21 after review of the open questions)
- **Date:** 2026-11-20
- **Deciders:** Max
- **Related:** ADR-0016 (first-run setup state). Impersonation is specified separately and is not changed here.
- **File name when committed:** `docs/adr/00NN-people-roles-workspaces-audit.md` (replace NN with the next free number)

## Context

The legacy system (see `docs/legacy/ROLE_AND_FEATURE_INVENTORY.md`) has no real role model:

- Each staff member has **one** `designation` and one `branch` in `staff_profiles`, copied into the session at login. There is no users table with roles, no role middleware, and authorization is done with inline `in_array` checks on the session.
- Extra responsibilities are layered on **at runtime** by matching data: Tutor and Mentor by `mobile_no` in the class tables, subject teachers by `subject_staff_assignments` or by name and mobile in timetable JSON files, and the SF Academic Coordinator by a mobile number in `system_settings`.
- The Principal reaches lower dashboards (HOD, coordinators, teaching views) through route whitelists. Nothing records why or how often.
- There is no global role switcher. Each dashboard has hand-written sidebar links to the other consoles the person can reach. HOD and staff have separate mobile dashboards.

CampusLynk-Next needs:

1. A hierarchy where every authority role is created by the role above it.
2. People who hold more than one role: a Principal who also teaches, an HOD who is also a lecturer.
3. Supervision by senior roles without unrecorded access.
4. A complete record of who did what, and of every data change.

Already decided and not revisited here: authority roles never self-register; the Admin role is dropped and replaced by Super Admin; the other legacy roles carry over; supervision of lower workspaces is view-only for now.

## Decision

### 1. People and assignments

- A **person** is one account (login, name, contact details). A person never has a role stored on the account itself.
- A **role assignment** links a person to a role with a scope and a validity period:
  `person_id, role, scope_type, scope_id, starts_at, ends_at, status, assigned_by, reason`.
- Assignments are **end-dated, never deleted**. History stays queryable.
- **Effective permissions are the union** of the permissions of the person's active assignments. Each permission is evaluated inside its own assignment's scope, so an HOD-and-lecturer has department-wide authority from one assignment and class-level authority from the other, never a blend.
- Nothing grants access by matching a phone number or a name. Classes and subjects reference a person's account.

**Scope types:** institution, department, class (batch plus section), subject offering.

**Positions** (what someone is appointed as): Super Admin, Principal, HOD, Lecturer, Demonstrator, Trade Instructor, Workshop staff, General Coordinator (Aided), General Coordinator (SF), Student, Parent. Admin is not carried over. **Chairman is deferred:** the position is reserved in the model (appointed by the Principal) but has no workspace yet, because it needs management and financial views, not academic ones.

**Responsibilities** (what someone is assigned to do, tied to a scope): Tutor, Mentor, Subject Teacher, Academic Coordinator (SF), which is a responsibility like HOD-style assignments, not a position. These replace the legacy runtime overlays and become explicit, visible, end-dated rows.

**Rules enforced by the database where possible:**
- At most one active Principal assignment per institution (partial unique index).
- Every assignment records who made it and when.
- A person may hold several active assignments, including several positions.

### 2. Appointment authority

| Appointed role | Appointed by |
| --- | --- |
| Principal | Super Admin |
| HOD, coordinators | Principal |
| Chairman (deferred) | Principal |
| Department staff, Tutor and Mentor, Subject Teacher | HOD (within the department) |
| Students, parents | Staff workflows now; self-registration only when that module ships and the institution enables it |

- A role can only be granted by a role above it. Authority roles never self-register.
- **Replacing a person in a role** ends the old assignment (with a reason) and starts a new one. The person account remains, so a retired Principal who continues as a lecturer keeps the lecturer assignment. Past actions still point at the assignment that was active at the time.

### 3. Activation with a temporary password

For now, a newly appointed person is activated with a temporary password:

- The system generates it. The appointing user sees it once, at creation or reset, and cannot view it again.
- It is stored hashed like any password, expires after a configurable period (default 48 hours), and forces the existing change-on-first-login flow.
- Repeated failed logins trigger the standard timed lockout policy (ADR-0011); accounts with a temporary password are not permanently locked.
- A reset generates a new temporary password and invalidates the previous one.
- The password value never appears in logs, audit records, or error reports.
- Activation sits behind one interface so an emailed invite link can replace it later without changing the rest of the flow.

### 4. Workspaces and the switcher

- A **workspace** is a dashboard with its own sidebar, belonging to a group of assignments: Super Admin, Principal, HOD, Teaching (Lecturer, Demonstrator, Trade Instructor, Workshop staff, Subject Teacher), Tutor and Mentor, Coordinator, Student, Parent.
- Workspaces are **computed from the person's active assignments**. Nothing is maintained by hand.
- One application shell serves all workspaces, responsive on small screens (no separate mobile dashboards).
- **Landing:** the highest-authority workspace the person has. This may be revisited once real use shows whether remembering the last used workspace works better.
- **Switcher:** a control in the shell header, visible only when the person has two or more workspaces. On small screens it opens as a bottom sheet.
- The active workspace is explicit in the URL, so links are shareable and every request knows which role context it runs in.
- A Principal who also teaches has two workspaces, **Principal** and **Teaching**, each with its own sidebar and dashboard. An HOD who is also a lecturer has **HOD** and **Teaching** in the same way.
- A Principal who teaches needs an explicit subject assignment like any other teacher. Their teaching load looks the same as everyone else's.

**Alternatives considered**
- *One merged sidebar:* rejected. It gets long, mixes scopes, makes the permission context unclear, and makes the audit log ambiguous about which role acted.
- *Legacy-style hard-coded cross links:* rejected. They are not derived from assignments and drift out of date.

### 5. Supervision

- The Principal has **read-only** supervisory permissions across the institution.
- These are exposed **inside the Principal workspace** as department drill-downs, not by entering the HOD or Teaching workspaces of other people.
- Acting on behalf of lower roles is out of scope. Impersonation is specified separately.
- Reads of personal staff or student data through supervisory views are recorded in the application audit.

### 6. Audit

Two layers, built as a module inside the backend (not a separate service for now):

**Application audit** records intent: actor person, the acting assignment and workspace, event name, subject, request id, IP address, user agent, and before and after values of important fields. It extends the activity log already used for setup events and standardises event names (for example `role_assignment.created`, `role_assignment.ended`, `principal.appointed`, `temp_password.reset`).

**Database change tracking** is the safety net. Triggers write every insert, update and delete on tracked tables to an append-only audit table, including changes that bypass the application (scripts, console sessions, seeders).

**Who can read the audit.** Visibility follows the hierarchy and each viewer's scope, computed from their active assignments the same way permissions are:

| Viewer | Sees |
| --- | --- |
| Principal | The whole institution's application audit, with drill-down by department, by HOD, by staff member |
| HOD | The audit of their own department, including the staff and classes in it |
| Tutor | Only the audit of their assigned class (batch) |
| Lecturer | Their own actions, plus events on their own subject offerings that involve students (assignment submissions, exam and marks entries), so they can verify when something a student says they did does not appear on their side |
| Academic Coordinator | The overview audit of whatever is assigned to them |
| Student | Their own events, for example a timestamped receipt that an assignment was submitted |
| Super Admin | User, role and system-configuration events only (proposed). Not academic events |

- Each application audit row stores **scope tags at write time** (department, class, subject offering, acting person, affected person). Scoped queries stay exact and fast, and are not affected by later changes such as a student moving class.
- Opening someone else's audit is itself audited.
- The **database change-tracking layer is forensic and is not part of this hierarchical view.** Access to it is a separate, narrowly granted permission. Who holds it is an open question.

Requirements for both layers:
- The actor is passed to triggers with `SET LOCAL` **inside each transaction**, never a session-level `SET`. The application connects through PgBouncer, so a session-level value could leak onto another request. This needs a regression test in the style of the existing worker-leak test.
- The application database user may only insert into audit tables. It cannot update or delete them.
- Secrets are redacted or excluded in both layers: passwords, temporary passwords, reset tokens, password hashes.
- Audit rows are never edited in place.

## Consequences

**Positive**
- Multi-role people work without special cases, and the principal-who-teaches case is the same model as everyone else.
- Access is explainable: every permission traces to an assignment, who made it, and when.
- Succession (replacing a Principal or HOD) keeps history intact and does not touch the person account.
- Scope is part of the model from the start, so department-limited roles (HOD, lecturer) do not have to be retrofitted later.

**Negative and costs**
- More tables and a permission layer to build before the first dashboard is useful.
- Triggers add write overhead on tracked tables. Choose tracked tables deliberately.
- A workspace switcher adds one click for multi-role people. This is accepted for clarity of context and audit.
- Legacy data needs a mapping step (below).

## Legacy mapping

| Legacy | New |
| --- | --- |
| `staff_profiles.designation` | Position assignment |
| `branch` | Scope (department or institution) |
| Tutor and Mentor via mobile number in class tables | Tutor or Mentor responsibility assignment, scope = class |
| `subject_staff_assignments`, timetable JSON names | Subject Teacher assignment, scope = subject offering |
| `sf_academic_coordinator_mobile` in system settings | Academic Coordinator assignment, scope = SF |
| Principal route whitelists | Read-only supervisory permissions inside the Principal workspace |
| Separate mobile dashboards | One responsive workspace |

## Implementation order (suggested)

1. Schema for people and assignments, permission evaluation with scope, tests with the 6 departments and 2 batches already in the dev tenant.
2. Super Admin appoints the Principal: temporary password flow, replacement flow, audit events.
3. Application shell with workspace computation and the switcher.
4. Database change tracking with the actor context and the PgBouncer leak test.
5. One thin vertical path to the bottom: an HOD limited to one department, then a student in one batch, to test scope at the narrow end.
6. Dashboards.

## Decided on 2026-11-21

- Academic Coordinator is a responsibility.
- Chairman is deferred. When added, it is appointed by the Principal and gets management and financial views, not academic ones.
- Super Admin does not need broad academic access.
- Audit visibility follows the hierarchy (see section 6).
- Landing rule: highest-authority workspace, open to revision.

## Open questions

1. **Raw database audit:** who holds the permission to read the forensic layer? It contains academic rows, which Super Admin otherwise does not see.
2. **Super Admin's audit view:** confirm that user, role and system-configuration events are enough.
3. **Student audit:** how much does a student see (receipts for their own submissions only, or a fuller activity history)?
4. **Audit retention:** how long are application and database audit records kept?
5. **Acting roles:** can one HOD cover a second department temporarily?
6. **Parent role:** one parent with several students is likely; confirm before the parent workspace is designed.
7. **Chairman workspace:** revisit when management and finance features are scoped.
