# Prompt 06l: Per-Role Capability Notes (docs only, no code)

## Working rules (read first)
- You are on branch docs/roles-and-registration. Commit only there. Never
  commit to main. Do not run git switch, git checkout, git stash or git
  reset: another agent is working in this repo on a different task.
- Write ONLY under docs/roles/ and docs/adr/. Do not touch frontend/,
  backend/, contracts/, AGENTS.md or docs/decision_log.md. If you think
  one of those needs a change, list it in your report instead.
- Do not run the full backend test suite or any long-running command.
  Reading files and light greps only.
- Do not start servers or write to any database.

Goal: produce docs/roles/ notes so role dashboards can be designed against
what the backend actually supports. Read-only on code; write only under
docs/roles/. Do not touch frontend/ or any file the frontend agent may be
editing.

1. Read role_and_permission_spec.md, the RBAC seeders, OrganisationModule
   and IdentityModule permission and role-permission maps, ScopeAuthorizer,
   ADR-0004, ADR-0005 and ADR-0007, and the routes in backend/routes.
2. For each of super_admin, principal, hod, lecturer (and tutor/mentor if
   they are distinct roles), write docs/roles/<role>.md with:
   - Purpose and scope level (institution, department, batch, sub-batch).
   - Permissions held, grouped by module.
   - Endpoints this role can call today (method, path, permission).
   - Candidate dashboard widgets, each marked: BACKEND EXISTS (name the
     endpoint) or NEEDS MODULE (name it: attendance, leave, assessment,
     approvals, etc.).
   - Things this role must NOT see or do (e.g. super_admin has no academic
     or leave approvals per ADR-0004).
3. Add docs/roles/README.md: a matrix of roles x widgets showing which are
   buildable now.
4. Flag any role in the spec that has no implementation, and any permission
   that exists but is unused by a route.
5. Impersonation: for each role, note what the impersonation read-only
   restriction blocks (EnforceImpersonationRestrictions), so dashboards
   know which actions to hide in an impersonation session.
6. Scope delegation: from the delegation matrix, list which roles can
   assign which roles at which scope, since the admin UI needs it.
7. Singleton roles: list every role with a singleton constraint (for
   example one active HOD per department) and what the UI should show
   when an assignment is blocked.
8. Do not invent permissions, endpoints or widgets. Everything must cite a
   file and line or a spec section. Anything you infer must be labelled
   INFERRED.

Deliverable: the files, plus a short list of spec/code mismatches found.
