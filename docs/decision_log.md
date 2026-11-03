# Decision Log (as of 2026-11-01)

## Confirmed by product owner
| Topic | Decision | Design implication |
|---|---|---|
| Student leave | Keep current behaviour (Tutor or Mentor approves) | Single approval step, scoped to batch/mentoring group. |
| Activity points | Keep current scope: 60 points, 40 for lateral entry | The HOD print report's hard-coded 75 is treated as a legacy bug. Goal is a per-regulation setting. |
| Notifications | Not set up. Firebase is acceptable | See section "Notification design". |
| Server (on-prem) | Unknown. Assume a high-end consumer PC | Size for one college. Add UPS, scheduled encrypted backups, restore drill. |
| Domain | `app.carmelpoly.in` (GoDaddy) reused for Carmel | Tenant host mapping in landlord `domains`. |
| AI assistant | In scope, but a **separate project** with a RAG pipeline | Core app exposes an integration interface only (see below). |
| WebRTC remote support | Dropped | Removes `SupportDeskController` and signalling tables. |
| Staff birthdays | Nice-to-have | Backlog, after core. |
| Mock tests | Required | Part of the Exams module. |
| Notifications section | Required in web app now; mobile push later | In-app notification centre first, FCM push added with the React Native app. |

## Notification design
- **Core:** a `notifications` table + `Notify` service with channels `in_app`, `email`, `push` (later), `sms` (optional). Providers sit behind interfaces.
- **In-app centre** is the primary channel from day one. Delivery over Reverb with polling fallback.
- **FCM** covers push for web and the future React Native app. It does not cover SMS or WhatsApp.
- **Firebase Phone Auth** can send OTPs, but it bills per SMS beyond the free tier and needs internet, so it cannot work on an offline on-prem server. Treat it as one optional parent-login provider. Keep **email plus temporary password** as the fallback, and **TOTP or passkeys** for staff second factor.
- WhatsApp needs the WhatsApp Business API, separate from Firebase. Defer.

## AI assistant: integration boundary
- Separate repo and service. Core exposes: a tenant-scoped, read-only retrieval API; a per-user token carrying their capabilities; an audit log of questions.
- The assistant must never see data the asking user cannot see. Authorisation is enforced by the core API, not the assistant.
- The old Carmie playbook JSON and query log can seed the knowledge base.

## Scope cut
- **In MVP:** identity, organisation, attendance (offline), assessment engine, exams and mock tests, student and parent portals, notifications, leave, mentoring, activity points.
- **Later:** SF Office extras, staff birthdays, mobile push, WhatsApp.
- **Dropped:** WebRTC remote support.
- **Separate project:** AI assistant (RAG).
- **Not decided yet:** flash notice scheduler (note: the legacy one never published scheduled notices, so rebuild it properly on the job scheduler), Google Drive backup (replaced by `tenants:backup`).

## Resolved Architectural & Domain Decisions (Locked in ADRs 0001–0007)
1. **Tenancy & Database ([ADR-0001](./adr/0001-postgresql-database-per-tenant.md)):** PostgreSQL 17 database-per-tenant (`landlord` + `tenant_<slug>`) with per-tenant PostgreSQL roles (`REVOKE CONNECT ON DATABASE ... FROM PUBLIC`) and dual `DEPLOY_PROFILE` (`onprem` for `app.carmelpoly.in` and `cloud` for AWS).
2. **API Contract ([ADR-0002](./adr/0002-api-versioning-and-compatibility.md)):** `/api/v1` JSON envelope + RFC 7807 errors + OpenAPI 3.1 contract generation + `202 Accepted` async job resource `/api/v1/jobs/{id}`.
3. **Authentication ([ADR-0003](./adr/0003-parent-and-student-authentication.md)):** Single `users` table (Argon2id), no universal default password, real `parent` accounts via `guardian_links`, offline-ready temporary password / email fallback + optional Firebase Phone Auth OTP, FIDO2 passkeys (`laragear/webauthn`), and mandatory MFA for `super_admin`.
4. **Super Admin vs Principal ([ADR-0004](./adr/0004-super-admin-vs-principal.md)):** Super Admin (College IT Head) administers accounts, system settings, and backups, while Principal holds institutional academic authority. Impersonation of academic roles (`principal`, `hod`, `tutor`, coordinators) is strictly **read-only**.
5. **Scope Tree & S1/S2 Governance ([ADR-0005](./adr/0005-scope-model-home-and-managing-department.md)):** `home_department_id` (permanent) vs `managing_department_id` (derived from `department_semester_governance`: `GEN_AIDED` for Aided S1/S2, `GEN_SF` for SF S1/S2). Governance/write permissions check `managing_department_id` only; read/analytics permissions check either edge. Typed `sub_batches` (`lab | mentoring | workshop`) replace `sections`.
6. **Regulation & Assessment Engine ([ADR-0006](./adr/0006-regulation-driven-assessment-engine.md)):** 8-table data-driven schema seeding all 13 `REV2021` & `REV2026` course archetypes, eliminating all hard-coded subject IDs and resolving the 3 legacy rule conflicts in `pass_rules_json`.
7. **Workflows, Notifications & AI Boundary ([ADR-0007](./adr/0007-configurable-approval-chains-and-notifications.md)):** Stream-aware approval chains (`AIDED` vs `SF` leave, CIA consolidation, single-step Tutor/Mentor student leave), built-in Web Notification Center (Reverb + polling) with `FcmPushChannel` ready for React Native, external RAG AI Assistant via `/api/v1/ai-bridge/*`, and WebRTC support desk dropped.

8. **Secrets Flow & Role Isolation ([ADR-0012](./adr/0012-owner-vs-runtime-role.md)):** Strict separation between `landlord_app` (DML only, no tenant DB connect), `provisioner` (ops only, `CREATEDB`), and superuser. Pre-boot generation via `init-secrets.ps1`/`init-secrets.sh` guarantees unified `APP_KEY` and credentials across container boundaries.
9. **Dual Scope Tree & LTree Scope Labels ([ADR-0013](./adr/0013-scope-labels-in-ltree-hierarchy.md)):** Every node in the institutional hierarchy carries a deterministic `scope_label` formatted as `{prefix}_{slug_fragment}`. Batches maintain dual `ltree` paths (`home_path` vs `managing_path`) indexed with GiST, evaluated by `ScopeAuthorizer` with `visibleTo` query scope pushing hierarchy checks to PostgreSQL without N+1 queries.
10. **Staff Member Who Is Also a Parent/Guardian (Resolved):** Option A confirmed. `guardian_links` references `guardian_user_id` regardless of `users.type`. A staff member retains a single account (`type = staff`) with their departmental assignments, while their `guardian_link` grants ward visibility in parent portals. Note: Full students and parents management & portal access are scheduled for Step 6 (Students/Portal work).
11. **Dedicated Account Unlock Permission (`identity.user.unlock`):** Re-using `identity.user.update` for account unlock created a privilege escalation risk where administrative roles (`principal`, `admin`) could bypass rate limiting defense and unlock their own or other accounts. `identity.user.unlock` is held strictly by `super_admin` to ensure clear audit trails and prevent brute-force assistance attacks.
12. **Canonical Role Assignment Surface:** Deprecated and eliminated duplicate endpoints `/roles/assign` and `/roles/revoke` to minimize attack surface and enforce a single RESTful contract: `GET /role-assignments`, `POST /role-assignments`, `DELETE /role-assignments/{id}`.
13. **Route Table Production Hygiene:** Test-only helper routes (e.g. side-effect checking fixtures) are strictly registered within `if (app()->environment('testing'))` blocks, preventing test endpoints from existing in production artifacts. Route audit builds verify absence of `/test/` routes.
14. **Architecture Boundary & Module Scaffolding (Sprint 0, Step 6):** Cross-module encapsulation enforced via `ModuleBoundaryTest.php`. Modules communicate strictly via Domain Events and Core Contracts. Direct imports of another module's Models, Actions, Controllers, Requests, or Policies are mechanically forbidden in CI. All Actions must be `final` with `execute(...)`. Thin controllers have zero raw DB statements. Standardized scaffolding via `php artisan make:module <Name>`.
15. **OpenAPI Contract Drift Gate & Typed Client Pipeline (Sprint 0, Step 6):** Bidirectional drift gate in `OpenApiContractSyncTest.php` (`composer contract`) asserts 1:1 route/contract parity. `@academic-suite/api-client` generated from `contracts/openapi.yaml` with RFC 7807 `ApiError` parsing, token/tenant header injection, and JSON schema validation foundation (`JsonSchemaValidator`).

## Open (as of 2026-11-02)
- **ADR-0008:** on-prem public reachability and TLS (proposed: outbound-only tunnel).
- **Exam-cell confirmation** of the R26 theory CIA floor, R21 theory ESE maximum and R26 Health & PE logbook mark (ADR-0006 defaults: 16/40, 75, logbook included).
- **Leave chains** for the Principal, `admin`, `sf_office` and `super_admin` as applicants (ADR-0007).
