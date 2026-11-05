# Prompt 06i (v4): Step 7a, First-Run Setup Wizard UI (Frontend)

Context: Part 0 and 0b are accepted and done (carry-over checks confirmed,
ADR-0015 section 7 added, contracts read, no conflicts). Backend 6.6a to
6.6c is merged to main. Do not redo those checks. No Stitch or external
design reference exists: the design source of truth is the existing
CampusLynk design system in @academic-suite/ui (shadcn-based) and its
semantic tokens (light and dark). This step is frontend only.

Endpoints (from the accepted Part 0b report):
- GET /api/v1/setup/status returns SetupStatusEnvelope: completed_at,
  is_completed, steps, prerequisites {streams_count, departments_count,
  academic_years_count}.
- PUT /api/v1/setup/steps/{step} (institution_profile, calendar_basics,
  signup_policy) returns the updated envelope.
- POST /api/v1/setup/complete returns the envelope; errors:
  setup-prerequisites-missing (422, list in errors.missing) and
  setup-already-completed (409).
- Streams GET/POST/PATCH(name only)/DELETE (409 stream-in-use; DELETE
  returns 200). Departments, programs, academic years: list and create.
- All setup routes: super_admin at institution scope only; a 403 forbidden
  is returned for wrong role, department-scoped super_admin, and
  impersonation sessions.

## Part 1: Pre-build decision (answer in your first message, then continue)
1. How will the UI distinguish an impersonation 403 from a wrong-role 403?
   Check the 403 body and the session/auth state the frontend already
   holds (the impersonation banner or token ability may be known
   client-side). If the client already knows it is impersonating, use
   that and add no backend change. If there is no reliable signal, STOP
   and propose a minimal backend slug (impersonation-not-allowed); do not
   string-match on detail text.

## Part 2: Routing and gating
2. After login and forced password change, super_admin users call
   GET /setup/status. If completed_at is null, redirect to /setup. Other
   roles are never redirected. After completion, /setup shows a read-only
   summary with an "Edit" link per step (re-saving is allowed).
3. /setup/* is visible to super_admin only; others see the existing
   forbidden page. Impersonation shows a clear "Setup is not available
   while impersonating a user" message. Refreshing never loses place: the
   current step derives from /setup/status plus prerequisite counts, not
   local state. Setup state does not gate any other route.

## Part 3: Wizard shell
4. Full-page layout, no sidebar. Top stepper with five items:
   Institution profile, Organisation basics, Calendar, Sign-up policy,
   Review and finish. Each shows state: not started, saved, current, with
   an icon plus text, never color alone. Steps can be visited in any
   order. Back/Next plus a per-step Save. Finish is enabled only when the
   status data says completion can succeed.
5. Use only @academic-suite/ui components and semantic tokens (the
   discipline gate must stay green: no local ui components, no hex or raw
   palette colors). Responsive to tablet (768px). Keyboard accessible,
   labelled inputs, visible focus, errors tied to fields with aria and
   announced to screen readers. Light and dark both work.

## Part 4: Step screens
6. Institution profile: fields exactly per institution-profile schema.
   Required: name, short_code. Optional: board/affiliation (string plus
   optional code), contact email, contact phone, address lines, city,
   state, postal code, website. Client validation mirrors the schema;
   server field errors map onto the fields.
7. Organisation basics, three sections on one screen, real endpoints:
   - Streams: list with departments_count, create (code, name), rename
     (name only; code is read-only after creation with a short
     explanation), delete. Delete is disabled with a tooltip or helper
     text when departments_count > 0; a server 409 stream-in-use shows a
     clear inline message. Treat 200 and 204 as delete success.
   - Departments: list, create (stream picker, code, name, kind where
     kind is exactly academic, general or administrative). The same code
     is allowed under two streams; a duplicate within one stream is a
     field error.
   - Academic years: list and create.
   - Programs optional and skippable.
   - A banner with live counts and "at least one of each is required".
     This step writes no setup step key. Never display, parse or derive
     scope labels anywhere.
8. Calendar: working-day toggles (unique lowercase weekdays, 1 to 7),
   periods per day (1 to 12), an editable period table (index, start, end
   in HH:MM) with live checks for start < end, ordering, no overlap, and
   row count equal to periods per day. Day-order format (roman, numeric,
   alpha) with a preview of how day orders will display. Mirror
   CalendarBasicsRule; the server remains the authority.
9. Sign-up policy: student self-registration toggle, parent
   self-registration toggle, approval mode (manual or auto). Defaults off
   and manual. A visible note: these settings take effect only when
   registration ships.
10. Review and finish: summary of each saved step, a checklist of what is
    missing (read it from errors.missing of the 422 and from the status
    counts), and Finish. On 409 setup-already-completed, route to the
    completed summary, not an error screen.

## Part 5: States and data layer
11. Every step has loading (skeleton), empty, error (with retry), saving
    (button disabled plus spinner) and success states. Preserve unsaved
    edits when a save fails. Warn before leaving a dirty step. Map
    problem+json field errors to fields; show other errors in an Alert.
12. Use the generated api-client and its helpers only. If a helper is
    missing, add it to the hand-written client.ts, never to generated
    files. Use the app's existing data-fetching pattern.
13. All user-visible strings go through the project's string convention.
    No hardcoded Carmel, Kerala, stream or department names; placeholders
    are generic ("Institution name", "Stream A").

## Part 6: Tests (Vitest)
14. Calendar overlap, ordering, count, and HH:MM validation; redirect
    logic by role; step derivation from status and counts; problem+json
    to field mapping; Finish enablement; 409 on complete; reading
    errors.missing; impersonation vs wrong-role messaging; stream delete
    disabled and server 409; code read-only after creation; delete 200
    and 204. Add an end-to-end happy path with a mocked api-client if the
    repo has the pattern: create stream, department, academic year, save
    three steps, finish.
15. A test that no component contains "Carmel" or "Kerala" and none reads
    or parses a scope_label field.

## Constraints
- pnpm run check --force green (lint, typecheck, tests, discipline).
  composer check green if any backend change is made.
- Do not hand-edit generated schema files.
- No backend changes unless Part 1 item 1 proves one is unavoidable, and
  then only after you stop and report.
- Out of scope: sign-up/registration screens, student/parent flows, CSV
  import, approval chains, role/user management UI, dashboards.

## Deliverable
1. Answer to item 1 (impersonation signal) before you build.
2. Table of items 2 to 15 (done / changed approach / blocked).
3. Route and component list; real test counts; and each step's loading,
   empty, error and saving states.
4. Any contradiction with this prompt.
