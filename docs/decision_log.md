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

## Open (as of 2026-11-01)
- **ADR-0008:** on-prem public reachability and TLS (proposed: outbound-only tunnel).
- **Exam-cell confirmation** of the R26 theory CIA floor, R21 theory ESE maximum and R26 Health & PE logbook mark (ADR-0006 defaults: 16/40, 75, logbook included).
- **Leave chains** for the Principal, `admin`, `sf_office` and `super_admin` as applicants (ADR-0007).
- **stancl/tenancy v4** PostgreSQL per-role isolation to verify in Sprint 0 (ADR-0001).
- **Staff member who is also a parent/guardian (Sprint 0, Step 4):** A lecturer can also be a parent of a student at the same college, but `users.type` has a single value (`staff | student | parent`). How does a staff member who is also a guardian get a `guardian_link`?
  - *Option A (Recommended):* `guardian_links` can reference any user regardless of `type` (e.g., a user with `type = staff` can be targeted by a `guardian_link` and granted student-guardian portal access without account duplication).
  - *Option B:* Dual accounts (separate staff account and parent account with distinct mobile/email identifiers).
  - *Decision timing:* To be decided in Step 4 (Scoped RBAC and Relationships).
