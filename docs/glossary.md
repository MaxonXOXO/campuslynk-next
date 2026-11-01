# Glossary

> Exact meanings of every domain term. Agents and humans must use these words in code, API fields, docs and UI copy. If a term is missing or disputed, add it here (with an ADR if it changes behaviour) before using it.
> Status tags: **Decided** = confirmed by the product owner. **Proposed** = reconciled by us, needs sign-off.

---

## 1. Platform & Tenancy

| Term | Meaning | Code name |
|---|---|---|
| **Platform Owner** | The vendor (our team). Operates the landlord level. Never a tenant user. | `platform_owner` (landlord `platform_users`) |
| **Landlord database** | The single central database holding tenants, domains, plans/licences, per-tenant DB host and encrypted credentials, schema versions, platform users. Present in **both** deployment profiles. | connection `landlord` |
| **Tenant** | One college. Owns exactly one tenant database. | `tenants` |
| **Tenant database** | A separate PostgreSQL database per college, identical schema, own DB role, no access to other tenants. | `tenant_<slug>` |
| **Deployment profile** | `onprem` (installed on a college server by us) or `cloud` (AWS). Same images, different environment variables and installer. | `DEPLOY_PROFILE` |
| **On-prem tenant** | A landlord with exactly one tenant. Not a fork, no special code path. | |
| **Plan / Licence** | Which modules and limits a tenant has. Plan row (cloud) or signed licence file (on-prem). Drives feature flags. | `licenses`, Pennant |
| **Tenant move** | Export a tenant (DB dump + files + tenant record) and import it into the other profile or another host. Supported feature, not a script. | `tenants:export`, `tenants:import` |

## 2. Organisation

| Term | Meaning |
|---|---|
| **Institution** | The college itself, the root of the scope tree inside a tenant. |
| **Stream** | A management stream within one college: `AIDED`, `SF` (Self-Financing), or `SHARED`. Office, HR, leave and coordinator rules are scoped per stream; academic features are shared. **Decided** |
| **Department** | An academic or administrative unit (EL, ME, CE, EEE, CT, AU, GEN_AIDED, GEN_SF, GEN, Administration). Carries a `funding_stream`. |
| **General Department** | `GEN_AIDED` / `GEN_SF`. Governs **Semesters 1 and 2** of its stream's engineering branches. |
| **Home department** | The branch a batch belongs to (e.g. CE). Never changes. |
| **Managing department** | The department that currently governs a batch's semester. For S1/S2 it is the General Department; for S3+ it equals the home department. **Decided** (ADR-0005) |
| **Program** | A diploma programme offered by a department. |
| **Regulation** | A rule set for a scheme revision: `REV2021` (R21) and `REV2026` (R26). Both active side by side. Future `REV2031` = seed data, no schema change. **Decided** (ADR-0006) |
| **Assessment scheme** | One course archetype inside a regulation (e.g. `r21_theory`, `r26_practicum_core`) with component tree, CIA/ESE split and pass rules. Stored as data. **Decided** (ADR-0006) |
| **Academic year** | A calendar span, e.g. 2026-27. |
| **Batch** | An admission-year cohort in a department/programme (e.g. ME 2024-2027). Permanently linked to **one** regulation via `regulation_id`. **Decided** |
| **Sub-batch** | A typed split of a batch (`kind ∈ ('lab', 'mentoring', 'workshop')`): Lab Batch 1/2 (per course offering), Mentoring Group A/B, Workshop Batch 1/2. Replaces the generic `sections` entity; "section" is not used for polytechnics. **Decided** (ADR-0005) |
| **Workshop section** | A trade section of the Central Workshop (Machine Shop, Fitting, Smithy, Welding, Sheet Metal, Foundry). |
| **Course** | A subject definition, versioned per regulation: `course_code` + `regulation_id`. Type: theory, practical, practicum, drawing, workshop, project, seminar, english, health_physical, internship. |
| **Course offering** | A course delivered to a batch in a semester. Holds `assessment_scheme_id` explicitly (no hard-coded subject-ID exceptions). |
| **Semester** | 1..6 within a batch. |

## 3. Identity & Access

| Term | Meaning |
|---|---|
| **User** | One person account (ULID). Staff, student, parent are user *types*. Mobile number is a unique, changeable attribute, never a key. |
| **Role** | A named bundle of permissions (seeded data). |
| **Permission** | A string `<module>.<resource>.<action>`, e.g. `attendance.session.mark`. Declared in code by each module, synced to DB. Never invented ad hoc. **Decided** (three-part form) |
| **Scope** | The part of the organisation tree a role assignment applies to: `institution`, `stream`, `department`, `program`, `batch`, `sub_batch`, `course_offering`, `workshop_section`, or `own`. |
| **Role assignment** | User + Role + Scope + assigned_by + valid_from/until. A person can hold many at once (Lecturer + HOD + Tutor). |
| **Delegation rule** | Defines which role may assign which role, within what scope constraint (e.g. HOD → Tutor only inside own department). |
| **Capability** | The computed list of what the current user may do, returned by `/me`. Used for UI only; the server enforces. |
| **Singleton role** | A role with at most one active holder per scope (Principal, HOD per department, Tutor per batch). |

### Roles (see `role_and_permission_spec.md` for the full catalogue)

| Role | Meaning |
|---|---|
| **Super Admin** | The college's **IT cell head**. Tenant level, **above the Principal in the system hierarchy**, owns technical administration (users, settings, backups, audit, impersonation). Does **not** hold academic approval powers. **Decided** (ADR-0004) |
| **Principal** | Head of the institution. Academic authority: final leave approval for the Aided stream, CIA approval. |
| **Chairman** | Optional, read-only executive dashboard role, disabled by default. |
| **Admin** | Office administration, per stream or institution. |
| **HOD** | Head of Department. One active per department. Assigns Tutors, Mentors, Course teachers. |
| **General Dept Coordinator** | Acts as HOD for S1/S2 of their stream. One per General Department. |
| **Academic Coordinator (SF)** | Stream-level academic oversight for SF; final SF leave approver. |
| **SF Office** | SF office desk: leave verification, CCL ledger, punches. |
| **Tutor** | Lecturer assigned by the HOD to a batch (legacy "Mentor-1"). Not a staff designation; it is a scoped assignment. |
| **Mentor** | Staff assigned to a batch or mentoring group (legacy "Mentor-2"). |
| **Course teacher** | Staff assigned to a course offering, with sub-role `primary`, `co_staff`, `lab_instructor` or `assistant`. |
| **Lecturer, Demonstrator, Workshop Instructor, Trade Instructor, Tradesman, Laboratory Assistant, Physical Instructor, Workshop Superintendent** | Staff designations, each a base role at department/workshop/institution scope. Laboratory Assistant is seeded but unassigned today. |
| **Student** | Own records only. |
| **Parent / Guardian** | Read-only access to linked student(s). Has a real user account (`type = parent`) linked via `guardian_links`. **Decided** (ADR-0003) |
| **Dean** | Not used for polytechnics. Only in a future engineering academic profile. |

## 4. Assessment

| Term | Meaning |
|---|---|
| **CIA** | Continuous Internal Assessment. |
| **ESE** | End Semester Examination. |
| **CO / PO / PSO** | Course Outcome / Programme Outcome / Programme Specific Outcome. |
| **Component** | A scoring block in a scheme (e.g. series test, lab work, attendance marks). |
| **Assessment item** | One instance of a component for a course offering (Experiment 3, Series Test 1). |
| **Assessment score** | One student's mark for one item, with optional rubric breakdown. |
| **CIA summary** | Per student per course offering: component totals, attendance marks, total CIA, ESE, pass status. |
| **CIA consolidation** | Per batch per semester: tutor submits → HOD locks. States `draft`, `submitted_by_tutor`, `locked_by_hod`. |
| **Archetype** | A scheme key such as `r21_theory`. The 13 archetypes are listed in the role/permission spec §6.1. |

## 5. Attendance

| Term | Meaning |
|---|---|
| **Attendance session** | One taught period for a course offering (or special duty) that can be marked. |
| **Attendance record** | One student's status in one session. |
| **Locked session** | A finalised session. Edits are rejected, except through an HOD override. |
| **Official attendance** | SBTE-published attendance, imported and reconciled; separate from internal marking. |
| **Condonation** | Permission to proceed despite attendance below the eligibility threshold. |
| **Client UUID** | Id generated on the device for an offline attendance entry; server upserts idempotently on it. |

## 6. API & Platform Terms

| Term | Meaning |
|---|---|
| **Action** | One class = one business use case (`MarkAttendanceAction`). Controllers contain none. |
| **Module** | A bounded unit under `app/Modules/<Name>`. Other modules may use only its `Contracts/`, `Events/`, `Http/Resources/`. |
| **Contract** | Either a module's public PHP interfaces or `contracts/openapi.yaml` (context decides; the API one is always called "OpenAPI contract"). |
| **Envelope** | `{ data, meta, links }` success shape; RFC 7807 for errors. |
| **Idempotency key** | Client-sent key on POST so retries never duplicate. |
| **Job resource** | Long-running work returned as `202` plus `/api/v1/jobs/{id}` to poll. (ADR-0002) |
| **Schema version** | Per-tenant migration level recorded in the landlord DB. |

---

## Resolved Sign-Off Items (2026-10-31)
1. **Decided:** Typed `sub_batches` (`lab | mentoring | workshop`) replaces `sections` (§2, ADR-0005).
2. **Decided:** Super Admin (College IT Head) sits above Principal for system administration, holds no unilateral academic approval permissions, and impersonates academic roles in read-only mode (ADR-0004).
3. **Decided:** Parent accounts are real `users` linked via `guardian_links`, supporting offline-capable temporary password / email login plus optional Firebase Phone Auth OTP (ADR-0003).
4. **Decided:** Canonical role catalogue has **21 tenant roles** + **1 landlord role (`platform_owner`)** (reconciled across `role_and_permission_spec.md` and seeders).
5. **Decided:** Regulation & Assessment Engine (ADR-0006) and Stream Approval Chains, Web Notification Center + FCM, and External RAG AI Assistant Boundary (ADR-0007).
