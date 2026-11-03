# ADR-0014: Scope Tree ltree Labels, Dual Paths, and Resilient Role Scoping

**Status:** Decided  
**Date:** 2026-11-02  
**Deciders:** Core Engineering Team  
**Consulted:** ADR-0001, ADR-0004, ADR-0005, `docs/role_and_permission_spec.md` (§2 Scope Tree)

---

## Context

In polytechnic institutional hierarchies (ADR-0005), engineering batches possess a dual organizational allegiance:
1. **Home Department:** Permanent disciplinary ownership (e.g., Civil Engineering `CE`).
2. **Managing Department:** Active academic semester governance (e.g., `GEN_AIDED` for Semesters 1 and 2; `CE` for Semesters 3 through 6).

Furthermore, resources inside a college form an ancestor-descendant tree:
```
institution (i)
 └── stream (s)
      └── department (d)
           └── program (p)
                └── batch (b)
                     ├── sub_batch (sb)
                     └── course_offering (co)
```
Separate branch:
```
institution (i)
 └── workshop_section (ws)
```

We require an efficient database representation in PostgreSQL that:
- Allows instantaneous hierarchical permission and ancestor/descendant queries (`@>` and `<@` operators).
- Supports dual paths (`home_path` and `managing_path`) where governance/write permissions check `managing_path` only, while read/analytics check `managing_path` or `home_path`.
- Avoids invalidating or breaking user role assignments when batches advance semesters (e.g., crossing from S2 to S3).

---

## Decision

### 1. Stable Scope Labels (`scope_label`)

Every organizational node carries a stable, unique string label formatted as `<type>_<ulid_lowercase>`:
- **`i_<ulid>`**: Institution
- **`s_<ulid>`**: Stream (`AIDED`, `SF`, `SHARED`)
- **`d_<ulid>`**: Department (`CE`, `ME`, `GEN_AIDED`, etc.)
- **`p_<ulid>`**: Program (`DCE`, `DME`, etc.)
- **`b_<ulid>`**: Batch (`ME 2024-2027`)
- **`sb_<ulid>`**: Sub-batch (Lab batch, Mentoring group, Workshop batch)
- **`ws_<ulid>`**: Central Workshop trade section
- *(Future)* **`co_<ulid>`**: Course offering

**PostgreSQL `ltree` Label Syntax:**  
PostgreSQL `ltree` labels consist of alphanumeric characters and underscores (`[A-Za-z0-9_]`). While PostgreSQL allows up to 256 bytes per label, CampusLynk enforces a strict 63-character ceiling (`^[a-zA-Z0-9_]{1,63}$`) via `ScopeLabelValidator` to conform with PostgreSQL identifier standards. Since ULIDs are 26 base32 characters, prefixing with `<type>_` creates valid, compact, human-distinguishable labels (e.g., `d_ce`, `i_carmel`).

### 2. Dual Path Architecture (`home_path` & `managing_path`)

Batches and their descendants (`sub_batches`, `course_offerings`) maintain two `ltree` columns indexed with GiST:
1. **`home_path`:** Traces permanent disciplinary lineage:
   `i_<inst>.s_<home_stream>.d_<home_dept>.p_<prog>.b_<batch>`
2. **`managing_path`:** Traces active governance lineage:
   `i_<inst>.s_<managing_stream>.d_<managing_dept>.p_<prog>.b_<batch>`

For child sub-batches:
- `home_path`: `<batch.home_path>.sb_<sub_batch>`
- `managing_path`: `<batch.managing_path>.sb_<sub_batch>`

Both paths maintain identical structural shape (depth and component types), differing solely in the swapped stream and department nodes when governance diverges during S1/S2.

### 3. Resilient Role Scoping (Never Stale on Promotion)

When a role is assigned to a user (e.g., Tutor of a Batch, HOD of a Department):
- The `role_assignments` record stores `scope_type` and `scope_label` (e.g., `scope_type = 'batch'`, `scope_label = 'b_01h...'`).
- The role assignment **never** stores static full paths.

When a batch is promoted from S2 to S3 (`PromoteBatchSemesterAction`):
1. `managing_department_id` re-resolves from `GEN_AIDED` to `CE`.
2. `managing_path` is recomputed to `i_...s_aided.d_ce.p_dce.b_...`.
3. The batch's own `scope_label` (`b_01h...`) **remains identical**.
4. Consequently:
   - Assignments scoped directly to the batch remain intact.
   - The General Department Coordinator (`d_gen_aided`) automatically loses governance over the batch because `d_gen_aided` no longer appears in the batch's `managing_path` (`managing_path ~ '*.d_gen_aided.*'` evaluates to `false`).
   - The Civil Department HOD (`d_ce`) automatically gains full governance over the batch because `d_ce` is now in `managing_path`.
   - Zero updates to `role_assignments` table are required for departmental governance transitions.

---

## Consequences

- ✅ **Instantaneous Hierarchy Checks:** Queries use PostgreSQL GiST-indexed `ltree` operators (`path ~ '*.d_ce.*'` or `scope_path @> resource_path`).
- ✅ **Decoupled Lifecycle:** Organizational path re-computation upon semester promotion does not mutate user role assignment rows.
- ✅ **Strict ADR-0005 Compliance:** Enforces separation between write/governance (managing path only) and read (home or managing path).

